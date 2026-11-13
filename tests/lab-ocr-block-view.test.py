"""WCP46 schema: a single MinerU source table, review extension and para view."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_block_view import initialize_block_projection,inspect_block_projection
from v6_lab_ocr_block import block_rows
from v6_lab_ocr_block import minerujson2block
from v6_lab_ocr_overlays import overlay_rows
from v6_lab_ocr_block_edit import persist_block_edit_batch,block_move_state


class MineruBlockViewContract(unittest.TestCase):
 def test_explicit_legacy_rebuild_and_error_rollback(self):
  with tempfile.TemporaryDirectory() as root:
   book=Path(root);(book/'mineru json').mkdir();(book/'pdf').mkdir()
   (book/'pdf'/'x.pdf').write_bytes(b'%PDF-1.4\n')
   source=json.dumps({'pdf_info':[{'page_idx':0,'page_size':[600,800],
     'para_blocks':[{'type':'text','bbox':[5,6,30,50],'lines':[]}],
     'preproc_blocks':[],'discarded_blocks':[]}]}).encode()
   (book/'mineru json'/'x.json').write_bytes(source)
   import_workspace(book);minerujson2block(book)
   self.assertEqual(inspect_block_projection(book)['status'],'legacy')
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    conn.execute("UPDATE block SET pbs='p1b99' WHERE block_id=1")
   # Pure inspection preserves reviewed legacy PBS.
   self.assertEqual(inspect_block_projection(book)['status'],'legacy')
   self.assertEqual(block_rows(book)['rows'][0]['pbs'],'p1b99')
   original=originals(book)
   initialized=initialize_block_projection(book)
   self.assertEqual((initialized['kind'],initialized['blocks']),('view',1))
   self.assertEqual(block_rows(book)['rows'][0]['pbs'],'p1b0')
   self.assertEqual(originals(book),original)
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    conn.execute("UPDATE block_review SET pbs='reviewed' WHERE block_id=1")
    # Corrupt *only the source SHA declaration*, not original bytes. The next
    # initializer must fail and roll back the entire schema + edited review.
    conn.execute("UPDATE minerujson SET source_sha256='bad' WHERE row_kind='source'")
   with self.assertRaises(ValueError):
    initialize_block_projection(book)
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    self.assertEqual(conn.execute("SELECT type FROM sqlite_master WHERE name='block'").fetchone()[0],'view')
    self.assertEqual(conn.execute('SELECT pbs FROM block_review').fetchone()[0],'reviewed')
    self.assertEqual(conn.execute('SELECT COUNT(*) FROM block_review').fetchone()[0],1)

 def test_nested_para_sql_view_and_destructive_explicit_reinit(self):
  with tempfile.TemporaryDirectory() as root:
   book=Path(root);(book/'mineru json').mkdir();(book/'pdf').mkdir()
   (book/'pdf'/'x.pdf').write_bytes(b'%PDF-1.4\nno-change')
   block=lambda typ,label:{'type':typ,'bbox':[30,40,90,110],
     'lines':[{'spans':[{'type':'text','content':label}]}]}
   page={'page_idx':0,'page_size':[600,800],
     'preproc_blocks':[block('text','header')],
     'discarded_blocks':[block('text','footer')],
     'para_blocks':[block('text','one'),{'type':'table','bbox':[10,20,40,90],
        'blocks':[block('table_caption','cap'),block('table_body','body')],
        'lines':[]}]}
   raw=json.dumps({'pdf_info':[page]},ensure_ascii=False,indent=2).encode()
   (book/'mineru json'/'x.json').write_bytes(raw)
   import_workspace(book)
   original=originals(book)
   self.assertEqual(inspect_block_projection(book)['status'],'missing')
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    self.assertEqual(conn.execute("SELECT name,type FROM sqlite_master WHERE name='block'").fetchall(),[])
   result=initialize_block_projection(book)
   self.assertEqual((result['status'],result['kind'],result['blocks']),('initialized','view',4))
   self.assertEqual(inspect_block_projection(book)['status'],'ready')
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    objects=dict(conn.execute('SELECT name,type FROM sqlite_master WHERE name IN (\'minerujson\',\'block_review\',\'block\',\'span\')'))
    self.assertEqual(objects,{'minerujson':'table','block_review':'table','block':'view'})
    self.assertEqual(conn.execute('SELECT COUNT(*) FROM block_review').fetchone()[0],4)
    rows=conn.execute('SELECT block_id,pbs,source_block_key,global_page,parent_block_id,'
      'block_path,page_size_json,span_count,block_json FROM block ORDER BY block_id').fetchall()
    self.assertEqual([r[0] for r in rows],[3,4,5,6])
    self.assertEqual([r[1] for r in rows],['p1b0','p1b1','p1b1s0','p1b1s1'])
    self.assertEqual([r[4] for r in rows],[None,None,4,4])
    self.assertEqual(rows[2][2],'s0:p0:para_blocks:b1.0')
    self.assertEqual([json.loads(r[6]) for r in rows],[[600,800]]*4)
    self.assertEqual([r[7] for r in rows],[1,0,1,1])
    self.assertNotIn('blocks',json.loads(rows[1][8]))
    self.assertEqual(json.loads(rows[2][8])['lines'][0]['spans'][0]['content'],'cap')
    self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(),[])
    # Manual review state is stored in extension, not the VIEW.
    conn.execute("UPDATE block_review SET pbs='p1b8' WHERE block_id=4")
    self.assertEqual(conn.execute('SELECT pbs FROM block WHERE block_id=4').fetchone()[0],'p1b8')
   self.assertEqual(originals(book),original)
   self.assertEqual((book/'mineru json'/'x.json').read_bytes(),raw)
   self.assertEqual(len(block_rows(book)['rows']),4)
   self.assertEqual([r['blockId'] for r in overlay_rows(book,'block',1)['boxes']],
                    ['3','4','5','6'])
   changed=persist_block_edit_batch(book,0,'wcp46_view_edit_batch_001',[
     {'action':'apply','sourceBlockId':3,'targetBlockId':4,'placement':'child'}])
   self.assertEqual(changed['revision'],1)
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    self.assertEqual(conn.execute('SELECT parent_block_id FROM block_review WHERE block_id=3').fetchone()[0],4)
    self.assertEqual(conn.execute('SELECT parent_block_id FROM block WHERE block_id=3').fetchone()[0],4)
    self.assertEqual(conn.execute('SELECT COUNT(*) FROM block_edit_history').fetchone()[0],1)
    self.assertEqual(conn.execute('SELECT COUNT(*) FROM sqlite_master WHERE type=\'table\' AND name=\'block\'').fetchone()[0],0)
   self.assertEqual(block_move_state(book)['revision'],1)
   restored=persist_block_edit_batch(book,1,'wcp46_view_undo_batch_002',[{'action':'undo'}])
   self.assertEqual(restored['revision'],2)
   self.assertEqual(block_rows(book)['rows'][0]['parent_block_id'],None)
   self.assertEqual(initialize_block_projection(book)['blocks'],4)
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    self.assertEqual(conn.execute('SELECT pbs FROM block WHERE block_id=4').fetchone()[0],'p1b1')
    self.assertEqual(conn.execute("SELECT type FROM sqlite_master WHERE name='block'").fetchone()[0],'view')
   self.assertEqual(originals(book),original)

if __name__=='__main__':unittest.main()
