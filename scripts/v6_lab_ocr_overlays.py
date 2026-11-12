"""Read-only, page-scoped PDF rectangle projection from derived OCR tables.

No MinerU bytes are rewritten; caller receives only geometry, never text.
Page numbers are 1-based for PDF.js while SQL global_page is 0-based.
"""
from __future__ import annotations

import json
import math
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import OCRImportError, REVIEW_BLOCK_GROUP, _db, existing_info

MAX_PAGE_BOXES = 5000


def overlay_rows(book: Path, level: str, page: int) -> dict:
    if level not in ('block', 'span'):
        raise OCRImportError('覆盖框粒度只能是 block 或 span')
    if type(page) is not int or not 1 <= page <= 200:
        raise OCRImportError('覆盖框页码无效')
    if existing_info(book) is None:
        raise OCRImportError('请先导入 MinerU JSON')
    table = level  # Restrict SQL identifiers to the validated allowlist above.
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro', uri=True, timeout=5)) as db:
        if db.execute('SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name=?',
                      (table,)).fetchone()[0] != 1:
            raise OCRImportError(f'尚未生成 {table} 表')
        if level == 'block':
            records = db.execute(
                'SELECT block_id,page_size_json,block_bbox_json,block_type,block_group,'
                'block_id,pbs,parent_block_id FROM block '
                'WHERE global_page=? AND block_group=? ORDER BY rowid LIMIT ?',
                (page - 1, REVIEW_BLOCK_GROUP,MAX_PAGE_BOXES + 1)).fetchall()
        else:
            # A Span is linked through the immutable source_block_key, never
            # through the mutable human PBS. Span works even without block.
            has_blocks = db.execute('SELECT COUNT(*) FROM sqlite_master '
                                    'WHERE type=\'table\' AND name=\'block\'').fetchone()[0] == 1
            if has_blocks:
                records = db.execute(
                    'SELECT s.span_id,s.page_size_json,s.span_bbox_json,s.block_type,'
                    's.block_group,b.block_id,b.pbs,b.parent_block_id FROM span AS s '
                    'LEFT JOIN block AS b ON b.source_block_key=s.block_id '
                    'WHERE s.global_page=? AND s.block_group=? ORDER BY s.rowid LIMIT ?',
                    (page - 1, REVIEW_BLOCK_GROUP,MAX_PAGE_BOXES + 1)).fetchall()
            else:
                records = db.execute(
                    'SELECT span_id,page_size_json,span_bbox_json,block_type,block_group,'
                    'NULL,NULL,NULL FROM span WHERE global_page=? AND block_group=? ORDER BY rowid LIMIT ?',
                    (page - 1, REVIEW_BLOCK_GROUP,MAX_PAGE_BOXES + 1)).fetchall()
    if len(records) > MAX_PAGE_BOXES:
        raise OCRImportError('单页覆盖框超过允许上限')
    size = None
    result = []
    for identity, raw_size, raw_bbox, block_type, block_group, block_id, pbs, parent_id in records:
        try:
            dimensions = json.loads(raw_size)
            rect = json.loads(raw_bbox)
        except (ValueError, TypeError):
            continue
        valid_size = (isinstance(dimensions, list) and len(dimensions) == 2 and
                      all(type(n) in (int, float) and math.isfinite(n) and n > 0 for n in dimensions))
        if not valid_size:
            continue
        if size is None:
            size = dimensions
        elif dimensions != size:
            raise OCRImportError('同页覆盖框的页面尺寸不一致')
        if (not isinstance(rect, list) or len(rect) != 4 or
                not all(type(n) in (int, float) and math.isfinite(n) for n in rect)):
            continue
        x1, y1, x2, y2 = rect
        if x2 <= x1 or y2 <= y1:
            continue
        result.append({'id': str(identity), 'blockId': str(block_id) if block_id is not None else None,
                       'pbs': str(pbs or ''), 'parentBlockId': str(parent_id) if parent_id is not None else None,
                       'blockType': str(block_type or ''), 'blockGroup': str(block_group or ''),
                       'bbox': rect})
    return {'level': level, 'page': page, 'pageSize': size, 'boxes': result}
