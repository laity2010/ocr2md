"""Translation state public API, mounted by existing shared Gateway."""
from contextlib import closing
import http.client
import json
import os
import sqlite3
import stat
from urllib.parse import urlencode
from .protection import build_rows,canonical,DIGEST,require

DB_NAME='ocr2md.v2.sqlite'
MAX_SNAPSHOT=32*1024*1024
FIELDS=('source_document_hash','sentence_sha256','source_line_hash','source_line','sentence_index','raw','type','level','policy','protected','translatable')
DDL="""CREATE TABLE translation (
 source_document_hash TEXT NOT NULL,
 sentence_sha256 TEXT NOT NULL,
 source_line_hash TEXT NOT NULL,
 source_line INTEGER NOT NULL,
 sentence_index INTEGER NOT NULL,
 raw TEXT NOT NULL,
 type TEXT NOT NULL,
 level TEXT NOT NULL,
 policy TEXT NOT NULL,
 protected TEXT NOT NULL,
 translatable INTEGER NOT NULL CHECK(translatable IN (0,1)),
 PRIMARY KEY(source_line,sentence_index)
)"""
INSERT='INSERT INTO translation ('+','.join(FIELDS)+') VALUES ('+','.join('?' for _ in FIELDS)+')'

class TranslationError(Exception):
    def __init__(self,code,message):
        super().__init__(message);self.code=code

def public_snapshot(folder,cookie):
    port=int(os.environ.get('OCR2MD_LABS_GATEWAY_PORT','4414'))
    path='/labs/lab-sentence/api/sentence/snapshot?'+urlencode({'workspace':str(folder)})
    with closing(http.client.HTTPConnection('127.0.0.1',port,timeout=30)) as conn:
        conn.request('GET',path,headers={'Cookie':cookie,'Cache-Control':'no-store'})
        response=conn.getresponse()
        if response.status!=200:
            raise TranslationError(response.status if response.status in (403,404,409) else 503,'已保存原句读取失败，请回 Sentence 州检查')
        raw=response.read(MAX_SNAPSHOT+1)
    if len(raw)>MAX_SNAPSHOT:raise TranslationError(413,'原句快照超限')
    return json.loads(raw)

def identity(path):
    try:st=path.lstat()
    except FileNotFoundError:raise TranslationError(409,'缺少上游 SQLite') from None
    if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1:raise TranslationError(403,'SQLite 必须是独立普通文件')
    return st.st_dev,st.st_ino

def sql_rows(rows):
    return [tuple(canonical(r[k]) if k=='protected' else int(r[k]) if k=='translatable' else r[k] for k in FIELDS) for r in rows]

def initialize(folder,expected_source,expected_sentences,reader):
    """Create exactly one owned table, or return the identical existing table.
    No update/delete/replacement, even for stale data. Reads upstream via API.
    """
    path=folder/DB_NAME;original_identity=identity(path)
    def read():
        if identity(path)!=original_identity:raise TranslationError(409,'SQLite 文件已切换')
        s=reader()
        if s.get('source_document_hash')!=expected_source or s.get('sentence_sha256')!=expected_sentences:
            raise TranslationError(409,'已保存原句已变化，请重新初始化原句表')
        if identity(path)!=original_identity:raise TranslationError(409,'SQLite 文件已切换')
        return s
    snapshot=read();rows=build_rows(snapshot);expected=sql_rows(rows)
    creating=False
    def authorize(action,a,b,db,source):
        if source is not None:return sqlite3.SQLITE_DENY
        if action in (sqlite3.SQLITE_SELECT,sqlite3.SQLITE_TRANSACTION):return sqlite3.SQLITE_OK
        if action==sqlite3.SQLITE_READ and db=='main' and a in ('translation','sqlite_master','sqlite_schema'):return sqlite3.SQLITE_OK
        if creating and db=='main':
            if action in (sqlite3.SQLITE_INSERT,sqlite3.SQLITE_UPDATE) and a in ('sqlite_master','sqlite_schema'):return sqlite3.SQLITE_OK
            if action==sqlite3.SQLITE_INSERT and a=='translation':return sqlite3.SQLITE_OK
            if action==sqlite3.SQLITE_CREATE_TABLE and a=='translation':return sqlite3.SQLITE_OK
            if action==sqlite3.SQLITE_CREATE_INDEX and b=='translation' and a=='sqlite_autoindex_translation_1':return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY
    if identity(path)!=original_identity:raise TranslationError(409,'SQLite 文件已切换')
    with closing(sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=10)) as db:
        db.set_authorizer(authorize)
        db.execute('BEGIN IMMEDIATE')
        try:
            catalog=db.execute("SELECT type,name,tbl_name,sql FROM main.sqlite_master").fetchall()
            owned=[r for r in catalog if r[1].casefold()=='translation']
            if any(r[0]=='trigger' and r[2].casefold()=='translation' for r in catalog):
                raise TranslationError(409,'译句表含未知触发器，拒绝写入')
            # The reserved lock prevents concurrent upstream commits. Re-read the
            # published snapshot, never read private upstream data in this connection.
            require(read()==snapshot,'原句快照变化')
            if owned:
                if owned!=[('table','translation','translation',DDL)]:
                    raise TranslationError(409,'已有同名译句表结构不同，拒绝覆盖')
                existing=db.execute('SELECT '+','.join(FIELDS)+' FROM translation ORDER BY source_line,sentence_index').fetchall()
                if existing!=expected:
                    raise TranslationError(409,'已有译句表与当前原句或保护版本不一致，保留旧表，拒绝自动覆盖')
                state='ready'
            else:
                creating=True
                db.execute(DDL);db.executemany(INSERT,expected);creating=False
                actual=db.execute('SELECT '+','.join(FIELDS)+' FROM translation ORDER BY source_line,sentence_index').fetchall()
                require(actual==expected,'译句表回读不一致')
                state='created'
            if identity(path)!=original_identity:raise TranslationError(409,'SQLite 文件已切换')
            db.commit()
        except BaseException:
            db.rollback();raise
    return {'schema':'ocr2md-translation-preparation/v1','state':state,'source_document_hash':expected_source,'sentence_sha256':expected_sentences,'rows':rows}

def handle(handler,operation,parsed,common):
    def respond(code,obj):handler.respond(code,json.dumps(obj,ensure_ascii=False),'application/json; charset=utf-8')
    try:
        if common is None:raise TranslationError(503,'Frame 授权服务不可用')
        if operation!='translation/initialize':raise TranslationError(404,'未知校译接口')
        if handler.command!='POST':raise TranslationError(405,'译句初始化仅允许 POST')
        if handler.headers.get('Origin') not in common.ALLOWED_ORIGINS:raise TranslationError(403,'拒绝未授权来源')
        if handler.headers.get('Transfer-Encoding'):raise TranslationError(400,'不支持 chunked')
        try:size=int(handler.headers.get('Content-Length','-1'))
        except ValueError:size=-1
        if not 2<=size<=8192:raise TranslationError(413,'请求体超限')
        raw=handler.rfile.read(size)
        if len(raw)!=size:raise TranslationError(400,'请求体不完整')
        p=json.loads(raw)
        if not isinstance(p,dict) or set(p)!={'workspace','source_document_hash','sentence_sha256'} or any(not isinstance(p[k],str) or not DIGEST.fullmatch(p[k]) for k in ('source_document_hash','sentence_sha256')):
            raise TranslationError(422,'译句初始化请求字段错误')
        cookie=handler.headers.get('Cookie','')
        folder=common.checked_workspace(p['workspace'],common.authorized_roots(cookie))
        respond(200,initialize(folder,p['source_document_hash'],p['sentence_sha256'],lambda:public_snapshot(folder,cookie)))
    except TranslationError as e:respond(e.code,{'error':str(e)})
    except (ValueError,TypeError,KeyError,UnicodeError):respond(409,{'error':'原句或保护结构校验失败，未确认写入'})
    except (sqlite3.DatabaseError,http.client.HTTPException,OSError):respond(503,{'error':'译句表操作未确认成功，请重试'})
    except Exception as e:
        if type(e).__name__ in ('AccessError','WorkspaceIOError') and hasattr(e,'code'):respond(e.code,{'error':str(e)})
        else:raise
