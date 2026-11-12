"""Direct contract: read-only, normalized page-level block/span rectangle projection."""
from __future__ import annotations
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace, originals, OCRImportError
from v6_lab_ocr_block import minerujson2block
from v6_lab_ocr_span import minerujson2span
from v6_lab_ocr_overlays import overlay_rows

class OverlayContract(unittest.TestCase):
 def test_page_filter_nested_bbox_sparse_and_source_readonly(self):
  with tempfile.TemporaryDirectory() as directory:
   book=Path(directory)
   (book/'pdf').mkdir();(book/'mineru json').mkdir()
   (book/'pdf'/'sample.pdf').write_bytes(b'%PDF-1.4\n')
   document={'pdf_info':[
    {'page_idx':0,'page_size':[595,842],'preproc_blocks':[], 'discarded_blocks':[],
     'para_blocks':[
      {'type':'text','bbox':[15,25,285,125], 'lines':[{'spans':[
       {'type':'text','bbox':[25,30,100,50],'content':'A'},
       {'type':'text','bbox':[110,30,200,50],'content':'B'},
       {'type':'text','bbox':None,'content':'missing rectangle'}]}]},
      {'type':'table','bbox':[15,150,400,300],'blocks':[
       {'type':'table_caption','bbox':[20,160,200,180], 'lines':[{'spans':[
        {'type':'text','bbox':[20,160,195,177],'content':'caption'}]}]}]},
      {'type':'empty','bbox':None,'lines':[]}]},
    {'page_idx':1,'page_size':[595,842],'preproc_blocks':[], 'discarded_blocks':[],
     'para_blocks':[{'type':'text','bbox':[40,50,500,120],'lines':[{'spans':[
       {'type':'text','bbox':[40,50,100,70],'content':'second page'}]}]}]}]}
   source=book/'mineru json'/'source.json'
   source.write_text(json.dumps(document))
   import_workspace(book)
   minerujson2block(book);minerujson2span(book)
   before=originals(book);original_bytes=source.read_bytes()
   block=overlay_rows(book,'block',1)
   self.assertEqual((block['page'],block['level'],block['pageSize']),(1,'block',[595,842]))
   self.assertEqual(len(block['boxes']),3)
   self.assertEqual([x['bbox'] for x in block['boxes']],[[15,25,285,125],[15,150,400,300],[20,160,200,180]])
   self.assertEqual([x['id'] for x in block['boxes']],['1','2','3'])
   self.assertEqual([x['blockType'] for x in block['boxes']],['text','table','table_caption'])
   self.assertEqual([x['blockGroup'] for x in block['boxes']],['para_blocks']*3)
   spans=overlay_rows(book,'span',1)
   self.assertEqual([x['bbox'] for x in spans['boxes']],[[25,30,100,50],[110,30,200,50],[20,160,195,177]])
   self.assertTrue(all(':l' in x['id'] for x in spans['boxes']))
   self.assertEqual([x['blockType'] for x in spans['boxes']],['text','text','table_caption'])
   self.assertEqual([x['blockGroup'] for x in spans['boxes']],['para_blocks']*3)
   self.assertEqual(overlay_rows(book,'span',2)['boxes'][0]['bbox'],[40,50,100,70])
   self.assertEqual(overlay_rows(book,'block',3),{'level':'block','page':3,'pageSize':None,'boxes':[]})
   for level,page in [('invalid',1),('span',0),('block',201)]:
    with self.assertRaises(OCRImportError):overlay_rows(book,level,page)
   self.assertEqual(originals(book),before)
   self.assertEqual(source.read_bytes(),original_bytes)
   with sqlite3.connect(book/'ocr2md.sqlite') as connection:
    self.assertEqual(connection.execute('SELECT COUNT(*) FROM block').fetchone()[0],5)
    self.assertEqual(connection.execute('SELECT COUNT(*) FROM span').fetchone()[0],5)

 def test_project_every_group_without_collapsing_source(self):
  with tempfile.TemporaryDirectory() as directory:
   book=Path(directory)
   (book/'pdf').mkdir();(book/'mineru json').mkdir()
   (book/'pdf'/'sample.pdf').write_bytes(b'%PDF-1.4\n')
   source={"pdf_info":[{"page_idx":0,"page_size":[595,842],
     "preproc_blocks":[{"type":"text","bbox":[21,31,101,61],
                         "lines":[{"spans":[{"type":"text","bbox":[22,32,50,40],"content":"pre"}]}]}],
     "discarded_blocks":[{"type":"page_number","bbox":[510,780,560,800],
                           "lines":[{"spans":[{"type":"text","bbox":[510,780,560,800],"content":"1"}]}]}],
     "para_blocks":[{"type":"text","bbox":[20,30,100,60],
                     "lines":[{"spans":[{"type":"text","bbox":[22,32,51,40],"content":"para"}]}]}]}]}
   (book/'mineru json'/'source.json').write_text(json.dumps(source))
   import_workspace(book);minerujson2block(book);minerujson2span(book)
   expected=['preproc_blocks','discarded_blocks','para_blocks']
   self.assertEqual([row['blockGroup'] for row in overlay_rows(book,'block',1)['boxes']],expected)
   self.assertEqual([row['blockGroup'] for row in overlay_rows(book,'span',1)['boxes']],expected)
   self.assertEqual([row['blockType'] for row in overlay_rows(book,'block',1)['boxes']],['text','page_number','text'])

if __name__=='__main__':unittest.main()
