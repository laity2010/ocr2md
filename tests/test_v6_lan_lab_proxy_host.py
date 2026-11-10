"""LAN TLS front proxy must preserve a verified external Host through gateway.

This is a local HTTP fixture, not live OCR reviewer data. Test both no-CSRF
weakening and successful same-origin LAN forwarding without editing Main data.
"""
import io
import json
import sys
import threading
import unittest
from email.message import Message
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from v6_lan_lab_proxy import dispatch_lan_lab


class CaptureHost(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_POST(self):
        size=int(self.headers.get('Content-Length','0'))
        self.rfile.read(size)
        self.server.captured.append({
            'host':self.headers.get('Host'),
            'origin':self.headers.get('Origin'),
            'path':self.path,
        })
        encoded=json.dumps(self.server.captured[-1]).encode()
        self.send_response(200)
        self.send_header('Content-Length',str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


class FakeLanHandler:
    def __init__(self,host,origin,body=b'{}'):
        self.server=type('LANSocket',(),{'server_address':('192.168.1.10',4443)})()
        self.path='/labs/ocr-review/api/cmd-block-review'
        self.command='POST'
        self.headers=Message()
        self.headers['Host']=host
        self.headers['Content-Length']=str(len(body))
        self.headers['Content-Type']='application/json'
        if origin is not None:self.headers['Origin']=origin
        self.rfile=io.BytesIO(body)
        self.wfile=io.BytesIO()
        self.status=None
        self.response_headers=[]
    def send_response(self,status):self.status=status
    def send_header(self,k,v):self.response_headers.append((k,v))
    def end_headers(self):pass
    def response(self,status,reason):self.status=status


class LANHostPropagationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream=ThreadingHTTPServer(('127.0.0.1',0),CaptureHost)
        cls.upstream.captured=[]
        cls.worker=threading.Thread(target=cls.upstream.serve_forever,daemon=True)
        cls.worker.start()
        cls.routes={'portal':cls.upstream.server_port}

    @classmethod
    def tearDownClass(cls):
        cls.upstream.shutdown();cls.worker.join(timeout=5);cls.upstream.server_close()

    def test_lan_host_matches_browser_origin_through_proxy(self):
        handler=FakeLanHandler('192.168.1.10:4443','https://192.168.1.10:4443')
        self.assertTrue(dispatch_lan_lab(handler,self.routes))
        self.assertEqual(handler.status,200)
        self.assertEqual(json.loads(handler.wfile.getvalue()),{
            'host':'192.168.1.10:4443','origin':'https://192.168.1.10:4443',
            'path':'/labs/ocr-review/api/cmd-block-review'})

    def test_bad_host_not_forwarded_even_when_origin_agrees(self):
        original_count=len(self.upstream.captured)
        for authority in ('192.168.1.11:4443','evil.invalid:4443','127.0.0.1:4414',''):
            with self.subTest(host=authority):
                handler=FakeLanHandler(authority,'https://'+authority if authority else None)
                self.assertTrue(dispatch_lan_lab(handler,self.routes))
                self.assertEqual(handler.status,421)
        self.assertEqual(len(self.upstream.captured),original_count)

    def test_cross_origin_keeps_original_origin_for_backend_csrf_gate(self):
        handler=FakeLanHandler('192.168.1.10:4443','https://attacker.invalid')
        self.assertTrue(dispatch_lan_lab(handler,self.routes))
        self.assertEqual(handler.status,200)
        captured=json.loads(handler.wfile.getvalue())
        self.assertEqual(captured['host'],'192.168.1.10:4443')
        self.assertEqual(captured['origin'],'https://attacker.invalid')
        self.assertNotEqual(captured['origin'],'https://'+captured['host'])


if __name__=='__main__':unittest.main()
