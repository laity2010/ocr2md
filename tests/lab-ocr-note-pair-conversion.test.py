"""WP3.2 synthetic-book-only prepare receipt: never write MD from the review endpoint."""
from __future__ import annotations
import importlib.util,sqlite3,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('mdfixture',ROOT/'tests/lab-ocr-md-store.test.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
from v6_lab_ocr_md import initialize_md,read_md
from v6_lab_ocr_note_pair_review import set_note_pair_review,read_note_pair_reviews
from v6_lab_ocr_note_pair_conversion import arm_note_pair_conversion
from v6_lab_ocr_store import OCRImportError

def setup(book):
 fixture.make_book(book);initialize_md(book)
 lines=read_md(book)['rows'][:]
 a,b=lines[0],lines[1]
 with sqlite3.connect(book/'ocr2md.sqlite') as db:
  db.execute('UPDATE md_line SET text=? WHERE line_id=?',('See<sup>1</sup>',a['line_id']))
  db.execute('UPDATE md_line SET text=? WHERE line_id=?',('1. The note',b['line_id']))
 a={**a,'text':'See<sup>1</sup>'};b={**b,'text':'1. The note'}
 def endpoint(row,kind,raw,from_,to,rule):
  return {'candidateId':f'{kind}:{row["line_id"]}:{from_}:{kind}.{rule}',
    'lineId':row['line_id'],'blockId':row['block_id'],
    'from':from_,'to':to,'raw':raw,'sourceText':row['text']}
 ref=endpoint(a,'ref','<sup>1</sup>',3,15,'html-sup')
 body=endpoint(b,'body',b['text'],0,len(b['text']),'number-dot')
 result=set_note_pair_review(book,ref,body,'待转换',None)
 updates=[{'lineId':a['line_id'],'blockId':a['block_id'],
          'beforeText':a['text'],'afterText':'See[^1]'},
          {'lineId':b['line_id'],'blockId':b['block_id'],
          'beforeText':b['text'],'afterText':'[^1]: The note'}]
 plan={'number':'1','convertedReferenceId':f'ref:{a["line_id"]}:3:ref.md-footnote',
       'convertedBodyId':f'body:{b["line_id"]}:0:body.md-footnote',
       'updates':updates}
 return ref,body,result,plan

class ConversionReceipt(unittest.TestCase):
 def test_prepare_is_metadata_only_and_undo_redo_evidence(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);ref,body,result,plan=setup(book)
   before=read_md(book)
   prepared=arm_note_pair_conversion(book,ref['candidateId'],result['revision'],plan)
   self.assertEqual(prepared['status'],'prepared')
   self.assertEqual(read_md(book),before,'prepare cannot write Markdown')
   first=read_note_pair_reviews(book)['reviews'][0]
   self.assertTrue(first['valid']);self.assertFalse(first['converted'])
   self.assertEqual(first['conversion']['converted_ref_id'],plan['convertedReferenceId'])
   with self.assertRaisesRegex(OCRImportError,'已有其他修改'):
    arm_note_pair_conversion(book,ref['candidateId'],result['revision'],plan)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',
      (plan['updates'][0]['afterText'],ref['lineId']))
   half=read_note_pair_reviews(book)['reviews'][0]
   self.assertFalse(half['valid']);self.assertFalse(half['converted'],
      'half of a conversion is never reported as complete')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',
      (plan['updates'][1]['afterText'],body['lineId']))
   complete=read_note_pair_reviews(book)['reviews'][0]
   self.assertFalse(complete['valid']);self.assertTrue(complete['converted'])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in plan['updates']:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',
       (item['beforeText'],item['lineId']))
   undone=read_note_pair_reviews(book)['reviews'][0]
   self.assertTrue(undone['valid']);self.assertFalse(undone['converted'])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in plan['updates']:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',
       (item['afterText'],item['lineId']))
   self.assertTrue(read_note_pair_reviews(book)['reviews'][0]['converted'])

 def test_migrates_wp3_1_legacy_review_table_on_prepare(self):
  import v6_lab_ocr_note_pair_review as review_store
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);fixture.make_book(book);initialize_md(book)
   legacy=review_store.SCHEMA.replace(' conversion_json TEXT,\n','')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:db.execute(legacy)
   # Explicit source text uses UTF-16 offsets for the review endpoint.
   current=read_md(book)['rows'];a,b=current[0],current[1]
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',('See<sup>1</sup>',a['line_id']))
    db.execute('UPDATE md_line SET text=? WHERE line_id=?',('1. The note',b['line_id']))
   ref={'candidateId':f'ref:{a["line_id"]}:3:ref.html-sup','lineId':a['line_id'],
        'blockId':a['block_id'],'from':3,'to':15,'raw':'<sup>1</sup>',
        'sourceText':'See<sup>1</sup>'}
   body={'candidateId':f'body:{b["line_id"]}:0:body.number-dot','lineId':b['line_id'],
         'blockId':b['block_id'],'from':0,'to':11,'raw':'1. The note',
         'sourceText':'1. The note'}
   decision=set_note_pair_review(book,ref,body,'待转换',None)
   self.assertEqual(decision['decision'],'待转换')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertIn('conversion_json',{row[1] for row in db.execute('PRAGMA table_info(note_pair_review)')})
   self.assertTrue(read_note_pair_reviews(book)['reviews'][0]['valid'])

 def test_http_cookie_origin_and_method(self):
  from http.server import ThreadingHTTPServer
  from urllib.request import Request,urlopen
  from urllib.error import HTTPError
  from unittest.mock import patch
  from urllib.parse import urlencode
  import json,threading
  import v6_lab_ocr_serve as api
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);ref,body,result,plan=setup(book)
   server=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   try:
    with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
       [book] if cookie=='authorized' else (_ for _ in ()).throw(api.APIError(403,'未授权'))):
     base=f'http://127.0.0.1:{server.server_port}/labs/lab-ocr/api/ocr/note-pair-convert-prepare'
     payload={'workspace':str(book),'referenceId':ref['candidateId'],
        'expectedRevision':result['revision'],'plan':plan}
     def call(cookie='authorized',origin='http://127.0.0.1:4414',post=True):
      url=base if post else base+'?'+urlencode({'workspace':str(book)})
      request=Request(url,data=json.dumps(payload).encode() if post else None,
       headers={'Cookie':cookie,'Origin':origin,'Content-Type':'application/json'})
      with urlopen(request,timeout=6) as response:return json.loads(response.read())
     with self.assertRaises(HTTPError) as error:call(cookie='bad')
     self.assertEqual(error.exception.code,403)
     with self.assertRaises(HTTPError) as error:call(origin='https://evil.example')
     self.assertEqual(error.exception.code,403)
     with self.assertRaises(HTTPError) as error:call(post=False)
     self.assertEqual(error.exception.code,405)
     self.assertEqual(call()['status'],'prepared')
   finally:server.shutdown();thread.join();server.server_close()

 def test_utf16_source_offsets_match_javascript(self):
  from v6_lab_ocr_note_pair_review import _utf16_range
  text='emoji 🔭 before <sup>2</sup> after'
  marker='<sup>2</sup>'
  # One astral code point before the marker occupies two JS code units.
  index=len(text[:text.index(marker)].encode('utf-16-le'))//2
  self.assertEqual(_utf16_range(text,index,index+len(marker)),marker)
  self.assertNotEqual(text[index:index+len(marker)],marker)

 def test_stale_evidence_fails_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);ref,body,result,plan=setup(book)
   invalid={**plan,'updates':[{'lineId':ref['lineId'],
     'blockId':ref['blockId'],'beforeText':'not original','afterText':'fake'}]}
   with self.assertRaisesRegex(OCRImportError,'计划过期'):
    arm_note_pair_conversion(book,ref['candidateId'],result['revision'],invalid)
   self.assertTrue(read_note_pair_reviews(book)['reviews'][0]['valid'])
   self.assertIsNone(read_note_pair_reviews(book)['reviews'][0]['conversion'])

if __name__=='__main__':unittest.main()
