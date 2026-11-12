"""CMD API: minerujson2span. Lossless Span projection of the imported MinerU source.

One SQLite row per actual span, including nested Block lineage. The original
`minerujson` source/block records and source PDF/JSON are never mutated.
"""
from __future__ import annotations
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import OCRImportError, _db, existing_info, REVIEW_BLOCK_GROUP

TABLE = 'span'
SCHEMA = '''CREATE TABLE span (
 span_id TEXT PRIMARY KEY,
 source_order INTEGER NOT NULL,
 source_name TEXT NOT NULL,
 global_page INTEGER NOT NULL,
 local_page INTEGER NOT NULL,
 page_size_json TEXT NOT NULL,
 block_group TEXT NOT NULL CHECK(block_group='para_blocks'),
 block_id TEXT NOT NULL,
 parent_block_id TEXT,
 block_path TEXT NOT NULL,
 block_index INTEGER,
 block_type TEXT NOT NULL,
 block_bbox_json TEXT,
 block_attrs_json TEXT NOT NULL,
 line_index INTEGER NOT NULL,
 line_bbox_json TEXT,
 line_attrs_json TEXT NOT NULL,
 span_index INTEGER NOT NULL,
 span_type TEXT NOT NULL,
 span_bbox_json TEXT,
 content TEXT,
 html TEXT,
 image_path TEXT,
 content_preview TEXT NOT NULL,
 span_json TEXT NOT NULL,
 import_fingerprint TEXT NOT NULL,
 UNIQUE(source_order, global_page, block_group, block_path, line_index, span_index)
)'''
LIMIT = 500000

def _dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))

def _rows(source_order: int, source_name: str, global_page: int, page: dict, signature: str):
    local_page = page['page_idx']
    page_size = _dump(page.get('page_size'))
    for group in (REVIEW_BLOCK_GROUP,):
        def walk(block, path, parent):
            if not isinstance(block, dict):
                raise OCRImportError('嵌套 Block 不是对象')
            block_path = '.'.join(map(str, path))
            bid = f's{source_order}:p{global_page}:{group}:b{block_path}'
            battrs = _dump({k: v for k, v in block.items() if k not in ('blocks', 'lines')})
            for li, line in enumerate(block.get('lines', [])):
                if not isinstance(line, dict) or not isinstance(line.get('spans'), list):
                    raise OCRImportError('MinerU 行的 spans 结构无效')
                lattrs = _dump({k: v for k, v in line.items() if k != 'spans'})
                for si, span in enumerate(line['spans']):
                    if not isinstance(span, dict):
                        raise OCRImportError('MinerU span 不是对象')
                    def field(k):
                        value = span.get(k)
                        return value if isinstance(value, str) else None
                    value = next((v for v in (field('content'), field('html'), field('image_path')) if v is not None), '')
                    yield (f'{bid}:l{li}:s{si}', source_order, source_name, global_page,
                           local_page, page_size, group, bid, parent, block_path,
                           block.get('index') if type(block.get('index')) is int else None,
                           str(block.get('type', '')), _dump(block.get('bbox')), battrs,
                           li, _dump(line.get('bbox')), lattrs, si, str(span.get('type', '')),
                           _dump(span.get('bbox')), field('content'), field('html'),
                           field('image_path'), value[:260], _dump(span), signature)
            children = block.get('blocks', [])
            if not isinstance(children, list):
                raise OCRImportError('嵌套 blocks 不是数组')
            for ci, child in enumerate(children):
                yield from walk(child, (*path, ci), bid)
        for bi, block in enumerate(page.get(group, [])):
            yield from walk(block, (bi,), None)

def minerujson2span(book: Path) -> dict:
    """Build/update the Span table atomically from imported original_bytes.

    Repeated calls for the same imported fingerprint are no-ops. Returns row
    count, source identity and status for the caller; never edits MinerU input.
    """
    info = existing_info(book)
    if info is None:
        raise OCRImportError('请先导入 minerujson 表')
    conn = sqlite3.connect(_db(book), timeout=20)
    try:
        conn.execute('BEGIN IMMEDIATE')
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if tables - {'minerujson', 'block', TABLE}:
            raise OCRImportError('SQLite 中存在未知表，拒绝修改')
        old = None
        if TABLE in tables:
            columns = {r[1] for r in conn.execute('PRAGMA table_info(span)')}
            if not {'span_id','parent_block_id','span_json','import_fingerprint','block_path'}.issubset(columns):
                raise OCRImportError('现有 span 表结构不兼容，拒绝覆盖')
            old = conn.execute('SELECT COUNT(*),MIN(import_fingerprint),MAX(import_fingerprint) FROM span').fetchone()
            if old[0] > 0 and old[1] == old[2] == info['signature']:
                # Existing three-group snapshots migrate without renumbering
                # Span identities or rewriting the original MinerU bytes.
                removed=conn.execute('DELETE FROM span WHERE block_group<>?',(REVIEW_BLOCK_GROUP,)).rowcount
                conn.commit()
                return {'status':'filtered' if removed else 'unchanged','table':TABLE,'spans':old[0]-removed}
        sources = conn.execute("SELECT source_order,source_name,source_sha256,source_page_count,original_bytes,import_fingerprint FROM minerujson WHERE row_kind='source' ORDER BY source_order").fetchall()
        if not sources:
            raise OCRImportError('minerujson 表没有来源 JSON')
        count = 0
        offset = 0
        # A rollback leaves the previous span table intact if any source fails.
        conn.execute('DROP TABLE IF EXISTS span')
        conn.execute(SCHEMA)
        columns = 'span_id,source_order,source_name,global_page,local_page,page_size_json,block_group,block_id,parent_block_id,block_path,block_index,block_type,block_bbox_json,block_attrs_json,line_index,line_bbox_json,line_attrs_json,span_index,span_type,span_bbox_json,content,html,image_path,content_preview,span_json,import_fingerprint'
        query = f'INSERT INTO span ({columns}) VALUES ({",".join("?" for _ in range(26))})'
        for order, name, sha, page_count, raw, signature in sources:
            if raw is None or hashlib.sha256(raw).hexdigest() != sha or signature != info['signature']:
                raise OCRImportError('MinerU 来源字节校验失败')
            data = json.loads(raw)
            pages = data.get('pdf_info')
            if not isinstance(pages, list) or len(pages) != page_count:
                raise OCRImportError('MinerU 页数据不一致')
            for local_position, page in enumerate(pages):
                if not isinstance(page, dict) or type(page.get('page_idx')) is not int:
                    raise OCRImportError('MinerU 页码无效')
                for record in _rows(order, name, offset + local_position, page, signature):
                    count += 1
                    if count > LIMIT:
                        raise OCRImportError('Span 数超出安全上限')
                    conn.execute(query, record)
            offset += page_count
        conn.execute('CREATE INDEX idx_span_location ON span(global_page,block_group,block_path,line_index,span_index)')
        conn.commit()
        return {'status':'created','table':TABLE,'spans':count}
    except (sqlite3.DatabaseError, ValueError, TypeError, KeyError) as error:
        conn.rollback()
        if isinstance(error, OCRImportError):
            raise
        raise OCRImportError('生成 span 表失败：'+str(error)) from error
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def span_rows(book: Path, offset: int=0, limit: int=200) -> dict:
    if type(offset) is not int or offset < 0 or type(limit) is not int or not 1 <= limit <= 500:
        raise OCRImportError('分页参数无效')
    if existing_info(book) is None:
        raise OCRImportError('请先导入 minerujson')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro', uri=True, timeout=5)) as conn:
        conn.row_factory = sqlite3.Row
        if conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='span'").fetchone()[0] != 1:
            raise OCRImportError('尚未生成 span 表')
        total = conn.execute('SELECT COUNT(*) FROM span WHERE block_group=?',(REVIEW_BLOCK_GROUP,)).fetchone()[0]
        data = conn.execute('''SELECT span_id, source_order, source_name, global_page,local_page,
                block_group,block_id,parent_block_id,block_path,block_index,block_type,
                block_bbox_json,line_index,line_bbox_json,span_index,span_type,
                span_bbox_json,content,html,image_path,content_preview,span_json,
                block_attrs_json,line_attrs_json,page_size_json
                FROM span WHERE block_group=? ORDER BY rowid LIMIT ? OFFSET ?''',
                (REVIEW_BLOCK_GROUP,limit,offset)).fetchall()
    return {'table':TABLE,'total':total,'offset':offset,'limit':limit,'rows':[dict(r) for r in data]}
