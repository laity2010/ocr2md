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
            for request in (payload,packet(folder,[],[target.logical_id]),dict(payload,expectedTextSha256='0'*64)):
                with self.assertRaisesRegex(base.BaseError,'已退役'):
                    base.commit_structure(folder,request,Stub())
                self.assertEqual(load(folder),old)
                self.assertEqual(evidence(folder),before)
                self.assertEqual(geom(base.existing_pdf_map(folder)),old_geometry)
            # Reproduce an old WP23G persisted synthetic row in a disposable
            # fixture only, never via a production write interface.
            import sqlite3
            from contextlib import closing
            with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
                db.execute('UPDATE logical_block SET b=b+1000 WHERE p=?',(target.p,))
                for r in new:
                    if r['logicalId']==new_id:
                        db.execute('INSERT INTO logical_block(logical_id,base_blockid,parent_id,logical_order,md_block,p,b,s,block_type,raw_path) VALUES(?,?,?,?,?,?,?,?,?,NULL)',
                        (new_id,r['baseBlockId'],r['parentId'],r['logicalOrder'],r['markdownText'],r['p'],r['b'],r['s'],r['blockType']))
                    else:
                        db.execute('UPDATE logical_block SET logical_order=?,b=?,md_block=? WHERE logical_id=?',(r['logicalOrder'],r['b'],r['markdownText'],r['logicalId']))
                db.commit()
            existing=base.existing_markdown(folder)
            self.assertEqual(existing['markdown'],initial['markdown'])
            self.assertIn(new_id,base.existing_pdf_map(folder)['unmappedLogicalIds'])
            self.assertEqual(geom(base.existing_pdf_map(folder)),old_geometry)
            with self.assertRaisesRegex(base.BaseError,'仅可只读'):
                base.commit_md(folder,dict(workspace=str(folder),confirm='commit-v2-owned-md',expectedStructure=structure(folder),
                    changes=[dict(logicalId=new_id,before=right,after='X\n\n')]),Stub())
            self.assertEqual(base.existing_markdown(folder),existing)

if __name__=='__main__':unittest.main()
