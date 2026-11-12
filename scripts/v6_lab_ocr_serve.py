#!/usr/bin/env python3
"""Lab OCR's isolated loopback API: delegates auth to Main, never owns Main data.

Single Agent Link /labs/ gateway exposes /labs/lab-ocr/api/ocr/
{inspect,import,rows,minerujson2span,minerujson2block,pdf}.
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

from v6_lab_ocr_span import minerujson2span, span_rows
from v6_lab_ocr_block import minerujson2block, block_rows
from v6_lab_ocr_store import (inspect_workspace, import_workspace, existing_info,
                              rows, fingerprint, OCRImportError)

HOST='127.0.0.1'
PORT=int(os.environ.get('OCR2MD_LAB_OCR_PORT','4416'))
MAIN_PORT=int(os.environ.get('OCR2MD_MAIN_PORT','4396'))
PREFIX='/labs/lab-ocr/api/ocr/'
MAX_BODY=32768
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
        if op not in ('inspect','import','rows','minerujson2span','minerujson2block','pdf'):raise APIError(404,'未知的 OCR API')
        if (op in ('import','minerujson2span','minerujson2block'))!=(self.command=='POST') or self.command not in (('GET','POST','HEAD') if op=='pdf' else ('GET','POST')):
            raise APIError(405,'不支持此请求方法')
        if self.command=='POST' and self.headers.get('Origin') not in ALLOWED_ORIGINS:
            raise APIError(403,'请求来源无效')
        roots=_authorized_roots(self.headers.get('Cookie',''))
        if self.command=='POST':
            try:
                n=int(self.headers.get('Content-Length','-1'))
            except ValueError:n=-1
            if not 1<=n<=MAX_BODY:raise APIError(413,'请求体超出允许范围')
            try:
                body=json.loads(self.rfile.read(n))
            except (ValueError,UnicodeError) as error:
                raise APIError(400,'请求体不是有效 JSON') from error
            if not isinstance(body,dict):raise APIError(400,'请求体需要 JSON 对象')
            query=body
        else:
            query={k:v[-1] for k,v in parse_qs(parsed.query,keep_blank_values=True).items()}
        book=_book(query.get('workspace',''),roots)
        if op=='pdf':
            if self.command not in ('GET','HEAD'):raise APIError(405,'PDF 仅允许读取')
            return self.serve_pdf(book)
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
                result=minerujson2block(book)
            elif op=='minerujson2span':
                result=minerujson2span(book)
            elif op=='import':
                if query.get('replace',False) not in (True,False):
                    raise APIError(422,'覆盖标志必须为布尔值')
                result=import_workspace(book,sequence,replace=query.get('replace',False))
            else:
                old=existing_info(book);sig=fingerprint(info)
                result={'status':'ready' if not old else 'unchanged' if old['signature']==sig else 'changed',
                        'sources':info['sources'],'pdf':info['pdf'].name,'pages':info['total_pages'],
                        'ordering':info['ordering'],'blocks':old['count'] if old else 0}
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
