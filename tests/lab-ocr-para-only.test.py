"""Para-only derived review tables: migration preserves para IDs and original bytes."""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace, originals, existing_info
from v6_lab_ocr_block import SCHEMA as BLOCK_SCHEMA, _records, minerujson2block, block_rows
from v6_lab_ocr_span import SCHEMA as SPAN_SCHEMA, _rows, minerujson2span, span_rows
from v6_lab_ocr_overlays import overlay_rows


class ParaOnlyContract(unittest.TestCase):
 def test_existing_three_group_projection_migrates_without_renumbering_para(self):
  with tempfile.TemporaryDirectory() as td:
   book=Path(td);(book/'mineru json').mkdir();(book/'pdf').mkdir()
   (book/'pdf'/'sample.pdf').write_bytes(b'%PDF-1.7\n')
   rect=[15,20,100,70]
   def block(content):
    return {'type':'text','bbox':rect,'lines':[{'spans':[{'type':'text','bbox':rect,'content':content}]}]}
   page={'page_idx':0,'page_size':[595,842],
         'preproc_blocks':[block('PREPROC')], 'discarded_blocks':[block('DISCARDED')],
         'para_blocks':[block('PARA')]}
   raw=json.dumps({'pdf_info':[page]}).encode('utf-8')
   (book/'mineru json'/'sample.json').write_bytes(raw)
   import_workspace(book);source_before=originals(book)
   signature=existing_info(book)['signature']
   all_block_rows=list(_records(0,'sample.json',0,page,signature,0))
   self.assertEqual([(r[0],r[8]) for r in all_block_rows],
                    [(1,'preproc_blocks'),(2,'discarded_blocks'),(3,'para_blocks')])
   para_span=next(_rows(0,'sample.json',0,page,signature))
   old_span=list(para_span)
   old_span[0]='s0:p0:preproc_blocks:b0:l0:s0'
   old_span[6]='preproc_blocks'
   old_span[7]='s0:p0:preproc_blocks:b0'
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    db.execute(BLOCK_SCHEMA.replace(" CHECK(block_group='para_blocks')",''))
    db.executemany('INSERT INTO block VALUES ('+','.join('?' for _ in range(22))+')',all_block_rows)
    db.execute(SPAN_SCHEMA.replace(" CHECK(block_group='para_blocks')",''))
    db.executemany('INSERT INTO span VALUES ('+','.join('?' for _ in range(26))+')',
                   [para_span,tuple(old_span)])
    db.execute("UPDATE block SET pbs='reviewed-p1b0' WHERE block_id=3")
   # Read APIs refuse non-para data even before migration.
   self.assertEqual([r['block_id'] for r in block_rows(book)['rows']],[3])
   self.assertEqual([r['span_id'] for r in span_rows(book)['rows']],[para_span[0]])
   self.assertEqual([r['blockId'] for r in overlay_rows(book,'block',1)['boxes']],['3'])
   self.assertEqual(len(overlay_rows(book,'span',1)['boxes']),1)
   self.assertEqual(minerujson2block(book),{'status':'filtered','table':'block','blocks':1})
   self.assertEqual(minerujson2span(book),{'status':'filtered','table':'span','spans':1})
   self.assertEqual(minerujson2block(book)['status'],'unchanged')
   self.assertEqual(minerujson2span(book)['status'],'unchanged')
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertEqual(db.execute('SELECT block_id,pbs,block_group FROM block').fetchall(),
                     [(3,'reviewed-p1b0','para_blocks')])
    self.assertEqual(db.execute('SELECT span_id,block_group FROM span').fetchall(),
                     [(para_span[0],'para_blocks')])
    self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
   self.assertEqual(originals(book),source_before)
   self.assertEqual((book/'mineru json'/'sample.json').read_bytes(),raw)


if __name__=='__main__':unittest.main()
