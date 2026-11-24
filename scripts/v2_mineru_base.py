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
from v2_logical_contract import initial_rows, validate_initial, raw_element_text
from v2_md_block import initial_md, raw_bindings, raw_at
from v2_table_recovery import table_overrides
from v2_markdown_roundtrip import from_sql_rows, to_markdown, from_markdown, preview_owned_migration, OWNED_FORMAT, FORMAT
from v2_pdf_projection import project_pdf, PDFProjectionError
from v2_pbs import initial_pbs, validate_pbs

DB_NAME='ocr2md.v2.sqlite'
# Explicit database header marker, not an extra table or inferred state.
# WP24 sets it only during fresh initialization or explicitly confirmed reset.
OWNED_LF_VERSION=2303
def is_owned_lf(db):
    return db.execute('PRAGMA user_version').fetchone()[0]==OWNED_LF_VERSION
SCHEMA='ocr2md-v2-mineru-base/v1'
MAX_SOURCE_FILE=64*1024*1024
MAX_PDF_FILE=64*1024*1024
MAX_SOURCE_TOTAL=128*1024*1024
PAGE_SIZE=120
LEGACY_LOGICAL_COLS=('logical_id','base_blockid','parent_id','logical_order','markdown_text')
PRE_PBS_LOGICAL_COLS=LEGACY_LOGICAL_COLS+('block_type',)
OLD_PBS_LOGICAL_COLS=PRE_PBS_LOGICAL_COLS+('p','b','s')
LOGICAL_COLS=('logical_id','base_blockid','parent_id','logical_order',
    'md_block','block_type','p','b','s','raw_path')
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
    if columns!=LOGICAL_COLS and not (allow_legacy and columns in (LEGACY_LOGICAL_COLS,PRE_PBS_LOGICAL_COLS,OLD_PBS_LOGICAL_COLS)):
        raise BaseError(409,'现有 SQLite 逻辑表结构不兼容，禁止将其当作当前逻辑状态')
    if columns==LOGICAL_COLS:
        try:validate_pbs([dict(r) for r in db.execute('SELECT logical_id,p,b,s FROM logical_block')])
        except ValueError as err:raise BaseError(409,'现有逻辑 PBS 状态不合法：'+str(err)) from err
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
      parent_id INTEGER, logical_order INTEGER, md_block TEXT NOT NULL,
      block_type TEXT NOT NULL DEFAULT '',
      p INTEGER NOT NULL CHECK(p>=0), b INTEGER NOT NULL CHECK(b>=0),
      s INTEGER NOT NULL CHECK(s>=0), raw_path TEXT,
      FOREIGN KEY(base_blockid) REFERENCES mineru_base(blockid)
    );
    CREATE UNIQUE INDEX logical_block_pbs_unique ON logical_block(p,b,s);
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
    source=db.execute('SELECT blockid,block_group,block_json,block_type,page_index,source_path FROM mineru_base '
                      'WHERE blockid>0 ORDER BY blockid').fetchall()
    rows=initial_rows(source)
    para_ids={row['blockid'] for row in source if row['block_group']=='para_blocks'}
    validate_initial(rows,para_ids)
    coords=initial_pbs([dict(logical_id=r.logical_id,base_blockid=r.base_blockid,
                        parent_id=r.parent_id,logical_order=r.logical_order) for r in rows],
                       {r['blockid']:r['page_index'] for r in source})
    bindings=raw_bindings(source)
    # A final para table can intentionally contain lines_deleted=True after
    # MinerU cross-page merging. Keep para's ID/structure but recover the
    # corresponding page-local table text from immutable preproc originals.
    recovered=table_overrides(source)
    db.executemany('INSERT INTO logical_block('
                   'logical_id,base_blockid,parent_id,logical_order,md_block,block_type,p,b,s,raw_path) '
                   'VALUES (?,?,?,?,?,?,?,?,?,?)',[
                   (r.logical_id,r.base_blockid,r.parent_id,r.logical_order,
                    initial_md(recovered.get((r.base_blockid,bindings[r.logical_id][1]),
                        (r.markdown_text,''))[0],r.block_type,bindings[r.logical_id][2]),
                    r.block_type,*coords[r.logical_id],bindings[r.logical_id][1]) for r in rows])
    inserted=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
    if inserted!=len(rows):raise BaseError(500,'逻辑表初始化行数不一致')
    if list(db.execute('PRAGMA foreign_key_check')):
        raise BaseError(500,'逻辑表存在失效基础块引用')
    return inserted


def finish_fresh_owned_logical(db):
    """Only on freshly compiled rows, within the same initialization transaction.
    Reuse the validated real LF layout; never pass previously edited rows here.
    """
    rows=from_sql_rows(db.execute('SELECT * FROM logical_block ORDER BY logical_order'))
    plan=preview_owned_migration(rows)
    db.executemany('UPDATE logical_block SET md_block=? WHERE logical_id=?',
                   [(c['after'],c['logicalId']) for c in plan['changes']])
    to_markdown(from_sql_rows(db.execute('SELECT * FROM logical_block ORDER BY logical_order')),format=OWNED_FORMAT)
    db.execute('PRAGMA user_version='+str(OWNED_LF_VERSION))


def new_book(folder:Path,*,overwrite=False,owned=False):
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
                if owned:finish_fresh_owned_logical(db)
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
    # Logical rows are one CM6-owned document, not a paginated SQL screen.
    # Return the complete logical inventory; AG filters it by the focused PBS p.
    # Keep the original 120-row paging for the immutable mineru_base inspector.
    if name=='logical_block':
        raw=db.execute('SELECT * FROM '+identifier+
                       ' ORDER BY logical_order,logical_id').fetchall()
    else:
        raw=db.execute('SELECT * FROM '+identifier+clause+order+' LIMIT ? OFFSET ?',
            (PAGE_SIZE,offset)).fetchall()
    rows=[]
    original={r['blockid']:r['block_json'] for r in db.execute(
        'SELECT blockid,block_json FROM mineru_base WHERE blockid>0')} if name=='logical_block' else {}
    for record in raw:
        row=dict(record)
        if 'original_bytes' in row:row['original_bytes']=None
        if name=='logical_block':
            source=original.get(row['base_blockid'])
            element=raw_at(source,row['raw_path']) if source and row['raw_path'] else None
            row['raw_block']=raw_element_text(element) if element else None
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
        if table=='logical_block':offset=0
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
        db.execute('BEGIN')
        assert_schema(db)
        rows=db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,md_block,block_type,p,b,s '
                        'FROM logical_block ORDER BY logical_order').fetchall()
        if not rows:raise BaseError(409,'逻辑表尚未初始化，请重新打开已保存的工作目录')
        try:
            originals=from_sql_rows(rows)
            result=to_markdown(originals,format=OWNED_FORMAT if is_owned_lf(db) else FORMAT)
            if from_markdown(result)!=originals:
                raise BaseError(409,'只读 Markdown 往返结果与逻辑表不一致')
        except ValueError as error:
            raise BaseError(409,'逻辑表无法无损重构：'+str(error)) from error
        return result


def table_repair_preview(folder:Path):
    """Read-only per-logical-ID candidate list for existing edited books.

    Plan ONLY when the persisted MD Block is byte-for-byte equal to the
    original para text at the matching base path. Modified blocks are skipped,
    not replaced. A separate user-confirmed CM6 transaction persists via
    existing optimistic md-commit; no new backend write operation is added.
    """
    db_path=folder/DB_NAME
    if db_path.is_symlink():raise BaseError(403,'SQLite 文件不允许是符号链接')
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
        base=db.execute('SELECT blockid,block_group,source_path,page_index,block_json '
                        'FROM mineru_base WHERE blockid>0 ORDER BY blockid').fetchall()
        planned=table_overrides(base)
        originals={r['blockid']:r['block_json'] for r in base}
        rows=db.execute('SELECT logical_id,base_blockid,raw_path,md_block,block_type '
                        'FROM logical_block ORDER BY logical_order').fetchall()
        result=[];skipped=0
        for row in rows:
            key=(row['base_blockid'],row['raw_path'])
            if key not in planned:continue
            source=originals.get(row['base_blockid'])
            element=raw_at(source,row['raw_path']) if source else None
            if element is None:
                skipped+=1;continue
            original_md=initial_md(raw_element_text(element),row['block_type'],element)
            desired_raw,reason=planned[key]
            updated_md=initial_md(desired_raw,row['block_type'],element)
            if row['md_block']==updated_md:continue
            if row['md_block']!=original_md:
                skipped+=1;continue
            result.append({'logicalId':row['logical_id'],
                'before':row['md_block'],'after':updated_md,'reason':reason})
        return {'schema':'v2-table-repair/v1','candidates':result,
                'changeCount':len(result),'skippedEdited':skipped}


def migrate_legacy_type_column(folder: Path, common):
    """In-place 5/6 -> 9 column PBS upgrade, no replacement of logical data."""
    path=folder/DB_NAME
    if path.is_symlink():raise BaseError(403,'SQLite 文件不允许是符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:
            raise BaseError(422,'SQLite 文件类型不合法')
    finally:os.close(fd)
    if any(os.path.lexists(folder/(DB_NAME+suffix)) for suffix in ('-wal','-shm','-journal')):
        raise BaseError(409,'SQLite 存在未结束的日志文件，请先关闭其他数据库连接')
    with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as read:
        read.row_factory=sqlite3.Row
        cols=tuple(r[1] for r in read.execute('PRAGMA table_info(logical_block)'))
        if cols not in (LEGACY_LOGICAL_COLS,PRE_PBS_LOGICAL_COLS,OLD_PBS_LOGICAL_COLS):return None
        archive=assert_schema(read,allow_legacy=True)
        n=read.execute('SELECT count(*) FROM logical_block').fetchone()[0]
    sources=mineru_sources(folder)
    if [(p,sha(raw)) for p,raw,_ in sources] != [
            (item['path'],item['sha256']) for item in archive['sources']]:
        if n:raise BaseError(409,'原始 MinerU 已改变，拒绝覆盖现有逻辑状态')
        return None
    common.probe(folder)
    with closing(sqlite3.connect('file:'+str(path)+'?mode=rw',uri=True,timeout=3)) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        now=tuple(r[1] for r in db.execute('PRAGMA table_info(logical_block)'))
        if now==LOGICAL_COLS:
            assert_schema(db)
            count=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
            db.commit()
            return {'created':False,'migrated':False,'replaced':False,
                    'blockCount':db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0],
                    'logicalCount':count,'sourceCount':len(archive['sources']),'dbFile':DB_NAME}
        if now not in (LEGACY_LOGICAL_COLS,PRE_PBS_LOGICAL_COLS,OLD_PBS_LOGICAL_COLS):
            raise BaseError(409,'升级期间逻辑表结构已改变，拒绝覆盖')
        assert_schema(db,allow_legacy=True)
        if now==LEGACY_LOGICAL_COLS:
            db.execute("ALTER TABLE logical_block ADD COLUMN block_type TEXT NOT NULL DEFAULT ''")
            db.execute('UPDATE logical_block SET block_type=COALESCE(('
                       'SELECT b.block_type FROM mineru_base AS b '
                       "WHERE b.blockid=logical_block.base_blockid),'')")
        if now in (LEGACY_LOGICAL_COLS,PRE_PBS_LOGICAL_COLS):
            for key in ('p','b','s'):
                db.execute('ALTER TABLE logical_block ADD COLUMN '+key+' INTEGER')
        existing=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
        if existing and now!=OLD_PBS_LOGICAL_COLS:
            source_rows=[dict(r) for r in db.execute(
                'SELECT logical_id,base_blockid,parent_id,logical_order FROM logical_block ORDER BY logical_order')]
            pages={r['blockid']:r['page_index'] for r in db.execute(
                'SELECT blockid,page_index FROM mineru_base WHERE blockid>0')}
            try:coords=initial_pbs(source_rows,pages)
            except ValueError as err:raise BaseError(409,str(err)) from err
            db.executemany('UPDATE logical_block SET p=?,b=?,s=? WHERE logical_id=?',
                           [(*value,lid) for lid,value in coords.items()])
        # Existing WP09 text was raw, so compile Markdown exactly once;
        # any non-raw text already edited is retained byte-for-byte.
        db.execute('ALTER TABLE logical_block RENAME COLUMN markdown_text TO md_block')
        db.execute('ALTER TABLE logical_block ADD COLUMN raw_path TEXT')
        if existing:
            base=list(db.execute('SELECT blockid,block_group,block_json FROM mineru_base WHERE blockid>0 ORDER BY blockid'))
            bindings=raw_bindings(base)
            edits=[]
            for r in db.execute('SELECT logical_id,base_blockid,block_type,md_block FROM logical_block'):
                ref=bindings.get(r['logical_id'])
                if ref and ref[0]==r['base_blockid']:
                    _,path,element=ref
                    raw=raw_element_text(element)
                    text=initial_md(raw,r['block_type'],element) if r['md_block']==raw else r['md_block']
                else:
                    path=None
                    text=r['md_block']
                edits.append((text,path,r['logical_id']))
            db.executemany('UPDATE logical_block SET md_block=?,raw_path=? WHERE logical_id=?',edits)
        else:
            existing=write_initial_logical(db)
            finish_fresh_owned_logical(db)
        db.execute('CREATE UNIQUE INDEX IF NOT EXISTS logical_block_pbs_unique ON logical_block(p,b,s)')
        assert_schema(db)
        if list(db.execute('PRAGMA foreign_key_check')):
            raise BaseError(409,'迁移后存在无效基础块来源')
        if any(sha(require_regular(folder/rel))!=sha(raw) for rel,raw,_ in sources):
            raise BaseError(409,'迁移期间 MinerUJSON 已改变，拒绝提交')
        blocks=db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0]
        db.commit()
        return {'created':False,'migrated':True,'replaced':False,'blockCount':blocks,
                'logicalCount':existing,'sourceCount':len(archive['sources']),'dbFile':DB_NAME}


def backfill_empty_logical(folder: Path, common, *, owned=False):
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
        if owned:finish_fresh_owned_logical(db)
        db.commit()
        return {'created':True,'preserved':False,'logicalCount':count,
                'dbFile':DB_NAME,'baseChanged':False}

def rebuild_logical_only(folder:Path,payload,common):
    """Explicit WP09 one-table data reset. MinerU/base stays byte-identical.

    The DELETE and INSERT use a single transaction. Failure restores all
    previous logical rows. Never replace the complete SQLite file.
    """
    owned=payload.get('confirm')=='initialize-v2-owned-logical'
    if payload.get('confirm') not in ('rebuild-v2-logical-only','initialize-v2-owned-logical') or set(payload)!={'workspace','confirm'}:
        raise BaseError(422,'缺少仅覆盖逻辑表的明确确认')
    path=folder/DB_NAME
    if path.is_symlink():raise BaseError(403,'V2 SQLite 不允许符号链接')
    try:st=path.stat()
    except FileNotFoundError:raise BaseError(409,'尚未建立 V2 SQLite，不可重建逻辑表')
    if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:
        raise BaseError(422,'V2 SQLite 不是独立普通文件')
    common.probe(folder)
    sources=mineru_sources(folder)
    with closing(sqlite3.connect('file:'+str(path)+'?mode=rw',uri=True,timeout=5)) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            db.execute('BEGIN IMMEDIATE')
            meta=assert_schema(db)
            if is_owned_lf(db) and not owned:raise BaseError(409,'真实换行模式禁止旧版逻辑表重建')
            expected=[(item['path'],item['sha256']) for item in meta['sources']]
            if [(rel,sha(raw)) for rel,raw,_ in sources]!=expected:
                raise BaseError(409,'原始 MinerU 文件与基础表档案不一致，拒绝覆盖逻辑表')
            base_snapshot=[tuple(row) for row in db.execute(
                'SELECT * FROM mineru_base ORDER BY blockid')]
            previous=db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
            backup=None
            if owned and previous:
                # A private, separate SQLite backup (not an application table).
                # BEGIN IMMEDIATE blocks concurrent writers; a second read-only
                # connection copies the last committed database consistently.
                backup=folder/('.ocr2md-v2-before-init-'+secrets.token_hex(8)+'.sqlite')
                fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
                os.close(fd)
                with closing(sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)) as reader, closing(sqlite3.connect(backup)) as copy:
                    reader.backup(copy)
                    if copy.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                        raise BaseError(500,'旧逻辑表备份完整性检查失败')
                    for table,order in [('mineru_base','blockid'),('logical_block','logical_order')]:
                        if copy.execute('SELECT * FROM '+table+' ORDER BY '+order).fetchall()!=[
                            tuple(r) for r in db.execute('SELECT * FROM '+table+' ORDER BY '+order)]:
                            raise BaseError(409,'初始化前备份与原表不一致')
                with backup.open('rb') as saved:os.fsync(saved.fileno())
                fd_dir=os.open(folder,os.O_RDONLY|getattr(os,'O_DIRECTORY',0))
                try:os.fsync(fd_dir)
                finally:os.close(fd_dir)
            db.execute('DELETE FROM logical_block')
            rebuilt=write_initial_logical(db)
            if owned:finish_fresh_owned_logical(db)
            assert_schema(db)
            records=db.execute('SELECT * FROM logical_block ORDER BY logical_order').fetchall()
            from_sql_rows(records)
            if [tuple(row) for row in db.execute(
                    'SELECT * FROM mineru_base ORDER BY blockid')]!=base_snapshot:
                raise BaseError(409,'重建过程中原始基础表发生变化，已回滚')
            if list(db.execute('PRAGMA foreign_key_check')):
                raise BaseError(409,'重建后的逻辑块引用失败，已回滚')
            if [(rel,sha(require_regular(folder/rel))) for rel,_,_ in sources]!=expected:
                raise BaseError(409,'重建期间源 MinerU 改变，已回滚')
            db.commit()
            return {'rebuilt':True,'previousLogicalCount':previous,
                    'logicalCount':rebuilt,'blockCount':len(base_snapshot)-1,
                    'baseChanged':False,'dbFile':DB_NAME,
                    **({'schema':OWNED_FORMAT,'backupFile':backup.name if backup else None} if owned else {})}
        except BaseException:
            db.rollback()
            raise

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

STRUCTURE_FIELDS=('parentId','logicalOrder','p','b','s')
def commit_md(folder:Path,payload,common):
    """WP10: optimistic per-row MD Block edit, no base or structure mutation."""
    owned=payload.get('confirm')=='commit-v2-owned-md'
    expected_keys={'workspace','confirm','changes'}|({'expectedStructure'} if owned else set())
    if payload.get('confirm') not in ('commit-v2-md','commit-v2-owned-md') or set(payload)!=expected_keys:
        raise BaseError(422,'MD Block 事务确认或字段不完整')
    if owned:
        expected=payload['expectedStructure']
        if not isinstance(expected,list) or not 1<=len(expected)<=100000:
            raise BaseError(422,'真实换行结构快照无效')
        for row in expected:
            if not isinstance(row,dict) or set(row)!={'logicalId',*STRUCTURE_FIELDS} or any(
                type(row[k]) is not int for k in ('logicalId','logicalOrder','p','b','s')) or (
                    row['parentId'] is not None and type(row['parentId']) is not int):
                raise BaseError(422,'真实换行结构快照无效')
    changes=payload['changes']
    if not isinstance(changes,list) or not 1<=len(changes)<=1000:
        raise BaseError(422,'MD Block 修改行数无效')
    seen=set();total=0
    for item in changes:
        if not isinstance(item,dict) or set(item)!={'logicalId','before','after'}:
            raise BaseError(422,'MD Block 编辑字段不完整')
        lid=item['logicalId']
        if type(lid) is not int or lid<=0 or lid in seen:
            raise BaseError(422,'MD Block 逻辑 ID 重复或无效')
        seen.add(lid)
        before,after=item['before'],item['after']
        if not isinstance(before,str) or not isinstance(after,str) or before==after:
            raise BaseError(422,'MD Block 旧值或新值无效')
        total+=len(after.encode('utf-8'))
        if total>4*1024*1024:raise BaseError(413,'本次 MD Block 保存超过上限')
    path=folder/DB_NAME
    if path.is_symlink():raise BaseError(403,'SQLite 不允许符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
            raise BaseError(422,'SQLite 不是单一普通文件')
    finally:os.close(fd)
    common.probe(folder)
    with closing(sqlite3.connect('file:'+str(path)+'?mode=rw',uri=True,timeout=5)) as db:
        db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            assert_schema(db)
            if owned!=is_owned_lf(db):
                raise BaseError(409,'正文协议与数据库不一致，请刷新；拒绝旧客户端修改真实换行')
            if owned:
                actual=[dict(logicalId=r['logical_id'],parentId=r['parent_id'],
                    logicalOrder=r['logical_order'],p=r['p'],b=r['b'],s=r['s'])
                    for r in db.execute('SELECT logical_id,parent_id,logical_order,p,b,s FROM logical_block ORDER BY logical_order')]
                if actual!=expected:raise BaseError(409,'PBS 结构已变化，保留 CM6 正文')
            for change in changes:
                row=db.execute('SELECT md_block FROM logical_block WHERE logical_id=?',
                               (change['logicalId'],)).fetchone()
                if row is None or row['md_block']!=change['before']:
                    raise BaseError(409,'MD Block 已被其他会话改变，保留 CM6 当前文本')
            db.executemany('UPDATE logical_block SET md_block=? WHERE logical_id=?',
                           [(c['after'],c['logicalId']) for c in changes])
            if owned:
                try:
                    to_markdown(from_sql_rows(db.execute('SELECT * FROM logical_block ORDER BY logical_order')),format=OWNED_FORMAT)
                except ValueError as error:
                    raise BaseError(409,'真实换行正文不满足块归属：'+str(error)) from error
            db.commit()
        except BaseException:
            db.rollback()
            raise
    return {'saved':True,'changedRows':len(changes),'baseChanged':False}

SYNTHETIC_ID_MIN=2**48
SYNTHETIC_ID_MAX=2**49-1
def synthetic_id(value):
    return type(value) is int and SYNTHETIC_ID_MIN<=value<=SYNTHETIC_ID_MAX

def commit_owned_inventory(folder:Path,payload,common):
    """WP23G inventory delta via existing structure-commit endpoint.
    CAS covers the complete old structure and exact per-block text hash;
    original source metadata and identities cannot be deleted or rewritten.
    """
    keys={'workspace','confirm','expectedStructure','expectedTextSha256','upserts','removeIds'}
    if set(payload)!=keys:raise BaseError(422,'分割事务字段不完整')
    expected=payload['expectedStructure'];digest=payload['expectedTextSha256']
    updates=payload['upserts'];removals=payload['removeIds']
    if (not isinstance(expected,list) or not isinstance(digest,str) or len(digest)!=64
        or not isinstance(updates,list) or not isinstance(removals,list)
        or not 1<=len(updates)+len(removals)<=10000):
        raise BaseError(422,'分割事务清单无效')
    if any(not synthetic_id(lid) for lid in removals) or len(set(removals))!=len(removals):
        raise BaseError(422,'只能撤销人工新增逻辑块，不能删除原始 OCR 块')
    ids=set(removals);total=0
    fields={'logicalId','baseBlockId','parentId','logicalOrder','p','b','s','blockType','markdownText'}
    for r in updates:
        if (not isinstance(r,dict) or set(r)!=fields or
            any(type(r[k]) is not int or not 0<r[k]<2**53 for k in ('logicalId','baseBlockId','logicalOrder')) or
            any(type(r[k]) is not int or not 0<=r[k]<2**53 for k in ('p','b','s')) or
            (r['parentId'] is not None and (type(r['parentId']) is not int or not 0<r['parentId']<2**53)) or
            not isinstance(r['blockType'],str) or not isinstance(r['markdownText'],str) or r['logicalId'] in ids):
            raise BaseError(422,'分割逻辑块字段或 ID 无效')
        ids.add(r['logicalId']);total+=len(r['markdownText'].encode('utf-8'))
    if total>4*1024*1024:raise BaseError(413,'分割正文差量超过上限')
    path=folder/DB_NAME
    if path.is_symlink():raise BaseError(403,'V2 SQLite 禁止符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:
            raise BaseError(422,'V2 SQLite 必须是单一普通文件')
    finally:os.close(fd)
    common.probe(folder)
    with closing(sqlite3.connect('file:'+str(path)+'?mode=rw',uri=True,timeout=5)) as db:
        db.row_factory=sqlite3.Row;db.execute('PRAGMA foreign_keys=ON')
        try:
            db.execute('BEGIN IMMEDIATE');assert_schema(db)
            if not is_owned_lf(db):raise BaseError(409,'旧数据库不得使用分割协议')
            old={r['logical_id']:dict(r) for r in db.execute('SELECT * FROM logical_block ORDER BY logical_order')}
            actual=[dict(logicalId=r['logical_id'],parentId=r['parent_id'],
                logicalOrder=r['logical_order'],p=r['p'],b=r['b'],s=r['s']) for r in old.values()]
            old_digest=sha(compact([[r['logical_id'],r['md_block']] for r in old.values()]).encode('utf-8'))
            if actual!=expected or digest!=old_digest:
                raise BaseError(409,'分割前正文或结构已变化，保留当前 CM6')
            for lid in removals:
                if lid not in old or old[lid]['raw_path'] is not None:
                    raise BaseError(409,'禁止删除具有原始 OCR 来源的逻辑块')
            created=[r for r in updates if r['logicalId'] not in old]
            if not created and not removals:raise BaseError(422,'分割协议仅用于新增或撤销新增块')
            valid_base={r['base_blockid'] for r in old.values() if r['raw_path'] is not None}
            for r in updates:
                previous=old.get(r['logicalId'])
                if previous:
                    if r['baseBlockId']!=previous['base_blockid'] or r['blockType']!=previous['block_type']:
                        raise BaseError(409,'原始来源和已存类型不可改写')
                elif not synthetic_id(r['logicalId']) or r['baseBlockId'] not in valid_base or r['blockType']!='text':
                    raise BaseError(422,'新增块来源或人工逻辑身份无效')
            # Park only changed existing rows to avoid transient PBS collisions.
            max_p=max((r['p'] for r in old.values()),default=0)+1
            for i,r in enumerate(updates):
                if r['logicalId'] in old:
                    db.execute('UPDATE logical_block SET p=?,b=?,s=0 WHERE logical_id=?',(max_p,i,r['logicalId']))
            db.executemany('DELETE FROM logical_block WHERE logical_id=?',[(lid,) for lid in removals])
            for r in updates:
                values=(r['parentId'],r['logicalOrder'],r['markdownText'],r['p'],r['b'],r['s'])
                if r['logicalId'] in old:
                    db.execute('UPDATE logical_block SET parent_id=?,logical_order=?,md_block=?,p=?,b=?,s=? WHERE logical_id=?',
                        (*values,r['logicalId']))
                else:
                    db.execute('INSERT INTO logical_block(logical_id,base_blockid,parent_id,logical_order,md_block,p,b,s,block_type,raw_path) VALUES (?,?,?,?,?,?,?,?,?,NULL)',
                        (r['logicalId'],r['baseBlockId'],*values,'text'))
            records=from_sql_rows(db.execute('SELECT * FROM logical_block ORDER BY logical_order'))
            to_markdown(records,format=OWNED_FORMAT)
            if list(db.execute('PRAGMA foreign_key_check')):raise ValueError('分割破坏原始引用')
            if len(records)!=len(old)+len(created)-len(removals):raise ValueError('分割清单数量不一致')
            db.commit()
        except (ValueError,sqlite3.IntegrityError) as error:
            db.rollback();raise BaseError(409,'分割原子事务被拒绝：'+str(error)) from error
        except BaseException:
            db.rollback();raise
    return dict(saved=True,changedRows=len(updates),removedRows=len(removals),logicalCount=len(records))


def commit_structure(folder:Path,payload,common):
    """WP07: optimistic, changed-rows-only SQL transaction. Never write text/base.

    The client sends the last acknowledged values as 'before', not the
    current focus view; another editor/session cannot be silently overwritten.
    """
    if payload.get('confirm')=='commit-v2-owned-inventory':
        return commit_owned_inventory(folder,payload,common)
    owned=payload.get('confirm')=='commit-v2-owned-structure'
    if payload.get('confirm') not in ('commit-v2-structure','commit-v2-owned-structure'):
        raise BaseError(422,'缺少 V2 结构事务确认')
    if owned:
        if set(payload)!={'workspace','confirm','changes','textChanges','expectedStructure','expectedBoundaryText'}:
            raise BaseError(422,'真实换行归组事务字段不完整')
        text_changes=payload['textChanges']
        if not isinstance(text_changes,list) or len(text_changes)>1000:
            raise BaseError(422,'真实换行正文差量无效')
        seen_text=set();total=0
        for change in text_changes:
            if (not isinstance(change,dict) or set(change)!={'logicalId','before','after'} or
                type(change['logicalId']) is not int or change['logicalId']<1 or
                change['logicalId'] in seen_text or not isinstance(change['before'],str) or
                not isinstance(change['after'],str) or change['before']==change['after']):
                raise BaseError(422,'真实换行正文差量无效')
            seen_text.add(change['logicalId']);total+=len(change['after'].encode('utf-8'))
        if total>4*1024*1024:raise BaseError(413,'归组正文保存超过上限')
        expected=payload['expectedStructure']
        expected_text=payload['expectedBoundaryText']
        if not isinstance(expected,list) or not isinstance(expected_text,list):
            raise BaseError(422,'真实换行归组快照无效')
    changes=payload.get('changes')
    if not isinstance(changes,list) or not 1<=len(changes)<=10000:
        raise BaseError(422,'结构修改行数无效')
    ids=set()
    for item in changes:
        if not isinstance(item,dict) or set(item)!={'logicalId','before','after'}:
            raise BaseError(422,'结构事务字段无效')
        lid=item['logicalId']
        if type(lid) is not int or lid<1 or lid in ids:raise BaseError(422,'结构行 ID 无效或重复')
        ids.add(lid)
        for key in ('before','after'):
            v=item[key]
            if not isinstance(v,dict) or set(v)!=set(STRUCTURE_FIELDS):
                raise BaseError(422,'结构行快照字段不完整')
            if any(type(v[c]) is not int or v[c]<0 for c in ('logicalOrder','p','b','s')):
                raise BaseError(422,'结构行序号必须为非负整数')
            if v['logicalOrder']<1 or (v['parentId'] is not None and
                (type(v['parentId']) is not int or v['parentId']<1)):
                raise BaseError(422,'结构父节点或顺序无效')
        if item['before']==item['after']:
            raise BaseError(422,'结构事务不能提交没有变化的行')
    dbpath=folder/DB_NAME
    if dbpath.is_symlink():raise BaseError(403,'V2 SQLite 禁止符号链接')
    fd=os.open(dbpath,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:
            raise BaseError(422,'V2 SQLite 必须是单一普通文件')
    finally:os.close(fd)
    common.probe(folder)
    with closing(sqlite3.connect('file:'+str(dbpath)+'?mode=rw',uri=True,timeout=5)) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('BEGIN IMMEDIATE')
        assert_schema(db)
        if owned!=is_owned_lf(db):
            raise BaseError(409,'真实换行归组需 WP23F 原子正文/结构协议')
        old={r['logical_id']:dict(r) for r in db.execute(
            'SELECT logical_id,parent_id,logical_order,p,b,s,md_block FROM logical_block ORDER BY logical_order')}
        if owned:
            def structure(r):
                return dict(logicalId=r['logical_id'],parentId=r['parent_id'],
                    logicalOrder=r['logical_order'],p=r['p'],b=r['b'],s=r['s'])
            actual=[structure(r) for r in old.values()]
            if actual!=expected:raise BaseError(409,'PBS 结构已变化，拒绝归组')
            def boundaries(rows):
                rows=sorted(rows,key=lambda r:r['logicalOrder'])
                return {r['logicalId']:(rows[i+1]['logicalId'] if i+1<len(rows) and
                    (r['p'],r['b'])==(rows[i+1]['p'],rows[i+1]['b']) else None)
                    for i,r in enumerate(rows)}
            changed={item['logicalId']:item['after'] for item in changes}
            prospective=[{**r,**changed.get(r['logicalId'],{})} for r in actual]
            prior=boundaries(actual);later=boundaries(prospective)
            boundary_ids={lid for lid in prior if prior[lid]!=later[lid]}
            expected_by_id={}
            for item in expected_text:
                if (not isinstance(item,dict) or set(item)!={'logicalId','before'} or
                    type(item['logicalId']) is not int or item['logicalId'] in expected_by_id or
                    not isinstance(item['before'],str)):
                    raise BaseError(422,'归组边界正文快照无效')
                expected_by_id[item['logicalId']]=item['before']
            if set(expected_by_id)!=boundary_ids:
                raise BaseError(422,'归组边界正文快照不完整')
            if any(old[lid]['md_block']!=value for lid,value in expected_by_id.items()):
                raise BaseError(409,'归组边界正文已变化，拒绝覆盖')
            for item in text_changes:
                row=old.get(item['logicalId'])
                if not row or row['md_block']!=item['before']:
                    raise BaseError(409,'归组正文已被其他会话改变，拒绝覆盖')
        if len(old)<len(changes):raise BaseError(409,'逻辑块数量已变化，禁止覆盖')
        for item in changes:
            row=old.get(item['logicalId'])
            if not row:raise BaseError(409,'原逻辑块已不存在')
            original={k:(row['parent_id'] if k=='parentId' else
                row['logical_order'] if k=='logicalOrder' else row[k])
                for k in STRUCTURE_FIELDS}
            if original!=item['before']:
                raise BaseError(409,'SQL 已被其他会话修改，保留当前 CM6 状态，不覆盖')
        # First park changed PBS coordinates in private, never-used temporary
        # groups, so a local sibling swap cannot violate the UNIQUE index.
        max_p=max((r['p'] for r in old.values()),default=0)+1
        for i,item in enumerate(changes):
            db.execute('UPDATE logical_block SET p=?,b=?,s=0 WHERE logical_id=?',
                (max_p,i,item['logicalId']))
        for item in changes:
            v=item['after']
            updated=db.execute('UPDATE logical_block SET parent_id=?,logical_order=?,p=?,b=?,s=? '
                'WHERE logical_id=?',(v['parentId'],v['logicalOrder'],v['p'],
                v['b'],v['s'],item['logicalId']))
            if updated.rowcount!=1:raise BaseError(409,'结构写入过程中逻辑块消失')
        if owned:
            db.executemany('UPDATE logical_block SET md_block=? WHERE logical_id=?',
                           [(c['after'],c['logicalId']) for c in text_changes])
        records=[dict(r) for r in db.execute(
            'SELECT logical_id,base_blockid,parent_id,logical_order,md_block,block_type,p,b,s '
            'FROM logical_block ORDER BY logical_order')]
        try:
            groups=validate_pbs(records)
            validated=from_sql_rows(records)
            if owned:to_markdown(validated,format=OWNED_FORMAT)
            for row in records:
                root=groups[(row['p'],row['b'])][0]
                if row['parent_id']!=(None if row['s']==0 else root):
                    raise ValueError('PBS 父子层级与 parent_id 不一致')
        except ValueError as err:raise BaseError(409,'结构事务被拒绝：'+str(err)) from err
        if list(db.execute('PRAGMA foreign_key_check')):
            raise BaseError(409,'结构事务破坏基础块引用')
        db.commit()
        return {'saved':True,'changedRows':len(changes),'logicalCount':len(records),**({'textChangedRows':len(text_changes)} if owned else {})}


def dispatch(operation,method,folder,payload,query,common):
    if operation=='logical-rebuild':
        if method!='POST':raise BaseError(405,'逻辑表重建只能 POST')
        return rebuild_logical_only(folder,payload,common)
    if operation=='md-commit':
        if method!='POST':raise BaseError(405,'正文修改只能 POST')
        return commit_md(folder,payload,common)
    if operation=='structure-commit':
        if method!='POST':raise BaseError(405,'结构修改只能 POST')
        return commit_structure(folder,payload,common)
    if operation=='pdf':
        if method!='GET':raise BaseError(405,'PDF 原文只能只读 GET')
        return read_verified_pdf(folder)
    if operation=='pdf-map':
        if method!='GET':raise BaseError(405,'PDF 映射仅可 GET')
        return existing_pdf_map(folder)
    if operation=='markdown':
        if method!='GET':raise BaseError(405,'Markdown 重构仅可 GET')
        return existing_markdown(folder)
    if operation=='table-repair-preview':
        if method!='GET':raise BaseError(405,'表格恢复预览仅可 GET')
        return table_repair_preview(folder)
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
                # Unknown nonempty schema is not an empty uninitialized V2.
                # Never destroy a user's previous logical work by auto-rebuild.
                with closing(sqlite3.connect('file:'+str(folder/DB_NAME)+'?mode=ro',uri=True)) as readonly:
                    names={r[0] for r in readonly.execute(
                        "SELECT name FROM sqlite_master WHERE type='table'")}
                    if 'logical_block' in names and readonly.execute(
                            'SELECT count(*) FROM logical_block').fetchone()[0]:
                        raise BaseError(409,'未知非空逻辑表结构，拒绝自动覆盖；请使用明确的数据迁移方案')
            except sqlite3.DatabaseError as err:
                raise BaseError(409,'现有 SQLite 无法安全识别，拒绝自动覆盖') from err
            else:
                sources=mineru_sources(folder)
                if [(v['path'],v['sha256']) for v in result['sources']]==[(p,sha(b)) for p,b,_ in sources]:
                    if result['logicalCount']==0:
                        completed=backfill_empty_logical(folder,common,owned=True)
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
        return new_book(folder,overwrite=exists,owned=True)
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
            limit=1024*1024 if operation=='md-commit' else 512*1024 if operation=='structure-commit' else 8192
            if not 2<=n<=limit:raise BaseError(413,'请求大小不合法')
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
