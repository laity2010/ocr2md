"""V3 书籍原始 MinerU/PDF 安全读取、单轨建库初始化与只读查询服务。

严格遵循 SQL.md 第 1–4 节：
1. 原始 MinerU JSON 与 PDF 一律 O_NOFOLLOW + st_nlink==1 只读读取，绝不改动原件；
2. 仅管理 ocr2md.v3.sqlite，完全隔离同目录下的 ocr2md.v2.sqlite；
3. 建库在私有暂存文件内原子完成，强制解压核验 zlib 归档与单轨 owned-LF 无损往返。
"""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import secrets
import sqlite3
import stat

from .compile import raw_at, raw_element_text, write_initial_v3_logical
from .db import (
    BASE_COLUMNS,
    BLOCK_LISTS,
    DB_NAME,
    DIR_FLAGS,
    FILE_NOFOLLOW,
    MAX_PDF_FILE,
    MAX_SOURCE_FILE,
    MAX_SOURCE_TOTAL,
    PAGE_SIZE,
    SCHEMA,
    V3Error,
    assert_v3_schema,
    compact_json,
    compress_source_archive,
    create_v3_schema,
    decompress_source_archive,
    ensure_no_active_journal,
    open_v3_db,
    sha256_bytes,
    sha256_text,
)
from .projection import (
    PDFProjectionError,
    compute_structure_sha256,
    from_owned_markdown,
    project_v3_pdf,
    rows_from_sql,
    to_owned_markdown,
)


def require_regular_readonly_bytes(path: Path, *, max_bytes: int, label: str) -> bytes:
    """以 O_NOFOLLOW 打开并读取普通单硬链接文件，防止符号链接/硬链接穿越与并发篡改。"""
    if path.is_symlink():
        raise V3Error(403, f'{label}不允许是符号链接')
    fd = os.open(path, os.O_RDONLY | FILE_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise V3Error(422, f'{label}必须是普通非硬链接文件')
        if info.st_size > max_bytes:
            raise V3Error(413, f'{label}超过允许大小上限')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            raw = stream.read(max_bytes + 1)
        if len(raw) != info.st_size:
            raise V3Error(409, f'{label}在读取期间发生变化')
        return raw
    finally:
        os.close(fd)


def discover_mineru_sources(folder: Path) -> list[tuple[str, bytes, dict]]:
    """只读发现工作目录或其唯一约定的 MinerU 子目录中含 pdf_info 的 JSON 源文件。"""
    candidates: list[Path] = []
    for sub in ('minerujson', 'mineru_json', 'mineru json'):
        cand = folder / sub
        if os.path.lexists(cand):
            if cand.is_symlink() or not cand.is_dir():
                raise V3Error(422, 'MinerU 子目录不可用或属于符号链接')
            candidates.append(cand)
    if len(candidates) > 1:
        raise V3Error(409, '检测到多个 MinerU 子目录，拒绝猜测来源')

    source_dir = candidates[0] if candidates else folder
    found: list[tuple[str, bytes, dict]] = []
    total_size = 0
    for item in sorted(source_dir.iterdir()):
        if item.name.startswith('.') or not item.name.lower().endswith('.json'):
            continue
        raw = require_regular_readonly_bytes(item, max_bytes=MAX_SOURCE_FILE, label='原始 MinerUJSON ')
        try:
            decoded = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(decoded, dict) or not isinstance(decoded.get('pdf_info'), list):
            continue
        total_size += len(raw)
        if total_size > MAX_SOURCE_TOTAL:
            raise V3Error(413, 'MinerUJSON 源文件总大小超过 128 MiB 上限')
        found.append((item.relative_to(folder).as_posix(), raw, decoded))

    if not found:
        raise V3Error(422, '工作目录中未找到包含 pdf_info 的 MinerUJSON 文件')
    if len(found) > 64:
        raise V3Error(413, 'MinerUJSON 分卷文件数超过 64 上限')
    return found


def _typed_json(obj: dict, key: str) -> str | None:
    value = obj.get(key)
    return compact_json(value) if value is not None else None


def prepare_base_records(files: list[tuple[str, bytes, dict]]) -> tuple[list[dict], list[tuple]]:
    """准备 blockid=0 归档清单与 blockid>=1 的不可变基础块记录。"""
    archive_entries: list[dict] = []
    rows: list[tuple] = []
    next_id = 1
    for rel_path, raw, doc in files:
        digest = sha256_bytes(raw)
        archive_entries.append({
            'path': rel_path,
            'sha256': digest,
            'size': len(raw),
            'contentBase64': base64.b64encode(raw).decode('ascii'),
        })
        for page_pos, page in enumerate(doc['pdf_info']):
            if not isinstance(page, dict):
                raise V3Error(422, 'MinerU 页结构不是 JSON 对象')
            page_idx = page.get('page_idx', page_pos)
            if type(page_idx) is not int:
                page_idx = page_pos
            for group in BLOCK_LISTS:
                blocks = page.get(group, [])
                if not isinstance(blocks, list):
                    raise V3Error(422, f'MinerU 块列表类型错误：{group}')
                for idx, block in enumerate(blocks):
                    if not isinstance(block, dict):
                        raise V3Error(422, 'MinerU 块元素不是 JSON 对象')
                    m_index = block.get('index')
                    angle = block.get('angle')
                    level = block.get('level')
                    rows.append((
                        next_id,
                        rel_path,
                        digest,
                        page_idx,
                        page_idx + 1,
                        group,
                        idx,
                        f'$.pdf_info[{page_pos}].{group}[{idx}]',
                        str(block.get('type', '')),
                        m_index if type(m_index) is int else None,
                        _typed_json(block, 'bbox'),
                        angle if isinstance(angle, (int, float)) and not isinstance(angle, bool) else None,
                        level if type(level) is int else None,
                        _typed_json(block, 'lines'),
                        _typed_json(block, 'blocks'),
                        compact_json(block),
                        'block',
                        None,
                    ))
                    next_id += 1
    return archive_entries, rows


def create_fresh_v3_book(folder: Path) -> dict:
    """在同目录私有暂存库内原子建立全新 ocr2md.v3.sqlite（拒绝覆盖已有库）。"""
    if os.path.lexists(folder / DB_NAME):
        raise V3Error(409, 'V3 SQLite 已存在，拒绝覆盖已有数据库')
    ensure_no_active_journal(folder, DB_NAME)

    files = discover_mineru_sources(folder)
    archive_entries, base_rows = prepare_base_records(files)
    sources_meta = [
        {'path': item['path'], 'sha256': item['sha256'], 'size': item['size']}
        for item in archive_entries
    ]
    archive_meta_json = compact_json({
        'schema': SCHEMA,
        'compression': 'zlib',
        'sources': sources_meta,
    })
    compressed_archive = compress_source_archive(archive_entries)

    fd_parent = os.open(folder, DIR_FLAGS)
    stage_name = f'.ocr2md-v3-{secrets.token_hex(12)}.tmp'
    try:
        fd_stage = os.open(
            stage_name,
            os.O_RDWR | os.O_CREAT | os.O_EXCL | FILE_NOFOLLOW,
            0o600,
            dir_fd=fd_parent,
        )
        os.close(fd_stage)
        try:
            with open_v3_db(folder, 'rw', _stage_filename=stage_name) as db:
                db.execute('BEGIN IMMEDIATE')
                create_v3_schema(db)
                db.execute(
                    'INSERT INTO mineru_base(blockid, block_json, record_kind, original_bytes) '
                    'VALUES (0, ?, ?, ?)',
                    (archive_meta_json, 'source_archive', compressed_archive),
                )
                placeholders = ','.join('?' for _ in BASE_COLUMNS)
                db.executemany(
                    f"INSERT INTO mineru_base({','.join(BASE_COLUMNS)}) VALUES ({placeholders})",
                    base_rows,
                )
                logical_count = write_initial_v3_logical(db)
                assert_v3_schema(db)

                if db.execute('SELECT count(*) FROM mineru_base WHERE blockid > 0').fetchone()[0] != len(base_rows):
                    raise V3Error(500, 'mineru_base 写入数量核验失败')

                # 建库事务内强制执行 zlib 解压与逐源文件 SHA-256 逐字节一致校验
                saved_blob = db.execute(
                    'SELECT original_bytes FROM mineru_base WHERE blockid = 0'
                ).fetchone()['original_bytes']
                verified_archive = decompress_source_archive(saved_blob, sources_meta)
                if [
                    (v['path'], v['sha256'], v['raw']) for v in verified_archive
                ] != [(rel, sha256_bytes(raw), raw) for rel, raw, _ in files]:
                    raise V3Error(500, 'zlib 原始档案解压后与源文件字节不一致')

                # 强制核验初始逻辑块满足单轨 owned-LF 无损往返
                logical_records = db.execute(
                    'SELECT * FROM logical_block ORDER BY logical_order'
                ).fetchall()
                typed_rows = rows_from_sql(logical_records)
                md_snapshot = to_owned_markdown(typed_rows)
                if from_owned_markdown(md_snapshot) != typed_rows:
                    raise V3Error(500, '初始 owned-LF Markdown 往返校验不一致')
                structure_sha = md_snapshot['structureSha256']
                db.execute('COMMIT')

            # 发布前再次核验磁盘原件在导入期间未被篡改，并以独占硬链接发布为 ocr2md.v3.sqlite
            for rel, raw, _ in files:
                if sha256_bytes(require_regular_readonly_bytes(folder / rel, max_bytes=MAX_SOURCE_FILE, label='原始 MinerUJSON ')) != sha256_bytes(raw):
                    raise V3Error(409, '导入期间原始 MinerUJSON 发生变化，已取消建库')
            ensure_no_active_journal(folder, DB_NAME)
            os.link(stage_name, DB_NAME, src_dir_fd=fd_parent, dst_dir_fd=fd_parent, follow_symlinks=False)
            os.fsync(fd_parent)
        finally:
            try:
                os.unlink(stage_name, dir_fd=fd_parent)
            except FileNotFoundError:
                pass
    finally:
        os.close(fd_parent)

    return {
        'created': True,
        'replaced': False,
        'dbFile': DB_NAME,
        'schema': SCHEMA,
        'compression': 'zlib',
        'compressedBytes': len(compressed_archive),
        'sourceCount': len(files),
        'blockCount': len(base_rows),
        'logicalCount': logical_count,
        'structureSha256': structure_sha,
    }


def _physical_tables(db: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND substr(name, 1, 7) != 'sqlite_' ORDER BY rowid"
        )
    ]


def _read_table(db: sqlite3.Connection, name: str, offset: int) -> dict:
    names = _physical_tables(db)
    if name not in names:
        raise V3Error(404, '指定 SQL 物理表不存在')
    ident = '"' + name.replace('"', '""') + '"'
    info = list(db.execute(f'PRAGMA table_info({ident})'))
    cols = [row[1] for row in info]
    if not cols:
        raise V3Error(409, 'SQL 物理表没有可显示的列')

    where_clause = ' WHERE blockid > 0' if name == 'mineru_base' else ''
    pk = sorted((row[5], row[1]) for row in info if row[5] > 0)
    ordering = ','.join('"' + col.replace('"', '""') + '"' for _, col in pk) if pk else 'rowid'
    count = db.execute(f'SELECT count(*) FROM {ident}{where_clause}').fetchone()[0]

    if name == 'logical_block':
        raw_rows = db.execute(
            f'SELECT * FROM {ident} ORDER BY logical_order, logical_id'
        ).fetchall()
    else:
        raw_rows = db.execute(
            f'SELECT * FROM {ident}{where_clause} ORDER BY {ordering} LIMIT ? OFFSET ?',
            (PAGE_SIZE, offset),
        ).fetchall()

    originals = (
        {
            r['blockid']: r['block_json']
            for r in db.execute('SELECT blockid, block_json FROM mineru_base WHERE blockid > 0')
        }
        if name == 'logical_block'
        else {}
    )
    rows_out: list[dict] = []
    for rec in raw_rows:
        row = dict(rec)
        if 'original_bytes' in row:
            row['original_bytes'] = None
        if name == 'logical_block':
            src_json = originals.get(row['base_blockid'])
            elem = raw_at(src_json, row['raw_path']) if src_json and row['raw_path'] else None
            row['raw_block'] = raw_element_text(elem) if elem is not None else None
            row['md_sha256'] = sha256_text(row['md_block'])
        rows_out.append(row)
    return {'name': name, 'columns': cols, 'rowCount': count, 'rows': rows_out}


def existing_v3_state(folder: Path, offset: int = 0, table: str = 'mineru_base') -> dict:
    """只读读取 ocr2md.v3.sqlite 状态、物理表目录、行数据及当前 structureSha256。"""
    db_path = folder / DB_NAME
    if not os.path.lexists(db_path):
        return {'exists': False, 'dbFile': DB_NAME}
    with open_v3_db(folder, 'ro') as db:
        db.execute('BEGIN')
        meta = assert_v3_schema(db)
        names = _physical_tables(db)
        if table == 'logical_block':
            offset = 0
        chosen = _read_table(db, table, offset)
        catalog = []
        for tbl_name in names:
            ident = '"' + tbl_name.replace('"', '""') + '"'
            catalog.append({
                'name': tbl_name,
                'columns': [r[1] for r in db.execute(f'PRAGMA table_info({ident})')],
            })
        block_count = db.execute('SELECT count(*) FROM mineru_base WHERE blockid > 0').fetchone()[0]
        para_count = db.execute(
            "SELECT count(*) FROM mineru_base WHERE block_group = 'para_blocks'"
        ).fetchone()[0]
        logical_struct = db.execute(
            'SELECT logical_id, parent_id, logical_order, p, b, s FROM logical_block ORDER BY logical_order'
        ).fetchall()
        return {
            'exists': True,
            'dbFile': DB_NAME,
            'schema': SCHEMA,
            'compression': meta.get('compression'),
            'sourceCount': len(meta['sources']),
            'sources': meta['sources'],
            'blockCount': block_count,
            'paraBlockCount': para_count,
            'logicalCount': len(logical_struct),
            'structureSha256': compute_structure_sha256(logical_struct),
            'offset': offset,
            'pageSize': PAGE_SIZE,
            'tables': catalog,
            'tableName': chosen['name'],
            'rowCount': chosen['rowCount'],
            'columns': chosen['columns'],
            'rows': chosen['rows'],
        }


def existing_v3_markdown(folder: Path) -> dict:
    """只读导出当前 V3 单轨 owned-LF Markdown 全文、坐标区间与 structureSha256。"""
    with open_v3_db(folder, 'ro') as db:
        db.execute('BEGIN')
        assert_v3_schema(db)
        records = db.execute(
            'SELECT logical_id, base_blockid, parent_id, logical_order, md_block, block_type, p, b, s, raw_path '
            'FROM logical_block ORDER BY logical_order'
        ).fetchall()
        if not records:
            raise V3Error(409, 'V3 逻辑表为空，无法重构文档')
        try:
            typed_rows = rows_from_sql(records)
            snapshot = to_owned_markdown(typed_rows)
            if from_owned_markdown(snapshot) != typed_rows:
                raise V3Error(409, '只读 Markdown 往返校验与逻辑表不一致')
            return snapshot
        except ValueError as err:
            raise V3Error(409, '逻辑表无法无损重构 owned-LF 正文：' + str(err)) from err


def existing_v3_pdf_map(folder: Path) -> dict:
    """只读导出当前 V3 逻辑块与物理 PDF 的几何覆盖框及公式块映射。"""
    with open_v3_db(folder, 'ro') as db:
        db.execute('BEGIN')
        assert_v3_schema(db)
        try:
            return project_v3_pdf(db)
        except PDFProjectionError as err:
            raise V3Error(409, str(err)) from err


def read_verified_pdf(folder: Path) -> bytes:
    """只读读取已授权书籍目录或其 pdf/ 子目录下的唯一原始 PDF 字节。"""
    candidates: list[Path] = []
    for directory in (folder, folder / 'pdf'):
        if directory != folder:
            if not os.path.lexists(directory):
                continue
            if directory.is_symlink() or not directory.is_dir():
                raise V3Error(403, 'PDF 子目录不允许是符号链接')
        for item in sorted(directory.iterdir()):
            if item.name.startswith('.') or item.suffix.lower() != '.pdf':
                continue
            candidates.append(item)
    if not candidates:
        raise V3Error(404, '工作目录中没有可预览的原始 PDF 文件')
    if len(candidates) != 1:
        raise V3Error(409, '检测到多个 PDF 文件，禁止猜测对应 MinerU 来源')

    raw = require_regular_readonly_bytes(candidates[0], max_bytes=MAX_PDF_FILE, label='原始 PDF ')
    if len(raw) < 8 or not raw.startswith(b'%PDF-'):
        raise V3Error(422, 'PDF 原始字节不完整或缺少 %PDF- 文件头')
    return raw


def import_v3_book(folder: Path, payload: dict, common: object) -> dict:
    """处理显式确认的 V3 新书导入：同源幂等返回，异源或非空未知库拒绝覆盖。"""
    if payload.get('confirm') != 'import-v3-mineru-base' or set(payload) != {'workspace', 'confirm'}:
        raise V3Error(422, '缺少明确的 V3 基础表导入确认字段')

    if os.path.lexists(folder / DB_NAME):
        state = existing_v3_state(folder)
        sources = discover_mineru_sources(folder)
        archived_pairs = [(item['path'], item['sha256']) for item in state['sources']]
        disk_pairs = [(rel, sha256_bytes(raw)) for rel, raw, _ in sources]
        if archived_pairs != disk_pairs:
            raise V3Error(409, '磁盘 MinerUJSON 与现有 V3 数据库来源不一致，拒绝自动覆盖已有状态')
        if state['logicalCount'] == 0:
            raise V3Error(409, '现有 V3 数据库逻辑表为空，请显式执行初始化恢复')
        return {
            'created': False,
            'replaced': False,
            'dbFile': DB_NAME,
            'schema': SCHEMA,
            'compression': state['compression'],
            'sourceCount': state['sourceCount'],
            'blockCount': state['blockCount'],
            'logicalCount': state['logicalCount'],
            'structureSha256': state['structureSha256'],
        }

    # 新建数据库前必须复用 Frame F02 真实读写回读清理探针
    common.probe(folder)
    return create_fresh_v3_book(folder)
