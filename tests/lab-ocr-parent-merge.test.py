"""WCP48: one parent + four children after two parent wrappers merge.

Raw MinerU bytes and every stable source BlockID survive; the absorbed parent
is an inactive review projection, not deleted or exposed as a fifth child.
"""
import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_block_view import initialize_block_projection
from v6_lab_ocr_block import block_rows
from v6_lab_ocr_overlays import overlay_rows
from v6_lab_ocr_block_edit import persist_block_edit_batch,block_move_state


def isolated_book(path):
    (path/'mineru json').mkdir();(path/'pdf').mkdir()
    pdf=b'%PDF-1.7\noriginal-pdf';(path/'pdf'/'book.pdf').write_bytes(pdf)
    def block(name, children=None):
        row={'type':'table' if children is not None else 'table_body',
             'bbox':[20,35,190,115],'lines':[{'spans':[{
               'type':'text','content':name}]}] if children is None else []}
        if children is not None:row['blocks']=children
        return row
    pdf_info=[{'page_idx':0,'page_size':[595,842],
      'preproc_blocks':[],'discarded_blocks':[],
      'para_blocks':[
        block('A',[block('A0'),block('A1')]),
        block('B',[block('B0'),block('B1')]),
        block('C')]}]
    raw=json.dumps({'pdf_info':pdf_info},ensure_ascii=False).encode()
    (path/'mineru json'/'book.json').write_bytes(raw)
    import_workspace(path);initialize_block_projection(path)
    return raw,pdf


class ParentParentMerge(unittest.TestCase):
 def test_exactly_one_parent_four_children_and_reversible_review(self):
  with tempfile.TemporaryDirectory() as td:
   book=Path(td);raw,pdf=isolated_book(book);sealed=originals(book)
   source={r['pbs']:r for r in block_rows(book)['rows']}
   self.assertEqual(len(source),7)
   src=source['p1b1']['block_id'];dst=source['p1b0']['block_id']
   source_children=[source[x]['block_id'] for x in ('p1b1s0','p1b1s1')]
   target_children=[source[x]['block_id'] for x in ('p1b0s0','p1b0s1')]
   r=persist_block_edit_batch(book,0,'parentmerge001',[
     {'action':'apply','sourceBlockId':src,'targetBlockId':dst,'placement':'child'}])
   self.assertEqual(r['revision'],1)
   rows={r['block_id']:r for r in block_rows(book)['rows']}
   visible=[r for r in rows.values() if r['absorbed_into_block_id'] is None]
   self.assertEqual(sorted(r['pbs'] for r in visible),
     sorted(['p1b0','p1b0s0','p1b0s1','p1b0s2','p1b0s3','p1b1']))
   self.assertEqual(rows[src]['absorbed_into_block_id'],dst)
   self.assertEqual(rows[src]['pbs'],f'~merged:{src}')
   self.assertEqual([rows[i]['pbs'] for i in target_children+source_children],
                    ['p1b0s0','p1b0s1','p1b0s2','p1b0s3'])
   self.assertTrue(all(rows[i]['parent_block_id']==dst for i in target_children+source_children))
   overlay=overlay_rows(book,'block',1)
   self.assertEqual(len(overlay['boxes']),7,'Retain immutable bbox for instantaneous Undo')
   self.assertEqual(next(r for r in overlay['boxes'] if r['blockId']==str(src))['absorbedIntoBlockId'],str(dst))
   self.assertEqual(rows[src]['source_block_key'],source['p1b1']['source_block_key'])
   self.assertEqual(rows[src]['block_json'],source['p1b1']['block_json'])
   with sqlite3.connect(book/'ocr2md.sqlite') as conn:
    self.assertEqual(conn.execute("SELECT type FROM sqlite_master WHERE name='block'").fetchone()[0],'view')
    self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(),[])
    self.assertEqual(conn.execute('SELECT absorbed_into_block_id FROM block_review WHERE block_id=?',
                                  (src,)).fetchone()[0],dst)
   self.assertEqual(persist_block_edit_batch(book,0,'parentmerge001',[
     {'action':'apply','sourceBlockId':src,'targetBlockId':dst,'placement':'child'}]),r)
   hist=block_move_state(book,include_history=True)['history'][0]
   self.assertEqual(hist['operation']['absorbsParent'],True)
   self.assertEqual(len(next(x for x in hist['before'] if x[0]==src)),5)
   self.assertIsNone(next(x for x in hist['before'] if x[0]==src)[4])
   self.assertEqual(next(x for x in hist['after'] if x[0]==src)[4],dst)
   persist_block_edit_batch(book,1,'parentundo001',[{'action':'undo'}])
   after_undo={r['block_id']:r for r in block_rows(book)['rows']}
   self.assertIsNone(after_undo[src]['absorbed_into_block_id'])
   self.assertEqual(after_undo[src]['pbs'],'p1b1')
   self.assertEqual([after_undo[i]['parent_block_id'] for i in source_children],[src,src])
   self.assertEqual(len(overlay_rows(book,'block',1)['boxes']),7)
   persist_block_edit_batch(book,2,'parentredo001',[{'action':'redo'}])
   after_redo={r['block_id']:r for r in block_rows(book)['rows']}
   self.assertEqual(after_redo[src]['absorbed_into_block_id'],dst)
   self.assertEqual(len(overlay_rows(book,'block',1)['boxes']),7)
   self.assertEqual(originals(book),sealed)
   self.assertEqual((book/'mineru json'/'book.json').read_bytes(),raw)
   self.assertEqual((book/'pdf'/'book.pdf').read_bytes(),pdf)

if __name__=='__main__':unittest.main()
