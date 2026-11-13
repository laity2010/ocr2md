"""WCP47 cross-page review uses stable source ID + an adjacent logical parent."""
import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals,OCRImportError
from v6_lab_ocr_block_view import initialize_block_projection
from v6_lab_ocr_block import block_rows
from v6_lab_ocr_block_edit import (persist_block_edit_batch,block_move_state,
    preview_block_move,apply_block_move,undo_block_move)

def make_book(path):
    (path/'mineru json').mkdir();(path/'pdf').mkdir()
    (path/'pdf'/'book.pdf').write_bytes(b'%PDF-1.7\n')
    def block(value,children=None):
        obj={'type':'text','bbox':[10,20,200,100],
             'lines':[{'spans':[{'type':'text','content':value}]}]}
        if children is not None:obj['blocks']=children
        return obj
    payload={'pdf_info':[
        {'page_idx':0,'page_size':[595,842], 'para_blocks':[
          block('A'),block('B',[block('B0')])]},
        {'page_idx':1,'page_size':[595,842], 'para_blocks':[
          block('C',[block('C0')]),block('D'),block('E')]}]}
    content=json.dumps(payload,ensure_ascii=False).encode()
    (path/'mineru json'/'book.json').write_bytes(content)
    import_workspace(path);initialize_block_projection(path)
    return content

class CrossPage(unittest.TestCase):
 def test_direct_apply_and_undo_port_use_the_same_cross_page_plan(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);make_book(book)
   result=apply_block_move(book,4,2,'child',0)
   self.assertEqual(result['pages'],[1,2])
   self.assertEqual({r['block_id']:r['pbs'] for r in block_rows(book)['rows']}[4],'p1b1s1')
   restored=undo_block_move(book,1)
   self.assertEqual(restored['pages'],[1,2])
   self.assertEqual({r['block_id']:r['pbs'] for r in block_rows(book)['rows']}[4],'p2b0')
   redone=undo_block_move(book,2,redo=True)
   self.assertEqual(redone['pages'],[1,2])
   self.assertEqual({r['block_id']:r['pbs'] for r in block_rows(book)['rows']}[4],'p1b1s1')

 def test_adjacent_child_async_cas_undo_redo_and_source_seals(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp);raw=make_book(book);sealed=originals(book)
   base={r['block_id']:r for r in block_rows(book)['rows']}
   self.assertEqual([base[x]['pbs'] for x in range(1,8)],
       ['p1b0','p1b1','p1b1s0','p2b0','p2b0s0','p2b1','p2b2'])
   expected={'action':'apply','sourceBlockId':4,'targetBlockId':3,'placement':'child'}
   preview=preview_block_move(book,4,3,'child')
   self.assertEqual(preview['pages'],[1,2])
   self.assertEqual(preview['scope'],'delta')
   result=persist_block_edit_batch(book,0,'cross-page-cas-0001',[expected])
   self.assertEqual(result['revision'],1)
   self.assertEqual(persist_block_edit_batch(book,0,'cross-page-cas-0001',[expected]),result)
   post={r['block_id']:r for r in block_rows(book)['rows']}
   self.assertEqual((post[4]['parent_block_id'],post[4]['pbs']),(2,'p1b1s1'))
   self.assertEqual((post[5]['parent_block_id'],post[5]['pbs']),(2,'p1b1s2'))
   self.assertEqual((post[6]['pbs'],post[7]['pbs']),('p2b0','p2b1'))
   self.assertTrue(all(post[i]['global_page']==base[i]['global_page'] for i in post))
   self.assertTrue(all(post[i]['block_json']==base[i]['block_json'] for i in post))
   self.assertEqual(block_move_state(book,True)['history'][0]['pages'],[1,2])
   # Normal same-page reorder must continue to work AFTER the cross-page link.
   result=persist_block_edit_batch(book,1,'cross-page-follow-002',[
       {'action':'apply','sourceBlockId':7,'targetBlockId':6,'placement':'before'}])
   self.assertEqual(result['revision'],2)
   post={r['block_id']:r for r in block_rows(book)['rows']}
   self.assertEqual((post[7]['pbs'],post[6]['pbs']),('p2b0','p2b1'))
   self.assertEqual(post[4]['pbs'],'p1b1s1')
   persist_block_edit_batch(book,2,'cross-page-undo-003',[{'action':'undo'}])
   self.assertEqual(block_rows(book)['rows'][-1]['pbs'],'p2b1')
   persist_block_edit_batch(book,3,'cross-page-undo-004',[{'action':'undo'}])
   restored={r['block_id']:r for r in block_rows(book)['rows']}
   self.assertEqual([restored[x]['pbs'] for x in range(1,8)],
       [base[x]['pbs'] for x in range(1,8)])
   persist_block_edit_batch(book,4,'cross-page-redo-005',[{'action':'redo'}])
   self.assertEqual({r['block_id']:r['pbs'] for r in block_rows(book)['rows']}[4],'p1b1s1')
   self.assertEqual(originals(book),sealed)
   self.assertEqual((book/'mineru json'/'book.json').read_bytes(),raw)
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(),[])
    self.assertEqual(conn.execute("SELECT type FROM sqlite_master WHERE name='block'").fetchone()[0],'view')
   # Invalid direction or cross-page rank must be rejected before writing SQL.
   with self.assertRaisesRegex(OCRImportError,'跨页'):
    preview_block_move(book,1,4,'child')
   with self.assertRaisesRegex(OCRImportError,'同页'):
    preview_block_move(book,6,2,'after')
   self.assertEqual(block_move_state(book)['revision'],5)

if __name__=='__main__':unittest.main()
