"""WP07 logical-only local SQL commit, optimistic guards, rollback and raw bytes."""
from pathlib import Path
import sys, tempfile, shutil, sqlite3
from contextlib import closing
import unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
def shape(row):
    return dict(parentId=row['parent_id'],logicalOrder=row['logical_order'],
        p=row['p'],b=row['b'],s=row['s'])
class Authorized:
    def probe(self,folder):assert folder.is_dir()

class StructureCommit(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.book=Path(self.tmp.name)
        path=self.book/'minerujson';path.mkdir()
        shutil.copyfile(FIXTURE,path/'fixture.json')
        v.new_book(self.book)
        self.db=self.book/v.DB_NAME
        with closing(sqlite3.connect(self.db)) as db:
            db.row_factory=sqlite3.Row
            self.original=[dict(r) for r in db.execute('SELECT * FROM logical_block ORDER BY logical_order')]
            self.raw=[tuple(r) for r in db.execute('SELECT * FROM mineru_base ORDER BY blockid')]
    def tearDown(self):self.tmp.cleanup()
    def records(self):
        with closing(sqlite3.connect(self.db)) as db:
            db.row_factory=sqlite3.Row
            return [dict(r) for r in db.execute('SELECT * FROM logical_block ORDER BY logical_order')]
    def commit(self,changes):
        return v.commit_structure(self.book,{'confirm':'commit-v2-structure','changes':changes},Authorized())
    def change(self,row,**updates):
        before=shape(row);return dict(logicalId=row['logical_id'],
            before=before,after={**before,**updates})
    def test_child_local_pbs_and_undo_after_commit(self):
        a,b=self.original[0],self.original[1]
        self.assertEqual((a['p'],a['b'],a['s']),(0,0,0))
        self.assertEqual((b['p'],b['s']),(0,0))
        c=self.change(b,p=a['p'],b=a['b'],s=1,parentId=a['logical_id'])
        result=self.commit([c]);self.assertEqual(result['changedRows'],1)
        actual=self.records()
        assert actual[1]['parent_id']==a['logical_id']
        self.assertEqual((actual[1]['p'],actual[1]['b'],actual[1]['s']),(0,0,1))
        self.assertEqual([(r['p'],r['b'],r['s']) for r in actual[2:]],
            [(r['p'],r['b'],r['s']) for r in self.original[2:]])
        self.assertEqual([(r['markdown_text'],r['base_blockid']) for r in actual],
            [(r['markdown_text'],r['base_blockid']) for r in self.original])
        self.assertEqual(self.commit([{'logicalId':c['logicalId'],'before':c['after'],'after':c['before']}])['changedRows'],1)
        self.assertEqual(self.records(),self.original)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM mineru_base ORDER BY blockid')],self.raw)
    def test_cross_page_group_and_collision_rollback(self):
        a=next(r for r in self.original if r['p']==0)
        b=next(r for r in self.original if r['p']==1)
        c=self.change(b,p=a['p'],b=a['b'],s=1,parentId=a['logical_id'])
        self.commit([c])
        with self.assertRaisesRegex(v.BaseError,'其他会话'):
            self.commit([c])
        assert self.records()[self.original.index(b)]['parent_id']==a['logical_id']
        # Existing s1 cannot be overwritten by an unrelated block.
        d=next(r for r in self.original if r['p']==1 and r['logical_id']!=b['logical_id'])
        with self.assertRaises((v.BaseError,sqlite3.IntegrityError)):
            self.commit([self.change(d,p=a['p'],b=a['b'],s=1,parentId=a['logical_id'])])
        self.assertEqual(self.records()[self.original.index(d)]['p'],d['p'])
    def test_two_children_sibling_swap_uses_single_atomic_transaction(self):
        a,b,c=self.original[:3]
        self.commit([self.change(b,b=a['b'],s=1,parentId=a['logical_id']),
                     self.change(c,b=a['b'],s=2,parentId=a['logical_id'])])
        current=self.records()
        b2=next(row for row in current if row['logical_id']==b['logical_id'])
        c2=next(row for row in current if row['logical_id']==c['logical_id'])
        result=self.commit([
            self.change(b2,s=2,logicalOrder=c2['logical_order']),
            self.change(c2,s=1,logicalOrder=b2['logical_order']),
        ])
        self.assertEqual(result['changedRows'],2)
        after=self.records()
        self.assertEqual([row['logical_id'] for row in after[:3]],
            [a['logical_id'],c['logical_id'],b['logical_id']])
        self.assertEqual([row['s'] for row in after[:3]],[0,1,2])
        self.assertEqual([(row['p'],row['b'],row['s']) for row in after[3:]],
            [(row['p'],row['b'],row['s']) for row in self.original[3:]])
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM sqlite_master WHERE type="table"').fetchone()[0],2)
            self.assertEqual([tuple(row) for row in db.execute('SELECT * FROM mineru_base ORDER BY blockid')],self.raw)
    def test_wp07_p1b3_after_p1b4_shifts_every_later_b_and_undo(self):
        """A parent carries all original typed children in ONE transaction."""
        a=next(row for row in self.original if (row['p'],row['b'],row['s'])==(1,3,0))
        b=next(row for row in self.original if (row['p'],row['b'],row['s'])==(1,4,0))
        tail=[row for row in self.original if row['p']==1 and row['b']>=5]
        self.assertGreater(len(tail),1)
        family=[row for row in self.original if row['p']==1 and row['b']==3]
        family_ids={row['logical_id'] for row in family}
        moved=[row for row in self.original if row['logical_id'] not in family_ids]
        slot=max(i for i,row in enumerate(moved) if row['p']==b['p'] and row['b']==b['b'])+1
        moved[slot:slot]=family
        orders={row['logical_id']:i+1 for i,row in enumerate(moved)}
        changes=[]
        for row in self.original:
            new_b=5 if row['logical_id'] in family_ids else (
                row['b']+1 if row['p']==1 and row['b']>=5 else row['b'])
            proposal=self.change(row,b=new_b,logicalOrder=orders[row['logical_id']])
            if proposal['before']!=proposal['after']:changes.append(proposal)
        result=self.commit(changes)
        self.assertEqual(result['changedRows'],len(changes))
        updated=self.records()
        records={row['logical_id']:row for row in updated}
        self.assertEqual(records[a['logical_id']]['b'],5)
        self.assertEqual(records[b['logical_id']]['b'],4)
        for row in tail:self.assertEqual(records[row['logical_id']]['b'],row['b']+1)
        for row in self.original:
            self.assertEqual(records[row['logical_id']]['markdown_text'],row['markdown_text'])
            self.assertEqual(records[row['logical_id']]['base_blockid'],row['base_blockid'])
            if row['p']!=1:self.assertEqual(records[row['logical_id']]['b'],row['b'])
        self.assertEqual([r['logical_id'] for r in updated],
            [r['logical_id'] for r in moved])
        reverse=[dict(logicalId=change['logicalId'],before=change['after'],
                      after=change['before']) for change in changes]
        self.assertEqual(self.commit(reverse)['changedRows'],len(reverse))
        self.assertEqual(self.records(),self.original)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual([tuple(row) for row in db.execute(
                'SELECT * FROM mineru_base ORDER BY blockid')],self.raw)
    def test_rejects_corrupt_payload_without_modify(self):
        a,b=self.original[:2]
        bad=self.change(b,p=a['p'],b=a['b'],s=1,parentId=999999)
        with self.assertRaisesRegex(v.BaseError,'结构事务'):
            self.commit([bad])
        self.assertEqual(self.records(),self.original)
        with self.assertRaisesRegex(v.BaseError,'缺少'):
            v.commit_structure(self.book,{'changes':[bad]},Authorized())

if __name__=='__main__':unittest.main()
