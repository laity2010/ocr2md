"""OCR2MD V2 WP01–WP03: 9-field latest-state logical table, 0 extra tables.

Public business APIs:
  logical_state(book,offset=0)  -- read-only AG rows from SQLite
  initialize_logical(book)    -- idempotent transactional initialization

The public V1 `toMarkdown` converter is the only OCR->Markdown authority. This
module translates its native CMD root/child anchors into SQL rows; it never
rewrites source JSON, overwrites `mineru_base`, or stores revision history.
"""
from __future__ import annotations
import base64
from contextlib import closing
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
from urllib.parse import quote

from v2_mineru_base import BaseError, DB_NAME, PAGE_SIZE, assert_schema, sha, compact

FIELDS=('logical_id','parent_id','sort_order','node_kind','block_type','markdown',
        'source_refs','attrs','revision')
OLD_FIELDS=('logical_id','base_blockid','parent_id','logical_order','markdown_text')
TAG=re.compile(r'^<!-- cmd:block:v1 id="(p(\d+)b(\d+)(?:s(\d+(?:\.\d+)*))?)" -->[ \t]*$',re.M)
AUDIT_TAIL=re.compile(r'(?m)^<!-- minerujson:(?:page:v1:\d+|source:v1:[a-f0-9]{64})')
SCHEMA_DDL='''CREATE TABLE logical_block(
    logical_id INTEGER PRIMARY KEY CHECK(logical_id>0),
    parent_id INTEGER REFERENCES logical_block(logical_id) DEFERRABLE INITIALLY DEFERRED,
    sort_order INTEGER NOT NULL CHECK(sort_order>0),
    node_kind TEXT NOT NULL CHECK(node_kind IN ('content','group')),
    block_type TEXT NOT NULL,
    markdown TEXT NOT NULL,
    source_refs TEXT NOT NULL CHECK(json_valid(source_refs)),
    attrs TEXT NOT NULL CHECK(json_valid(attrs)),
    revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),
    CHECK(node_kind!='group' OR markdown='')
)'''
CONVERTER=Path(__file__).with_name('v2_logical_converter.mjs')
CONVERTER_JS=Path(__file__).resolve().parents[1]/'packages/minerujson-md/dist/index.js'


def converter_ready():
    if not CONVERTER_JS.is_file():
        raise BaseError(503,'公共 MinerU Markdown 转换器尚未构建，请运行 npm --prefix packages/minerujson-md ci && npm --prefix packages/minerujson-md run build')
    if not CONVERTER.is_file():raise BaseError(503,'V2 转换桥脚本缺失')


def markdown_from_source(raw:bytes):
    converter_ready()
    try:
        text=raw.decode('utf-8')
    except UnicodeDecodeError:
        raise BaseError(422,'MinerUJSON 不是 UTF-8；转换器拒绝有损解码')
    try:
        proc=subprocess.run(['node',str(CONVERTER)],input=text,text=True,
            capture_output=True,timeout=110,check=False)
    except (OSError,subprocess.TimeoutExpired):
        raise BaseError(503,'公开 MinerU 转换器执行失败或超时')
    if proc.returncode!=0:
        raise BaseError(422,'公开 MinerU 转换器拒绝了输入，保留原数据库不变')
    return proc.stdout


def column_names(db):
    return tuple(row[1] for row in db.execute('PRAGMA table_info(logical_block)'))


def schema_status(db):
    cols=column_names(db)
    if cols==FIELDS:return 'ready'
    if cols==OLD_FIELDS:return 'wp00'
    raise BaseError(409,'逻辑表结构未知，拒绝覆盖用户编辑')


def db_connection(book:Path):
    path=book/DB_NAME
    if not path.exists():raise BaseError(409,'当前目录尚未建立基础表')
    if path.is_symlink() or not path.is_file():raise BaseError(403,'V2 SQLite 必须是普通文件')
    return sqlite3.connect('file:'+quote(str(path),safe='/')+'?mode=ro',uri=True)


def logical_state(book:Path,offset:int=0):
    with closing(db_connection(book)) as db:
        db.row_factory=sqlite3.Row
        assert_schema(db)
        status=schema_status(db)
        count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
        if status=='wp00' and count:
            raise BaseError(409,'旧逻辑表包含用户数据，禁止自动变更')
        if status=='wp00' or not count:
            return {'exists':True,'initialized':False,'needsInitialization':True,
                    'blockCount':0,'columns':list(FIELDS),'rows':[],'pageSize':PAGE_SIZE}
        result=db.execute('SELECT '+','.join(FIELDS)+' FROM logical_block ORDER BY logical_id LIMIT ? OFFSET ?',
            (PAGE_SIZE,offset)).fetchall()
        return {'exists':True,'initialized':True,'blockCount':count,'columns':list(FIELDS),
                'rows':[dict(row) for row in result],'offset':offset,'pageSize':PAGE_SIZE}


def _archive_sources(db):
    row=db.execute('SELECT original_bytes FROM mineru_base WHERE blockid=0').fetchone()
    if not row or not row[0]:raise BaseError(409,'基础表缺少无损 MinerU 原始数据')
    try:archive=json.loads(row[0])
    except (ValueError,TypeError):raise BaseError(409,'原始 JSON 档案不可读')
    if not isinstance(archive,list) or not archive:raise BaseError(409,'原始 JSON 档案结构错误')
    result=[]
    for item in archive:
        try:
            raw=base64.b64decode(item['contentBase64'],validate=True)
            if sha(raw)!=item['sha256'] or len(raw)!=item['size']:
                raise ValueError('bad sha')
            source=json.loads(raw)
        except (ValueError,TypeError,KeyError,UnicodeDecodeError):
            raise BaseError(409,'基础表源文件档案 SHA256 核验失败')
        if not isinstance(source,dict) or not isinstance(source.get('pdf_info'),list):
            raise BaseError(409,'基础表 JSON 源文件格式不符')
        result.append((item['path'],raw,source))
    return result


def parse_rows(db):
    """Pure projection: DB archive -> V1 CMD MD -> 9-field logical records."""
    sources=_archive_sources(db)
    refs={}
    for r in db.execute("SELECT blockid,source_path,source_json_path,block_type,block_json,page_number FROM mineru_base WHERE block_group='para_blocks'"):
        base_id,path,json_path,typ,raw_block,page_number=r
        match=re.fullmatch(r'\$\.pdf_info\[(\d+)\]\.para_blocks\[(\d+)\]',json_path)
        if not match:raise BaseError(422,'基础表正文块源路径不符合 MinerU 格式')
        key=(path,int(match[1]),int(match[2]))
        if key in refs:raise BaseError(409,'基础表存在重复的源 BlockID')
        refs[key]=(base_id,typ,json.loads(raw_block),page_number)
    # The audited V1 converter can recover split table HTML from preproc,
    # which is not identical to para_blocks. Preserve that *additional*
    # exact provenance by referencing the original preproc base block too.
    preproc={}
    for base_id,source_path,original_path,raw in db.execute(
            "SELECT blockid,source_path,source_json_path,block_json FROM mineru_base WHERE block_group='preproc_blocks'"):
        match=re.fullmatch(r'\$\.pdf_info\[(\d+)\]\.preproc_blocks\[(\d+)\]',original_path)
        if match:
            preproc[(source_path,int(match[1]),int(match[2]))]=(base_id,json.loads(raw))
    out=[];order={};seen=set();next_id=1
    for source_path,raw,source in sources:
        markdown=markdown_from_source(raw)
        markers=list(TAG.finditer(markdown))
        expected=sum(len(page.get('para_blocks',[])) for page in source['pdf_info'])
        actual_roots=sum(match.group(4) is None for match in markers)
        if actual_roots!=expected:
            raise BaseError(422,'Markdown 主块数量与无损基础表不符，拒绝构建逻辑表')
        # One normalized start marker can correspond to exactly one source node.
        entries=[];marker_ids=set()
        for i,match in enumerate(markers):
            full_id,page_index,block_index,child_path=match.groups()
            key=(source_path,int(page_index),int(block_index))
            if key not in refs:raise BaseError(422,'CMD 标记缺少基础表引用：'+full_id)
            if full_id in marker_ids:raise BaseError(422,'出现重复的 CMD BlockID')
            marker_ids.add(full_id)
            base_id,root_type,root,page_number=refs[key]
            path_components=[] if child_path is None else [int(k) for k in child_path.split('.')]
            node=root
            try:
                for index in path_components:node=node['blocks'][index]
            except (IndexError,KeyError,TypeError):
                raise BaseError(422,'子块标记的源 JSON 路径不存在：'+full_id)
            fragment=markdown[match.end():markers[i+1].start() if i+1<len(markers) else len(markdown)]
            cut=AUDIT_TAIL.search(fragment)
            if cut:fragment=fragment[:cut.start()]
            fragment=fragment.strip('\r\n')
            entries.append((full_id,key,base_id,path_components,root_type,node,fragment,page_number))
        # Every native OCR child must have its own native marker, even empty.
        expected_children=0
        for page_pos,page in enumerate(source['pdf_info']):
            for block_pos,root in enumerate(page['para_blocks']):
                stack=list(root.get('blocks',[]))
                while stack:
                    current=stack.pop();expected_children+=1
                    stack.extend(current.get('blocks',[]))
        if len(entries)!=expected+expected_children:
            raise BaseError(422,'转换器的子块标记缺失，拒绝丢失来源')
        child_ids={full for full,*_ in entries}
        for full_id,key,base_id,path,root_type,node,fragment,page_number in entries:
            parent_tag=None if not path else full_id.rsplit('s',1)[0] if len(path)==1 else full_id.rsplit('.',1)[0]
            if parent_tag and parent_tag not in child_ids:
                raise BaseError(422,'子块缺少父节点标记')
            # A root with native OCR children must be a group; native children
            # are stored separately, so the root never duplicates their MD.
            has_children=bool(node.get('blocks'))
            if has_children and fragment:
                # Unknown source shapes can append a fallback after child
                # markers; fail rather than silently move text to wrong node.
                raise BaseError(422,'含子节点的原始块还有独立正文，需先明确映射')
            # Root IDs are unique only *within a source part*, not across all
            # split files, so give each part its own temporary lookup.
            parent_id=order.get(('id',source_path,parent_tag)) if parent_tag else None
            if parent_tag and parent_id is None:raise BaseError(422,'父节点先后顺序不正确')
            sibling_key=(source_path,parent_id)
            order[sibling_key]=order.get(sibling_key,0)+1
            ordering=order[sibling_key]
            typename=str(node.get('type') or root_type or 'unknown')
            origin_refs=[{'blockid':base_id,'child_path':path}]
            if typename=='table_body' and fragment and key in preproc:
                extra_id,extra_root=preproc[key]
                extra_child=extra_root
                try:
                    for index in path:extra_child=extra_child['blocks'][index]
                except (IndexError,KeyError,TypeError):extra_child={}
                original_htmls=[span.get('html') for line in extra_child.get('lines',[])
                    for span in line.get('spans',[]) if isinstance(span.get('html'),str)]
                # Exact V1 recovered HTML, never heuristic matching or a
                # duplicate Markdown node for the preproc evidence.
                if any(html and html in fragment for html in original_htmls):
                    origin_refs.append({'blockid':extra_id,'child_path':path,'role':'recovered_preproc'})
            source_refs=compact(origin_refs)
            attrs=compact({'source_marker':full_id,'page':page_number,'source_file':source_path})
            out.append((next_id,parent_id,ordering,'group' if has_children else 'content',
                typename,'' if has_children else fragment,source_refs,attrs,0))
            order[('id',source_path,full_id)]=next_id
            next_id+=1
            if not path:seen.add(key)
    if seen!=set(refs):raise BaseError(422,'逻辑块覆盖范围与基础表 para_blocks 不一致')
    return out


def initialize_logical(book:Path):
    # Parse and validate using an existing readable DB before obtaining the
    # write lock; no destructive migration if parsing fails.
    with closing(db_connection(book)) as db:
        assert_schema(db)
        old_schema=schema_status(db)
        count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
        if count:
            if old_schema!='ready':raise BaseError(409,'旧逻辑表包含用户数据，拒绝迁移')
            return {'created':False,'blockCount':count,'columns':list(FIELDS)}
        rows=parse_rows(db)
    with closing(sqlite3.connect(book/DB_NAME,timeout=15)) as db:
        db.execute('PRAGMA foreign_keys=ON')
        try:
            db.execute('BEGIN IMMEDIATE')
            assert_schema(db)
            now_schema=schema_status(db)
            count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
            if count:
                if now_schema!='ready':raise BaseError(409,'逻辑表在初始化期间发生变化')
                db.rollback()
                return {'created':False,'blockCount':count,'columns':list(FIELDS)}
            if now_schema=='wp00':
                db.execute('DROP TABLE logical_block')
                db.execute(SCHEMA_DDL)
            db.executemany('INSERT INTO logical_block('+','.join(FIELDS)+') VALUES ('+
                ','.join(['?']*len(FIELDS))+')',rows)
            count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
            if count!=len(rows) or schema_status(db)!='ready':raise BaseError(500,'初始化逻辑表数量核验失败')
            db.commit()
            return {'created':True,'blockCount':count,'columns':list(FIELDS)}
        except Exception:
            db.rollback()
            raise
