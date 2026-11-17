"""WCP43 review decision persistence on synthetic book only; never user data."""
from __future__ import annotations
import importlib.util,json,sqlite3,sys,tempfile,threading,unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('mdfixture',ROOT/'tests/lab-ocr-md-store.test.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
import v6_lab_ocr_serve as api
from v6_lab_ocr_md import initialize_md,read_md
from v6_lab_ocr_store import originals,existing_info,OCRImportError,import_workspace
from v6_lab_ocr_block_break_review import (read_block_break_reviews,
    set_block_break_review)


def setup(book):
    fixture.make_book(book)
    initialize_md(book)
    with sqlite3.connect(book/'ocr2md.sqlite') as db:
        # Make a synthetic directly adjacent logical pair using stable BlockIDs.
        db.execute('UPDATE block_review SET parent_block_id=2,sibling_order=0 WHERE block_id=5')
        before=db.execute('SELECT line_id,text FROM md_line WHERE block_id=2 AND text<>\'\'').fetchone()
        after=db.execute('SELECT line_id,text FROM md_line WHERE block_id=5 AND text<>\'\'').fetchone()
    return {'before_block_id':2,'after_block_id':5,
        'before_line_id':before[0],'after_line_id':after[0],
        'before_text':before[1],'after_text':after[1]}


def save(book,args,decision='断块合并',expected='待定'):
    return set_block_break_review(book,args['before_block_id'],args['after_block_id'],
        args['before_line_id'],args['after_line_id'],args['before_text'],args['after_text'],
        decision,expected)


class BlockBreakReviewStorage(unittest.TestCase):
 def test_review_cas_stale_evidence_and_source_immutability(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);args=setup(book)
   original=originals(book)
   md=read_md(book)
   self.assertEqual(read_block_break_reviews(book)['reviews'],[])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertFalse(db.execute("SELECT 1 FROM sqlite_master WHERE name='block_break_review'").fetchone(),
      'GET never creates a review table')
   result=save(book,args)
   self.assertEqual(result['decision'],'断块合并')
   self.assertEqual(read_block_break_reviews(book)['reviews'][0]['decision'],'断块合并')
   self.assertIsNotNone(existing_info(book),'new SQLite extension is recognized')
   self.assertEqual(read_md(book),md,'review never changes Markdown or LineIDs')
   self.assertEqual(originals(book),original)
   with self.assertRaisesRegex(OCRImportError,'已有其他修改'):
    save(book,args,decision='忽略',expected='待定')
   save(book,args,decision='忽略',expected='断块合并')
   self.assertEqual(read_block_break_reviews(book)['reviews'][0]['decision'],'忽略')
   with self.assertRaisesRegex(OCRImportError,'文本已变化'):
    save(book,{**args,'after_text':'tampered'},decision='断块合并',expected='忽略')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',('External edit',args['after_line_id']))
   self.assertEqual(read_block_break_reviews(book)['reviews'],[],
     'changed MD evidence invalidates saved review without deleting history')
   with self.assertRaisesRegex(OCRImportError,'文本已变化'):
    save(book,args,decision='断块合并',expected='待定')
   # Restore synthetic row for this isolated test, then clear the decision.
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',
               (args['after_text'],args['after_line_id']))
   save(book,args,decision='待定',expected='忽略')
   self.assertEqual(read_block_break_reviews(book)['reviews'],[])
   self.assertEqual(read_md(book),md)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE block_review SET parent_block_id=NULL WHERE block_id=5')
   with self.assertRaisesRegex(OCRImportError,'父子关系'):
    save(book,args)
   self.assertEqual(import_workspace(book,replace=True)['status'],'unchanged',
     'Import with identical source fingerprint is a no-op, never erases review table')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertTrue(db.execute("SELECT 1 FROM sqlite_master WHERE name='block_break_review'").fetchone())

 def test_http_authorization_and_colored_decisions_endpoint(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);book=root/'book';book.mkdir();args=setup(book)
   with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
     [root] if cookie=='valid=yes' else
     (_ for _ in ()).throw(api.APIError(403,'need auth'))):
    server=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_address[1]}'+api.PREFIX
    def send(op,params=None,method='GET',cookie='valid=yes',origin=api.PUBLIC_ORIGIN):
     params={'workspace':str(book),**(params or {})}
     if method=='GET':request=Request(base+op+'?'+urlencode(params),headers={'Cookie':cookie})
     else:request=Request(base+op,data=json.dumps(params).encode(),method=method,
       headers={'Cookie':cookie,'Origin':origin,'Content-Type':'application/json'})
     with urlopen(request,timeout=8) as response:return json.load(response)
    try:
     with self.assertRaises(HTTPError) as err:send('block-break-reviews',cookie='')
     self.assertEqual(err.exception.code,403)
     with self.assertRaises(HTTPError) as err:send('block-break-review-set',method='POST',
         origin='https://evil.example',params={})
     self.assertEqual(err.exception.code,403)
     self.assertEqual(send('block-break-reviews')['reviews'],[])
     payload={'beforeBlockId':2,'afterBlockId':5,
       'beforeLineId':args['before_line_id'],'afterLineId':args['after_line_id'],
       'beforeText':args['before_text'],'afterText':args['after_text'],
       'decision':'断块合并','expectedDecision':'待定'}
     self.assertEqual(send('block-break-review-set',payload,method='POST')['status'],'saved')
     self.assertEqual(send('block-break-reviews')['reviews'][0]['decision'],'断块合并')
     payload.update(decision='忽略',expectedDecision='待定')
     with self.assertRaises(HTTPError) as conflict:
      send('block-break-review-set',payload,method='POST')
     self.assertEqual(conflict.exception.code,422)
    finally:server.shutdown();server.server_close()

if __name__=='__main__':unittest.main()
