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
   self.assertEqual(sum(r['span_count'] for r in rows),7)
   self.assertEqual([r['block_group'] for r in rows if r['parent_block_id'] is None],
     ['preproc_blocks','discarded_blocks','para_blocks','para_blocks','para_blocks','para_blocks'])
   inner=next(r for r in rows if r['block_type']=='table_body')
   self.assertEqual(inner['block_id'],'s0:p0:para_blocks:b1.1')
   self.assertEqual(inner['parent_block_id'],'s0:p0:para_blocks:b1')
   self.assertEqual(json.loads(inner['block_json'])['lines'][0]['spans'][0], nested['blocks'][1]['lines'][0]['spans'][0])
   parent=next(r for r in rows if r['block_type']=='table')
   self.assertNotIn('blocks',json.loads(parent['block_json']))
   self.assertEqual(parent['has_blocks_field'],1)
   self.assertEqual(parent['span_count'],0)
   text=next(r for r in rows if r['block_type']=='text' and r['block_group']=='para_blocks')
   self.assertEqual(json.loads(text['block_json']),para[0])
   empty=next(r for r in rows if r['block_type']=='empty')
   self.assertEqual(json.loads(empty['block_json'])['lines'],[])
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
   self.assertEqual(minerujson2block(book)['status'],'unchanged')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertEqual(db.execute("SELECT COUNT(*) FROM minerujson WHERE row_kind='block'").fetchone()[0],6)
    self.assertEqual(db.execute('SELECT COUNT(*) FROM block').fetchone()[0],10)

if __name__=='__main__':unittest.main()
