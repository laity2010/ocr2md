"""WP23F exact atomic storage, only disposable fixture."""
import sys,tempfile,unittest,sqlite3
from pathlib import Path
from contextlib import closing
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from test_v2_owned_edit import prepare_owned_book,structure,load,base,Stub

def packet(folder):
    rows=load(folder);first,second=rows[:2]
    assert first.s==second.s==0 and first.b!=second.b
    old=structure(folder)
    a,b=old[:2]
    after={**b,'p':a['p'],'b':a['b'],'s':1,'parentId':a['logicalId']}
    return dict(workspace=str(folder),confirm='commit-v2-owned-structure',
        changes=[dict(logicalId=b['logicalId'],before={k:b[k] for k in base.STRUCTURE_FIELDS},
            after={k:after[k] for k in base.STRUCTURE_FIELDS})],
        expectedStructure=old,
        expectedBoundaryText=[dict(logicalId=a['logicalId'],before=first.markdown_text)],
        textChanges=[dict(logicalId=a['logicalId'],before=first.markdown_text,
                          after=first.markdown_text.rstrip('\n')+'\n')])

class OwnedStructureTest(unittest.TestCase):
    def test_atomic_merge_conflict_invalid_and_reopen(self):
        with tempfile.TemporaryDirectory(prefix='wp23f-') as root:
            folder=Path(root);original=prepare_owned_book(folder)
            old=load(folder);pdf_before=base.existing_pdf_map(folder)
            payload=packet(folder)
            # Reject a missing unchanged-or-changed boundary CAS.
            with self.assertRaisesRegex(base.BaseError,'快照不完整'):
                base.commit_structure(folder,{**payload,'expectedBoundaryText':[]},Stub())
            stale=[dict(payload['expectedBoundaryText'][0],before='wrong')]
            with self.assertRaisesRegex(base.BaseError,'边界正文已变化'):
                base.commit_structure(folder,{**payload,'expectedBoundaryText':stale},Stub())
            bad=[dict(payload['textChanges'][0],after='no LF')]
            with self.assertRaisesRegex(base.BaseError,'结构事务被拒绝'):
                base.commit_structure(folder,{**payload,'textChanges':bad},Stub())
            self.assertEqual(load(folder),old,'after SQL updates, failed validation rolls back both structure and text')
            self.assertEqual(base.existing_markdown(folder),original)
            result=base.commit_structure(folder,payload,Stub())
            self.assertEqual((result['changedRows'],result['textChangedRows']),(1,1))
            new=load(folder)
            self.assertEqual(new[0].markdown_text,old[0].markdown_text.rstrip('\n')+'\n')
            self.assertEqual(new[1].parent_id,old[0].logical_id)
            self.assertEqual(new[1].markdown_text,old[1].markdown_text)
            self.assertEqual(new[2:],old[2:])
            def geometry(snapshot):
                return {r['logicalId']:(r['physicalPageIndex'],r['bbox']) for r in snapshot['covers']}
            self.assertEqual(geometry(pdf_before),geometry(base.existing_pdf_map(folder)))
            with self.assertRaisesRegex(base.BaseError,'结构已变化'):
                base.commit_structure(folder,payload,Stub())
            self.assertEqual(load(folder),new)
            # Undo after save is itself an atomic, verified inverse.
            inverse={**payload,'expectedStructure':structure(folder),
                     'expectedBoundaryText':[dict(logicalId=new[0].logical_id,before=new[0].markdown_text)],
                     'changes':[dict(logicalId=c['logicalId'],before=c['after'],after=c['before']) for c in payload['changes']],
                     'textChanges':[dict(logicalId=c['logicalId'],before=c['after'],after=c['before']) for c in payload['textChanges']]}
            base.commit_structure(folder,inverse,Stub())
            self.assertEqual(base.existing_markdown(folder),original)
            self.assertEqual(load(folder),old)
if __name__=='__main__':unittest.main()
