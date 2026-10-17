#!/usr/bin/env python3
"""LAN HTTPS presentation of the SAME published V5 gateway (no second build).

LAN-first development uses https://192.168.1.10:4443/ with Apple trusted local
cert, and public https://ocr2md.laity.bid/ only when remote. Both proxy the
single canonical gateway 127.0.0.1:4385 and immutable public release directory.
"""
import argparse
import http.client
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

MAX_BODY=32*1024*1024

def main():
 p=argparse.ArgumentParser();p.add_argument('--bind',default='192.168.1.10')
 p.add_argument('--port',type=int,default=4443);p.add_argument('--upstream-port',type=int,default=4385)
 p.add_argument('--cert-dir',type=Path,required=True)
 args=p.parse_args()
 cert=args.cert_dir/'server.crt';key=args.cert_dir/'server.key'
 if not cert.is_file() or not key.is_file():raise SystemExit('LAN_TLS_CERT_MISSING')
 class Handler(BaseHTTPRequestHandler):
  server_version='OCR2MD-V5-LAN/1.0';sys_version=''
  def log_message(self,fmt,*vals):pass
  def reply(self,code,content=b'',ctype='text/plain; charset=utf-8'):
   self.send_response(code)
   self.send_header('Content-Type',ctype)
   self.send_header('Content-Length',str(len(content)))
   self.send_header('Cache-Control','no-store, max-age=0')
   self.send_header('X-OCR2MD-Single-Gateway','127.0.0.1:4385')
   self.end_headers()
   if self.command!='HEAD':self.wfile.write(content)
  def request(self):
   if len(self.path)>4096 or '\\' in self.path:return self.reply(400,b'Invalid path')
   conn=http.client.HTTPConnection('127.0.0.1',args.upstream_port,timeout=18)
   try:
    # No local-specific filesystem permissions: send every path to the SAME
    # public V5 router. This cannot bypass deny-lists/pairing/write guard.
    headers={'Accept':self.headers.get('Accept','*/*')}
    supplied_key=self.headers.get('X-OCR2MD-V3-Key','')
    if supplied_key and len(supplied_key)<=256:headers['X-OCR2MD-V3-Key']=supplied_key
    conn.request(self.command,self.path,headers=headers)
    response=conn.getresponse();data=response.read(MAX_BODY+1)
    if len(data)>MAX_BODY:return self.reply(502,b'Oversize asset')
    return self.reply(response.status,data,response.getheader('Content-Type','application/octet-stream'))
   except (OSError,http.client.HTTPException):return self.reply(502,b'Single V5 gateway unavailable')
   finally:conn.close()
  do_GET=request;do_HEAD=request
  def do_POST(self):self.reply(405,b'WP2 write APIs disabled on BOTH entrances')
  do_PUT=do_POST;do_DELETE=do_POST;do_PATCH=do_POST
 class Server(ThreadingHTTPServer):allow_reuse_address=True
 server=Server((args.bind,args.port),Handler)
 tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
 tls.minimum_version=ssl.TLSVersion.TLSv1_2;tls.load_cert_chain(str(cert),str(key))
 server.socket=tls.wrap_socket(server.socket,server_side=True)
 print(f'OCR2MD_V5_SAME_RELEASE_LAN_HTTPS https://{args.bind}:{args.port}/ -> http://127.0.0.1:{args.upstream_port}/',flush=True)
 server.serve_forever()
if __name__=='__main__':main()
