#!/usr/bin/env python3
"""Lab OCR's isolated loopback API: delegates auth to Main, never owns Main data.

Single Agent Link /labs/ gateway exposes /labs/lab-ocr/api/ocr/
{inspect,import,rows,minerujson2span,minerujson2block,pdf,overlays}.
No second tunnel and no changes to Main V6 business routes.
"""
from __future__ import annotations
import http.client
import json
import os
import stat
import sqlite3
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from v6_media import download_chunk as media_download_chunk, status as media_status, inventory as media_inventory, read_local as media_read_local
from v6_lab_ocr_span import minerujson2span, span_rows
from v6_lab_ocr_block import minerujson2block, block_rows
from v6_lab_ocr_block_view import inspect_block_projection,initialize_block_projection
from v6_lab_ocr_block_edit import (block_move_state,preview_block_move,
    apply_block_move,undo_block_move,persist_block_edit_batch)
from v6_lab_ocr_overlays import overlay_rows
from v6_lab_ocr_md import read_md, initialize_md, persist_md_splice
from v6_lab_ocr_block_break_review import read_block_break_reviews,set_block_break_review
from v6_lab_ocr_note_match_config import read_note_match_config,save_note_match_config
from v6_lab_ocr_note_pair_review import read_note_pair_reviews,set_note_pair_review,set_note_pair_conversion_issues
from v6_lab_ocr_note_pair_conversion import arm_note_pair_conversion,arm_note_pair_group_conversion
from v6_lab_ocr_store import (inspect_workspace, import_workspace, existing_info,
                              rows, fingerprint, OCRImportError)

HOST='127.0.0.1'
PORT=int(os.environ.get('OCR2MD_LAB_OCR_PORT','4416'))
MAIN_PORT=int(os.environ.get('OCR2MD_MAIN_PORT','4396'))
PREFIX='/labs/lab-ocr/api/ocr/'
MAX_BODY=32768
MAX_MD_BODY=2 * 1024 * 1024
MAX_PDF_BYTES=512 * 1024 * 1024
PUBLIC_ORIGIN='https://ocr2md.laity.bid'
LAN_ORIGIN=os.environ.get('OCR2MD_LAN_ORIGIN','')
ALLOWED_ORIGINS=frozenset((PUBLIC_ORIGIN,'http://127.0.0.1:4414',
                           'http://127.0.0.1:'+str(PORT),LAN_ORIGIN))

class APIError(Exception):
    def __init__(self,code:int,message:str,*,extra:dict|None=None):
        super().__init__(message);self.code=code;self.extra=extra or {}

def _authorized_roots(cookie:str)->list[Path]:
    if not cookie or len(cookie)>8192:raise APIError(403,'需要 Main 的编辑授权')
    conn=http.client.HTTPConnection(HOST,MAIN_PORT,timeout=6)
    try:
        conn.request('GET','/api/workspace/roots',headers={'Cookie':cookie,'Accept':'application/json'})
        res=conn.getresponse()
        body=res.read(64*1024)
        if res.status!=200:raise APIError(403,'需要 Main 的编辑授权')
        data=json.loads(body)
        return [Path(x).resolve(strict=True) for x in data.get('allowedRoots',[])
                if isinstance(x,str) and Path(x).is_dir()]
    except (OSError,ValueError,TypeError) as error:
        raise APIError(503,'Main 授权服务暂不可用') from error
    finally:conn.close()

def _book(value:str,roots:list[Path])->Path:
    if not value or len(value)>2048 or '\x00' in value or '\n' in value:
        raise APIError(422,'工作区路径无效')
    path=Path(value).expanduser()
    if not path.is_absolute() or '..' in path.parts:
        raise APIError(422,'工作区必须是绝对路径，不能包含 ..')
    if path.is_symlink() or not path.is_dir():raise APIError(422,'工作区不存在或是符号链接')
    try:real=path.resolve(strict=True)
    except OSError as error:raise APIError(422,'工作区不可访问') from error
    if not any(real.is_relative_to(root) for root in roots):
        raise APIError(403,'目录不在 Main 授权范围内')
    for root in roots:
        if real.is_relative_to(root):
            rel=real.relative_to(root)
            current=root
            for item in rel.parts:
                current=current/item
                if current.is_symlink():raise APIError(403,'工作区包含符号链接路径')
            break
    return real

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass

    def respond(self,code:int,payload:dict):
        data=json.dumps(payload,ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(data)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers()
        if self.command!='HEAD':self.wfile.write(data)

    def serve_pdf(self,book:Path):
        # Never accept a PDF filename from the client. One authorized book ->
        # exactly one regular PDF in its own pdf/ directory.
        folder=book/'pdf'
        if folder.is_symlink() or not folder.is_dir():
            raise APIError(422,'工作区缺少有效 pdf/ 目录')
        candidates=[p for p in folder.iterdir() if p.suffix.lower()=='.pdf' and
                    not p.name.startswith('.') and p.is_file() and not p.is_symlink()]
        if len(candidates)!=1:raise APIError(422,'pdf/ 需要且仅能有 1 个 PDF')
        path=candidates[0]
        try:
            fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
            with os.fdopen(fd,'rb') as stream:
                metadata=os.fstat(stream.fileno())
                if not stat.S_ISREG(metadata.st_mode) or not 5<=metadata.st_size<=MAX_PDF_BYTES:
                    raise APIError(422,'PDF 文件大小无效')
                if stream.read(5)!=b'%PDF-':raise APIError(422,'PDF 文件头无效')
                stream.seek(0)
                self.send_response(200)
                self.send_header('Content-Type','application/pdf')
                self.send_header('Content-Length',str(metadata.st_size))
                self.send_header('Content-Disposition','inline')
                self.send_header('Cache-Control','private, no-store')
                self.send_header('X-Content-Type-Options','nosniff')
                self.end_headers()
                if self.command=='GET':
                    while part:=stream.read(256*1024):self.wfile.write(part)
        except (BrokenPipeError,ConnectionResetError):
            # A viewer can cancel the old stream when a book changes.
            return

    def execute(self):
        parsed=urlsplit(self.path)
        if parsed.path=='/healthz' and self.command=='GET':
            return self.respond(200,{'service':'lab-ocr-store','status':'ready'})
        if not parsed.path.startswith(PREFIX):raise APIError(404,'未知的 OCR API')
        op=parsed.path[len(PREFIX):]
        if op not in ('inspect','import','rows','minerujson2span','minerujson2block','initialize-sql','pdf','overlays','block-edit','block-edit-state','block-edit-batch','md-state','md-initialize','md-save','block-break-reviews','block-break-review-set','note-match-rules','note-match-rules-save','note-pair-reviews','note-pair-review-set','note-pair-convert-prepare','note-pair-group-prepare','note-pair-convert-issues','media-inventory','media-status','media-chunk','media-file'):raise APIError(404,'未知的 OCR API')
        post_ops=('import','minerujson2span','minerujson2block','initialize-sql','block-edit','block-edit-batch','md-initialize','md-save','block-break-review-set','note-match-rules-save','note-pair-review-set','note-pair-convert-prepare','note-pair-group-prepare','note-pair-convert-issues','media-chunk')
        if (op in post_ops)!=(self.command=='POST') or self.command not in (('GET','POST','HEAD') if op=='pdf' else ('GET','POST')):
            raise APIError(405,'不支持此请求方法')
        if self.command=='POST' and self.headers.get('Origin') not in ALLOWED_ORIGINS:
            raise APIError(403,'请求来源无效')
        roots=_authorized_roots(self.headers.get('Cookie',''))
        if self.command=='POST':
            try:
                n=int(self.headers.get('Content-Length','-1'))
            except ValueError:n=-1
            if not 1<=n<=(MAX_MD_BODY if op in ('md-save','note-pair-review-set','note-pair-convert-prepare','note-pair-group-prepare','note-pair-convert-issues') else MAX_BODY):
                raise APIError(413,'请求体超出允许范围')
            try:
                body=json.loads(self.rfile.read(n))
            except (ValueError,UnicodeError) as error:
                raise APIError(400,'请求体不是有效 JSON') from error
            if not isinstance(body,dict):raise APIError(400,'请求体需要 JSON 对象')
            query=body
        else:
            query={k:v[-1] for k,v in parse_qs(parsed.query,keep_blank_values=True).items()}
        book=_book(query.get('workspace',''),roots)
        # Media uses the EXISTING Main module's byte-store implementation,
        # scoped to this authorized Lab book; never call Main active_doc().
        # A virtual document location places all media in <book>/media/.
        if op.startswith('media-'):
            doc=book/'.ocr2md-lab-media-scope.md'
            try:
                if op=='media-inventory':
                    return self.respond(200,{'files':media_inventory(doc)})
                if op=='media-status':
                    return self.respond(200,media_status(doc,query.get('url')))
                if op=='media-chunk':
                    if not isinstance(query.get('url'),str):raise APIError(422,'媒体 URL 无效')
                    return self.respond(200,media_download_chunk(doc,query['url']))
                if op=='media-file':
                    raw=query.get('path','')
                    if not isinstance(raw,str) or not raw.startswith('media/'):
                        raise APIError(422,'媒体路径无效')
                    data,kind=media_read_local(doc,raw[6:])
                    self.send_response(200)
                    self.send_header('Content-Type',kind)
                    self.send_header('Content-Length',str(len(data)))
                    self.send_header('Cache-Control','private, no-store')
                    self.send_header('X-Content-Type-Options','nosniff')
                    self.end_headers()
                    if self.command=='GET':self.wfile.write(data)
                    return
            except (ValueError,FileNotFoundError) as error:
                raise APIError(422,str(error)[:300]) from error
        if op=='note-pair-convert-issues':
            return self.respond(200,set_note_pair_conversion_issues(book,
                query.get('items')))
        if op=='note-pair-group-prepare':
            return self.respond(200,arm_note_pair_group_conversion(book,
                query.get('members'),query.get('updates'),query.get('anchors')))
        if op=='note-pair-convert-prepare':
            return self.respond(200,arm_note_pair_conversion(book,
                query.get('referenceId'),query.get('expectedRevision'),
                query.get('plan')))
        if op=='note-pair-reviews':
            return self.respond(200,read_note_pair_reviews(book))
        if op=='note-pair-review-set':
            return self.respond(200,set_note_pair_review(book,
                query.get('reference'),query.get('body'),query.get('decision'),
                query.get('expectedRevision')))
        if op=='note-match-rules':
            return self.respond(200,read_note_match_config(book))
        if op=='note-match-rules-save':
            return self.respond(200,save_note_match_config(book,
                query.get('config'),query.get('expectedRevision')))
        if op=='block-break-reviews':
            return self.respond(200,read_block_break_reviews(book))
        if op=='block-break-review-set':
            return self.respond(200,set_block_break_review(book,
                query.get('beforeBlockId'),query.get('afterBlockId'),
                query.get('beforeLineId'),query.get('afterLineId'),
                query.get('beforeText'),query.get('afterText'),
                query.get('decision'),query.get('expectedDecision')))
        if op=='md-state':
            return self.respond(200,read_md(book))
        if op=='md-initialize':
            return self.respond(200,initialize_md(book))
        if op=='md-save':
            if type(query.get('blockRevision')) is not int:
                raise APIError(422,'MD 保存必须提供当前 CM Block revision')
            return self.respond(200,persist_md_splice(book,
                query.get('expectedRevision'),query.get('requestId'),
                query.get('start'),query.get('deleteCount'),query.get('insert'),
                query.get('blockRevision')))
        if op=='initialize-sql':
            if query.get('confirmReset') is not True:
                raise APIError(422,'必须明确确认重建扩展表将清空旧审阅结果')
            return self.respond(200,initialize_block_projection(book))
        if op=='block-edit-state':
            return self.respond(200,block_move_state(book,
                include_history=query.get('history')=='1'))
        if op=='block-edit-batch':
            return self.respond(200,persist_block_edit_batch(book,
                query.get('expectedRevision'),query.get('batchId'),
                query.get('operations')))
        if op=='block-edit':
            action=query.get('action')
            if action=='plan':
                result=preview_block_move(book,query.get('sourceBlockId'),
                    query.get('targetBlockId'),query.get('placement'))
            elif action=='apply':
                result=apply_block_move(book,query.get('sourceBlockId'),
                    query.get('targetBlockId'),query.get('placement'),
                    query.get('expectedRevision'))
            elif action in ('undo','redo'):
                result=undo_block_move(book,query.get('expectedRevision'),
                    redo=action=='redo')
            else:raise APIError(422,'Block 操作类型不支持')
            return self.respond(200,result)
        if op=='pdf':
            if self.command not in ('GET','HEAD'):raise APIError(405,'PDF 仅允许读取')
            return self.serve_pdf(book)
        if op=='overlays':
            try:
                page=int(query.get('page',''))
            except (TypeError, ValueError) as error:
                raise APIError(422,'覆盖框页码必须是整数') from error
            return self.respond(200,overlay_rows(book,query.get('level',''),page))
        # First milestone: one sub-200-page MinerU JSON plus one PDF only.
        # The store already supports independent multi-source preservation, but
        # multi-part ordering is deliberately NOT exposed to this Lab yet.
        if op=='rows':
            try:
                offset=int(query.get('offset','0'));limit=int(query.get('limit','150'))
            except (ValueError,TypeError) as error:raise APIError(422,'分页参数必须是整数') from error
            table=query.get('table','minerujson')
            if table not in ('minerujson','span','block'):raise APIError(422,'未知的 SQLite 表')
            readers={'minerujson':rows,'span':span_rows,'block':block_rows}
            return self.respond(200,readers[table](book,offset,limit))
        sequence=query.get('order')
        if sequence is not None:
            raise APIError(422,'当前 Lab OCR 仅验收单 JSON，不接收多分段顺序')
        try:
            info=inspect_workspace(book)
            if len(info['parts'])!=1 or info['total_pages']>=200:
                raise APIError(422,'当前阶段仅支持 1 个不足 200 页的 MinerU JSON + 1 个 PDF')
            if op=='minerujson2block':
                # Historical operation name remains read-only for older UI
                # clients. Rebuild may ONLY use initialize-sql with consent.
                result=inspect_block_projection(book)
            elif op=='minerujson2span':
                # Never create Span now. Legacy already-present tables remain
                # readable until the user explicitly resets SQL.
                with sqlite3.connect(book/'ocr2md.sqlite') as db:
                    has_span=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='span'").fetchone()
                    if not has_span:raise APIError(422,'当前阶段不再创建 Span 实体表')
                    result={'status':'legacy','table':'span',
                            'spans':db.execute('SELECT COUNT(*) FROM span WHERE block_group=?',
                                              ('para_blocks',)).fetchone()[0]}
            elif op=='import':
                if query.get('replace',False) not in (True,False):
                    raise APIError(422,'覆盖标志必须为布尔值')
                result=import_workspace(book,sequence,replace=query.get('replace',False))
            else:
                old=existing_info(book);sig=fingerprint(info)
                result={'status':'ready' if not old else 'unchanged' if old['signature']==sig else 'changed',
                        'sources':info['sources'],'pdf':info['pdf'].name,'pages':info['total_pages'],
                        'ordering':info['ordering'],'blocks':old['count'] if old else 0}
            if op=='inspect':
                result['mdSupported']=True
            return self.respond(200,result)
        except OCRImportError as error:
            return self.respond(422,{'error':str(error)})

    def _dispatch(self):
        try:self.execute()
        except APIError as error:self.respond(error.code,{'error':str(error),**error.extra})
        except (OCRImportError,sqlite3.DatabaseError,PermissionError,OSError) as error:
            self.respond(422,{'error':str(error)[:400]})
        except Exception:
            self.respond(500,{'error':'OCR 导入服务发生内部错误'})

    def do_GET(self):self._dispatch()
    def do_POST(self):self._dispatch()
    def do_HEAD(self):self._dispatch()

if __name__=='__main__':
    if not 1024<=PORT<=65535 or HOST!='127.0.0.1':
        raise SystemExit('Lab OCR API may only bind to loopback')
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
