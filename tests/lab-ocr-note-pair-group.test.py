"""Synthetic same-line footnotes 9/10, metadata-only grouped CAS, partial rebase."""
from __future__ import annotations
import importlib.util,sqlite3,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
spec=importlib.util.spec_from_file_location('fixture',ROOT/'tests/lab-ocr-md-store.test.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
from v6_lab_ocr_md import read_md,initialize_md
from v6_lab_ocr_store import OCRImportError
from v6_lab_ocr_note_pair_review import (set_note_pair_review,read_note_pair_reviews,
    set_note_pair_conversion_issues)
from v6_lab_ocr_note_pair_conversion import (arm_note_pair_group_conversion,
    arm_note_pair_conversion)

SRC='Assessing taxes<sup>9</sup> and overseas<sup>10</sup> Hence.'
BODY9='9. For a corporation, capital gains taxes apply.'
BODY10='10. International taxes are complex.'


def make(book):
 fixture.make_book(book);initialize_md(book)
 lines=read_md(book)['rows']
 assert len(lines)>=3
 with sqlite3.connect(book/'ocr2md.sqlite') as db:
  for row,value in zip(lines,[SRC,BODY9,BODY10]):
   db.execute('UPDATE md_line SET text=? WHERE line_id=?',(value,row['line_id']))
 return [dict(row, text=txt) for row,txt in zip(lines,[SRC,BODY9,BODY10])]


def endpoint(row,kind,label,rule):
 text=row['text'];raw=f'<sup>{label}</sup>' if kind=='ref' else text
 start=text.index(raw)
 return {'candidateId':f'{kind}:{row["line_id"]}:{start}:{kind}.{rule}',
   'lineId':row['line_id'],'blockId':row['block_id'],'from':start,
   'to':start+len(raw),'raw':raw,'sourceText':text}


def change(row,after):
 return {'lineId':row['line_id'],'blockId':row['block_id'],
         'beforeText':row['text'],'afterText':after}


def members_and_changes(rows,one=False):
 first=endpoint(rows[0],'ref','9','html-sup')
 second=endpoint(rows[0],'ref','10','html-sup')
 b9=endpoint(rows[1],'body','9','number-dot')
 b10=endpoint(rows[2],'body','10','number-dot')
 return first,second,b9,b10


class SameLineConversion(unittest.TestCase):
 def test_9_10_group_atomic_receipts_undo_redo(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);rows=make(book);r9,r10,b9,b10=members_and_changes(rows)
   v9=set_note_pair_review(book,r9,b9,'待转换',None)
   v10=set_note_pair_review(book,r10,b10,'待转换',None)
   after=SRC.replace('<sup>9</sup>','[^9]').replace('<sup>10</sup>','[^10]')
   updates=[change(rows[0],after),change(rows[1],'[^9]: '+BODY9[3:]),
            change(rows[2],'[^10]: '+BODY10[4:])]
   ms=[{'referenceId':r['candidateId'],'expectedRevision':v['revision'],
        'number':number,
        'convertedReferenceId':f'ref:{rows[0]["line_id"]}:{after.index("[^"+number+"]")}:ref.md-footnote',
        'convertedBodyId':f'body:{body["lineId"]}:0:body.md-footnote'}
       for r,v,number,body in ((r9,v9,'9',b9),(r10,v10,'10',b10))]
   result=arm_note_pair_group_conversion(book,ms,updates)
   self.assertEqual(len(result['members']),2)
   self.assertEqual(read_md(book)['rows'][0]['text'],SRC,'prepare does not write MD')
   with self.assertRaisesRegex(OCRImportError,'版本冲突'):
    arm_note_pair_group_conversion(book,ms,updates)
   self.assertEqual([x['converted'] for x in read_note_pair_reviews(book)['reviews']],[False,False])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in updates:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',(item['afterText'],item['lineId']))
   self.assertEqual([x['converted'] for x in read_note_pair_reviews(book)['reviews']],[True,True])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in updates:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',(item['beforeText'],item['lineId']))
   self.assertEqual([x['converted'] for x in read_note_pair_reviews(book)['reviews']],[False,False])
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in updates:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',(item['afterText'],item['lineId']))
   self.assertTrue(all(x['converted'] for x in read_note_pair_reviews(book)['reviews']))

 def test_rebase_previous_10_when_9_converted_later_and_undo(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);rows=make(book);r9,r10,b9,b10=members_and_changes(rows)
   v10=set_note_pair_review(book,r10,b10,'待转换',None)
   mid=SRC.replace('<sup>10</sup>','[^10]')
   before10=[change(rows[0],mid),change(rows[2],'[^10]: '+BODY10[4:])]
   single={'number':'10','convertedReferenceId':f'ref:{rows[0]["line_id"]}:{mid.index("[^10]")}:ref.md-footnote',
           'convertedBodyId':f'body:{b10["lineId"]}:0:body.md-footnote',
           'updates':before10}
   arm_note_pair_conversion(book,r10['candidateId'],v10['revision'],single)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in before10:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',(item['afterText'],item['lineId']))
   self.assertTrue(read_note_pair_reviews(book)['reviews'][0]['converted'])
   current=dict(rows[0],text=mid)
   r9=endpoint(current,'ref','9','html-sup')
   v9=set_note_pair_review(book,r9,b9,'待转换',None)
   old10=next(x for x in read_note_pair_reviews(book)['reviews'] if x['ref_id']==r10['candidateId'])
   new=mid.replace('<sup>9</sup>','[^9]')
   changes=[change(current,new),change(rows[1],'[^9]: '+BODY9[3:])]
   member={'referenceId':r9['candidateId'],'expectedRevision':v9['revision'],
     'number':'9','convertedReferenceId':f'ref:{rows[0]["line_id"]}:{new.index("[^9]")}:ref.md-footnote',
     'convertedBodyId':f'body:{b9["lineId"]}:0:body.md-footnote'}
   anchor={'referenceId':r10['candidateId'],'expectedRevision':old10['revision'],
     'convertedReferenceId':f'ref:{rows[0]["line_id"]}:{new.index("[^10]")}:ref.md-footnote'}
   prepared=arm_note_pair_group_conversion(book,[member],changes,[anchor])
   self.assertEqual(len(prepared['members']),2)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in changes:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',(item['afterText'],item['lineId']))
   final=read_note_pair_reviews(book)['reviews']
   self.assertTrue(all(item['converted'] for item in final))
   self.assertEqual(next(x for x in final if x['ref_id']==r10['candidateId'])['conversion']['converted_ref_id'],
     anchor['convertedReferenceId'])
   # Undo only the later 9 conversion, leaving the original 10 converted.
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    for item in changes:
     db.execute('UPDATE md_line SET text=? WHERE line_id=?',(item['beforeText'],item['lineId']))
   undone=read_note_pair_reviews(book)['reviews']
   self.assertFalse(next(x for x in undone if x['ref_id']==r9['candidateId'])['converted'])
   ten=next(x for x in undone if x['ref_id']==r10['candidateId'])
   self.assertTrue(ten['converted'])
   self.assertEqual(ten['conversion']['converted_ref_id'],single['convertedReferenceId'])

 def test_group_and_issue_http_auth_origin_and_method(self):
  from http.server import ThreadingHTTPServer
  from urllib.request import Request,urlopen
  from urllib.error import HTTPError
  from urllib.parse import urlencode
  from unittest.mock import patch
  import json,threading
  import v6_lab_ocr_serve as api
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);rows=make(book)
   r9,r10,b9,b10=members_and_changes(rows)
   v9=set_note_pair_review(book,r9,b9,'待转换',None)
   v10=set_note_pair_review(book,r10,b10,'待转换',None)
   after=SRC.replace('<sup>9</sup>','[^9]').replace('<sup>10</sup>','[^10]')
   changes=[change(rows[0],after),change(rows[1],'[^9]: '+BODY9[3:]),
            change(rows[2],'[^10]: '+BODY10[4:])]
   members=[{'referenceId':r['candidateId'],'expectedRevision':v['revision'],
      'number':num,'convertedReferenceId':f'ref:{rows[0]["line_id"]}:{after.index("[^"+num+"]")}:ref.md-footnote',
      'convertedBodyId':f'body:{body["lineId"]}:0:body.md-footnote'}
      for r,v,num,body in ((r9,v9,'9',b9),(r10,v10,'10',b10))]
   server=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
   thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
   try:
    with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
      [book] if cookie=='authorized' else (_ for _ in ()).throw(api.APIError(403,'未授权'))):
     root=f'http://127.0.0.1:{server.server_port}/labs/lab-ocr/api/ocr/'
     def call(op,data,cookie='authorized',origin='http://127.0.0.1:4414',post=True):
      url=root+op+(('?' + urlencode({'workspace':str(book)})) if not post else '')
      req=Request(url,data=json.dumps({'workspace':str(book),**data}).encode() if post else None,
       headers={'Cookie':cookie,'Origin':origin,'Content-Type':'application/json'})
      with urlopen(req,timeout=7) as res:return json.loads(res.read())
     payload={'members':members,'updates':changes,'anchors':[]}
     for kwargs,expected in [({'cookie':'invalid'},403),({'origin':'https://evil.example'},403),
                             ({'post':False},405)]:
      with self.assertRaises(HTTPError) as error:call('note-pair-group-prepare',payload,**kwargs)
      self.assertEqual(error.exception.code,expected)
     prepared=call('note-pair-group-prepare',payload)
     self.assertEqual(len(prepared['members']),2)
     self.assertEqual(read_md(book)['rows'][0]['text'],SRC)
     with self.assertRaises(HTTPError) as error:
      call('note-pair-convert-issues',{'items':[{'reference':r9,
        'expectedRevision':v9['revision'],'code':'unsafe-layout','reason':'same line'}]})
     self.assertEqual(error.exception.code,422,'Prior CAS revision must be rejected')
     revision=next(x['revision'] for x in prepared['members'] if x['ref_id']==r9['candidateId'])
     issued=call('note-pair-convert-issues',{'items':[{'reference':r9,
       'expectedRevision':revision,'code':'unsafe-layout','reason':'same line'}]})
     self.assertEqual(issued['issues'][0]['issue']['code'],'unsafe-layout')
   finally:server.shutdown();thread.join();server.server_close()

 def test_conversion_failure_persisted_then_cleared(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);rows=make(book);r9,r10,b9,b10=members_and_changes(rows)
   old=read_md(book)
   result=set_note_pair_conversion_issues(book,[{
     'reference':r9,'expectedRevision':None,'code':'unsafe-layout',
     'reason':'同一源码行存在重叠注引，暂不允许转换'}])
   self.assertEqual(result['status'],'saved')
   review=read_note_pair_reviews(book)['reviews'][0]
   self.assertEqual(review['issue']['code'],'unsafe-layout')
   self.assertTrue(review['valid'])
   self.assertEqual(read_md(book),old)
   with self.assertRaisesRegex(OCRImportError,'其他操作修改'):
    set_note_pair_conversion_issues(book,[{'reference':r9,
      'expectedRevision':None,'code':'other','reason':'overwritten'}])
   changed=set_note_pair_review(book,r9,b9,'待转换',review['revision'])
   self.assertEqual(changed['decision'],'待转换')
   self.assertIsNone(read_note_pair_reviews(book)['reviews'][0]['issue'])

if __name__=='__main__':unittest.main()
