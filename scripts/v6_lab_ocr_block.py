"""CMD API: minerujson2block — one row per MinerU Block, with intact Lines/Spans.

Nested Block children become separate rows linked by parent_block_id and
path/order. Every block_json retains all original Block fields except its child
`blocks` array, whose presence and order are separately preserved. The
original source JSON stays untouched in minerujson.source.original_bytes.
"""
from __future__ import annotations
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import BLOCK_GROUPS, OCRImportError, _db, existing_info

TABLE = 'block'
LIMIT = 500000
SCHEMA = '''CREATE TABLE block (
 block_id TEXT PRIMARY KEY,
 source_order INTEGER NOT NULL,
 source_name TEXT NOT NULL,
 global_page INTEGER NOT NULL,
 local_page INTEGER NOT NULL,
 page_size_json TEXT NOT NULL,
 block_group TEXT NOT NULL,
 block_path TEXT NOT NULL,
 parent_block_id TEXT,
 sibling_order INTEGER NOT NULL,
 block_index INTEGER,
 block_type TEXT NOT NULL,
 block_bbox_json TEXT,
 line_count INTEGER NOT NULL,
 span_count INTEGER NOT NULL,
 span_types TEXT NOT NULL,
 content_preview TEXT NOT NULL,
 block_json TEXT NOT NULL,
 has_blocks_field INTEGER NOT NULL CHECK(has_blocks_field IN (0,1)),
 import_fingerprint TEXT NOT NULL,
 UNIQUE (source_order,global_page,block_group,block_path)
)'''

def _dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',',':'))

def _records(source_order:int, source_name:str, global_page:int, page:dict, signature:str):
    local_page = page['page_idx']
    page_size_json = _dump(page.get('page_size'))
    for group in BLOCK_GROUPS:
        for bi, root in enumerate(page.get(group, [])):
            def walk(block:dict, path:tuple[int,...], parent:str|None):
                if not isinstance(block,dict):
                    raise OCRImportError('嵌套 Block 不是对象')
                children = block.get('blocks', [])
                if not isinstance(children, list):
                    raise OCRImportError('嵌套 blocks 不是数组')
                lines = block.get('lines', [])
                if not isinstance(lines, list):
                    raise OCRImportError('Block.lines 不是数组')
                types=[]
                preview=[]
                count=0
                for line in lines:
                    if not isinstance(line,dict) or not isinstance(line.get('spans'),list):
                        raise OCRImportError('Line.spans 不是数组')
                    for span in line['spans']:
                        if not isinstance(span,dict):
                            raise OCRImportError('Span 不是对象')
                        count+=1
                        types.append(str(span.get('type','')))
                        if len(' '.join(preview)) < 260:
                            for key in ('content','html','image_path'):
                                value=span.get(key)
                                if isinstance(value,str):
                                    preview.append(value[:260]);break
                path_str='.'.join(map(str,path))
                bid=f's{source_order}:p{global_page}:{group}:b{path_str}'
                own={k:v for k,v in block.items() if k!='blocks'}
                # Block JSON contains original Lines/Spans verbatim, not a lossy
                # text projection. Child Blocks are distinct rows, never copies.
                yield (bid,source_order,source_name,global_page,local_page,
                       page_size_json,group,path_str,parent,path[-1],
                       block.get('index') if type(block.get('index')) is int else None,
                       str(block.get('type','')),_dump(block.get('bbox')),
                       len(lines),count,','.join(dict.fromkeys(types)),
                       ' '.join(preview)[:260],_dump(own),int('blocks' in block),signature)
                for ci,child in enumerate(children):
                    yield from walk(child, (*path,ci),bid)
            yield from walk(root,(bi,),None)

def minerujson2block(book:Path)->dict:
    """Create an idempotent, transactional Block projection from saved source bytes."""
    info=existing_info(book)
    if info is None:raise OCRImportError('请先导入 minerujson 表')
    con=sqlite3.connect(_db(book), timeout=20)
    try:
        con.execute('BEGIN IMMEDIATE')
        tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if tables-{'minerujson','span',TABLE}:
            raise OCRImportError('SQLite 中存在未知表，拒绝修改')
        if TABLE in tables:
            columns={r[1] for r in con.execute('PRAGMA table_info(block)')}
            if not {'block_id','parent_block_id','block_json','import_fingerprint','has_blocks_field'}.issubset(columns):
                raise OCRImportError('现有 block 表结构不兼容，拒绝覆盖')
            old=con.execute('SELECT COUNT(*),MIN(import_fingerprint),MAX(import_fingerprint) FROM block').fetchone()
            if old[0] and old[1]==old[2]==info['signature']:
                con.commit()
                return {'status':'unchanged','table':TABLE,'blocks':old[0]}
        sources=con.execute("""SELECT source_order,source_name,source_sha256,source_page_count,
                       original_bytes,import_fingerprint FROM minerujson
                       WHERE row_kind='source' ORDER BY source_order""").fetchall()
        if not sources:raise OCRImportError('minerujson 表没有来源 JSON')
        con.execute('DROP TABLE IF EXISTS block')
        con.execute(SCHEMA)
        query='INSERT INTO block VALUES ('+','.join('?' for _ in range(20))+')'
        count=0
        global_offset=0
        for order,name,sha,page_count,raw,signature in sources:
            if raw is None or hashlib.sha256(raw).hexdigest()!=sha or signature!=info['signature']:
                raise OCRImportError('MinerU 来源校验失败')
            data=json.loads(raw)
            pages=data.get('pdf_info')
            if not isinstance(pages,list) or len(pages)!=page_count:
                raise OCRImportError('MinerU 页数不一致')
            for page_offset,page in enumerate(pages):
                if not isinstance(page,dict) or type(page.get('page_idx')) is not int:
                    raise OCRImportError('MinerU 页码无效')
                for group in BLOCK_GROUPS:
                    if not isinstance(page.get(group, []),list):
                        raise OCRImportError('MinerU 内容组不是数组')
                for record in _records(order,name,global_offset+page_offset,page,signature):
                    count+=1
                    if count>LIMIT:raise OCRImportError('Block 数超出安全上限')
                    con.execute(query,record)
            global_offset+=page_count
        con.execute('CREATE INDEX idx_block_location ON block(global_page,block_group,block_path)')
        con.commit()
        return {'status':'created','table':TABLE,'blocks':count}
    except (sqlite3.DatabaseError,ValueError,TypeError,KeyError) as error:
        con.rollback()
        if isinstance(error,OCRImportError):raise
        raise OCRImportError('生成 block 表失败：'+str(error)) from error
    except Exception:
        con.rollback()
        raise
    finally:con.close()

def block_rows(book:Path, offset:int=0,limit:int=200)->dict:
    if type(offset) is not int or offset<0 or type(limit) is not int or not 1<=limit<=500:
        raise OCRImportError('分页参数无效')
    if existing_info(book) is None:raise OCRImportError('请先导入 minerujson')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=5)) as conn:
        conn.row_factory=sqlite3.Row
        if conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='block'").fetchone()[0]!=1:
            raise OCRImportError('尚未生成 block 表')
        total=conn.execute('SELECT COUNT(*) FROM block').fetchone()[0]
        data=conn.execute('''SELECT block_id,source_order,source_name,global_page,local_page,
                page_size_json,block_group,block_path,parent_block_id,sibling_order,
                block_index,block_type,block_bbox_json,line_count,span_count,
                span_types,content_preview,block_json,has_blocks_field
                FROM block ORDER BY rowid LIMIT ? OFFSET ?''',(limit,offset)).fetchall()
    return {'table':TABLE,'total':total,'offset':offset,'limit':limit,'rows':[dict(r) for r in data]}
