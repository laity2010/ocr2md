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

from v6_lab_ocr_store import OCRImportError, _db, existing_info

MAX_PAGE_BOXES = 5000


def overlay_rows(book: Path, level: str, page: int) -> dict:
    if level not in ('block', 'span'):
        raise OCRImportError('覆盖框粒度只能是 block 或 span')
    if type(page) is not int or not 1 <= page <= 200:
        raise OCRImportError('覆盖框页码无效')
    if existing_info(book) is None:
        raise OCRImportError('请先导入 MinerU JSON')
    table = level  # Restrict SQL identifiers to the validated allowlist above.
    id_column = 'block_id' if table == 'block' else 'span_id'
    bbox_column = 'block_bbox_json' if table == 'block' else 'span_bbox_json'
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro', uri=True, timeout=5)) as db:
        if db.execute('SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name=?',
                      (table,)).fetchone()[0] != 1:
            raise OCRImportError(f'尚未生成 {table} 表')
        records = db.execute(
            f'SELECT {id_column},page_size_json,{bbox_column},block_type,block_group FROM {table} '
            'WHERE global_page=? ORDER BY rowid LIMIT ?', (page - 1, MAX_PAGE_BOXES + 1)).fetchall()
    if len(records) > MAX_PAGE_BOXES:
        raise OCRImportError('单页覆盖框超过允许上限')
    size = None
    result = []
    for identity, raw_size, raw_bbox, block_type, block_group in records:
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
        result.append({'id': str(identity), 'blockType': str(block_type or ''), 'blockGroup': str(block_group or ''), 'bbox': rect})
    return {'level': level, 'page': page, 'pageSize': size, 'boxes': result}
