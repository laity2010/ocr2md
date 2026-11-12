"""Direct CMD API test: Block rows preserve all Line/Span and nested-Block details."""
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_span import minerujson2span
from v6_lab_ocr_block import minerujson2block,block_rows

class BlockContract(unittest.TestCase):
 def test_nested_full_round_trip_and_no_source_mutation(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);(book/'mineru json').mkdir();(book/'pdf').mkdir()
   (book/'pdf'/'file.pdf').write_bytes(b'%PDF-1.4\n')
   rect=[3,4,8,12]
   def l(*ss):return {'bbox':rect,'spans':list(ss),'line_extra':{'raw':'keep'}}
   def s(t,**kw):return {'bbox':rect,'type':t,**kw}
   nested={'type':'table','index':10,'bbox':rect,'other_attrs':[3,2],
      'blocks':[
       {'type':'table_caption','index':0,'bbox':rect,'lines':[l(s('text',content='Table A',score=1))]},
       {'type':'table_body','index':1,'bbox':rect,'lines':[l(s('table',html='<table><tr><td>A</td></tr></table>',image_path='asset.jpg',flag=[1,2]))]},
       {'type':'table_footnote','index':2,'bbox':rect,'lines':[]}], 'lines':[]}
   para=[{'type':'text','index':1,'bbox':rect,'angle':0,'merge_prev':False,
          'lines':[l(s('text',content='Hello ',score=0.6),s('inline_equation',content='x^2'))]},
         nested,{'type':'image','index':19,'bbox':rect,'blocks':[
          {'type':'image_body','index':0,'bbox':rect,'lines':[l(s('image',image_path='https://test/img.jpg'))]}]},
         {'type':'empty','index':22,'bbox':rect,'lines':[],'blocks':[]}]
   doc={'_backend':'hybrid','pdf_info':[{'page_idx':0,'page_size':[594,783],'custom_page':32,
       'preproc_blocks':[{'type':'text','index':0,'bbox':rect,'lines':[l(s('text',content='Before'))]}],
       'discarded_blocks':[{'type':'footer','index':4,'bbox':rect,'lines':[l(s('text',content='Footer'))]}],
       'para_blocks':para}]}
   raw=json.dumps(doc,ensure_ascii=False,indent=2).encode()
   file=book/'mineru json'/'sample.json';file.write_bytes(raw)
   import_workspace(book)
   original=originals(book)
   res=minerujson2block(book)
   self.assertEqual((res['status'],res['blocks']),('created',10))
   self.assertEqual(minerujson2block(book)['status'],'unchanged')
   rows=block_rows(book,0,100)['rows']
   self.assertEqual(len(rows),10)
   self.assertEqual(len({x['block_id'] for x in rows}),10)
   self.assertEqual([x['block_id'] for x in rows],list(range(1,11)))
   self.assertEqual(len({(r['source_order'],r['block_group'],r['pbs']) for r in rows}),10)
   self.assertEqual(len({r['pbs'] for r in rows if r['block_group']=='para_blocks'}),8)
   self.assertEqual(next(r for r in rows if r['block_group']=='preproc_blocks')['pbs'],'p1b0')
   self.assertEqual(next(r for r in rows if r['block_group']=='para_blocks')['pbs'],'p1b0')
   self.assertEqual(sum(r['span_count'] for r in rows),7)
   self.assertEqual([r['block_group'] for r in rows if r['parent_block_id'] is None],
     ['preproc_blocks','discarded_blocks','para_blocks','para_blocks','para_blocks','para_blocks'])
   inner=next(r for r in rows if r['block_type']=='table_body')
   self.assertIsInstance(inner['block_id'],int)
   self.assertEqual(inner['source_block_key'],'s0:p0:para_blocks:b1.1')
   self.assertEqual(inner['pbs'],'p1b1s1')
   self.assertNotIn('parent_pbs',inner)
   parent=next(r for r in rows if r['block_type']=='table')
   self.assertEqual(inner['parent_block_id'],parent['block_id'])
   self.assertEqual(parent['pbs'],'p1b1')
   self.assertNotIn('parent_pbs',parent)
   self.assertIsNone(parent['parent_block_id'])
   self.assertEqual(json.loads(inner['block_json'])['lines'][0]['spans'][0], nested['blocks'][1]['lines'][0]['spans'][0])
   self.assertNotIn('blocks',json.loads(parent['block_json']))
   self.assertEqual(parent['has_blocks_field'],1)
   self.assertEqual(parent['span_count'],0)
   text=next(r for r in rows if r['block_type']=='text' and r['block_group']=='para_blocks')
   self.assertEqual(json.loads(text['block_json']),para[0])
   empty=next(r for r in rows if r['block_type']=='empty')
   self.assertEqual(json.loads(empty['block_json'])['lines'],[])
   self.assertEqual(empty['pbs'],'p1b3')
   self.assertEqual(empty['has_blocks_field'],1)
   self.assertEqual(block_rows(book,3,2)['rows'],rows[3:5])
   by_parent={}
   for r in rows:by_parent.setdefault(r['parent_block_id'],[]).append(r)
   def unpack(row):
    b=json.loads(row['block_json'])
    if row['has_blocks_field']:
     b['blocks']=[unpack(c) for c in sorted(by_parent.get(row['block_id'],[]),key=lambda x:x['sibling_order'])]
    return b
   rebuilt={group:[unpack(r) for r in sorted((r for r in by_parent[None] if r['block_group']==group),key=lambda x:x['sibling_order'])] for group in ('preproc_blocks','discarded_blocks','para_blocks')}
   self.assertEqual({k:doc['pdf_info'][0][k] for k in rebuilt},rebuilt)
   self.assertEqual(originals(book),original)
   self.assertEqual(file.read_bytes(),raw)
   # Existing span API must continue to work after block table creation.
   self.assertEqual(minerujson2span(book)['status'],'created')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertEqual(db.execute('''SELECT COUNT(*) FROM span s JOIN block b
      ON s.block_id=b.source_block_key''').fetchone()[0],7)

   self.assertEqual(minerujson2block(book)['status'],'unchanged')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertEqual(db.execute("SELECT COUNT(*) FROM minerujson WHERE row_kind='block'").fetchone()[0],6)
    self.assertEqual(db.execute('SELECT COUNT(*) FROM block').fetchone()[0],10)
    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
    self.assertEqual(db.execute('SELECT COUNT(*) FROM block WHERE parent_block_id IS NOT NULL').fetchone()[0],4)
   # PBS may be re-numbered during OCR review; the parent FK must stay fixed.
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute("UPDATE block SET pbs=? WHERE block_id=?",('p1b99',parent['block_id']))
    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
    self.assertEqual(db.execute('SELECT parent_block_id FROM block WHERE block_id=?',(inner['block_id'],)).fetchone()[0],parent['block_id'])
   reread=next(r for r in block_rows(book,0,100)['rows'] if r['block_id']==inner['block_id'])
   self.assertEqual(reread['parent_block_id'],parent['block_id'])
   self.assertNotIn('parent_pbs',reread)
   self.assertEqual(next(r for r in block_rows(book,0,100)['rows'] if r['block_id']==parent['block_id'])['pbs'],'p1b99')

 def test_upgrade_legacy_derived_table(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);(book/'mineru json').mkdir();(book/'pdf').mkdir()
   (book/'pdf'/'file.pdf').write_bytes(b'%PDF-1.4\n')
   document={'pdf_info':[{'page_idx':0,'page_size':[100,100],
     'para_blocks':[{'type':'text','index':0,'bbox':[0,0,100,100],
       'lines':[{'bbox':[1,2,3,4],'spans':[{'type':'text','content':'source'}]}]}],
     'preproc_blocks':[],'discarded_blocks':[]}]}
   (book/'mineru json'/'a.json').write_text(json.dumps(document))
   import_workspace(book)
   # Only the old generated, read-only schema is eligible for migration.
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute('''CREATE TABLE block (block_id TEXT PRIMARY KEY,
      parent_block_id TEXT,block_path TEXT,block_json TEXT,
      import_fingerprint TEXT,has_blocks_field INTEGER)''')
    db.execute("INSERT INTO block(block_id,block_path,block_json,import_fingerprint,has_blocks_field) VALUES ('legacy','0','{}','legacy',0)")
   self.assertEqual(minerujson2block(book),{'status':'created','table':'block','blocks':1})
   result=block_rows(book)['rows'][0]
   self.assertEqual((result['block_id'],result['pbs'],result['source_block_key']),
     (1,'p1b0','s0:p0:para_blocks:b0'))
   self.assertEqual(json.loads(result['block_json'])['lines'][0]['spans'][0]['content'],'source')
   self.assertEqual(minerujson2block(book)['status'],'unchanged')

if __name__=='__main__':unittest.main()
