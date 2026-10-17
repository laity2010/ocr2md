#!/usr/bin/env python3
"""The ONLY public OCR2MD application entrypoint: / (V5).

Serves an immutable curated release directory, denies all versioned /v2-/v3-/v4-/v5-
legacy paths, and proxies ONLY authorized read-only Vault filesystem requests to
existing private backend. No user-book contents, keys or URLs are logged.
"""
import argparse
import http.client
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re
import hmac
import json
from remember_device import load_vault_key, issue, from_headers, cookie_header
from screenshot_bridge import retrieve as retrieve_screenshot

APP_ROOT_FILES={'/','/index.html','/app.js','/release-info.json'}
ALLOWED_PREFIXES=('/components/','/plugins/','/vendor/','/assets/')
ALLOWED_SUFFIXES={'.html','.js','.mjs','.json','.css','.svg','.png','.jpg','.jpeg',
                  '.webp','.woff','.woff2','.ttf','.wasm'}
DENIED_NAMES={'..','tests','scripts','src','__pycache__','.runtime','node_modules','baseline'}
CURSOR_PATTERN=re.compile(r'g:[0-9a-f]{20}:[0-9]+\Z')


def safe_directory_query(raw):
    """Allow only directory enumeration, never file reads or backend pairing.

    The backend trusts loopback when Host is localhost. The proxy MUST send a
    different Host (and Forwarded marker) so its own credential check executes.
    """
    if len(raw)>3000:return None
    query=parse_qs(raw,keep_blank_values=True)
    if any(len(v)!=1 for v in query.values()):return None
    op=query.get('op',[''])[0]
    if op=='status' and set(query)=={'op'}:return raw
    if op!='list' or set(query)-{'op','path','cursor'} or 'path' not in query:
        return None
    path=query['path'][0]
    if len(path)>2000 or not (path=='/ocr2md' or path.startswith('/ocr2md/')):
        return None
    parts=path.split('/')[1:]
    if any(not p or p in ('.','..') or p.startswith('.') or '\\' in p
           or any(ord(ch)<32 or ord(ch)==127 for ch in p) for p in parts):
        return None
    if 'cursor' in query and not CURSOR_PATTERN.fullmatch(query['cursor'][0]):
        return None
    return raw


def create_handler(release_root:Path,backend_port:int, vault_key_file:Path|None=None,
                   trusted_origins:tuple[str,...]=('https://ocr2md.laity.bid','https://192.168.1.10:4443'),
                   screenshot_root:Path|None=None):
    root=release_root.resolve()
    key_file=vault_key_file or Path.home()/'.ocr2md-private/v3-vault-access-key'
    screenshot_folder=screenshot_root or release_root.parent/'ocr2md-screenshot-bridge'/'shared'
    class Handler(BaseHTTPRequestHandler):
        server_version='OCR2MD-V5-Single/1.0';sys_version=''
        def log_message(self,*args):pass
        def respond(self,status:int,payload:bytes=b'',content_type='text/plain; charset=utf-8',extra_headers=()):
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(payload)))
            self.send_header('Cache-Control','no-store, max-age=0')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('X-OCR2MD-Release','v5-single')
            for name,value in extra_headers:self.send_header(name,value)
            self.end_headers()
            if self.command!='HEAD':self.wfile.write(payload)
        def backend_status(self,key):
            conn=http.client.HTTPConnection('127.0.0.1',backend_port,timeout=8)
            try:
                conn.request('GET','/__v3/fs?op=status',headers={
                    'Host':'vault-proxy.internal','X-Forwarded-Proto':'https',
                    'X-OCR2MD-V3-Key':key,'Accept':'application/json'})
                result=conn.getresponse()
                data=result.read(4096)
                return result.status==200 and json.loads(data).get('authorized') is True
            finally:conn.close()
        def remember(self):
            # A dedicated same-origin authorization operation, NEVER a Vault
            # mutation. Require JSON, Origin and the browser's fetch metadata.
            origin=self.headers.get('Origin','')
            if origin not in trusted_origins or self.headers.get('Sec-Fetch-Site','same-origin')!='same-origin':
                return self.respond(403,b'Untrusted device authorization origin')
            if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':
                return self.respond(415,b'JSON required')
            try:length=int(self.headers.get('Content-Length','0'))
            except ValueError:length=0
            if not (0<length<=256):return self.respond(400,b'Invalid authorization request')
            try:
                body=json.loads(self.rfile.read(length))
            except (ValueError,UnicodeError):
                return self.respond(400,b'Invalid JSON')
            if not isinstance(body,dict) or set(body)!={'remember'} or not isinstance(body['remember'],bool):
                return self.respond(400,b'Invalid preference')
            if body['remember'] is False:
                data=b'{"remembered":false}'
                return self.respond(200,data,'application/json',(('Set-Cookie',cookie_header()),))
            supplied=self.headers.get('X-OCR2MD-V3-Key','')
            if not (22<=len(supplied)<=256):return self.respond(401,b'Vault key required')
            try:
                actual=load_vault_key(key_file)
                if not hmac.compare_digest(supplied,actual) or not self.backend_status(supplied):
                    return self.respond(401,b'Invalid Vault key')
                data=b'{"remembered":true,"days":30}'
                return self.respond(200,data,'application/json',(('Set-Cookie',cookie_header(issue(actual))),))
            except (OSError,ValueError,http.client.HTTPException):
                return self.respond(503,b'Vault credential service unavailable')
        def forward_vault_fs(self):
            if safe_directory_query(urlsplit(self.path).query) is None:
                return self.respond(403,b'Only authenticated directory listing is allowed')
            # Do NOT forward localhost Host: V3 otherwise trusts this loopback
            # request even if its caller supplies no key. Explicitly force the
            # existing backend to validate X-OCR2MD-V3-Key on every request.
            request_headers={'Accept':'application/json',
                             'Host':'vault-proxy.internal',
                             'X-Forwarded-Proto':'https'}
            key=self.headers.get('X-OCR2MD-V3-Key','')
            # Browser cookies are opaque and checked against the CURRENT
            # private secret; never accept a cookie's value as a Vault key.
            if not key and self.headers.get('Cookie'):
                try:
                    current=load_vault_key(key_file)
                    if from_headers(self.headers.get('Cookie',''),current):key=current
                except OSError:pass
            if key and len(key)<=256:request_headers['X-OCR2MD-V3-Key']=key
            conn=http.client.HTTPConnection('127.0.0.1',backend_port,timeout=15)
            try:
                conn.request('GET',self.path,headers=request_headers)
                result=conn.getresponse()
                data=result.read(1024*1024+1)
                if len(data)>1024*1024:return self.respond(502,b'Vault response too large')
                return self.respond(result.status,data,'application/json')
            except (OSError,http.client.HTTPException):
                return self.respond(502,b'Vault backend temporarily unavailable')
            finally:conn.close()
        def serve(self):
            route=urlsplit(self.path).path
            try:route=unquote(route)
            except Exception:return self.respond(400,b'Invalid path')
            if route.startswith('/__v5/screenshots/'):
                # This is a separate, read-only capability URL service.
                # Images live OUTSIDE the public release directory. A caller
                # must possess a 192-bit random, unexpired, review-approved link.
                # No listing, anonymous upload or Vault credential transfer.
                if urlsplit(self.path).query:return self.respond(404,b'Not found')
                picture=retrieve_screenshot(screenshot_folder,route)
                if picture is None:return self.respond(404,b'Screenshot unavailable')
                return self.respond(200,picture,'image/png',(
                    ('X-Robots-Tag','noindex, noimageindex, noarchive'),
                    ('Referrer-Policy','no-referrer'),
                    ('Content-Disposition','inline'),
                ))
            if route=='/__v3/fs':return self.forward_vault_fs() if self.command=='GET' else self.respond(405)
            if route=='/__v5/auth/remember':return self.respond(405)
            # Freeze/withdraw V4; no historical path is ever served as an app.
            if route.startswith(('/v2/','/v3/','/v4/','/v5/','/v4-directory/',
                                  '/v4-wp3-candidate/','/v3-directory/','/v5-directory/')):
                return self.respond(410,b'Previous version withdrawn; use /')
            if route not in APP_ROOT_FILES and not route.startswith(ALLOWED_PREFIXES):
                return self.respond(404,b'Only the V5 root application is published')
            if route not in APP_ROOT_FILES and Path(route).suffix.lower() not in ALLOWED_SUFFIXES:
                return self.respond(404,b'Unsupported asset')
            bits=route.strip('/').split('/')
            if any((bit in DENIED_NAMES or bit.startswith('.') or '\\' in bit) for bit in bits):
                return self.respond(404,b'Not found')
            path=(root/('index.html' if route=='/' else route.lstrip('/'))).resolve()
            if not path.is_relative_to(root) or not path.is_file():return self.respond(404,b'Asset unavailable')
            if path.is_symlink():return self.respond(404,b'No symlinks')
            try:data=path.read_bytes()
            except OSError:return self.respond(503,b'Release unavailable')
            content_type=mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
            if path.suffix in ('.js','.mjs'):content_type='text/javascript; charset=utf-8'
            if path.suffix=='.json':content_type='application/json; charset=utf-8'
            if path.suffix=='.html':content_type='text/html; charset=utf-8'
            self.respond(200,data,content_type)
        do_GET=serve;do_HEAD=serve
        def do_POST(self):
            if urlsplit(self.path).path=='/__v5/auth/remember':
                return self.remember()
            self.respond(405,b'Only the dedicated device authorization API accepts POST')
        do_PUT=do_POST;do_DELETE=do_POST;do_PATCH=do_POST
    return Handler


def main():
    p=argparse.ArgumentParser();p.add_argument('--bind',default='127.0.0.1');p.add_argument('--port',type=int,default=4185)
    p.add_argument('--release-root',type=Path,required=True);p.add_argument('--vault-port',type=int,default=4176)
    p.add_argument('--vault-key-file',type=Path,default=Path.home()/'.ocr2md-private/v3-vault-access-key')
    a=p.parse_args()
    http=ThreadingHTTPServer((a.bind,a.port),create_handler(a.release_root,a.vault_port,a.vault_key_file))
    print(f'OCR2MD_SINGLE_RELEASE_READY http://{a.bind}:{a.port}/ release={a.release_root}',flush=True)
    http.serve_forever()
if __name__=='__main__':main()
