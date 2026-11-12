"""WP5: isolate the actual HTTP Block editor behind Main-cookie/Origin checks."""
from __future__ import annotations
import json
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request,urlopen
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import v6_lab_ocr_serve as api
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_block import minerujson2block,block_rows


class BlockHttpContract(unittest.TestCase):
 def test_auth_origin_and_cas_transaction_endpoints(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);book=root/'book';(book/'pdf').mkdir(parents=True)
   (book/'mineru json').mkdir()
   (book/'pdf'/'a.pdf').write_bytes(b'%PDF-1.7\n ORIGINAL')
   def item(label):return {'type':'text','bbox':[20,30,180,110],
      'lines':[{'spans':[{'type':'text','content':label}]}]}
   raw=json.dumps({'pdf_info':[{'page_idx':0,'page_size':[595,842],
       'preproc_blocks':[],'discarded_blocks':[],
       'para_blocks':[item('A'),item('B'),item('C')]}]}).encode()
   (book/'mineru json'/'source.json').write_bytes(raw)
   import_workspace(book);minerujson2block(book)
   original=originals(book)
   with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
     [root] if cookie=='valid=yes' else
     (_ for _ in ()).throw(api.APIError(403,'Editor authorization required'))):
    server=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_address[1]}'+api.PREFIX
    def send(op,params=None,*,method='GET',cookie='valid=yes',origin=None):
      params={'workspace':str(book),**(params or {})}
      if method=='GET':
       url=base+op+'?'+urlencode(params)
       request=Request(url,headers={'Cookie':cookie})
      else:
       payload=json.dumps(params).encode()
       request=Request(base+op,data=payload,method='POST',headers={
         'Cookie':cookie,'Origin':origin or api.PUBLIC_ORIGIN,
         'Content-Type':'application/json'})
      with urlopen(request,timeout=5) as response:
       return response.status,json.loads(response.read())
    try:
     for op,method,params in [('block-edit-state','GET',{}),
          ('block-edit','POST',{'action':'apply','sourceBlockId':1,
                             'targetBlockId':2,'placement':'child','expectedRevision':0})]:
      with self.assertRaises(HTTPError) as denied:
       send(op,params,method=method,cookie='')
      self.assertEqual(denied.exception.code,403)
     with self.assertRaises(HTTPError) as origin_error:
      send('block-edit',{'action':'apply','sourceBlockId':1,'targetBlockId':2,
                'placement':'child','expectedRevision':0},
           method='POST',origin='https://attacker.invalid')
     self.assertEqual(origin_error.exception.code,403)
     self.assertEqual(send('block-edit-state')[1],{'revision':0,'canUndo':False,'canRedo':False})
     plan=send('block-edit',{'action':'plan','sourceBlockId':1,'targetBlockId':2,
             'placement':'child'},method='POST')[1]
     self.assertTrue(plan['changed'])
     self.assertEqual(send('block-edit-state')[1]['revision'],0,'Plan writes nothing')
     action={'action':'apply','sourceBlockId':1,'targetBlockId':2,
             'placement':'child','expectedRevision':0}
     result=send('block-edit',action,method='POST')[1]
     self.assertTrue(result['changed'])
     self.assertEqual(result['revision'],1)
     self.assertEqual(result['canUndo'],True)
     self.assertEqual(next(r for r in block_rows(book)['rows'] if r['block_id']==1)['parent_block_id'],2)
     with self.assertRaises(HTTPError) as stale:
      send('block-edit',action,method='POST')
     self.assertEqual(stale.exception.code,422)
     self.assertEqual(send('block-edit-state')[1]['revision'],1)
     undo=send('block-edit',{'action':'undo','expectedRevision':1},method='POST')[1]
     self.assertEqual(undo['revision'],2)
     self.assertTrue(undo['canRedo'])
     redo=send('block-edit',{'action':'redo','expectedRevision':2},method='POST')[1]
     self.assertEqual(redo['revision'],3)
     self.assertEqual(next(r for r in block_rows(book)['rows'] if r['block_id']==1)['parent_block_id'],2)
     self.assertEqual(originals(book),original)
     self.assertEqual((book/'mineru json'/'source.json').read_bytes(),raw)
    finally:
     server.shutdown();server.server_close()


if __name__=='__main__':unittest.main()
