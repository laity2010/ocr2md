"""V3 单轨 owned-LF Markdown 往返投影、结构摘要计算与原始 PDF 几何投影。

遵循 SQL.md 第 2–4 节：
1. 仅支持单轨 owned-LF（v3-logical-md/v1），不携带任何旧版虚拟组尾 LF 分支；
2. 统一计算有序结构摘要 structure_sha256 与块正文 fragmentSha256（md_sha256）；
3. PDF 投影从 blockid=0 的 zlib 归档解压校验原始页面尺寸，不伪造坐标。
"""
from __future__ import annotations

import json
import math
import sqlite3

from .compile import LogicalBlockRow, raw_at
from .db import (
    OWNED_MD_SCHEMA,
    PDF_PROJECTION_SCHEMA,
    V3Error,
    compact_json,
    decompress_source_archive,
    sha256_text,
    validate_pbs_coordinates,
)

MAX_MD_BYTES = 8 * 1024 * 1024
MAX_ROWS = 100_000


class PDFProjectionError(ValueError):
    """原始 PDF 映射投影校验异常。"""


def length_utf16(text: str) -> int:
    """计算字符串在 JavaScript / CodeMirror 6 中的 UTF-16 code unit 长度。"""
    return len(text.encode('utf-16-le')) // 2


def compute_structure_sha256(rows: list[LogicalBlockRow | dict | sqlite3.Row]) -> str:
    """计算全书有序逻辑结构 (logical_id, parent_id, logical_order, p, b, s) 的确定性 SHA-256。

    供 WP03 md-commit / structure-commit 轻量摘要式 CAS 直接核验全表 PBS 结构未漂移。
    """
    normalized: list[list[int | None]] = []
    for item in rows:
        if isinstance(item, LogicalBlockRow):
            normalized.append([
                item.logical_id, item.parent_id, item.logical_order,
                item.p, item.b, item.s,
            ])
        else:
            normalized.append([
                item['logical_id'], item['parent_id'], item['logical_order'],
                item['p'], item['b'], item['s'],
            ])
    normalized.sort(key=lambda entry: (entry[2] if entry[2] is not None else 0, entry[0] or 0))
    return sha256_text(compact_json(normalized))


def rows_from_sql(records: list[sqlite3.Row | dict]) -> list[LogicalBlockRow]:
    """将数据库查询记录转换为强类型 LogicalBlockRow 列表。"""
    return [
        LogicalBlockRow(
            logical_id=r['logical_id'],
            base_blockid=r['base_blockid'],
            parent_id=r['parent_id'],
            logical_order=r['logical_order'],
            md_block=r['md_block'],
            block_type=r['block_type'],
            p=r['p'],
            b=r['b'],
            s=r['s'],
            raw_path=r['raw_path'] if 'raw_path' in r.keys() else None,
        )
        for r in records
    ]


def validate_owned_rows(rows: list[LogicalBlockRow]) -> list[LogicalBlockRow]:
    """严格核验单轨 owned-LF 逻辑块序列的顺序、父子层级、组连续性与尾换行不变量。"""
    result = list(rows)
    if len(result) > MAX_ROWS:
        raise ValueError('逻辑块数量超出单文档上限')
    if [r.logical_order for r in result] != list(range(1, len(result) + 1)):
        raise ValueError('logical_order 必须为连续正整数 1..N')
    ids = [r.logical_id for r in result]
    if any(type(v) is not int or v <= 0 for v in ids) or len(set(ids)) != len(ids):
        raise ValueError('logical_id 必须为正整数且全局唯一')
    for r in result:
        if (
            type(r.base_blockid) is not int
            or r.base_blockid <= 0
            or not isinstance(r.md_block, str)
            or not isinstance(r.block_type, str)
        ):
            raise ValueError('逻辑块来源或正文类型无效')
        if '\r' in r.md_block:
            raise ValueError(f'逻辑块 {r.logical_id} 含有非法 CR 字符')

    coords = [{'logical_id': r.logical_id, 'p': r.p, 'b': r.b, 's': r.s} for r in result]
    groups = validate_pbs_coordinates(coords)
    seen_groups: set[tuple[int, int]] = set()

    for idx, row in enumerate(result):
        gkey = (row.p, row.b)
        prev = result[idx - 1] if idx > 0 else None
        if prev is None or (prev.p, prev.b) != gkey:
            if gkey in seen_groups or row.s != 0:
                raise ValueError(f'PBS 组 p{row.p}b{row.b} 不连续或未以 s0 起始')
            seen_groups.add(gkey)
        elif row.s <= prev.s:
            raise ValueError(f'PBS 子块顺序非法（logical_id={row.logical_id}）')
        expected_parent = None if row.s == 0 else groups[gkey][0]
        if row.parent_id != expected_parent:
            raise ValueError(f'PBS parent_id 与组根不一致（logical_id={row.logical_id}）')

        nxt = result[idx + 1] if idx + 1 < len(result) else None
        min_lf = 1 if (nxt is not None and (nxt.p, nxt.b) == gkey) else 2
        if not row.md_block.endswith('\n' * min_lf):
            raise ValueError(f'逻辑块 {row.logical_id} 缺少必要的 owned-LF 尾换行（需至少 {min_lf} 个）')
    return result


def to_owned_markdown(rows: list[LogicalBlockRow]) -> dict:
    """将单轨 owned-LF 逻辑块拼接为完整 Markdown 文档与外部 UTF-16 坐标及哈希清单。"""
    validated = validate_owned_rows(rows)
    pieces: list[str] = []
    segments: list[dict] = []
    start_char = 0
    start_utf16 = 0
    total_bytes = 0

    for row in validated:
        chunk = row.md_block
        total_bytes += len(chunk.encode('utf-8'))
        if total_bytes > MAX_MD_BYTES:
            raise ValueError('逻辑 Markdown 总大小超过 8 MiB 上限')
        end_char = start_char + len(chunk)
        end_utf16 = start_utf16 + length_utf16(chunk)
        frag_sha = sha256_text(chunk)
        segments.append({
            'logicalId': row.logical_id,
            'baseBlockId': row.base_blockid,
            'parentId': row.parent_id,
            'logicalOrder': row.logical_order,
            'blockType': row.block_type,
            'p': row.p,
            'b': row.b,
            's': row.s,
            'rawPath': row.raw_path,
            'startChar': start_char,
            'endChar': end_char,
            'startUtf16': start_utf16,
            'endUtf16': end_utf16,
            'fragmentSha256': frag_sha,
        })
        pieces.append(chunk)
        start_char = end_char
        start_utf16 = end_utf16

    document = ''.join(pieces)
    return {
        'schema': OWNED_MD_SCHEMA,
        'markdown': document,
        'sha256': sha256_text(document),
        'structureSha256': compute_structure_sha256(validated),
        'rowCount': len(validated),
        'lengthUtf16': start_utf16,
        'segments': segments,
    }


def from_owned_markdown(snapshot: dict) -> list[LogicalBlockRow]:
    """严格逆变换：由完整 Markdown 文档与外部坐标清单无损还原全部 LogicalBlockRow。"""
    if not isinstance(snapshot, dict) or snapshot.get('schema') != OWNED_MD_SCHEMA:
        raise ValueError('Markdown 快照 Schema 版本不匹配')
    md = snapshot.get('markdown')
    seg = snapshot.get('segments')
    if not isinstance(md, str) or not isinstance(seg, list):
        raise ValueError('Markdown 快照正文或坐标清单缺失')
    if len(md.encode('utf-8')) > MAX_MD_BYTES or len(seg) > MAX_ROWS:
        raise ValueError('Markdown 快照超出允许规模')
    if snapshot.get('rowCount') != len(seg) or snapshot.get('sha256') != sha256_text(md):
        raise ValueError('Markdown 全文 SHA-256 或块数量不一致')
    if snapshot.get('lengthUtf16') != length_utf16(md):
        raise ValueError('Markdown UTF-16 长度不一致')

    reconstructed: list[LogicalBlockRow] = []
    cursor = 0
    cursor16 = 0
    for item in seg:
        if not isinstance(item, dict):
            raise ValueError('逻辑区间项格式无效')
        begin = item.get('startChar')
        end = item.get('endChar')
        if type(begin) is not int or type(end) is not int or begin != cursor or end < begin or end > len(md):
            raise ValueError('逻辑块字符区间不连续或越界')
        fragment = md[begin:end]
        if (
            item.get('startUtf16') != cursor16
            or item.get('endUtf16') != cursor16 + length_utf16(fragment)
            or item.get('fragmentSha256') != sha256_text(fragment)
        ):
            raise ValueError('逻辑块 UTF-16 坐标或片段哈希不一致')
        reconstructed.append(LogicalBlockRow(
            logical_id=item.get('logicalId'),
            base_blockid=item.get('baseBlockId'),
            parent_id=item.get('parentId'),
            logical_order=item.get('logicalOrder'),
            md_block=fragment,
            block_type=item.get('blockType'),
            p=item.get('p'),
            b=item.get('b'),
            s=item.get('s'),
            raw_path=item.get('rawPath'),
        ))
        cursor = end
        cursor16 += length_utf16(fragment)

    if cursor != len(md) or cursor16 != length_utf16(md):
        raise ValueError('Markdown 末尾存在未归属字符')
    validated = validate_owned_rows(reconstructed)
    expected_struct = snapshot.get('structureSha256')
    if expected_struct is not None and expected_struct != compute_structure_sha256(validated):
        raise ValueError('结构摘要 structureSha256 校验不一致')
    return validated


def _valid_bbox(box: object, size: object) -> bool:
    if not isinstance(box, list) or len(box) != 4 or not isinstance(size, list) or len(size) != 2:
        return False
    if any(
        not isinstance(v, (int, float)) or isinstance(v, bool) or not math.isfinite(v)
        for v in (*box, *size)
    ):
        return False
    x0, y0, x1, y1 = box
    w, h = size
    return w > 0 and h > 0 and 0 <= x0 < x1 <= w and 0 <= y0 < y1 <= h


def project_v3_pdf(db: sqlite3.Connection) -> dict:
    """从 zlib 原始归档与当前逻辑块只读投影物理 PDF 页尺寸、覆盖框及公式证据块。"""
    archive = db.execute(
        'SELECT block_json, original_bytes FROM mineru_base WHERE blockid = 0'
    ).fetchone()
    if not archive:
        raise PDFProjectionError('缺少原始 MinerU 来源归档')
    meta = json.loads(archive['block_json'])
    sources = meta.get('sources') or []
    if len(sources) != 1:
        raise PDFProjectionError('多分卷 MinerUJSON 尚未绑定单一 PDF，拒绝猜测页面映射')
    try:
        decompressed = decompress_source_archive(archive['original_bytes'], sources)
    except V3Error as err:
        raise PDFProjectionError(str(err)) from err

    src_entry = decompressed[0]
    doc = json.loads(src_entry['raw'].decode('utf-8'))
    pdf_info = doc.get('pdf_info')
    if not isinstance(pdf_info, list) or not pdf_info:
        raise PDFProjectionError('MinerUJSON 缺少有效 pdf_info 页面证据')

    page_sizes: list[list[float | int]] = []
    for idx, page in enumerate(pdf_info):
        if not isinstance(page, dict):
            raise PDFProjectionError(f'第 {idx + 1} 页结构无效')
        size = page.get('page_size')
        if (
            not isinstance(size, list)
            or len(size) != 2
            or any(not isinstance(n, (int, float)) or isinstance(n, bool) or not math.isfinite(n) or n <= 0 for n in size)
        ):
            raise PDFProjectionError(f'第 {idx + 1} 页缺少有效原始页面尺寸')
        if page.get('page_idx', idx) != idx:
            raise PDFProjectionError('MinerU 页序非连续原始 PDF 页序，拒绝假定坐标对应')
        page_sizes.append(size)

    base = {
        r['blockid']: r
        for r in db.execute(
            'SELECT blockid, page_index, block_group, page_block_index, bbox_json, block_json '
            'FROM mineru_base WHERE blockid > 0 ORDER BY blockid'
        )
    }
    logical = [
        dict(r)
        for r in db.execute(
            'SELECT logical_id, base_blockid, parent_id, logical_order, md_block, block_type, p, b, s, raw_path '
            'FROM logical_block ORDER BY logical_order, logical_id'
        )
    ]
    try:
        groups = validate_pbs_coordinates(logical)
    except ValueError as err:
        raise PDFProjectionError(str(err)) from err

    roots = {row['logical_id']: groups[(row['p'], row['b'])][0] for row in logical}
    pbs_map = {row['logical_id']: f"p{row['p']}b{row['b']}s{row['s']}" for row in logical}
    covers: list[dict] = []
    unmapped: list[int] = []
    formula_blocks: list[dict] = []

    for row in logical:
        lid = row['logical_id']
        original = base.get(row['base_blockid'])
        if not original or original['block_group'] != 'para_blocks' or not row['raw_path']:
            unmapped.append(lid)
            continue
        page = original['page_index']
        if type(page) is not int or not (0 <= page < len(page_sizes)):
            unmapped.append(lid)
            continue
        try:
            bbox = json.loads(original['bbox_json']) if original['bbox_json'] else None
        except (TypeError, ValueError):
            bbox = None

        element = raw_at(original['block_json'], row['raw_path'])
        if isinstance(element, dict):
            lines = element.get('lines') or []
            if any(
                isinstance(span, dict) and span.get('type') in ('inline_equation', 'interline_equation')
                for line in lines if isinstance(line, dict)
                for span in (line.get('spans') or [])
            ):
                formula_blocks.append({
                    'block_id': lid,
                    'base_blockid': row['base_blockid'],
                    'block_type': element.get('type', ''),
                    'global_page': page,
                    'page_size_json': page_sizes[page],
                    'block_json': element,
                })
            if row['raw_path'] != '$':
                child_bbox = element.get('bbox')
                if _valid_bbox(child_bbox, page_sizes[page]):
                    bbox = child_bbox

        if not _valid_bbox(bbox, page_sizes[page]):
            unmapped.append(lid)
            continue

        # owned-LF 下空逻辑块仅含尾换行符，去除尾 LF 后判空以准确驱动 PDF 虚线/实线提示
        is_empty = row['md_block'].rstrip('\n') == ''
        covers.append({
            'logicalId': lid,
            'baseBlockId': row['base_blockid'],
            'parentId': None if row['s'] == 0 else roots[lid],
            'rootLogicalId': roots[lid],
            'logicalOrder': row['logical_order'],
            'pbs': pbs_map[lid],
            'physicalPageIndex': page,
            'physicalBlockIndex': original['page_block_index'],
            'pageSize': page_sizes[page],
            'bbox': bbox,
            'empty': is_empty,
        })

    return {
        'schema': PDF_PROJECTION_SCHEMA,
        'sourcePath': src_entry['path'],
        'pageCount': len(page_sizes),
        'pageSizes': page_sizes,
        'logicalCount': len(logical),
        'mappedCount': len(covers),
        'unmappedLogicalIds': unmapped,
        'covers': covers,
        'formulaBlocks': formula_blocks,
        'structureSha256': compute_structure_sha256(logical),
        'pbs': {str(row['logical_id']): pbs_map[row['logical_id']] for row in logical},
    }
