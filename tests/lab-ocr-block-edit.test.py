"""WP2/WP3 direct tests: stable IDs, SQLite revision CAS, undo/redo and source seals."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import (OCRImportError, import_workspace, originals)
from v6_lab_ocr_block import minerujson2block,block_rows
from v6_lab_ocr_span import minerujson2span,span_rows
from v6_lab_ocr_block_edit import (block_move_state,preview_block_move,apply_block_move,
                                   undo_block_move,plan_block_move)


def make_book(book):
    (book/'mineru json').mkdir()
    (book/'pdf').mkdir()
    original_pdf=b'%PDF-1.7\n' + b'preserve-the-pdf'
    (book/'pdf'/'original.pdf').write_bytes(original_pdf)
    rect=[20,30,160,80]
    def block(name,children=None):
        item=dict(type='text',bbox=rect,lines=[{'spans':[dict(type='text',content=name)]}])
        if children is not None:item['blocks']=children
        return item
    doc={'pdf_info':[
        {'page_idx':0,'page_size':[595,842],
         'preproc_blocks':[block('PRE')],'discarded_blocks':[block('BAD')],
         'para_blocks':[block('A'),block('B',[block('B0'),block('B1')]),block('C')]},
        {'page_idx':1,'page_size':[595,842],'para_blocks':[block('D')],
         'preproc_blocks':[],'discarded_blocks':[]}]}
    source=json.dumps(doc,ensure_ascii=False).encode()
    (book/'mineru json'/'source.json').write_bytes(source)
    import_workspace(book)
    minerujson2block(book)
    minerujson2span(book)
    return (source,original_pdf)


class BlockEditContract(unittest.TestCase):
 def test_transactional_reparent_undo_redo_and_sealed_data(self):
    with tempfile.TemporaryDirectory() as td:
        book=Path(td)
        source,pdf=make_book(book)
        original=originals(book)
        original_span=span_rows(book)['rows']
        raw=block_rows(book)['rows']
        before={r['pbs']:r for r in raw}
        a,b,b0,b1,c,d=[before[x]['block_id'] for x in
                        ('p1b0','p1b1','p1b1s0','p1b1s1','p1b2','p2b0')]
        assert len({a,b,b0,b1,c,d})==6
        self.assertEqual(block_move_state(book),dict(revision=0,canUndo=False,canRedo=False))
        planned=preview_block_move(book,a,b,'child')
        self.assertEqual(planned['revision'],0)
        self.assertTrue(planned['changed'])
        self.assertEqual(next(r['pbs'] for r in planned['changedRows'] if r['block_id']==a),'p1b0s2')
        self.assertEqual(block_move_state(book)['revision'],0,'Preview may not write')
        first=apply_block_move(book,a,b,'child',0)
        self.assertEqual(first['revision'],1)
        self.assertEqual(first['page'],1)
        self.assertTrue(first['canUndo'])
        after={r['block_id']:r for r in block_rows(book)['rows']}
        self.assertEqual((after[a]['parent_block_id'],after[a]['pbs']),(b,'p1b0s2'))
        self.assertEqual(after[b]['pbs'],'p1b0')
        self.assertEqual(after[b0]['pbs'],'p1b0s0')
        self.assertEqual(after[b1]['pbs'],'p1b0s1')
        self.assertEqual(after[d]['pbs'],'p2b0','Unrelated page must remain untouched')
        self.assertEqual(after[a]['source_block_key'],before['p1b0']['source_block_key'])
        self.assertEqual(after[a]['block_json'],before['p1b0']['block_json'])
        self.assertEqual(span_rows(book)['rows'],original_span)
        self.assertEqual(originals(book),original)
        self.assertEqual((book/'mineru json'/'source.json').read_bytes(),source)
        self.assertEqual((book/'pdf'/'original.pdf').read_bytes(),pdf)
        with self.assertRaisesRegex(OCRImportError,'版本冲突'):
            apply_block_move(book,c,b,'child',0)
        with self.assertRaises(OCRImportError):
            apply_block_move(book,b,b0,'child',1)
        with self.assertRaises(OCRImportError):
            apply_block_move(book,d,b,'before',1)
        with self.assertRaises(OCRImportError):
            apply_block_move(book,b0,b1,'child',1)
        self.assertEqual(block_move_state(book)['revision'],1)
        self.assertEqual(minerujson2block(book)['status'],'unchanged')
        self.assertEqual(minerujson2span(book)['status'],'unchanged',
            'Initializing Span after edited Block must preserve the edit history')
        rewind=undo_block_move(book,1)
        self.assertEqual(rewind['revision'],2)
        self.assertTrue(rewind['canRedo'])
        restored={r['block_id']:r for r in block_rows(book)['rows']}
        self.assertEqual([(restored[x]['pbs'],restored[x]['parent_block_id']) for x in (a,b,b0,b1,c)],
           [(before[x]['pbs'],before[x]['parent_block_id']) for x in ('p1b0','p1b1','p1b1s0','p1b1s1','p1b2')])
        again=undo_block_move(book,2,redo=True)
        self.assertEqual(again['revision'],3)
        self.assertEqual({r['block_id']:r['pbs'] for r in block_rows(book)['rows']},
                         {bid:r['pbs'] for bid,r in after.items()})
        reorder=apply_block_move(book,b1,b0,'before',3)
        self.assertEqual(reorder['revision'],4)
        final={r['block_id']:r for r in block_rows(book)['rows']}
        self.assertEqual(final[b1]['pbs'],'p1b0s0')
        self.assertEqual(final[b0]['pbs'],'p1b0s1')
        self.assertEqual(final[b1]['parent_block_id'],b)
        self.assertEqual(final[a]['pbs'],'p1b0s2')
        rollback=undo_block_move(book,4)
        self.assertTrue(rollback['canRedo'])
        next_move=apply_block_move(book,c,b,'before',5)
        self.assertFalse(next_move['canRedo'],'New edit after undo truncates redo')
        self.assertEqual(block_move_state(book)['revision'],6)
        with sqlite3.connect(book/'ocr2md.sqlite') as conn:
            self.assertEqual(conn.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(conn.execute('SELECT count(*) FROM block WHERE block_group<>?',('para_blocks',)).fetchone()[0],0)
        # An explicit changed-source reimport must be blocked, not erase
        # a human's reviewed relation history.
        (book/'mineru json'/'source.json').write_bytes(source+b' ')
        with self.assertRaisesRegex(OCRImportError,'人工作业历史'):
            import_workspace(book,replace=True)
        self.assertEqual(originals(book),original)

 def test_pure_plan_validation_and_absorbed_parent_descendants(self):
    rows=[
      dict(block_id=10,global_page=0,block_group='para_blocks',parent_block_id=None,
           sibling_order=0,pbs='p1b0'),
      dict(block_id=11,global_page=0,block_group='para_blocks',parent_block_id=10,
           sibling_order=0,pbs='p1b0s0'),
      dict(block_id=12,global_page=0,block_group='para_blocks',parent_block_id=None,
           sibling_order=1,pbs='p1b1'),
      dict(block_id=13,global_page=0,block_group='para_blocks',parent_block_id=12,
           sibling_order=0,pbs='p1b1s0'),
      dict(block_id=14,global_page=0,block_group='para_blocks',parent_block_id=None,
           sibling_order=2,pbs='p1b2'),
    ]
    frozen=json.dumps(rows,sort_keys=True)
    plan=plan_block_move(rows,10,13,'child')
    result={row[0]:row for row in plan['after']}
    self.assertEqual(result[10][1],12)
    self.assertEqual(result[10][3],'p1b0s1')
    self.assertEqual(result[11][3],'p1b0s1s0','Descendant identity preserved')
    self.assertEqual(result[13][3],'p1b0s0')
    self.assertEqual(json.dumps(rows,sort_keys=True),frozen,'Pure plan cannot modify input')
    self.assertEqual(plan_block_move(rows,10,12,'after')['changed'],True)
    self.assertFalse(plan_block_move(rows,10,12,'before')['changed'])
    for src,target,placement in [(10,10,'child'),(10,11,'child'),
                                  (11,12,'after'),(10,12,'bad')]:
        with self.assertRaises(OCRImportError):
            plan_block_move(rows,src,target,placement)
    cycle=[dict(row) for row in rows]
    cycle[0]['parent_block_id']=11
    with self.assertRaisesRegex(OCRImportError,'循环'):
        plan_block_move(cycle,12,14,'before')


if __name__=='__main__':unittest.main()
