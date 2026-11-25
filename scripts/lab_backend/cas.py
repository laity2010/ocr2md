"""WP03 · V3 摘要式增量 CAS 写回服务（md-commit 与 structure-commit）。

严格遵循 SQL.md 第 4 节：
1. 所有 SQLite 访问统一经 open_v3_db(folder, 'rw') 完成，零手写 sqlite3.connect；
2. md-commit 采用全书有序结构摘要 structure_sha256 + 逐块 before_sha256 乐观锁，
   并在 BEGIN IMMEDIATE 原子事务内仅对受影响的 k 个块执行局部 O(k) 尾换行边界校验；
3. structure-commit 采用临时坐标停泊避免 (p,b,s) UNIQUE 冲突，强制核验边界块
   before_sha256、两层 PBS 与 owned-LF 全量不变量及外键完整性，任一失败全量回滚。
"""
from __future__ import annotations

from pathlib import Path

from .db import V3Error, assert_v3_schema, open_v3_db, sha256_text
from .projection import compute_structure_sha256, rows_from_sql, validate_owned_rows

MAX_MD_COMMIT_BYTES = 4 * 1024 * 1024
STRUCTURE_SNAP_KEYS = frozenset(('parentId', 'logicalOrder', 'p', 'b', 's'))


def is_sha256_hex(value: object) -> bool:
    """校验是否为 64 位小写十六进制 SHA-256 字符串。"""
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(ch in '0123456789abcdef' for ch in value)
    )


def commit_v3_md(folder: Path, payload: dict, common: object) -> dict:
    """摘要式正文增量提交（md-commit）：structure_sha256 + 逐行 before_sha256 + O(k) 边界核验。"""
    if (
        payload.get('confirm') != 'commit-v3-md'
        or set(payload) != {'workspace', 'confirm', 'structureSha256', 'changes'}
    ):
        raise V3Error(422, 'md-commit 确认标识或请求字段不完整')

    expected_struct_sha = payload['structureSha256']
    if not is_sha256_hex(expected_struct_sha):
        raise V3Error(422, 'structureSha256 必须是 64 位小写十六进制摘要')

    changes = payload['changes']
    if not isinstance(changes, list) or not (1 <= len(changes) <= 1000):
        raise V3Error(422, 'md-commit 修改块数量必须在 1..1000 之间')

    seen_ids: set[int] = set()
    total_after_bytes = 0
    for item in changes:
        if not isinstance(item, dict) or set(item) != {'logicalId', 'beforeSha256', 'after'}:
            raise V3Error(422, 'md-commit 单项字段必须为 logicalId、beforeSha256、after')
        lid = item['logicalId']
        if type(lid) is not int or lid <= 0 or lid in seen_ids:
            raise V3Error(422, 'md-commit logicalId 无效或存在重复')
        seen_ids.add(lid)
        before_sha = item['beforeSha256']
        after_text = item['after']
        if not is_sha256_hex(before_sha) or not isinstance(after_text, str):
            raise V3Error(422, 'md-commit beforeSha256 或 after 正文格式无效')
        if '\r' in after_text:
            raise V3Error(422, f'逻辑块 {lid} 提交正文禁止包含 CR 字符')
        if sha256_text(after_text) == before_sha:
            raise V3Error(422, f'逻辑块 {lid} 正文未发生实际变化，禁止空提交')
        total_after_bytes += len(after_text.encode('utf-8'))
        if total_after_bytes > MAX_MD_COMMIT_BYTES:
            raise V3Error(413, '单次 md-commit 新正文总大小超出 4 MiB 上限')

    common.probe(folder)
    with open_v3_db(folder, 'rw') as db:
        db.execute('BEGIN IMMEDIATE')
        assert_v3_schema(db)

        struct_rows = db.execute(
            'SELECT logical_id, parent_id, logical_order, p, b, s '
            'FROM logical_block ORDER BY logical_order'
        ).fetchall()
        if not struct_rows:
            raise V3Error(409, '逻辑表为空，无法提交正文修改')
        actual_struct_sha = compute_structure_sha256(struct_rows)
        if actual_struct_sha != expected_struct_sha:
            raise V3Error(409, 'PBS 结构摘要已变化，拒绝写入并保留前端内存')

        meta_by_id = {
            r['logical_id']: (r['logical_order'], r['p'], r['b'])
            for r in struct_rows
        }
        coord_by_order = {
            r['logical_order']: (r['p'], r['b'])
            for r in struct_rows
        }

        # 仅按主键读取受影响的 k 行核对 before_sha256，并执行 O(k) 紧邻后继尾换行边界校验
        for item in changes:
            lid = item['logicalId']
            if lid not in meta_by_id:
                raise V3Error(409, f'目标逻辑块 {lid} 不存在，拒绝写入')
            cur_row = db.execute(
                'SELECT md_block FROM logical_block WHERE logical_id = ?',
                (lid,),
            ).fetchone()
            if cur_row is None or sha256_text(cur_row['md_block']) != item['beforeSha256']:
                raise V3Error(
                    409,
                    f'逻辑块 {lid} 已被其他会话修改（before_sha256 不匹配），保留前端当前正文',
                )
            ord_i, p_i, b_i = meta_by_id[lid]
            next_coord = coord_by_order.get(ord_i + 1)
            min_lf = 1 if (next_coord is not None and next_coord == (p_i, b_i)) else 2
            if not item['after'].endswith('\n' * min_lf):
                raise V3Error(
                    409,
                    f'逻辑块 {lid} 尾换行不满足 owned-LF 边界契约（需至少 {min_lf} 个 LF）',
                )

        db.executemany(
            'UPDATE logical_block SET md_block = ? WHERE logical_id = ?',
            [(c['after'], c['logicalId']) for c in changes],
        )
        db.execute('COMMIT')

    return {
        'saved': True,
        'changedRows': len(changes),
        'baseChanged': False,
        'structureSha256': actual_struct_sha,
        'updatedHashes': {str(c['logicalId']): sha256_text(c['after']) for c in changes},
    }


def _validate_structure_snap(snap: object) -> dict:
    if not isinstance(snap, dict) or set(snap) != STRUCTURE_SNAP_KEYS:
        raise V3Error(422, '结构快照字段必须为 parentId、logicalOrder、p、b、s')
    if type(snap['logicalOrder']) is not int or snap['logicalOrder'] < 1:
        raise V3Error(422, 'logicalOrder 必须为正整数')
    for key in ('p', 'b', 's'):
        if type(snap[key]) is not int or snap[key] < 0:
            raise V3Error(422, f'PBS 坐标 {key} 必须为非负整数')
    pid = snap['parentId']
    if pid is not None and (type(pid) is not int or pid < 1):
        raise V3Error(422, 'parentId 必须为 None 或正整数')
    return snap


def _same_group_successors(struct_items: list[dict]) -> dict[int, int | None]:
    """按 logicalOrder 排序计算每个逻辑块的同组紧邻后继 logicalId（组末为 None）。"""
    ordered = sorted(struct_items, key=lambda r: (r['logicalOrder'], r['logicalId']))
    result: dict[int, int | None] = {}
    for idx, row in enumerate(ordered):
        nxt = ordered[idx + 1] if idx + 1 < len(ordered) else None
        same_group = nxt is not None and (row['p'], row['b']) == (nxt['p'], nxt['b'])
        result[row['logicalId']] = nxt['logicalId'] if same_group else None
    return result


def commit_v3_structure(folder: Path, payload: dict, common: object) -> dict:
    """摘要式结构增量提交（structure-commit）：临时坐标停泊 + 边界 before_sha256 + 全量复核。"""
    required_keys = {
        'workspace', 'confirm', 'structureSha256',
        'changes', 'textChanges', 'boundaryChecks',
    }
    if payload.get('confirm') != 'commit-v3-structure' or set(payload) != required_keys:
        raise V3Error(422, 'structure-commit 确认标识或请求字段不完整')

    expected_struct_sha = payload['structureSha256']
    if not is_sha256_hex(expected_struct_sha):
        raise V3Error(422, 'structureSha256 必须是 64 位小写十六进制摘要')

    changes = payload['changes']
    if not isinstance(changes, list) or not (1 <= len(changes) <= 10_000):
        raise V3Error(422, 'structure-commit 结构变更行数必须在 1..10000 之间')

    seen_struct_ids: set[int] = set()
    for item in changes:
        if not isinstance(item, dict) or set(item) != {'logicalId', 'before', 'after'}:
            raise V3Error(422, '结构变更项字段必须为 logicalId、before、after')
        lid = item['logicalId']
        if type(lid) is not int or lid <= 0 or lid in seen_struct_ids:
            raise V3Error(422, '结构变更 logicalId 无效或重复')
        seen_struct_ids.add(lid)
        before_snap = _validate_structure_snap(item['before'])
        after_snap = _validate_structure_snap(item['after'])
        if before_snap == after_snap:
            raise V3Error(422, f'逻辑块 {lid} 结构快照未发生变化，禁止空提交')

    text_changes = payload['textChanges']
    if not isinstance(text_changes, list) or len(text_changes) > 1000:
        raise V3Error(422, 'structure-commit 伴随正文变更数量超出上限')

    seen_text_ids: set[int] = set()
    total_text_bytes = 0
    for t_item in text_changes:
        if not isinstance(t_item, dict) or set(t_item) != {'logicalId', 'beforeSha256', 'after'}:
            raise V3Error(422, '伴随正文变更项字段必须为 logicalId、beforeSha256、after')
        lid = t_item['logicalId']
        if type(lid) is not int or lid <= 0 or lid in seen_text_ids:
            raise V3Error(422, '伴随正文变更 logicalId 无效或重复')
        seen_text_ids.add(lid)
        if not is_sha256_hex(t_item['beforeSha256']) or not isinstance(t_item['after'], str):
            raise V3Error(422, '伴随正文变更 beforeSha256 或 after 格式无效')
        if '\r' in t_item['after'] or sha256_text(t_item['after']) == t_item['beforeSha256']:
            raise V3Error(422, f'伴随正文变更块 {lid} 含非法 CR 或无实际变化')
        total_text_bytes += len(t_item['after'].encode('utf-8'))
        if total_text_bytes > MAX_MD_COMMIT_BYTES:
            raise V3Error(413, '伴随正文变更总大小超出 4 MiB 上限')

    boundary_checks = payload['boundaryChecks']
    if not isinstance(boundary_checks, list) or len(boundary_checks) > 10_000:
        raise V3Error(422, 'boundaryChecks 列表格式或长度无效')

    boundary_sha_by_id: dict[int, str] = {}
    for b_item in boundary_checks:
        if not isinstance(b_item, dict) or set(b_item) != {'logicalId', 'beforeSha256'}:
            raise V3Error(422, 'boundaryChecks 项字段必须为 logicalId、beforeSha256')
        lid = b_item['logicalId']
        if type(lid) is not int or lid <= 0 or lid in boundary_sha_by_id:
            raise V3Error(422, 'boundaryChecks logicalId 无效或重复')
        if not is_sha256_hex(b_item['beforeSha256']):
            raise V3Error(422, 'boundaryChecks beforeSha256 格式无效')
        boundary_sha_by_id[lid] = b_item['beforeSha256']

    common.probe(folder)
    with open_v3_db(folder, 'rw') as db:
        db.execute('BEGIN IMMEDIATE')
        assert_v3_schema(db)

        old_rows = {
            r['logical_id']: dict(r)
            for r in db.execute(
                'SELECT logical_id, base_blockid, parent_id, logical_order, md_block, block_type, p, b, s, raw_path '
                'FROM logical_block ORDER BY logical_order'
            )
        }
        if len(old_rows) < len(changes):
            raise V3Error(409, '逻辑块库存数量不匹配，拒绝结构写入')

        actual_struct_sha = compute_structure_sha256(list(old_rows.values()))
        if actual_struct_sha != expected_struct_sha:
            raise V3Error(409, 'PBS 结构摘要已被其他会话修改，拒绝覆盖并保留前端状态')

        for item in changes:
            lid = item['logicalId']
            row = old_rows.get(lid)
            if row is None:
                raise V3Error(409, f'逻辑块 {lid} 不存在，禁止增删库存')
            cur_snap = {
                'parentId': row['parent_id'],
                'logicalOrder': row['logical_order'],
                'p': row['p'],
                'b': row['b'],
                's': row['s'],
            }
            if cur_snap != item['before']:
                raise V3Error(409, f'逻辑块 {lid} 原结构状态已变化，拒绝覆盖')

        # 精确计算同组紧邻后继发生改变的所有边界块，核对 boundaryChecks 清单完整性与 before_sha256
        actual_struct_list = [
            {
                'logicalId': r['logical_id'],
                'parentId': r['parent_id'],
                'logicalOrder': r['logical_order'],
                'p': r['p'],
                'b': r['b'],
                's': r['s'],
            }
            for r in old_rows.values()
        ]
        after_by_id = {item['logicalId']: item['after'] for item in changes}
        prospective_struct_list = [
            {'logicalId': s['logicalId'], **after_by_id.get(s['logicalId'], s)}
            for s in actual_struct_list
        ]
        prior_succ = _same_group_successors(actual_struct_list)
        later_succ = _same_group_successors(prospective_struct_list)
        expected_boundary_ids = {
            lid for lid in prior_succ if prior_succ[lid] != later_succ.get(lid)
        }
        if set(boundary_sha_by_id.keys()) != expected_boundary_ids:
            raise V3Error(422, 'boundaryChecks 集合与实际同组边界变化块集合不一致')

        for lid, expected_b_sha in boundary_sha_by_id.items():
            row = old_rows.get(lid)
            if row is None or sha256_text(row['md_block']) != expected_b_sha:
                raise V3Error(409, f'归组边界块 {lid} 正文已变化（before_sha256 不匹配），拒绝覆盖')

        for t_item in text_changes:
            lid = t_item['logicalId']
            row = old_rows.get(lid)
            if row is None or sha256_text(row['md_block']) != t_item['beforeSha256']:
                raise V3Error(409, f'归组伴随正文块 {lid} 已被其他会话修改，拒绝覆盖')
            if lid in boundary_sha_by_id and boundary_sha_by_id[lid] != t_item['beforeSha256']:
                raise V3Error(422, f'逻辑块 {lid} 在 boundaryChecks 与 textChanges 中的 beforeSha256 不一致')

        # 先将变更行停泊至大于当前最大页码的私有临时坐标区，防止兄弟交换触发 UNIQUE(p,b,s) 冲突
        park_p = max((r['p'] for r in old_rows.values()), default=0) + 1
        for idx, item in enumerate(changes):
            db.execute(
                'UPDATE logical_block SET p = ?, b = ?, s = 0 WHERE logical_id = ?',
                (park_p, idx, item['logicalId']),
            )

        for item in changes:
            aft = item['after']
            cur = db.execute(
                'UPDATE logical_block SET parent_id = ?, logical_order = ?, p = ?, b = ?, s = ? '
                'WHERE logical_id = ?',
                (aft['parentId'], aft['logicalOrder'], aft['p'], aft['b'], aft['s'], item['logicalId']),
            )
            if cur.rowcount != 1:
                raise V3Error(409, f'结构更新期间逻辑块 {item["logicalId"]} 丢失')

        if text_changes:
            db.executemany(
                'UPDATE logical_block SET md_block = ? WHERE logical_id = ?',
                [(t['after'], t['logicalId']) for t in text_changes],
            )

        updated_records = db.execute(
            'SELECT logical_id, base_blockid, parent_id, logical_order, md_block, block_type, p, b, s, raw_path '
            'FROM logical_block ORDER BY logical_order'
        ).fetchall()
        try:
            validated_rows = validate_owned_rows(rows_from_sql(updated_records))
        except ValueError as err:
            raise V3Error(409, '结构事务未通过 owned-LF 或两层 PBS 复核：' + str(err)) from err

        if list(db.execute('PRAGMA foreign_key_check')):
            raise V3Error(409, '结构事务破坏了基础表外键引用完整性')

        new_struct_sha = compute_structure_sha256(validated_rows)
        db.execute('COMMIT')

    return {
        'saved': True,
        'changedRows': len(changes),
        'textChangedRows': len(text_changes),
        'logicalCount': len(validated_rows),
        'baseChanged': False,
        'structureSha256': new_struct_sha,
        'updatedHashes': {str(t['logicalId']): sha256_text(t['after']) for t in text_changes},
    }
