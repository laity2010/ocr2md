"""V2 WP00–03: immutable MinerUJSON, latest logical rows and readonly Markdown.

Business endpoint only; authorization and directory capability are reused from
Lab-Frame's F02 Workspace I/O. No duplicate file-I/O port or extra listener.
"""
from __future__ import annotations
import base64
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import stat
from urllib.parse import parse_qs
from v2_logical_contract import initial_rows, validate_initial
from v2_markdown_roundtrip import from_sql_rows, to_markdown, from_markdown
from v2_pdf_projection import project_pdf, PDFProjectionError

DB_NAME='ocr2md.v2.sqlite'
SCHEMA='ocr2md-v2-mineru-base/v1'
MAX_SOURCE_FILE=64*1024*1024
MAX_PDF_FILE=64*1024*1024
MAX_SOURCE_TOTAL=128*1024*1024
PAGE_SIZE=120
LEGACY_LOGICAL_COLS=('logical_id','base_blockid','parent_id','logical_order','markdown_text')
LOGICAL_COLS=LEGACY_LOGICAL_COLS+('block_type',)
BLOCK_LISTS=('preproc_blocks','discarded_blocks','para_blocks')
COLUMNS=('blockid','source_path','source_sha256','page_index','page_number',
    'block_group','page_block_index','source_json_path','block_type','mineru_index',
    'bbox_json','angle','level','lines_json','blocks_json','block_json',
    'record_kind','original_bytes')

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

class BaseError(Exception):
    def __init__(self,status,msg):super().__init__(msg);self.status=status

def require_regular(path:Path)->bytes:
    if path.is_symlink():raise BaseError(403,'原始文件不允许是符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:raise BaseError(422,'原始文件必须是普通文件')
        if info.st_size>MAX_SOURCE_FILE:raise BaseError(413,'单个 MinerUJSON 超过 64 MiB 限额')
        with os.fdopen(os.dup(fd),'rb') as f: raw=f.read(MAX_SOURCE_FILE+1)
        if len(raw)!=info.st_size:raise BaseError(409,'原始文件读取期间发生变化')
        return raw
    finally:os.close(fd)

def mineru_sources(folder:Path):
    """Read only directly selected directory or its ONE conventional MinerU subdir."""
    candidates=[]
    for sub in ('minerujson','mineru_json','mineru json'):
        p=folder/sub
        if p.exists():
            if p.is_symlink() or not p.is_dir():raise BaseError(422,'MinerU 目录不可用或为符号链接')
            candidates.append(p)
    if len(candidates)>1:raise BaseError(409,'检测到多个 MinerU 目录，拒绝猜测来源')
    source=candidates[0] if candidates else folder
    found=[];total=0
    for p in sorted(source.iterdir()):
        if not p.name.lower().endswith('.json') or p.name.startswith('.'):continue
        data=require_regular(p)
        try: decoded=json.loads(data)
        except (ValueError,UnicodeDecodeError):continue
        if not isinstance(decoded,dict) or not isinstance(decoded.get('pdf_info'),list):continue
        total+=len(data)
        if total>MAX_SOURCE_TOTAL:raise BaseError(413,'本次源文件总大小超过 128 MiB')
        found.append((p.relative_to(folder).as_posix(),data,decoded))
    if not found:raise BaseError(422,'工作目录中未找到含 pdf_info 的 MinerUJSON')
    if len(found)>64:raise BaseError(413,'MinerUJSON 分卷数超过 64')
    return found

def compact(obj):return json.dumps(obj,ensure_ascii=False,separators=(',',':'))

def typed(obj,key):
    value=obj.get(key)
    return compact(value) if value is not None else None

def assert_schema(db, *, allow_legacy=False):
    tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
    if tables!={'mineru_base','logical_block'}:raise BaseError(409,'现有 SQLite 不符合 V2 两表结构，拒绝覆盖')
    # Only the verified WP03 five-column table may be migrated in place.
    columns=tuple(row[1] for row in db.execute('PRAGMA table_info(logical_block)'))
    if columns!=LOGICAL_COLS and not (allow_legacy and columns==LEGACY_LOGICAL_COLS):
        raise BaseError(409,'现有 SQLite 逻辑表结构不兼容，禁止将其当作当前逻辑状态')
    record=db.execute('SELECT block_json,record_kind FROM mineru_base WHERE blockid=0').fetchone()
    if not record or record[1]!='source_archive':raise BaseError(409,'现有 SQLite 缺少不可变原始档案')
    try: meta=json.loads(record[0])
    except (ValueError,TypeError):raise BaseError(409,'数据库原始档案损坏')
    if meta.get('schema')!=SCHEMA:raise BaseError(409,'现有 SQLite 的 Schema 版本不同，拒绝覆盖')
    return meta

def create_schema(db):
    db.executescript('''
    CREATE TABLE mineru_base(
      blockid INTEGER PRIMARY KEY CHECK(blockid>=0),
      source_path TEXT, source_sha256 TEXT,
      page_index INTEGER, page_number INTEGER, block_group TEXT,
      page_block_index INTEGER, source_json_path TEXT,
      block_type TEXT, mineru_index INTEGER, bbox_json TEXT,
      angle REAL, level INTEGER, lines_json TEXT, blocks_json TEXT,
      block_json TEXT NOT NULL, record_kind TEXT NOT NULL,
      original_bytes BLOB
    );
    CREATE TABLE logical_block(
      logical_id INTEGER PRIMARY KEY, base_blockid INTEGER,
      parent_id INTEGER, logical_order INTEGER, markdown_text TEXT,
      block_type TEXT NOT NULL DEFAULT '',
      FOREIGN KEY(base_blockid) REFERENCES mineru_base(blockid)
    );
    ''')

def prepare_rows(files):
    archive=[];rows=[];next_id=1
    for relative,raw,doc in files:
        digest=sha(raw)
        archive.append({'path':relative,'sha256':digest,'size':len(raw),
            'contentBase64':base64.b64encode(raw).decode('ascii')})
        for page_pos,page in enumerate(doc['pdf_info']):
            if not isinstance(page,dict):raise BaseError(422,'MinerU 页数据不是对象')
            page_idx=page.get('page_idx',page_pos)
            if not isinstance(page_idx,int):page_idx=page_pos
            for group in BLOCK_LISTS:
                blocks=page.get(group,[])
                if not isinstance(blocks,list):raise BaseError(422,'MinerU 块列表类型错误：'+group)
                for i,block in enumerate(blocks):
                    if not isinstance(block,dict):raise BaseError(422,'MinerU 块不是 JSON 对象')
                    index=block.get('index')
                    rows.append((next_id,relative,digest,page_idx,page_idx+1,group,i,
                        f'$.pdf_info[{page_pos}].{group}[{i}]',
                        str(block.get('type','')),
                        index if isinstance(index,int) else None,
                        typed(block,'bbox'),block.get('angle') if isinstance(block.get('angle'),(int,float)) else None,
                        block.get('level') if isinstance(block.get('level'),int) else None,
                        typed(block,'lines'),typed(block,'blocks'),compact(block),'block',None))
                    next_id+=1
    return archive,rows

def write_initial_logical(db):
    """Populate flat logical rows from the same already-verified base transaction.

    Caller owns the write transaction, must hold a write lock and must ensure
    the logical table is empty. Neither input JSON nor mineru_base is altered.
    """
    if db.execute('SELECT count(*) FROM logical_block').fetchone()[0]:
        raise BaseError(409,'逻辑表已有状态，禁止初始化覆盖')
    source=db.execute('SELECT blockid,block_group,block_json,block_type FROM mineru_base '
                      'WHERE blockid>0 ORDER BY blockid').fetchall()
    rows=initial_rows(source)
    para_ids={row['blockid'] for row in source if row['block_group']=='para_blocks'}
    validate_initial(rows,para_ids)
    db.executemany('INSERT INTO logical_block('
                   'logical_id,base_blockid,parent_id,logical_order,markdown_text,block_type) '
                   'VALUES (?,?,?,?,?,?)',[
                   (r.logical_id,r.base_blockid,r.parent_id,r.logical_order,r.markdown_text,r.block_type)
                   for r in rows])
    inserted=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
    if inserted!=len(rows):raise BaseError(500,'逻辑表初始化行数不一致')
    if list(db.execute('PRAGMA foreign_key_check')):
        raise BaseError(500,'逻辑表存在失效基础块引用')
    return inserted


def new_book(folder:Path,*,overwrite=False):
    files=mineru_sources(folder)
    archive,rows=prepare_rows(files)
    archive_data=compact({'schema':SCHEMA,'sources':[{k:v for k,v in f.items() if k!='contentBase64'} for f in archive]})
    raw_archive=compact(archive).encode('utf-8')
    # Create only a private staging file in the authorized selected directory.
    # Stage atomically; replace only the authorized V2 SQLite filename when needed.
    fd_parent=os.open(folder,os.O_RDONLY|getattr(os,'O_DIRECTORY',0)|getattr(os,'O_NOFOLLOW',0))
    stage='.ocr2md-v2-'+secrets.token_hex(12)+'.tmp'
    try:
        # Only the explicitly authorized V2 database may be replaced. Never
        # rename, delete, or overwrite the MinerU/PDF inputs or other SQL files.
        current=None
        if os.path.lexists(folder/DB_NAME):
            if not overwrite:raise BaseError(409,'V2 SQLite 已存在，拒绝未授权覆盖')
            current=os.stat(DB_NAME,dir_fd=fd_parent,follow_symlinks=False)
            if not stat.S_ISREG(current.st_mode) or current.st_nlink!=1:
                raise BaseError(422,'V2 SQLite 不是独立普通文件，拒绝覆盖')
            # Active WAL or rollback journal files cannot be left beside the
            # replacement: they may apply historical transactions to new data.
            for suffix in ('-wal','-shm','-journal'):
                if os.path.lexists(folder/(DB_NAME+suffix)):
                    raise BaseError(409,'SQLite 存在未结束的日志文件，请先关闭其他数据库连接')
        fd=os.open(stage,os.O_RDWR|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600,dir_fd=fd_parent)
        os.close(fd)
        try:
            with closing(sqlite3.connect(folder/stage)) as db:
                db.row_factory=sqlite3.Row
                db.execute('PRAGMA foreign_keys=ON')
                create_schema(db)
                db.execute('INSERT INTO mineru_base(blockid,block_json,record_kind,original_bytes) VALUES (0,?,?,?)',
                    (archive_data,'source_archive',raw_archive))
                marks=','.join('?' for _ in COLUMNS)
                db.executemany('INSERT INTO mineru_base('+','.join(COLUMNS)+') VALUES ('+marks+')',rows)
                # Base and initial logical content commit together in the
                # private staged database. Neither table is published alone.
                logical_count=write_initial_logical(db)
                assert_schema(db)
                if db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0]!=len(rows):
                    raise BaseError(500,'基础表入库数量核验失败')
                # Validate byte-exact reconstruction from the SQLite archive.
                saved=json.loads(db.execute('SELECT original_bytes FROM mineru_base WHERE blockid=0').fetchone()[0]);
                if [(v['path'],sha(base64.b64decode(v['contentBase64']))) for v in saved]!=[(v['path'],v['sha256']) for v in archive]:
                    raise BaseError(500,'MinerUJSON 原始字节归档校验失败')
                db.commit()
            # File-by-file SHA guard before publication; JSON files remain read-only.
            for rel,raw,_ in files:
                if sha(require_regular(folder/rel))!=sha(raw):raise BaseError(409,'导入期间 MinerUJSON 被修改，已取消')
            if current is None:
                os.link(stage,DB_NAME,src_dir_fd=fd_parent,dst_dir_fd=fd_parent,follow_symlinks=False)
            else:
                # Ensure no other process replaced the file while importing.
                now=os.stat(DB_NAME,dir_fd=fd_parent,follow_symlinks=False)
                if (now.st_ino,now.st_mtime_ns,now.st_size)!=(current.st_ino,current.st_mtime_ns,current.st_size):
                    raise BaseError(409,'转换期间数据库已变化，拒绝覆盖')
                os.replace(stage,DB_NAME,src_dir_fd=fd_parent,dst_dir_fd=fd_parent)
            os.fsync(fd_parent)
        finally:
            try:os.unlink(stage,dir_fd=fd_parent)
            except FileNotFoundError:pass
    finally:os.close(fd_parent)
    return {'created':True,'replaced':current is not None,'blockCount':len(rows),'logicalCount':logical_count,'sourceCount':len(files),'dbFile':DB_NAME}

def physical_tables(db):
    """Reflect actual user-defined SQLite tables, including empty tables.

    A table's inclusion is determined by sqlite_master, never its row count
    or whether an editor/View has been implemented. SQLite's internal tables
    and views are not SQL business-table navigation entries.
    """
    return [row[0] for row in db.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='table' AND substr(name,1,7) != 'sqlite_' "
        "ORDER BY rowid")]


def read_table(db, name, offset):
    names=physical_tables(db)
    if name not in names:raise BaseError(404,'指定 SQL 物理表不存在')
    # Identifier quoted ONLY after exact sqlite_master membership validation.
    identifier='"'+name.replace('"','""')+'"'
    info=list(db.execute('PRAGMA table_info('+identifier+')'))
    cols=[row[1] for row in info]
    if not cols:raise BaseError(409,'SQL 物理表没有可显示的列')
    # Source archive is stored in blockid=0 but intentionally omitted from
    # the business-block grid. Never send its original_bytes to the client.
    clause=' WHERE blockid>0' if name=='mineru_base' else ''
    pk=sorted((row[5],row[1]) for row in info if row[5]>0)
    ordering=(','.join('"'+column.replace('"','""')+'"' for _,column in pk)
              if pk else 'rowid')
    order=' ORDER BY '+ordering
    count=db.execute('SELECT count(*) FROM '+identifier+clause).fetchone()[0]
    raw=db.execute('SELECT * FROM '+identifier+clause+order+' LIMIT ? OFFSET ?',
        (PAGE_SIZE,offset)).fetchall()
    rows=[]
    for record in raw:
        row=dict(record)
        if 'original_bytes' in row:row['original_bytes']=None
        rows.append(row)
    return {'name':name,'columns':cols,'rowCount':count,'rows':rows}


def existing_state(folder:Path,offset=0,table='mineru_base'):
    db_path=folder/DB_NAME
    if not db_path.exists():return {'exists':False,'dbFile':DB_NAME}
    if db_path.is_symlink():raise BaseError(403,'SQLite 不允许是符号链接')
    fd=os.open(db_path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:raise BaseError(422,'SQLite 文件类型不合法')
    finally:os.close(fd)
    with closing(sqlite3.connect('file:'+str(db_path)+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row
        meta=assert_schema(db)
        names=physical_tables(db)
        chosen=read_table(db,table,offset)
        catalog=[]
        for name in names:
            # SQLite schema is WP00's only authority; metadata is read-only.
            identifier='"'+name.replace('"','""')+'"'
            catalog.append({'name':name,'columns':[
                row[1] for row in db.execute('PRAGMA table_info('+identifier+')')]})
        block_count=db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0]
        logical_count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
        para_count=db.execute("SELECT count(*) FROM mineru_base WHERE block_group='para_blocks'").fetchone()[0]
        return {'exists':True,'dbFile':DB_NAME,'schema':SCHEMA,
            'sourceCount':len(meta['sources']),'sources':meta['sources'],
            'blockCount':block_count,'paraBlockCount':para_count,'logicalCount':logical_count,'offset':offset,'pageSize':PAGE_SIZE,
            'tables':catalog,'tableName':chosen['name'],
            'rowCount':chosen['rowCount'],'columns':chosen['columns'],'rows':chosen['rows']}


def existing_markdown(folder:Path):
    """WP03 read-only Markdown and position manifest from current logical rows."""
    db_path=folder/DB_NAME
    if db_path.is_symlink():raise BaseError(403,'SQLite 不允许是符号链接')
    try:fd=os.open(db_path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    except FileNotFoundError:raise BaseError(409,'请先初始化 V2 SQLite')
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
            raise BaseError(422,'SQLite 文件类型不合法')
    finally:os.close(fd)
    with closing(sqlite3.connect('file:'+str(db_path)+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row
        assert_schema(db)
        rows=db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,markdown_text,block_type '
                        'FROM logical_block ORDER BY logical_order').fetchall()
        if not rows:raise BaseError(409,'逻辑表尚未初始化，请重新打开已保存的工作目录')
        try:
            originals=from_sql_rows(rows)
            result=to_markdown(originals)
            if from_markdown(result)!=originals:
                raise BaseError(409,'只读 Markdown 往返结果与逻辑表不一致')
        except ValueError as error:
            raise BaseError(409,'逻辑表无法无损重构：'+str(error)) from error
        return result


def migrate_legacy_type_column(folder: Path, common):
    """Migrate only our known 5-column WP03 logical table, without rebuilding.

    Returns None if this isn't that exact old schema (other schema handling
    stays with the existing import flow). A populated old logic table with a
    changed MinerU source is never silently replaced.
    """
    path=folder/DB_NAME
    if path.is_symlink():raise BaseError(403,'SQLite 文件不允许是符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
            raise BaseError(422,'SQLite 文件类型不合法')
    finally:os.close(fd)
    # Probe on the same Frame-authorized workspace before any write.
    with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as readonly:
        columns=tuple(r[1] for r in readonly.execute('PRAGMA table_info(logical_block)'))
        if columns!=LEGACY_LOGICAL_COLS:return None
        archive=assert_schema(readonly,allow_legacy=True)
        row_count=readonly.execute('SELECT count(*) FROM logical_block').fetchone()[0]
    # Validate source identity before converting even a one-column schema.
    sources=mineru_sources(folder)
    if [(p,sha(raw)) for p,raw,_ in sources] != [
            (src['path'],src['sha256']) for src in archive['sources']]:
        if row_count:
            raise BaseError(409,'原始 MinerU 已改变，拒绝覆盖现有五列逻辑状态')
        return None  # empty old logic may use the safe existing rebuild path
    common.probe(folder)
    with closing(sqlite3.connect('file:'+str(path)+'?mode=rw',uri=True,timeout=3)) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        now=tuple(r[1] for r in db.execute('PRAGMA table_info(logical_block)'))
        if now==LOGICAL_COLS:
            # Another request already migrated it; don't touch existing types.
            count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
            db.commit()
            return {'created':False,'migrated':False,'replaced':False,
                    'blockCount':db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0],
                    'logicalCount':count,'sourceCount':len(archive['sources']),'dbFile':DB_NAME}
        if now!=LEGACY_LOGICAL_COLS:
            raise BaseError(409,'升级期间逻辑表结构已变化，拒绝覆盖')
        assert_schema(db,allow_legacy=True)
        db.execute("ALTER TABLE logical_block ADD COLUMN block_type TEXT NOT NULL DEFAULT ''")
        db.execute('UPDATE logical_block SET block_type=COALESCE(('
                   'SELECT b.block_type FROM mineru_base AS b '
                   "WHERE b.blockid=logical_block.base_blockid),'')")
        existing=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
        if not existing:
            existing=write_initial_logical(db)
        assert_schema(db)
        if list(db.execute('PRAGMA foreign_key_check')):
            raise BaseError(409,'升级后逻辑关系存在无效基础块引用')
        if any(sha(require_regular(folder/rel))!=sha(raw) for rel,raw,_ in sources):
            raise BaseError(409,'升级期间 MinerUJSON 已改变，拒绝提交迁移')
        block_count=db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0]
        db.commit()
        return {'created':False,'migrated':True,'replaced':False,
                'blockCount':block_count,'logicalCount':existing,
                'sourceCount':len(archive['sources']),'dbFile':DB_NAME}


def backfill_empty_logical(folder: Path, common):
    """Auto-complete an older valid V2 DB without touching its base archive.

    Invoked only through the already-authorized, explicitly confirmed `import`
    POST. The same source must match; non-empty state is never modified.
    """
    db_path=folder/DB_NAME
    if db_path.is_symlink():raise BaseError(403,'SQLite 文件不允许是符号链接')
    try:metadata=db_path.stat()
    except FileNotFoundError:raise BaseError(409,'请先初始化 MinerU 基础表')
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink!=1:
        raise BaseError(422,'SQLite 文件类型不合法')
    common.probe(folder)
    with closing(sqlite3.connect('file:'+str(db_path)+'?mode=rw',uri=True,timeout=3)) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        meta=assert_schema(db)
        sources=mineru_sources(folder)
        if [(p,sha(raw)) for p,raw,_ in sources]!=[
            (src['path'],src['sha256']) for src in meta['sources']]:
            raise BaseError(409,'MinerU 来源与基础表不一致，禁止自动补全逻辑层')
        existing=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
        if existing:
            db.commit()
            return {'created':False,'preserved':True,'logicalCount':existing,
                    'dbFile':DB_NAME,'baseChanged':False}
        count=write_initial_logical(db)
        db.commit()
        return {'created':True,'preserved':False,'logicalCount':count,
                'dbFile':DB_NAME,'baseChanged':False}

def read_verified_pdf(folder:Path):
    """Return the one PDF directly under an F02-authorized book folder.

    Not a general-purpose file API: no filename user argument or path escape,
    no root recursion, no touching other books, no symlink/hardlink reads.
    """
    candidates=[]
    for directory in (folder,folder/'pdf'):
        if directory!=folder:
            if not directory.exists():continue
            if directory.is_symlink() or not directory.is_dir():
                raise BaseError(403,'PDF 子目录不允许是符号链接')
        for path in sorted(directory.iterdir()):
            if path.name.startswith('.') or path.suffix.lower()!='.pdf':continue
            candidates.append(path)
    if not candidates:raise BaseError(404,'工作目录中没有可预览的原始 PDF 文件')
    if len(candidates)!=1:raise BaseError(409,'检测到多个 PDF 文件，禁止猜测对应 MinerU 来源')
    path=candidates[0]
    if path.is_symlink():raise BaseError(403,'PDF 文件不允许是符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
            raise BaseError(422,'PDF 必须是普通非硬链接文件')
        if not 8<=info.st_size<=MAX_PDF_FILE:
            raise BaseError(413,'PDF 超过 64 MiB 或不是有效文件')
        with os.fdopen(os.dup(fd),'rb') as stream:
            raw=stream.read(MAX_PDF_FILE+1)
        if len(raw)!=info.st_size or not raw.startswith(b'%PDF-'):
            raise BaseError(422,'PDF 原始字节不完整或缺少 PDF 文件头')
        return raw
    finally:os.close(fd)


def existing_pdf_map(folder:Path):
    path=folder/DB_NAME
    if path.is_symlink():raise BaseError(403,'数据库不允许是符号链接')
    with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row
        assert_schema(db)
        try:return project_pdf(db)
        except PDFProjectionError as err:raise BaseError(409,str(err)) from err


def dispatch(operation,method,folder,payload,query,common):
    if operation=='pdf':
        if method!='GET':raise BaseError(405,'PDF 原文只能只读 GET')
        return read_verified_pdf(folder)
    if operation=='pdf-map':
        if method!='GET':raise BaseError(405,'PDF 映射仅可 GET')
        return existing_pdf_map(folder)
    if operation=='markdown':
        if method!='GET':raise BaseError(405,'Markdown 重构仅可 GET')
        return existing_markdown(folder)
    if operation=='state':
        if method!='GET':raise BaseError(405,'基础表状态仅可 GET')
        try:offset=int(query.get('offset',['0'])[0])
        except (ValueError,TypeError):raise BaseError(422,'分页参数无效')
        if offset<0 or offset>10000000:raise BaseError(422,'分页参数超出范围')
        table=query.get('table',['mineru_base'])[0]
        if not isinstance(table,str) or not table or len(table)>128:
            raise BaseError(422,'SQL 物理表名称无效')
        return existing_state(folder,offset,table)
    if operation=='import':
        if method!='POST':raise BaseError(405,'导入操作仅可 POST')
        if payload.get('confirm')!='import-mineru-base':raise BaseError(422,'缺少明确导入确认')
        exists=os.path.lexists(folder/DB_NAME)
        if exists:
            # Compatible + identical input is stable across refreshes. The
            # user's explicit V2 import approval also permits overwriting an
            # incompatible old schema or a different-source V2 database.
            try:
                result=existing_state(folder)
            except BaseError as error:
                if error.status!=409:raise
                upgraded=migrate_legacy_type_column(folder,common)
                if upgraded is not None:return upgraded
            except sqlite3.DatabaseError:
                pass
            else:
                sources=mineru_sources(folder)
                if [(v['path'],v['sha256']) for v in result['sources']]==[(p,sha(b)) for p,b,_ in sources]:
                    if result['logicalCount']==0:
                        completed=backfill_empty_logical(folder,common)
                        return {'created':False,'replaced':False,'blockCount':result['blockCount'],
                            'logicalCount':completed['logicalCount'],'backfilled':completed['created'],
                            'sourceCount':result['sourceCount'],'dbFile':DB_NAME}
                    return {'created':False,'replaced':False,'blockCount':result['blockCount'],
                        'logicalCount':result['logicalCount'],'backfilled':False,
                        'sourceCount':result['sourceCount'],'dbFile':DB_NAME}
                with closing(sqlite3.connect('file:'+str(folder/DB_NAME)+'?mode=ro',uri=True)) as db:
                    if db.execute('SELECT count(*) FROM logical_block').fetchone()[0]:
                        raise BaseError(409,'逻辑表已有最新状态，禁止自动覆盖重建 V2 SQLite')
        # Reuse the same F02 read/write/cleanup probe before atomic replacement.
        common.probe(folder)
        return new_book(folder,overwrite=exists)
    raise BaseError(404,'未知 V2 导入操作')

def handle(handler,operation,parsed,common):
    def respond(code,result):handler.respond(code,json.dumps(result,ensure_ascii=False),'application/json; charset=utf-8')
    try:
        if handler.command not in ('GET','POST'):raise BaseError(405,'不允许此请求方法')
        if handler.command=='POST':
            if handler.headers.get('Origin') not in common.ALLOWED_ORIGINS:raise BaseError(403,'写入来源未经授权')
            if handler.headers.get('Transfer-Encoding'):raise BaseError(400,'不支持 chunked 请求')
            try:n=int(handler.headers.get('Content-Length','-1'))
            except ValueError:n=-1
            if not 2<=n<=8192:raise BaseError(413,'请求大小不合法')
            raw=handler.rfile.read(n)
            if len(raw)!=n:raise BaseError(400,'请求数据不完整')
            try:payload=json.loads(raw)
            except ValueError:raise BaseError(400,'请求不是 JSON')
            if not isinstance(payload,dict):raise BaseError(422,'请求不是对象')
        else:payload={}
        q=parse_qs(parsed.query)
        path=payload.get('workspace') if handler.command=='POST' else q.get('workspace',[None])[0]
        roots=common.authorized_roots(handler.headers.get('Cookie',''))
        folder=common.checked_workspace(path,roots)
        result=dispatch(operation,handler.command,folder,payload,q,common)
        if operation=='pdf':handler.respond(200,result,'application/pdf')
        else:respond(200,result)
    except BaseError as error:respond(error.status,{'error':str(error)})
    except common.WorkspaceIOError as error:respond(error.code,{'error':str(error)})
    except common.AccessError as error:respond(error.code,{'error':str(error)})
    except FileExistsError:respond(409,{'error':'数据库已经存在，拒绝覆盖'})
    except PermissionError:respond(403,{'error':'目录权限不足，无法建立 SQLite'})
    except (OSError,sqlite3.Error) as error:respond(503,{'error':'本地 SQLite 操作失败：'+type(error).__name__})
