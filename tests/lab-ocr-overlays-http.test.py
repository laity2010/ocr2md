"""The PDF coverage endpoint shares Main authorization and never exposes text."""
from __future__ import annotations
import json
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import v6_lab_ocr_serve as server
from v6_lab_ocr_store import import_workspace
from v6_lab_ocr_block import minerujson2block
from v6_lab_ocr_span import minerujson2span

class CoverageHttpContract(unittest.TestCase):
 def test_authenticated_page_projection_only(self):
  with tempfile.TemporaryDirectory() as base:
   root=Path(base)
   book=root/'book';(book/'pdf').mkdir(parents=True);(book/'mineru json').mkdir()
   (book/'pdf'/'a.pdf').write_bytes(b'%PDF-1.7\n')
   (book/'mineru json'/'a.json').write_text(json.dumps({'pdf_info':[
    {'page_idx':0,'page_size':[595,842], 'preproc_blocks':[],'discarded_blocks':[],
     'para_blocks':[{'type':'text','bbox':[20,30,100,60],'lines':[{'spans':[
      {'type':'text','bbox':[21,31,80,45],'content':'PRIVATE TEXT'}]}]}]}]}))
   import_workspace(book);minerujson2block(book);minerujson2span(book)
   with patch.object(server,'_authorized_roots',side_effect=lambda cookie:[root] if cookie=='valid=yes' else (_ for _ in ()).throw(server.APIError(403,'Unauthorized'))):
    http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
    threading.Thread(target=http.serve_forever,daemon=True).start()
    host=f'http://127.0.0.1:{http.server_address[1]}'
    def get(**query):
     url=host+server.PREFIX+'overlays?'+urlencode({'workspace':str(book),**query})
     return urlopen(Request(url,headers={'Cookie':'valid=yes'}),timeout=5)
    try:
     with self.assertRaises(HTTPError) as no_auth:
      urlopen(host+server.PREFIX+'overlays?'+urlencode({'workspace':str(book),'level':'block','page':1}),timeout=5)
     self.assertEqual(no_auth.exception.code,403)
     with get(level='block',page=1) as response:
      result=json.loads(response.read())
     self.assertEqual(result,{'level':'block','page':1,'pageSize':[595,842],
                              'boxes':[{'id':'1','blockType':'text','blockGroup':'para_blocks','bbox':[20,30,100,60]}]})
     self.assertNotIn('PRIVATE TEXT',json.dumps(result))
     with get(level='span',page=1) as response:spans=json.loads(response.read())
     self.assertEqual([i['bbox'] for i in spans['boxes']],[[21,31,80,45]])
     self.assertEqual([i['blockType'] for i in spans['boxes']],['text'])
     self.assertEqual([i['blockGroup'] for i in spans['boxes']],['para_blocks'])
     with get(level='block',page=2) as response:empty=json.loads(response.read())
     self.assertEqual(empty['boxes'],[])
     for query in ({'level':'invalid','page':1},{'level':'span','page':-1},
                   {'level':'block','page':'abc'}):
      with self.assertRaises(HTTPError) as invalid:get(**query)
      self.assertEqual(invalid.exception.code,422)
     with self.assertRaises(HTTPError) as invalid_method:
      urlopen(Request(host+server.PREFIX+'overlays?'+urlencode({'workspace':str(book)}),
                      method='POST',headers={'Cookie':'valid=yes','Origin':server.PUBLIC_ORIGIN},data=b'{}'),timeout=5)
     self.assertEqual(invalid_method.exception.code,405)
    finally:
     http.shutdown();http.server_close()

if __name__=='__main__':unittest.main()
