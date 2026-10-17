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

APP_ROOT_FILES={'/','/index.html','/app.js','/release-info.json'}
ALLOWED_PREFIXES=('/components/','/plugins/','/vendor/','/assets/')
ALLOWED_SUFFIXES={'.html','.js','.mjs','.json','.css','.svg','.png','.jpg','.jpeg',
                  '.webp','.woff','.woff2','.ttf','.wasm'}
DENIED_NAMES={'..','tests','scripts','src','__pycache__','.runtime','node_modules','baseline'}


def create_handler(release_root:Path,backend_port:int):
    root=release_root.resolve()
    class Handler(BaseHTTPRequestHandler):
        server_version='OCR2MD-V5-Single/1.0';sys_version=''
        def log_message(self,*args):pass
        def respond(self,status:int,payload:bytes=b'',content_type='text/plain; charset=utf-8'):
            self.send_response(status)
            self.send_header('Content-Type',content_type)
            self.send_header('Content-Length',str(len(payload)))
            self.send_header('Cache-Control','no-store, max-age=0')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('X-OCR2MD-Release','v5-single')
            self.end_headers()
            if self.command!='HEAD':self.wfile.write(payload)
        def forward_vault_fs(self):
            query=parse_qs(urlsplit(self.path).query,keep_blank_values=True)
            # The private backend implicitly trusts loopback. Proxying ANY read
            # (including list/stat) would bypass remote authorization. Keep
            # status-only until WP3 introduces a separately proven auth path.
            op=query.get('op',[])
            if len(op)!=1 or op[0]!='status':
                return self.respond(403,b'Pairing and mutation are not public')
            # Remote sessions authorize via the original server's key validation.
            # This gateway never creates, persists or logs a credential.
            request_headers={'Accept':'application/json'}
            key=self.headers.get('X-OCR2MD-V3-Key','')
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
            if route=='/__v3/fs':return self.forward_vault_fs() if self.command=='GET' else self.respond(405)
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
        def do_POST(self):self.respond(405,b'V5 WP1/WP2 has no write API')
        do_PUT=do_POST;do_DELETE=do_POST;do_PATCH=do_POST
    return Handler


def main():
    p=argparse.ArgumentParser();p.add_argument('--bind',default='127.0.0.1');p.add_argument('--port',type=int,default=4185)
    p.add_argument('--release-root',type=Path,required=True);p.add_argument('--vault-port',type=int,default=4176)
    a=p.parse_args()
    http=ThreadingHTTPServer((a.bind,a.port),create_handler(a.release_root,a.vault_port))
    print(f'OCR2MD_SINGLE_RELEASE_READY http://{a.bind}:{a.port}/ release={a.release_root}',flush=True)
    http.serve_forever()
if __name__=='__main__':main()
