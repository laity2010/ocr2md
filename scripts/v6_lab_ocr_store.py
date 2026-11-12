"""OCR Lab source-preserving MinerU table in a per-book SQLite database.

Input files are READ ONLY. Every JSON's exact bytes are stored once in a
`source` row; every distinct occurrence of a source block is a `block` row.
A source row is metadata, not an OCR block. The AG view filters block rows.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
from contextlib import closing
import sqlite3
from pathlib import Path

DB_NAME = 'ocr2md.sqlite'
MAX_JSON_BYTES = 96 * 1024 * 1024
MAX_SEGMENTS = 32
MAX_BLOCKS = 500_000
MAX_PAGE_ROWS = 250
TABLE = 'minerujson'
BLOCK_GROUPS = ('preproc_blocks', 'discarded_blocks', 'para_blocks')
# Raw MinerU import keeps all groups. Derived review/operation tables only
# expose the authoritative para block group.
REVIEW_BLOCK_GROUP = 'para_blocks'

class OCRImportError(ValueError):
    pass

def _regular(path: Path, *, suffix: str | None = None) -> bool:
    return path.is_file() and not path.is_symlink() and (suffix is None or path.suffix.lower() == suffix)

def _dir(path: Path):
    if not path.is_dir() or path.is_symlink():
        raise OCRImportError('工作区缺少目录或目录为符号链接：' + path.name)

def _read_json_file(path: Path) -> dict:
    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
    try:
        with os.fdopen(fd, 'rb') as f:
            size = os.fstat(f.fileno()).st_size
            if size <= 0 or size > MAX_JSON_BYTES:
                raise OCRImportError('MinerU JSON 大小不在允许范围：'+path.name)
            raw = f.read(MAX_JSON_BYTES + 1)
    finally:
        pass
    if len(raw) > MAX_JSON_BYTES:
        raise OCRImportError('MinerU JSON 超过安全大小限制：'+path.name)
    try:
        payload=json.loads(raw)
    except (UnicodeDecodeError, ValueError) as error:
        raise OCRImportError('MinerU JSON 解析失败：'+path.name) from error
    if not isinstance(payload, dict) or not isinstance(payload.get('pdf_info'), list):
        raise OCRImportError('MinerU JSON 缺少 pdf_info 页面数组：'+path.name)
    pages=payload['pdf_info']
    if not pages or len(pages)>MAX_PAGE_ROWS:
        raise OCRImportError('MinerU JSON 页数异常：'+path.name)
    indices=[]
    for i,page in enumerate(pages):
        if not isinstance(page,dict):raise OCRImportError('MinerU JSON 页记录不是对象：'+path.name)
        ix=page.get('page_idx')
        if type(ix) is not int or ix<0:raise OCRImportError('MinerU JSON 页码无效：'+path.name)
        indices.append(ix)
        for g in BLOCK_GROUPS:
            value=page.get(g,[])
            if not isinstance(value,list) or any(not isinstance(block,dict) for block in value):
                raise OCRImportError('MinerU JSON 块数组无效：'+path.name+':'+g)
    if indices!=list(range(indices[0],indices[0]+len(indices))):
        raise OCRImportError('MinerU JSON 分段内页码不连续：'+path.name)
    return {'path':path,'raw':raw,'data':payload,'pages':pages,
            'min_idx':indices[0],'max_idx':indices[-1],
            'sha':hashlib.sha256(raw).hexdigest(),'count':len(pages)}

def _filename_position(name: str) -> int | None:
    # Numeric page ranges or explicitly named parts can establish order.
    # MinerU export timestamps (e.g. __20261029123958) DO NOT prove page order.
    stem=Path(name).stem
    match=re.search(r'(?i)(?:^|[ _.-])(?:part|chunk|segment|分段|第)(?:[ _.-]*)(\d{1,4})(?:[ _.-]|$)',stem)
    if match:return int(match.group(1))
    match=re.search(r'(?i)(?:^|[ _.-])(?:pages?|页码)(?:[ _.-]*)(\d{1,5})[-_~](\d{1,5})(?:$|[ _.-])',stem)
    if match:return int(match.group(1))
    return None

def order_parts(parts: list[dict], explicit: list[str] | None=None) -> tuple[list[dict],str]:
    if len(parts)==1:return parts,'single'
    if explicit is not None:
        if (len(explicit)!=len(parts) or len(explicit)!=len(set(explicit)) or
            set(explicit)!={part['path'].name for part in parts}):
            raise OCRImportError('手动分段顺序与现有文件不一致')
        mapping={p['path'].name:p for p in parts}
        return [mapping[name] for name in explicit],'manual'
    ranges=sorted(parts,key=lambda p:p['min_idx'])
    if all(ranges[i]['max_idx']+1==ranges[i+1]['min_idx'] for i in range(len(ranges)-1)) and ranges[0]['min_idx']==0:
        return ranges,'global-page-indices'
    positions=[_filename_position(p['path'].name) for p in parts]
    if all(p is not None for p in positions) and len(set(positions))==len(positions):
        return sorted(parts,key=lambda p:_filename_position(p['path'].name)),'part-filename-index'
    # MinerU splits every 200 pages: the sole shorter segment is the LAST one.
    # This handles the actual 200+159 page book, but not 200+200 ambiguities.
    if len(parts)==2 and sorted(p['count'] for p in parts)[0]<200 and sorted(p['count'] for p in parts)[1]==200:
        return sorted(parts,key=lambda p:p['count'],reverse=True),'full-200-then-short-tail'
    raise OCRImportError('无法可靠判断多个 JSON 的先后顺序；请手动确认分段顺序')

def inspect_workspace(book: Path, explicit: list[str] | None=None) -> dict:
    _dir(book)
    candidates=[book/n for n in ('mineru json','minerujson','mineru_json') if (book/n).is_dir()]
    if len(candidates)!=1:
        raise OCRImportError('工作区需要一个 mineru json/ 目录')
    json_dir=candidates[0]
    pdf_dir=book/'pdf'
    _dir(json_dir);_dir(pdf_dir)
    jsons=sorted((p for p in json_dir.iterdir() if _regular(p,suffix='.json') and not p.name.startswith('.')),key=lambda p:p.name)
    pdfs=[p for p in pdf_dir.iterdir() if _regular(p,suffix='.pdf') and not p.name.startswith('.')]
    if not jsons or len(jsons)>MAX_SEGMENTS:
        raise OCRImportError('mineru json/ 需要 1–32 个 JSON 分段')
    if len(pdfs)!=1:
        raise OCRImportError('pdf/ 需要且仅能有 1 个 PDF 文件')
    parts=[_read_json_file(p) for p in jsons]
    ordered,order_reason=order_parts(parts,explicit)
    first=ordered[0]['min_idx']
    total=sum(p['count'] for p in ordered)
    if total>10_000:raise OCRImportError('分段合计页数异常')
    pdf=pdfs[0]
    with pdf.open('rb') as f:
        if f.read(5)!=b'%PDF-':raise OCRImportError('PDF 文件头无效：'+pdf.name)
    return {'book':str(book),'pdf':pdf,'parts':ordered,'total_pages':total,
            'ordering':order_reason,'sources':[{'name':p['path'].name,'pages':p['count'],
              'localStart':p['min_idx'],'sha256':p['sha']} for p in ordered]}

def fingerprint(info:dict)->str:
    payload={'pdf':info['pdf'].name,'order':[p['sha'] for p in info['parts']]}
    return hashlib.sha256(json.dumps(payload,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

SCHEMA=f'''CREATE TABLE IF NOT EXISTS {TABLE} (
 id INTEGER PRIMARY KEY,
 row_kind TEXT NOT NULL CHECK(row_kind IN ('source','block')),
 source_order INTEGER NOT NULL,
 source_name TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 source_page_count INTEGER NOT NULL,
 pdf_name TEXT NOT NULL,
 global_page INTEGER,
 local_page INTEGER,
 block_group TEXT,
 block_index INTEGER,
 block_type TEXT,
 bbox_json TEXT,
 text_preview TEXT,
 block_json TEXT,
 original_bytes BLOB,
 import_fingerprint TEXT NOT NULL
)'''

def _db(book:Path)->Path:
    f=book/DB_NAME
    if f.is_symlink():raise OCRImportError('SQLite 数据库不能是符号链接')
    return f

def existing_info(book:Path)->dict | None:
    db=_db(book)
    if not db.exists():return None
    if not db.is_file():raise OCRImportError('SQLite 数据库路径不是文件')
    with closing(sqlite3.connect(f'file:{db}?mode=ro',uri=True,timeout=5)) as connection:
        tables={row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if TABLE not in tables or tables-{TABLE,'span','block'}:raise OCRImportError('现有数据库不是预期的 MinerU/Span 表结构，拒绝覆盖')
        cols={row[1] for row in connection.execute(f'PRAGMA table_info({TABLE})')}
        if not {'row_kind','original_bytes','import_fingerprint','source_order'}.issubset(cols):
            raise OCRImportError('现有 MinerU 表结构不兼容，拒绝覆盖')
        return {'count':connection.execute(f"SELECT COUNT(*) FROM {TABLE} WHERE row_kind='block'").fetchone()[0],
                'signature':(connection.execute(f"SELECT import_fingerprint FROM {TABLE} LIMIT 1").fetchone() or [None])[0]}

def _snippet(block:dict)->str:
    out=[]
    def walk(value,depth=0):
        if len(out)>=25 or depth>8:return
        if isinstance(value,dict):
            if isinstance(value.get('content'),str):out.append(value['content'])
            for k,v in value.items():
                if k!='content' and isinstance(v,(dict,list)):walk(v,depth+1)
        elif isinstance(value,list):
            for v in value[:100]:walk(v,depth+1)
    walk(block)
    return ' '.join(out)[:260]

def import_workspace(book:Path, explicit:list[str] | None=None, replace:bool=False)->dict:
    info=inspect_workspace(book,explicit)
    sig=fingerprint(info)
    old=existing_info(book)
    if old and old['signature']==sig:
        return {'status':'unchanged','blocks':old['count'],'pages':info['total_pages'],'sources':info['sources'],'ordering':info['ordering']}
    if old and not replace:
        return {'status':'changed','blocks':old['count'],'pages':info['total_pages'],'sources':info['sources'],'ordering':info['ordering']}
    db=_db(book)
    # One book = one SQLite DB, one user table. No input JSON/PDF modification.
    con=sqlite3.connect(str(db),timeout=20)
    try:
        con.execute('PRAGMA journal_mode=DELETE')
        con.execute('BEGIN IMMEDIATE')
        tables={row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
        if tables and (TABLE not in tables or tables-{TABLE,'span','block'}):raise OCRImportError('数据库中存在其他表，拒绝覆盖')
        con.execute('DROP TABLE IF EXISTS span')  # Derived rows are rebuilt explicitly
        con.execute('DROP TABLE IF EXISTS block')
        con.execute(SCHEMA)
        con.execute(f'DELETE FROM {TABLE}')
        count=0;global_start=0
        for segment,part in enumerate(info['parts']):
            common=(segment,part['path'].name,part['sha'],part['count'],info['pdf'].name,sig)
            con.execute(f'''INSERT INTO {TABLE} (row_kind,source_order,source_name,source_sha256,
              source_page_count,pdf_name,original_bytes,import_fingerprint)
              VALUES ('source',?,?,?,?,?,?,?)''',(*common[:5],part['raw'],sig))
            for local_num,page in enumerate(part['pages']):
                for group in BLOCK_GROUPS:
                    for i,block in enumerate(page.get(group,[])):
                        count+=1
                        if count>MAX_BLOCKS:raise OCRImportError('MinerU 块数超出上限')
                        con.execute(f'''INSERT INTO {TABLE}(row_kind,source_order,source_name,source_sha256,
                          source_page_count,pdf_name,global_page,local_page,block_group,block_index,
                          block_type,bbox_json,text_preview,block_json,import_fingerprint)
                          VALUES ('block',?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                          (*common[:5],global_start+local_num,page['page_idx'],group,i,
                           str(block.get('type',''))[:100],json.dumps(block.get('bbox'),ensure_ascii=False),
                           _snippet(block),json.dumps(block,ensure_ascii=False,separators=(',',':')),sig))
            global_start+=part['count']
        con.commit()
        return {'status':'imported','blocks':count,'pages':info['total_pages'],
                'sources':info['sources'],'ordering':info['ordering'],'signature':sig}
    except Exception:
        con.rollback()
        raise
    finally:con.close()

def rows(book:Path, offset:int=0,limit:int=150)->dict:
    if type(offset) is not int or offset<0 or type(limit) is not int or not 1<=limit<=500:
        raise OCRImportError('分页参数无效')
    old=existing_info(book)
    if old is None:raise OCRImportError('尚未生成 minerujson SQL 表')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as conn:
        conn.row_factory=sqlite3.Row
        result=conn.execute(f'''SELECT id,source_order,source_name,global_page,local_page,
             block_group,block_index,block_type,bbox_json,text_preview,block_json
             FROM {TABLE} WHERE row_kind='block' ORDER BY source_order,global_page,id LIMIT ? OFFSET ?''',
             (limit,offset)).fetchall()
    return {'table':TABLE,'total':old['count'],'offset':offset,'limit':limit,'rows':[dict(r) for r in result]}

def originals(book:Path)->list[tuple[str,bytes]]:
    old=existing_info(book)
    if old is None:raise OCRImportError('无已导入的 SQL 表')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as c:
        return [(name,raw) for name,raw in c.execute(f'''SELECT source_name,original_bytes
           FROM {TABLE} WHERE row_kind='source' ORDER BY source_order''')]
