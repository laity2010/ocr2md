"""CMD API: minerujson2block — one row per Block, complete Lines and Spans.

A compact SQL integer block_id is the immutable row identity. PBS is a separate
human-readable structural label, scoped by source and MinerU processing group.
source_block_key preserves the original full structural key so `span` remains
joinable. Child Blocks get distinct rows rather than duplicated nested content.
"""
from __future__ import annotations
import hashlib
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import BLOCK_GROUPS, REVIEW_BLOCK_GROUP, OCRImportError, _db, existing_info

TABLE = 'block'
LIMIT = 500000
SCHEMA = '''CREATE TABLE block (
 block_id INTEGER PRIMARY KEY,
 pbs TEXT NOT NULL,
 source_block_key TEXT NOT NULL UNIQUE,
 source_order INTEGER NOT NULL,
 source_name TEXT NOT NULL,
 global_page INTEGER NOT NULL,
 local_page INTEGER NOT NULL,
 page_size_json TEXT NOT NULL,
 block_group TEXT NOT NULL CHECK(block_group='para_blocks'),
 block_path TEXT NOT NULL,
 parent_block_id INTEGER REFERENCES block(block_id),
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
 UNIQUE (source_order,global_page,block_group,block_path),
 UNIQUE (source_order,block_group,pbs)
)'''
REQUIRED = {'block_id','pbs','source_block_key','parent_block_id','block_json','import_fingerprint','has_blocks_field'}
LEGACY = {'block_id','parent_block_id','block_path','block_json','import_fingerprint','has_blocks_field'}

def _dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',',':'))

def _pbs(page:int, path:tuple[int,...])->str:
    # CMD: page is 1-based; block and nested-subblock indices are 0-based.
    return f'p{page+1}b{path[0]}' + ''.join(f's{index}' for index in path[1:])

def _records(source_order:int,source_name:str,global_page:int,page:dict,signature:str,start_id:int):
    local_page=page['page_idx']
    page_size_json=_dump(page.get('page_size'))
    next_id=start_id
    for group in BLOCK_GROUPS:
        for bi,root in enumerate(page.get(group, [])):
            def walk(block:dict,path:tuple[int,...],parent:int|None):
                nonlocal next_id
                if not isinstance(block,dict):
                    raise OCRImportError('嵌套 Block 不是对象')
                children=block.get('blocks', [])
                if not isinstance(children,list):
                    raise OCRImportError('嵌套 blocks 不是数组')
                lines=block.get('lines', [])
                if not isinstance(lines,list):
                    raise OCRImportError('Block.lines 不是数组')
                types=[];preview=[];count=0
                for line in lines:
                    if not isinstance(line,dict) or not isinstance(line.get('spans'),list):
                        raise OCRImportError('Line.spans 不是数组')
                    for span in line['spans']:
                        if not isinstance(span,dict):
                            raise OCRImportError('Span 不是对象')
                        count+=1;types.append(str(span.get('type','')))
                        if len(' '.join(preview))<260:
                            for key in ('content','html','image_path'):
                                value=span.get(key)
                                if isinstance(value,str):
                                    preview.append(value[:260]);break
                path_str='.'.join(map(str,path))
                source_key=f's{source_order}:p{global_page}:{group}:b{path_str}'
                own={k:v for k,v in block.items() if k!='blocks'}
                next_id+=1
                numeric_id=next_id
                # Preorder emits the parent before children so integer FKs are
                # stable for this source snapshot and need no second pass.
                yield (numeric_id,_pbs(global_page,path),source_key,source_order,
                       source_name,global_page,local_page,page_size_json,group,
                       path_str,parent,path[-1],
                       block.get('index') if type(block.get('index')) is int else None,
                       str(block.get('type','')),_dump(block.get('bbox')),
                       len(lines),count,','.join(dict.fromkeys(types)),
                       ' '.join(preview)[:260],_dump(own),int('blocks' in block),signature)
                for ci,child in enumerate(children):
                    yield from walk(child,(*path,ci),numeric_id)
            yield from walk(root,(bi,),None)
    # Global counter is maintained by the generator's start_id/return record.

def minerujson2block(book:Path)->dict:
    """Create a transactional Block projection; safely upgrade the legacy derived table."""
    info=existing_info(book)
    if info is None:raise OCRImportError('请先导入 minerujson 表')
    con=sqlite3.connect(_db(book),timeout=20)
    try:
        con.execute('PRAGMA foreign_keys=ON')
        con.execute('BEGIN IMMEDIATE')
        tables={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if tables-{'minerujson','span',TABLE,'block_edit_meta','block_edit_history'}:
            raise OCRImportError('SQLite 中存在未知表，拒绝修改')
        if TABLE in tables:
            columns={row[1]:row[2].upper() for row in con.execute('PRAGMA table_info(block)')}
            modern=REQUIRED.issubset(columns) and columns['block_id']=='INTEGER'
            old=LEGACY.issubset(columns) and 'pbs' not in columns and columns['block_id']=='TEXT'
            if not modern and not old:
                raise OCRImportError('现有 block 表结构未知，拒绝覆盖')
            if modern:
                state=con.execute('SELECT COUNT(*),MIN(import_fingerprint),MAX(import_fingerprint) FROM block').fetchone()
                if state[0] and state[1]==state[2]==info['signature']:
                    # Migrate old three-group projections in place. Keep the
                    # original integer IDs and any reviewed para PBS labels.
                    removed=con.execute('DELETE FROM block WHERE block_group<>?',(REVIEW_BLOCK_GROUP,)).rowcount
                    con.commit()
                    return {'status':'filtered' if removed else 'unchanged','table':TABLE,'blocks':state[0]-removed}
        sources=con.execute("""SELECT source_order,source_name,source_sha256,source_page_count,
                      original_bytes,import_fingerprint FROM minerujson
                      WHERE row_kind='source' ORDER BY source_order""").fetchall()
        if not sources:raise OCRImportError('minerujson 表没有来源 JSON')
        # Once the review structure is edited, rebuilding from MinerU would
        # silently discard human-reviewed parent/PBS state. Reject it.
        if 'block_edit_meta' in tables:
            revision=con.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone()
            if revision and revision[0]>0:
                raise OCRImportError('Block 已有人工作业历史，不允许从 MinerU 静默重建')
            con.execute('DROP TABLE IF EXISTS block_edit_history')
            con.execute('DROP TABLE IF EXISTS block_edit_meta')
        con.execute('DROP TABLE IF EXISTS block')
        con.execute(SCHEMA)
        query='INSERT INTO block VALUES ('+','.join('?' for _ in range(22))+')'
        count=0;inserted=0;global_offset=0
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
                    if not isinstance(page.get(group,[]),list):
                        raise OCRImportError('MinerU 内容组不是数组')
                for record in _records(order,name,global_offset+page_offset,page,signature,count):
                    if record[0]<=count:
                        raise OCRImportError('Block 编号未递增')
                    count=record[0]
                    if count>LIMIT:raise OCRImportError('Block 数超出安全上限')
                    # Enumerate all original groups to keep existing para
                    # Block IDs stable, but insert only the para review rows.
                    if record[8]==REVIEW_BLOCK_GROUP:
                        con.execute(query,record)
                        inserted+=1
            global_offset+=page_count
        con.execute('CREATE INDEX idx_block_location ON block(global_page,block_group,block_path)')
        con.commit()
        return {'status':'created','table':TABLE,'blocks':inserted}
    except (sqlite3.DatabaseError,ValueError,TypeError,KeyError) as error:
        con.rollback()
        if isinstance(error,OCRImportError):raise
        raise OCRImportError('生成 block 表失败：'+str(error)) from error
    except Exception:
        con.rollback()
        raise
    finally:con.close()

def block_rows(book:Path,offset:int=0,limit:int=200)->dict:
    if type(offset) is not int or offset<0 or type(limit) is not int or not 1<=limit<=500:
        raise OCRImportError('分页参数无效')
    if existing_info(book) is None:raise OCRImportError('请先导入 minerujson')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=5)) as conn:
        conn.row_factory=sqlite3.Row
        if conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='block'").fetchone()[0]!=1:
            raise OCRImportError('尚未生成 block 表')
        total=conn.execute('SELECT COUNT(*) FROM block WHERE block_group=?',(REVIEW_BLOCK_GROUP,)).fetchone()[0]
        data=conn.execute('''SELECT child.block_id,child.pbs,
                  child.source_block_key,child.source_order,child.source_name,child.global_page,
                  child.local_page,child.page_size_json,child.block_group,child.block_path,
                  child.parent_block_id,child.sibling_order,child.block_index,
                  child.block_type,child.block_bbox_json,child.line_count,child.span_count,
                  child.span_types,child.content_preview,child.block_json,child.has_blocks_field
                  FROM block AS child WHERE child.block_group=?
                  ORDER BY child.block_id LIMIT ? OFFSET ?''',(REVIEW_BLOCK_GROUP,limit,offset)).fetchall()
    return {'table':TABLE,'total':total,'offset':offset,'limit':limit,'rows':[dict(row) for row in data]}
