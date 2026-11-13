"""WCP46: MinerU source table + one para Block VIEW + review extension.

The view expands the original JSON root blocks using SQLite JSON1, and joins
editable, stable identities from block_review. Nothing copies OCR block JSON
into the review table. Existing block entities are not replaced automatically:
only an explicitly authorized 'initialize SQL' command may rebuild the view
and review table, wiping prior review edits with a clear UI warning.
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
from pathlib import Path
from contextlib import closing

from v6_lab_ocr_store import (
    _db, existing_info, OCRImportError, REVIEW_BLOCK_GROUP,
)
from v6_lab_ocr_block import _records, LIMIT

REVIEW_SCHEMA = """CREATE TABLE block_review (
 block_id INTEGER PRIMARY KEY,
 source_block_key TEXT NOT NULL UNIQUE,
 source_root_id INTEGER NOT NULL REFERENCES minerujson(id),
 source_json_path TEXT NOT NULL,
 block_path TEXT NOT NULL,
 source_order INTEGER NOT NULL,
 global_page INTEGER NOT NULL,
 parent_block_id INTEGER REFERENCES block_review(block_id),
 sibling_order INTEGER NOT NULL,
 pbs TEXT NOT NULL,
 import_fingerprint TEXT NOT NULL,
 UNIQUE(source_order,global_page,pbs)
)"""

# A view follows stable JSON source pointers; only the pointer, integer ID and
# editable review relations live in block_review. No OCR JSON is materialized.
# This avoids recursively expanding 6,000+ nodes for every 40-box PDF page.
VIEW_SCHEMA = """CREATE VIEW block AS
WITH nodes AS (
 SELECT r.block_id,r.pbs,r.source_block_key,r.source_order,r.global_page,
        r.parent_block_id,r.sibling_order,r.block_path,
        m.source_name,m.local_page,m.page_size_json,m.import_fingerprint,
        json_extract(m.block_json,r.source_json_path) AS node_json
 FROM block_review AS r
 JOIN minerujson AS m ON m.id=r.source_root_id
 WHERE m.row_kind='block' AND m.block_group='para_blocks'
   AND r.source_order=m.source_order AND r.global_page=m.global_page
   AND r.import_fingerprint=m.import_fingerprint
)
SELECT
 n.block_id AS block_id,n.pbs AS pbs,n.source_block_key AS source_block_key,
 n.source_order AS source_order,n.source_name AS source_name,
 n.global_page AS global_page,n.local_page AS local_page,
 n.page_size_json AS page_size_json,
 'para_blocks' AS block_group,n.block_path AS block_path,
 n.parent_block_id AS parent_block_id,n.sibling_order AS sibling_order,
 CASE WHEN json_type(n.node_json,'$.index')='integer'
      THEN json_extract(n.node_json,'$.index') ELSE NULL END AS block_index,
 COALESCE(CAST(json_extract(n.node_json,'$.type') AS TEXT),'') AS block_type,
 json_extract(n.node_json,'$.bbox') AS block_bbox_json,
 COALESCE(json_array_length(n.node_json,'$.lines'),0) AS line_count,
 (SELECT COALESCE(SUM(json_array_length(l.value,'$.spans')),0)
  FROM json_each(n.node_json,'$.lines') AS l) AS span_count,
 (SELECT group_concat(DISTINCT json_extract(s.value,'$.type'))
  FROM json_each(n.node_json,'$.lines') AS l
  JOIN json_each(l.value,'$.spans') AS s) AS span_types,
 SUBSTR(COALESCE((SELECT group_concat(
    COALESCE(json_extract(s.value,'$.content'),
             json_extract(s.value,'$.html'),json_extract(s.value,'$.image_path')), ' ')
  FROM json_each(n.node_json,'$.lines') AS l
  JOIN json_each(l.value,'$.spans') AS s),''),
  1,260) AS content_preview,
 json_remove(n.node_json,'$.blocks') AS block_json,
 CASE WHEN json_type(n.node_json,'$.blocks') IS NULL THEN 0 ELSE 1 END
   AS has_blocks_field,
 n.import_fingerprint AS import_fingerprint
FROM nodes AS n
"""

def _object_type(con:sqlite3.Connection,name:str)->str|None:
    row=con.execute('SELECT type FROM sqlite_master WHERE name=? AND type IN (\'view\',\'table\')',(name,)).fetchone()
    return row[0] if row else None

def _page_sizes(con:sqlite3.Connection,signature:str):
    """Populate base-row page geometry once, without changing any source bytes."""
    cols={r[1] for r in con.execute('PRAGMA table_info(minerujson)')}
    if 'page_size_json' not in cols:
        con.execute('ALTER TABLE minerujson ADD COLUMN page_size_json TEXT')
    sources=con.execute("""SELECT source_order,source_sha256,source_page_count,
       original_bytes FROM minerujson WHERE row_kind='source' ORDER BY source_order""").fetchall()
    if not sources:raise OCRImportError('minerujson 缺少无损 source 行')
    for order,sha,page_count,raw in sources:
        if not isinstance(raw,bytes) or hashlib.sha256(raw).hexdigest()!=sha:
            raise OCRImportError('MinerU 原始来源校验失败，拒绝初始化')
        pages=json.loads(raw)['pdf_info']
        if len(pages)!=page_count:raise OCRImportError('MinerU 页数不匹配')
        for page in pages:
            local_page=page.get('page_idx')
            size=page.get('page_size')
            if type(local_page) is not int or not isinstance(size,list):
                raise OCRImportError('MinerU 页尺寸/页码不合法')
            con.execute('''UPDATE minerujson SET page_size_json=? WHERE row_kind='block'
                AND source_order=? AND local_page=? AND import_fingerprint=?''',
                (json.dumps(size,ensure_ascii=False,separators=(',',':')),
                 order,local_page,signature))

def inspect_block_projection(book:Path)->dict:
    """Read-only: never initialize, wipe or auto-upgrade existing review data."""
    info=existing_info(book)
    if not info:raise OCRImportError('请先导入 MinerU 源表')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=10)) as conn:
        mode=_object_type(conn,'block')
        ext=_object_type(conn,'block_review')
        span=_object_type(conn,'span')
        if mode=='view' and ext=='table':
            count=conn.execute('SELECT COUNT(*) FROM block_review').fetchone()[0]
            valid=conn.execute('SELECT COUNT(*) FROM block_review WHERE import_fingerprint=?',
                               (info['signature'],)).fetchone()[0]==count
            if not valid:raise OCRImportError('Block 视图关联了旧来源，禁止自动覆写')
            return {'status':'ready','table':'block','blocks':count,'kind':'view',
                    'hasLegacySpan':span is not None}
        if mode=='table':return {'status':'legacy','table':'block','kind':'table',
                                 'blocks':conn.execute('SELECT COUNT(*) FROM block').fetchone()[0]}
        return {'status':'missing','table':'block','kind':mode,'blocks':0}

def initialize_block_projection(book:Path)->dict:
    """Explicit, transactional destructive review reset. No original input rewrite.

    Legacy reviewed block entities and edit history are overwritten ONLY here.
    Any failure rolls back the entire schema-and-review transition.
    """
    info=existing_info(book)
    if not info:raise OCRImportError('请先导入 MinerU JSON 基础表')
    with closing(sqlite3.connect(_db(book),timeout=25)) as conn:
        try:
            conn.execute('PRAGMA foreign_keys=OFF')
            conn.execute('BEGIN IMMEDIATE')
            tables={name for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
            allowed={'minerujson','block','span','block_review','block_edit_meta',
                     'block_edit_history','block_edit_receipt'}
            if tables-allowed:raise OCRImportError('数据库存在未知实体表，拒绝重建')
            _page_sizes(conn,info['signature'])
            # Enumerate existing MinerU data in its original group order.
            # Stable BlockID numerical semantics match old WCP40 exactly.
            sources=conn.execute('''SELECT source_order,source_name,source_sha256,
             source_page_count,original_bytes,import_fingerprint FROM minerujson
             WHERE row_kind='source' ORDER BY source_order''').fetchall()
            root_ids={(order,page,index):row_id for row_id,order,page,index in
              conn.execute('''SELECT id,source_order,global_page,block_index
                FROM minerujson WHERE row_kind='block' AND block_group='para_blocks' ''')}
            candidates=[]
            current_id=0;offset=0
            for order,name,sha,pages_count,raw,signature in sources:
                if signature!=info['signature']:raise OCRImportError('来源指纹不一致')
                pages=json.loads(raw)['pdf_info']
                for local_idx,page in enumerate(pages):
                    for record in _records(order,name,offset+local_idx,page,signature,current_id):
                        if record[0]<=current_id or record[0]>LIMIT:raise OCRImportError('BlockID 异常')
                        current_id=record[0]
                        if record[8]==REVIEW_BLOCK_GROUP:
                            components=[int(x) for x in record[9].split('.')]
                            root_id=root_ids.get((record[3],record[5],components[0]))
                            if root_id is None:
                                raise OCRImportError('无损基础表缺少 para 根块定位')
                            json_path='$'+''.join(f'.blocks[{part}]' for part in components[1:])
                            candidates.append((record[0],record[2],root_id,json_path,
                                               record[9],record[3],record[5],record[10],
                                               record[11],record[1],signature))
                offset+=pages_count
            if _object_type(conn,'block')=='view':conn.execute('DROP VIEW block')
            if _object_type(conn,'block')=='table':conn.execute('DROP TABLE block')
            if _object_type(conn,'span')=='view':conn.execute('DROP VIEW span')
            if _object_type(conn,'span')=='table':conn.execute('DROP TABLE span')
            if _object_type(conn,'block_review')=='table':conn.execute('DROP TABLE block_review')
            for name in ('block_edit_receipt','block_edit_history','block_edit_meta'):
                conn.execute('DROP TABLE IF EXISTS '+name)
            conn.execute(REVIEW_SCHEMA)
            conn.executemany('''INSERT INTO block_review
             (block_id,source_block_key,source_root_id,source_json_path,block_path,
              source_order,global_page,parent_block_id,sibling_order,pbs,import_fingerprint)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)''',candidates)
            conn.execute('CREATE INDEX idx_review_page ON block_review(global_page,block_id)')
            conn.execute(VIEW_SCHEMA)
            viewed=conn.execute('SELECT COUNT(*) FROM block').fetchone()[0]
            if viewed!=len(candidates):raise OCRImportError(
                f'Block VIEW 行数不匹配：源 {len(candidates)}，视图 {viewed}')
            if conn.execute('PRAGMA foreign_key_check').fetchall():
                raise OCRImportError('Block 扩展表外键不完整')
            conn.commit()
            return {'status':'initialized','table':'block','kind':'view',
                    'blocks':viewed,'extensionRows':len(candidates),
                    'clearedReviewHistory':True}
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.execute('PRAGMA foreign_keys=ON')
