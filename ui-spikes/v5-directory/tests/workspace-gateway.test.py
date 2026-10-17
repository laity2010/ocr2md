#!/usr/bin/env python3
"""V5 directory gateway regression: credentials are checked by V3, never bypassed by loopback."""
import http.client
import importlib.util
import json
import threading
import sys
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

source=Path(__file__).resolve().parents[1]/'scripts/release_gateway.py'
sys.path.insert(0,str(source.parent))
spec=importlib.util.spec_from_file_location('v5_gateway',source)
gateway=importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
from remember_device import issue, verify, COOKIE, DAYS_30
calls=[]
KEY='test-credential-device-long-123'

class Vault(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        from urllib.parse import urlsplit,parse_qs
        qs=parse_qs(urlsplit(self.path).query)
        op=qs.get('op',[''])[0]
        # This fixture reproduces the upstream loopback trust pitfall.
        local=self.headers.get('Host')=='127.0.0.1:'+str(self.server.server_port) and not self.headers.get('X-Forwarded-Proto')
        authorized=local or self.headers.get('X-OCR2MD-V3-Key')==KEY
        calls.append((op,local,self.headers.get('Host'),authorized))
        if op=='status':data={'authorized':authorized,'canPairLocally':local,'rootLabel':'Obsidian/ocr2md'}
        elif not authorized:return self.send_json({'error':'unauthorized'},401)
        elif op=='list':data={'entries':[{'path':'/ocr2md/Alpha','kind':'directory'}],'nextCursor':None}
        elif op=='pair':data={'accessKey':'danger'}
        else:data={'base64':'danger'}
        self.send_json(data)
    def send_json(self,data,status=200):
        raw=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers();self.wfile.write(raw)

class Boundary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=TemporaryDirectory()
        cls.key_file=Path(cls.temp.name)/'private-key'
        cls.key_file.write_text(KEY)
        cls.backend=ThreadingHTTPServer(('127.0.0.1',0),Vault)
        cls.proxy=ThreadingHTTPServer(('127.0.0.1',0),
            gateway.create_handler(Path(cls.temp.name),cls.backend.server_port,cls.key_file,
                ('https://ocr2md.laity.bid',)))
        cls.threads=[]
        for server in (cls.backend,cls.proxy):
            t=threading.Thread(target=server.serve_forever,daemon=True);t.start();cls.threads.append(t)
    @classmethod
    def tearDownClass(cls):
        for server in (cls.proxy,cls.backend):server.shutdown();server.server_close()
        cls.temp.cleanup()
    def ask(self,path,secret=None,method='GET',cookie=None,origin=None,payload=None):
        c=http.client.HTTPConnection('127.0.0.1',self.proxy.server_port,timeout=3)
        headers={'X-OCR2MD-V3-Key':secret} if secret else {}
        if cookie:headers['Cookie']=cookie
        if origin:headers['Origin']=origin
        if payload is not None:headers['Content-Type']='application/json'
        c.request(method,path,body=json.dumps(payload).encode() if payload is not None else None,headers=headers)
        r=c.getresponse();body=r.read();status=r.status;setcookie=r.getheader('Set-Cookie');c.close()
        return status,json.loads(body) if body.startswith(b'{') else body,setcookie
    def test_credentials_never_bypassed(self):
        for key in (None,'incorrect'):
            status,data,_=self.ask('/__v3/fs?op=status',key)
            self.assertEqual(status,200)
            self.assertFalse(data['authorized'])
            self.assertFalse(data['canPairLocally'])
            status,_,_=self.ask('/__v3/fs?op=list&path=%2Focr2md',key)
            self.assertEqual(status,401)
        status,data,_=self.ask('/__v3/fs?op=status',KEY)
        self.assertTrue(data['authorized'])
        status,data,_=self.ask('/__v3/fs?op=list&path=%2Focr2md',KEY)
        self.assertEqual(status,200);self.assertEqual(data['entries'][0]['kind'],'directory')
        self.assertTrue(calls)
        self.assertTrue(all(op in ('status','list') and not local and host=='vault-proxy.internal'
                            for op,local,host,_ in calls))
    def test_no_pair_read_mutation_or_path_escape(self):
        before=len(calls)
        for path in ('?op=pair','?op=read&path=/ocr2md/book.md',
                     '?op=stat&path=/ocr2md','?op=list&path=/',
                     '?op=list&path=/ocr2md/../outside',
                     '?op=list&path=/ocr2md/.obsidian',
                     '?op=list&path=/ocr2md&op=pair',
                     '?op=list&path=/ocr2md&cursor=nonsense'):
            status,_,_=self.ask('/__v3/fs'+path,KEY)
            self.assertEqual(status,403,path)
        self.assertEqual(self.ask('/__v3/fs?op=list&path=/ocr2md',KEY,'POST')[0],405)
        self.assertEqual(len(calls),before,'rejected requests must never hit Vault')
    def test_remember_cookie_lifetime_reopen_and_forget(self):
        route='/__v5/auth/remember'
        wrong=self.ask(route,KEY,'POST',origin='https://evil.example',payload={'remember':True})
        self.assertEqual(wrong[0],403)
        bad=self.ask(route,'wrong-password','POST',origin='https://ocr2md.laity.bid',payload={'remember':True})
        self.assertEqual(bad[0],401)
        status,data,setcookie=self.ask(route,KEY,'POST',origin='https://ocr2md.laity.bid',payload={'remember':True})
        self.assertEqual((status,data['remembered'],data['days']),(200,True,30))
        self.assertIn('HttpOnly',setcookie);self.assertIn('Secure',setcookie)
        self.assertIn('SameSite=Lax',setcookie);self.assertIn('Max-Age=2592000',setcookie)
        self.assertNotIn(KEY,setcookie)
        ticket=setcookie.split(';',1)[0]
        self.assertEqual(ticket.split('=')[0],COOKIE)
        self.assertTrue(verify(ticket.split('=',1)[1],KEY))
        # Browser reload without any session key: the signed cookie suffices.
        status,data,_=self.ask('/__v3/fs?op=status',cookie=ticket)
        self.assertEqual(status,200);self.assertTrue(data['authorized'])
        status,data,_=self.ask('/__v3/fs?op=list&path=%2Focr2md',cookie=ticket)
        self.assertEqual(status,200);self.assertTrue(data['entries'])
        token=ticket.split('=',1)[1]
        expired=issue(KEY,now=int(time.time())-DAYS_30-1)
        self.assertFalse(verify(expired,KEY))
        self.assertFalse(verify(token,'rotated-key-much-longer-than-22'))
        self.assertEqual(self.ask('/__v3/fs?op=list&path=%2Focr2md',cookie=f'{COOKIE}={expired}')[0],401)
        status,data,cleared=self.ask(route,method='POST',origin='https://ocr2md.laity.bid',payload={'remember':False})
        self.assertEqual(status,200);self.assertFalse(data['remembered'])
        self.assertIn('Max-Age=0',cleared)

if __name__=='__main__':
    unittest.main()
