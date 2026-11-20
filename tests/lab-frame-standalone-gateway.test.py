"""Real loopback Gateway HTTP exercise of Frame without Main process APIs."""
import base64
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request,urlopen
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import frame_access

ROOT=Path(__file__).resolve().parents[1]
GATEWAY=ROOT.parents[2]/'agent-link-monitor/bin/ocr2md-labs-gateway.py'

class TestIndependentGateway(unittest.TestCase):
    def test_f02_full_http_with_no_main_api(self):
        # Dedicated loopback server, its own scratch allowed root and test code.
        with tempfile.TemporaryDirectory(prefix='frame-http-') as temp:
            root=Path(temp)
            (root/'book').mkdir();book=root/'book'
            (book/'original.txt').write_text('immutable')
            cfg=root/'access.json'
            cfg.write_text(json.dumps({'schema':'ocr2md-frame-access/v1',
                'code':'ABCD1234ABCD1234','secret':'a'*64,'allowedRoots':[str(root)]}))
            os.chmod(cfg,0o600)
            spec=importlib.util.spec_from_file_location('frame_lab_test_gateway',GATEWAY)
            module=importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.STATIC_ROOT=ROOT.parents[1]/'release'
            server=ThreadingHTTPServer(('127.0.0.1',0),module.LabGateway)
            thread=threading.Thread(target=server.serve_forever,daemon=True)
            thread.start()
            base=f'http://127.0.0.1:{server.server_port}/labs/lab-frame/api/workspace-io/'
            def request(op,method='GET',payload=None,cookie='',query=''):
                headers={'Origin':'https://ocr2md.laity.bid','Cookie':cookie}
                raw=json.dumps(payload).encode() if method=='POST' else None
                if raw is not None:headers['Content-Type']='application/json'
                q=Request(base+op+query,data=raw,method=method,headers=headers)
                try:
                    with urlopen(q,timeout=5) as resp:
                        return resp.status,json.loads(resp.read()),resp.headers
                except HTTPError as err:return err.code,json.loads(err.read()),err.headers
            try:
                with patch.object(frame_access,'CONFIG',cfg):
                    self.assertEqual(request('roots')[0],403)
                    code,result,headers=request('unlock','POST',{'code':'ABCD1234ABCD1234'})
                    self.assertEqual(code,200)
                    cookie=headers['Set-Cookie'].split(';')[0]
                    self.assertEqual(request('session',cookie=cookie)[1]['authorized'],True)
                    self.assertEqual(request('roots',cookie=cookie)[1]['allowedRoots'],[str(root)])
                    self.assertEqual(request('browse',cookie=cookie,query='?path='+quote(str(root)))[1]['children'],
                                     [{'path':str(book),'name':'book'}])
                    self.assertTrue(request('probe','POST',{'workspace':str(book)},cookie)[1]['verified'])
                    self.assertEqual(request('read',cookie=cookie,
                        query='?workspace='+quote(str(book))+'&path=original.txt')[1]['size'],9)
                    added=request('create','POST',{'workspace':str(book),'path':'new.txt',
                        'contentBase64':base64.b64encode(b'hi').decode()},cookie)
                    self.assertEqual(added[0],200)
                    self.assertEqual(request('replace','POST',{'workspace':str(book),'path':'new.txt',
                        'contentBase64':base64.b64encode(b'bye').decode(),
                        'expectedSha256':added[1]['sha256']},cookie)[0],200)
                    self.assertEqual((book/'new.txt').read_bytes(),b'bye')
                    self.assertEqual((book/'original.txt').read_text(),'immutable')
            finally:
                server.shutdown();server.server_close();thread.join(timeout=3)

if __name__=='__main__':unittest.main()
