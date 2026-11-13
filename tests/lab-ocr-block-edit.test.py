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
                                   undo_block_move,plan_block_move,plan_flatten_page,
                                   persist_block_edit_batch)


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
 def test_two_level_migration_preserves_originals_and_blocks_undo_barrier(self):
    with tempfile.TemporaryDirectory() as td:
        book=Path(td)
        source,pdf=make_book(book)
        originals_before=originals(book)
        span_before=span_rows(book)['rows']
        original_rows=block_rows(book)['rows']
        labels={r['pbs']:r for r in original_rows}
        root=labels['p1b1']['block_id']
        child=labels['p1b1s0']['block_id']
        grandchild=labels['p1b1s1']['block_id']
        # Simulate the existing p6b4s2s0 bug using an isolated test DB.
        with sqlite3.connect(book/'ocr2md.sqlite') as conn:
            conn.execute('''UPDATE block SET parent_block_id=?,pbs=?,sibling_order=?
                            WHERE block_id=?''',
                         (child,'p1b1s0s0',0,grandchild))
        nested=block_rows(book)['rows']
        plan=plan_flatten_page([r for r in nested if r['global_page']==0])
        renamed={r['block_id']:r for r in plan['changedRows']}
        self.assertEqual(renamed[grandchild]['parent_block_id'],root)
        self.assertEqual(renamed[grandchild]['pbs'],'p1b1s1')
        self.assertEqual(block_move_state(book)['revision'],0)
        command={'action':'flatten','page':1}
        result=persist_block_edit_batch(book,0,'cm-protective-flatten-001',[command])
        self.assertEqual(result['revision'],1)
        self.assertEqual(persist_block_edit_batch(
            book,0,'cm-protective-flatten-001',[command]),result,
            'idempotent retry must not flatten twice')
        final={r['block_id']:r for r in block_rows(book)['rows']}
        self.assertEqual(final[grandchild]['pbs'],'p1b1s1')
        self.assertEqual(final[grandchild]['parent_block_id'],root)
        self.assertEqual(final[grandchild]['source_block_key'],
                         labels['p1b1s1']['source_block_key'])
        self.assertEqual(final[grandchild]['block_json'],
                         labels['p1b1s1']['block_json'])
        history=block_move_state(book,include_history=True)
        self.assertEqual(history['history'][0]['before'][
            next(i for i,v in enumerate(history['history'][0]['before']) if v[0]==grandchild)][3],
            'p1b1s0s0','Before-snapshot remains auditable')
        self.assertEqual(history['history'][0]['operation'],
                         {'action':'flatten','page':1})
        self.assertFalse(history['canUndo'],'Undo cannot recreate forbidden grandchildren')
        with self.assertRaises(OCRImportError):
            persist_block_edit_batch(book,1,'cm-invalid-undo-00001',[{'action':'undo'}])
        self.assertEqual(block_move_state(book)['revision'],1)
        self.assertEqual(originals(book),originals_before)
        self.assertEqual(span_rows(book)['rows'],span_before)
        self.assertEqual((book/'mineru json'/'source.json').read_bytes(),source)
        self.assertEqual((book/'pdf'/'original.pdf').read_bytes(),pdf)

 def test_absorb_existing_parent_subtree_without_grandchildren(self):
    with tempfile.TemporaryDirectory() as td:
        book=Path(td);make_book(book)
        labels={r['pbs']:r for r in block_rows(book)['rows']}
        root,child0,child1,target=[
            labels[x]['block_id'] for x in ('p1b1','p1b1s0','p1b1s1','p1b2')]
        before={r['block_id']:r for r in block_rows(book)['rows']}
        plan=plan_block_move([r for r in before.values() if r['global_page']==0],
                             root,target,'child')
        mapped={v[0]:v for v in plan['after']}
        self.assertEqual((mapped[root][1],mapped[root][3]),(target,'p1b1s0'))
        self.assertEqual((mapped[child0][1],mapped[child0][3]),(target,'p1b1s1'))
        self.assertEqual((mapped[child1][1],mapped[child1][3]),(target,'p1b1s2'))
        self.assertTrue(all(r[3].count('s')<=1 for r in mapped.values()))
        persist_block_edit_batch(book,0,'cm-absorb-parent-00001',
          [{'action':'apply','sourceBlockId':root,
            'targetBlockId':target,'placement':'child'}])
        rows={r['block_id']:r for r in block_rows(book)['rows']}
        for block_id in (root,child0,child1):
            self.assertEqual(rows[block_id]['parent_block_id'],target)
            self.assertEqual(rows[block_id]['source_block_key'],
                             before[block_id]['source_block_key'])
        persist_block_edit_batch(book,1,'cm-absorb-undo-00002',[{'action':'undo'}])
        restored={r['block_id']:r for r in block_rows(book)['rows']}
        self.assertEqual(restored[child0]['parent_block_id'],root)
        self.assertEqual(restored[child1]['parent_block_id'],root)
        self.assertEqual(restored[root]['parent_block_id'],None)
        self.assertTrue(all(r['pbs'].count('s')<=1 for r in restored.values()))

 def test_deferred_cm_batch_idempotent_and_atomic_rollback(self):
    with tempfile.TemporaryDirectory() as td:
        book=Path(td);source,pdf=make_book(book)
        original=originals(book);spans=span_rows(book)['rows']
        by_pbs={row['pbs']:row['block_id'] for row in block_rows(book)['rows']}
        a,b,c=by_pbs['p1b0'],by_pbs['p1b1'],by_pbs['p1b2']
        commands=[
            {'action':'apply','sourceBlockId':a,'targetBlockId':b,'placement':'child'},
            {'action':'apply','sourceBlockId':c,'targetBlockId':b,'placement':'before'},
            {'action':'undo'},{'action':'redo'},
        ]
        self.assertEqual(block_move_state(book)['revision'],0,'CM editing should not call SQL until flush')
        batch_id='cm-firstbatch-00000001'
        result=persist_block_edit_batch(book,0,batch_id,commands)
        self.assertEqual((result['revision'],result['appliedCount']),(4,4))
        self.assertEqual(persist_block_edit_batch(book,0,batch_id,commands),result,
            'Retried lost response uses receipt and must NOT duplicate edit')
        with self.assertRaisesRegex(OCRImportError,'批次编号'):
            persist_block_edit_batch(book,4,batch_id,[{'action':'undo'}])
        self.assertEqual(block_move_state(book)['revision'],4)
        latest={r['block_id']:r for r in block_rows(book)['rows']}
        self.assertEqual(latest[a]['parent_block_id'],b)
        self.assertEqual(latest[a]['pbs'],'p1b1s2')
        self.assertEqual(latest[c]['pbs'],'p1b0')
        historical=block_move_state(book,include_history=True)
        self.assertEqual(len(historical['history']),2)
        self.assertEqual(historical['cursor'],historical['history'][1]['seq'])
        self.assertEqual(historical['history'][0]['page'],1)
        self.assertEqual(historical['history'][0]['operation']['placement'],'child')
        before_failure=block_rows(book)['rows']
        with self.assertRaises(OCRImportError):
            persist_block_edit_batch(book,4,'cm-failure-00000001',[
                {'action':'undo'},
                {'action':'apply','sourceBlockId':a,'targetBlockId':a,'placement':'child'},
            ])
        self.assertEqual(block_rows(book)['rows'],before_failure,
            'Failure on the second command must roll back the whole first command')
        self.assertEqual(block_move_state(book)['revision'],4)
        undo=persist_block_edit_batch(book,4,'cm-secondbatch-00000002',[{'action':'undo'}])
        self.assertEqual(undo['revision'],5)
        self.assertTrue(undo['canRedo'])
        branch=persist_block_edit_batch(book,5,'cm-thirdbatch-00000003',[
            {'action':'apply','sourceBlockId':c,'targetBlockId':b,'placement':'before'}])
        self.assertEqual(branch['revision'],6)
        self.assertFalse(branch['canRedo'])
        self.assertEqual(minerujson2block(book)['status'],'unchanged')
        self.assertEqual(minerujson2span(book)['status'],'unchanged')
        self.assertEqual(originals(book),original)
        self.assertEqual(span_rows(book)['rows'],spans)
        self.assertEqual((book/'mineru json'/'source.json').read_bytes(),source)
        self.assertEqual((book/'pdf'/'original.pdf').read_bytes(),pdf)

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
    self.assertEqual(result[11][3],'p1b0s2','Grandchild promoted into one-level sibling')
    self.assertEqual(result[11][1],12,'Promoted BlockID keeps its identity under the target')
    self.assertEqual(result[13][3],'p1b0s0')
    self.assertTrue(all('s' not in row[3] or row[3].count('s')==1 for row in plan['after']))
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
