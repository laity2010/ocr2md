"""Lab-specific Media API isolation; no real book, Main doc or network downloads."""
import json
import hashlib
import os
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import v6_lab_ocr_serve as api

PNG=b'\x89PNG\r\n\x1a\n' + b'\x00'*24
SOURCE='https://cdn-mineru.openxlab.org.cn/example.png'
MEDIA='media/'+hashlib.sha256(SOURCE.encode()).hexdigest()[:24]+'.png'

class MediaAPITest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'allowed';self.root.mkdir()
        self.book=self.root/'book-a';self.book.mkdir()
        self.outside=Path(self.tmp.name)/'outside';self.outside.mkdir()
        def auth(cookie):
            if cookie!='test=1':raise api.APIError(403,'没有编辑授权')
            return [self.root]
        self.auth_patch=patch.object(api,'_authorized_roots',side_effect=auth)
        self.auth_patch.start();self.addCleanup(self.auth_patch.stop)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)
        self.base=f'http://127.0.0.1:{self.server.server_port}'+api.PREFIX

    def call(self,op,method='GET',data=None,workspace=None,origin='http://127.0.0.1:4414',cookie='test=1'):
        arg={'workspace':str(workspace or self.book)}
        if data:arg.update(data)
        if method=='POST':
            url=self.base+op
            payload=json.dumps(arg).encode()
            headers={'Origin':origin,'Content-Type':'application/json','Cookie':cookie}
        else:
            url=self.base+op+'?'+urlencode(arg)
            payload=None;headers={'Cookie':cookie}
        req=Request(url,headers=headers,data=payload,method=method)
        try:
            with urlopen(req,timeout=4) as response:
                return response.status,response.read(),response.headers.get('Content-Type')
        except HTTPError as error:
            return error.code,error.read(),error.headers.get('Content-Type')

    def test_inventory_download_local_and_auth_boundaries(self):
        code,body,_=self.call('media-inventory')
        self.assertEqual((code,json.loads(body)),(200,{'files':[]}))
        def fake_chunk(doc,url):
            self.assertEqual(url,SOURCE)
            folder=Path(doc).parent/'media';folder.mkdir(exist_ok=True)
            (folder/MEDIA[6:]).write_bytes(PNG)
            return {'state':'complete','path':MEDIA,'bytes':len(PNG),'total':len(PNG)}
        with patch.object(api,'media_download_chunk',side_effect=fake_chunk):
            code,body,_=self.call('media-chunk','POST',{'url':SOURCE})
        self.assertEqual(code,200)
        self.assertEqual(json.loads(body)['path'],MEDIA)
        self.assertTrue((self.book/MEDIA).is_file())
        self.assertFalse((self.root/MEDIA).exists())
        code,body,_=self.call('media-inventory')
        self.assertEqual(json.loads(body)['files'][0]['path'],MEDIA)
        code,body,mime=self.call('media-file',data={'path':MEDIA})
        self.assertEqual((code,body,mime),(200,PNG,'image/png'))
        code,body,_=self.call('media-status',data={'url':SOURCE})
        self.assertEqual((code,json.loads(body)['state']),(200,'complete'))
        self.assertEqual(self.call('media-file',data={'path':'media/../outside'})[0],422)
        self.assertEqual(self.call('media-inventory',workspace=self.outside)[0],403)
        self.assertEqual(self.call('media-inventory',cookie='')[0],403)
        self.assertEqual(self.call('media-chunk','POST',{'url':SOURCE},origin='https://evil.example')[0],403)
        self.assertEqual(self.call('media-chunk','GET')[0],405)
        self.assertEqual(self.call('media-inventory','POST')[0],405)

if __name__=='__main__':unittest.main()
