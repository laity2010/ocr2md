"""Synthetic-book only human note review persistence: source immutable, CAS, HTTP auth."""
from __future__ import annotations
import importlib.util,json,sqlite3,sys,tempfile,threading,unittest
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('mdfixture',ROOT/'tests/lab-ocr-md-store.test.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
from v6_lab_ocr_md import read_md,initialize_md
from v6_lab_ocr_store import OCRImportError
from v6_lab_ocr_note_pair_review import read_note_pair_reviews,set_note_pair_review
import v6_lab_ocr_serve as api


def setup(book):
    fixture.make_book(book)
    initialize_md(book)
    lines=read_md(book)['rows']
    references=[item for item in lines if item['text'] and item['block_id'] is not None]
    assert len(references)>=2
    def end(row,kind):
        return {'candidateId':kind+':'+row['line_id']+':0:'+kind+'.html-sup',
          'lineId':row['line_id'],'blockId':row['block_id'],
          'from':0,'to':1,'raw':row['text'][:1],'sourceText':row['text']}
    return end(references[0],'ref'),end(references[1],'body')


class NoteReview(unittest.TestCase):
 def test_read_only_get_and_ignore_restore_confirm_cas(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);ref,body=setup(book)
   before=read_md(book)
   self.assertEqual(read_note_pair_reviews(book)['reviews'],[])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertFalse(db.execute('SELECT 1 FROM sqlite_master WHERE name="note_pair_review"').fetchone())
   ignore=set_note_pair_review(book,ref,None,'忽略',None)
   self.assertEqual(ignore['decision'],'忽略')
   self.assertRegex(ignore['revision'],r'^[a-f0-9]{32}$')
   saved=read_note_pair_reviews(book)['reviews'][0]
   self.assertEqual(saved['ref_id'],ref['candidateId']);self.assertTrue(saved['valid'])
   self.assertEqual(saved['decision'],'忽略')
   self.assertEqual(read_md(book),before)
   with self.assertRaisesRegex(OCRImportError,'已有其他修改'):
    set_note_pair_review(book,ref,None,'待定',None)
   confirmed=set_note_pair_review(book,ref,body,'待转换',ignore['revision'])
   self.assertEqual(confirmed['body_id'],body['candidateId'])
   record=read_note_pair_reviews(book)['reviews'][0]
   self.assertEqual(record['decision'],'待转换');self.assertTrue(record['valid'])
   with self.assertRaisesRegex(OCRImportError,'已有其他修改'):
    set_note_pair_review(book,ref,None,'忽略',ignore['revision'])
   cleared=set_note_pair_review(book,ref,None,'待定',confirmed['revision'])
   self.assertEqual(cleared['revision'],None)
   self.assertEqual(read_note_pair_reviews(book)['reviews'],[])
   self.assertEqual(before,read_md(book),'Only review extension table can be written')

 def test_three_status_choices_persist_on_legacy_sqlite(self):
  from v6_lab_ocr_note_pair_review import SCHEMA
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);ref,body=setup(book)
   original=read_md(book)
   old=SCHEMA.replace("('忽略','待核实','待转换')", "('忽略','待转换')")
   old=old.replace("decision IN ('忽略','待核实')", "decision='忽略'")
   with sqlite3.connect(book/'ocr2md.sqlite') as db:db.execute(old)
   ignored=set_note_pair_review(book,ref,None,'忽略',None)
   self.assertEqual(ignored['decision'],'忽略')
   waiting=set_note_pair_review(book,ref,None,'待核实',ignored['revision'])
   self.assertEqual(waiting['decision'],'待核实')
   self.assertTrue(read_note_pair_reviews(book)['reviews'][0]['valid'])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    schema=db.execute("SELECT sql FROM sqlite_master WHERE name='note_pair_review'").fetchone()[0]
    self.assertIn('待核实',schema)
    self.assertEqual(db.execute('SELECT COUNT(*) FROM note_pair_review').fetchone()[0],1)
   matched=set_note_pair_review(book,ref,body,'待转换',waiting['revision'])
   self.assertEqual(matched['decision'],'待转换')
   waiting2=set_note_pair_review(book,ref,None,'待核实',matched['revision'])
   self.assertEqual(waiting2['decision'],'待核实')
   self.assertEqual(read_md(book),original)

 def test_stale_text_and_invalid_body_source_not_applied(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);ref,body=setup(book)
   res=set_note_pair_review(book,ref,body,'待转换',None)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',('edited line',body['lineId']))
   self.assertEqual(read_note_pair_reviews(book)['reviews'][0]['valid'],False)
   with self.assertRaisesRegex(OCRImportError,'已变化'):
    set_note_pair_review(book,ref,body,'待转换',res['revision'])
   with self.assertRaisesRegex(OCRImportError,'来源位置无效|候选'):
    set_note_pair_review(book,{**ref,'to':10000},None,'忽略',res['revision'])

 def test_book_isolation_and_http_method_cookie_origin(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);a=root/'book-A';b=root/'book-B';a.mkdir();b.mkdir()
   ref,body=setup(a);setup(b)
   set_note_pair_review(a,ref,None,'忽略',None)
   self.assertEqual(read_note_pair_reviews(b)['reviews'],[])
   server=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   try:
    with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
           [root] if cookie=='authorized' else (_ for _ in ()).throw(api.APIError(403,'未授权'))):
     from urllib.parse import urlencode
     base=f'http://127.0.0.1:{server.server_port}/labs/lab-ocr/api/ocr/'
     def query(op,body=None,cookie='authorized',origin='http://127.0.0.1:4414'):
      uri=base+op+(('?'+urlencode({'workspace':str(a)})) if body is None else '')
      req=Request(uri,headers={'Cookie':cookie,'Origin':origin,'Content-Type':'application/json'},
        data=json.dumps({'workspace':str(a),**body}).encode() if body is not None else None)
      with urlopen(req,timeout=7) as response:return json.loads(response.read())
     got=query('note-pair-reviews')
     self.assertEqual(got['reviews'][0]['decision'],'忽略')
     rev=got['reviews'][0]['revision']
     saved=query('note-pair-review-set',{'reference':ref,'body':body,
       'decision':'待转换','expectedRevision':rev})
     self.assertEqual(saved['decision'],'待转换')
     with self.assertRaises(HTTPError) as failure:
      query('note-pair-review-set',{'reference':ref,'body':None,
        'decision':'忽略','expectedRevision':rev})
     self.assertEqual(failure.exception.code,422)
     with self.assertRaises(HTTPError) as failure:query('note-pair-reviews',cookie='not-auth')
     self.assertEqual(failure.exception.code,403)
     with self.assertRaises(HTTPError) as failure:
      query('note-pair-review-set',{'reference':ref,'body':None,'decision':'待定',
        'expectedRevision':saved['revision']},origin='https://evil.example')
     self.assertEqual(failure.exception.code,403)
     with self.assertRaises(HTTPError) as failure:query('note-pair-review-set')
     self.assertEqual(failure.exception.code,405)
   finally:server.shutdown();thread.join();server.server_close()

if __name__=='__main__':unittest.main()
