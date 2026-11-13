"""WCP46 HTTP initialization is explicit, authorized, and destructive by consent."""
from __future__ import annotations
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from unittest.mock import patch
from http.server import ThreadingHTTPServer

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import v6_lab_ocr_serve as api
from v6_lab_ocr_store import import_workspace,originals

class SQLInitializationHTTP(unittest.TestCase):
 def test_init_requires_confirmation_and_preserves_raw_source(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);book=root/'book';(book/'mineru json').mkdir(parents=True);(book/'pdf').mkdir()
   (book/'pdf'/'paper.pdf').write_bytes(b'%PDF-1.7\n')
   source=json.dumps({'pdf_info':[{'page_idx':0,'page_size':[595,842],
     'para_blocks':[{'type':'text','bbox':[20,40,70,90],'lines':[
       {'spans':[{'type':'text','content':'PRIVATE'}]}]}],
     'preproc_blocks':[],'discarded_blocks':[]}]}).encode()
   (book/'mineru json'/'a.json').write_bytes(source)
   import_workspace(book)
   original=originals(book)
   with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
       [root] if cookie=='valid=yes' else
       (_ for _ in ()).throw(api.APIError(403,'unauthorized'))):
    srv=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    url=f'http://127.0.0.1:{srv.server_address[1]}'+api.PREFIX
    def post(op,body,*,cookie='valid=yes',origin=api.PUBLIC_ORIGIN):
     req=Request(url+op,method='POST',data=json.dumps({'workspace':str(book),**body}).encode(),
       headers={'Cookie':cookie,'Content-Type':'application/json','Origin':origin})
     with urlopen(req,timeout=8) as response:return json.loads(response.read())
    try:
     self.assertEqual(post('minerujson2block',{})['status'],'missing',
       'Read-only legacy API cannot create a derived entity or view')
     with self.assertRaises(HTTPError) as denied:
      post('initialize-sql',{'confirmReset':True},cookie='')
     self.assertEqual(denied.exception.code,403)
     with self.assertRaises(HTTPError) as denied:
      post('initialize-sql',{'confirmReset':True},origin='https://evil.invalid')
     self.assertEqual(denied.exception.code,403)
     with self.assertRaises(HTTPError) as no_confirmation:
      post('initialize-sql',{'confirmReset':False})
     self.assertEqual(no_confirmation.exception.code,422)
     result=post('initialize-sql',{'confirmReset':True})
     self.assertEqual((result['kind'],result['blocks']),('view',1))
     self.assertEqual(post('minerujson2block',{})['status'],'ready')
     self.assertEqual(originals(book),original)
     self.assertEqual((book/'mineru json'/'a.json').read_bytes(),source)
     with self.assertRaises(HTTPError) as refused_span:
      post('minerujson2span',{})
     self.assertEqual(refused_span.exception.code,422)
    finally:
     srv.shutdown();srv.server_close()

if __name__=='__main__':unittest.main()
