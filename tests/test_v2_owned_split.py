"""WP23G atomic split inventory: disposable fixture only."""
import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from test_v2_owned_edit import prepare_owned_book,structure,load,base,Stub
from test_v2_owned_lf import evidence

def packet(folder,updates,remove=()):
    old=load(folder)
    return dict(workspace=str(folder),confirm='commit-v2-owned-inventory',
        expectedStructure=structure(folder),
        expectedTextSha256=base.sha(base.compact([[r.logical_id,r.markdown_text] for r in old]).encode()),
        upserts=updates,removeIds=list(remove))
def row(r):
    return dict(logicalId=r.logical_id,baseBlockId=r.base_blockid,parentId=r.parent_id,
        logicalOrder=r.logical_order,p=r.p,b=r.b,s=r.s,blockType=r.block_type,markdownText=r.markdown_text)
def geom(pdf):
    return {r['logicalId']:(r['physicalPageIndex'],r['bbox']) for r in pdf['covers']}

class SplitTest(unittest.TestCase):
    def test_split_atomic_undo_redo_and_provenance(self):
        with tempfile.TemporaryDirectory(prefix='wp23g-') as root:
            folder=Path(root);initial=prepare_owned_book(folder)
            old=load(folder);old_geometry=geom(base.existing_pdf_map(folder))
            before=evidence(folder);target=old[0];new_id=2**48+33
            self.assertEqual(target.logical_id,23)
            self.assertEqual(target.s,0)
            left,right=target.markdown_text.split('\n\n',1)
            new=[dict(row(target),markdownText=left+'\n\n'),
                 dict(row(target),logicalId=new_id,logicalOrder=2,b=target.b+1,
                      blockType='text',markdownText=right)]
            new.extend(dict(row(r),logicalOrder=r.logical_order+1,
                           b=r.b+1 if r.p==target.p else r.b) for r in old[1:])
            payload=packet(folder,new)
            bad=dict(payload,expectedTextSha256='0'*64)
            with self.assertRaisesRegex(base.BaseError,'正文或结构已变化'):base.commit_structure(folder,bad,Stub())
            self.assertEqual(load(folder),old)
            invalid=[*new];invalid[1]=dict(invalid[1],markdownText='no LF')
            with self.assertRaisesRegex(base.BaseError,'分割原子事务被拒绝'):
                base.commit_structure(folder,dict(payload,upserts=invalid),Stub())
            self.assertEqual(load(folder),old)
            result=base.commit_structure(folder,payload,Stub())
            self.assertEqual(result['logicalCount'],268)
            self.assertEqual(base.existing_markdown(folder)['markdown'],initial['markdown'])
            pdf=base.existing_pdf_map(folder);self.assertEqual(geom(pdf),old_geometry)
            self.assertIn(new_id,pdf['unmappedLogicalIds'])
            self.assertEqual(pdf['mappedCount'],267)
            sql=base.existing_state(folder,table='logical_block')
            rec=next(r for r in sql['rows'] if r['logical_id']==new_id)
            self.assertIsNone(rec['raw_path']);self.assertIsNone(rec['raw_block'])
            self.assertEqual(rec['base_blockid'],target.base_blockid)
            with self.assertRaisesRegex(base.BaseError,'不能删除原始'):
                base.commit_structure(folder,packet(folder,[],[target.logical_id]),Stub())
            undo=packet(folder,[row(r) for r in old],[new_id])
            self.assertEqual(base.commit_structure(folder,undo,Stub())['logicalCount'],267)
            self.assertEqual(base.existing_markdown(folder),initial)
            self.assertEqual(evidence(folder),before)
            redo=packet(folder,new)
            self.assertEqual(base.commit_structure(folder,redo,Stub())['logicalCount'],268)
            self.assertIn(new_id,base.existing_pdf_map(folder)['unmappedLogicalIds'])

if __name__=='__main__':unittest.main()
