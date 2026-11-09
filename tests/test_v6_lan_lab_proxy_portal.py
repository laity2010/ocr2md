"""Direct routing contract: one LAN portal for all Lab homepages."""
import io
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lan_lab_proxy import parse_lan_labs,dispatch_lan_lab

class FakeOrigin(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        is_home=self.path.endswith('/lab-home.html')
        body=b'' if is_home else ('served '+self.path).encode()
        self.send_response(302 if is_home else 200)
        if is_home:self.send_header('Location','/labs/')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers();self.wfile.write(body)

class FakeRequest:
    command='GET'
    def __init__(self,path):
        self.path=path;self.headers={};self.rfile=io.BytesIO();self.wfile=io.BytesIO()
        self.status=None;self.outheaders={}
    def send_response(self,status):self.status=status
    def send_header(self,key,val):self.outheaders[key]=val
    def end_headers(self):pass
    def response(self,code,text):self.status=code

class LanPortalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.origin=ThreadingHTTPServer(('127.0.0.1',0),FakeOrigin)
        cls.thread=threading.Thread(target=cls.origin.serve_forever,daemon=True)
        cls.thread.start()
        cls.routes=parse_lan_labs(f'portal={cls.origin.server_port},translation-lab={cls.origin.server_port},sentence-benchmark={cls.origin.server_port}')
    @classmethod
    def tearDownClass(cls):cls.origin.shutdown();cls.origin.server_close()
    def test_unified_catalogue_and_legacy_home(self):
        for path,status,body in [('/labs/',200,b'served /labs/'),('/labs',200,b'served /labs'),
            ('/labs/translation-lab/translation-lab.html',200,b'served /labs/translation-lab/translation-lab.html'),
            ('/labs/sentence-benchmark/lab-home.html',302,b''),
            ('/labs/translation-lab/lab-home.html',302,b'')]:
            with self.subTest(path=path):
                req=FakeRequest(path)
                self.assertTrue(dispatch_lan_lab(req,self.routes))
                self.assertEqual(req.status,status)
                self.assertEqual(req.wfile.getvalue(),body)
                if status==302:self.assertEqual(req.outheaders['Location'],'/labs/')
    def test_other_paths_stay_isolated(self):
        req=FakeRequest('/api/document')
        self.assertFalse(dispatch_lan_lab(req,self.routes))
        req=FakeRequest('/labs/unknown/')
        self.assertTrue(dispatch_lan_lab(req,self.routes))
        self.assertEqual(req.status,404)
        req=FakeRequest('/labs/sentence-benchmark/other')
        self.assertTrue(dispatch_lan_lab(req,self.routes))
        self.assertEqual(req.status,200)
    def test_duplicate_route_rejected(self):
        with self.assertRaises(ValueError):parse_lan_labs('portal=4414,portal=4415')

if __name__=='__main__':unittest.main()
