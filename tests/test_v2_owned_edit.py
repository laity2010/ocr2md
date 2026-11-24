"""WP23E isolated owned-LF editor backend. No user workspace access."""
import sys,tempfile,sqlite3,unittest
from pathlib import Path
from contextlib import closing
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from test_v2_owned_lf import make_book,load,evidence,commit,Stub
import v2_mineru_base as base
from v2_markdown_roundtrip import preview_owned_migration,OWNED_FORMAT

def prepare_owned_book(folder):
    # Only for disposable test directories; not a production migration API.
    make_book(folder)
    plan=preview_owned_migration(load(folder))
    commit(folder,plan['changes'])
    with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
        db.execute('PRAGMA user_version='+str(base.OWNED_LF_VERSION));db.commit()
    return base.existing_markdown(folder)

def structure(folder):
    return [dict(logicalId=r.logical_id,parentId=r.parent_id,logicalOrder=r.logical_order,
                 p=r.p,b=r.b,s=r.s) for r in load(folder)]

def owned_commit(folder,changes,expected=None):
    return base.commit_md(folder,dict(workspace=str(folder),confirm='commit-v2-owned-md',
        changes=changes,expectedStructure=structure(folder) if expected is None else expected),Stub())

class OwnedEditTest(unittest.TestCase):
    def test_marked_book_real_edits_guards_and_reopen(self):
        with tempfile.TemporaryDirectory(prefix='wp23e-sql-') as temp:
            folder=Path(temp)
            original=prepare_owned_book(folder);self.assertEqual(original['schema'],OWNED_FORMAT)
            before=load(folder);identity=evidence(folder)
            row=before[1];text=row.markdown_text
            after=text[:-1]+'## 新标题😀\n\n'
            change=dict(logicalId=row.logical_id,before=text,after=after)
            with self.assertRaises(base.BaseError):commit(folder,[change])
            wrong=structure(folder);wrong[0]['b']+=1
            with self.assertRaisesRegex(base.BaseError,'PBS 结构已变化'):
                owned_commit(folder,[change],wrong)
            with self.assertRaisesRegex(base.BaseError,'块归属'):
                owned_commit(folder,[dict(change,after='no real end')])
            self.assertEqual(load(folder),before)
            self.assertEqual(owned_commit(folder,[change])['changedRows'],1)
            self.assertEqual(load(folder)[1].markdown_text,after)
            self.assertEqual(base.existing_markdown(folder)['schema'],OWNED_FORMAT)
            self.assertEqual(evidence(folder),identity)
            with self.assertRaisesRegex(base.BaseError,'其他会话'):
                owned_commit(folder,[change])
            self.assertEqual(owned_commit(folder,[dict(logicalId=row.logical_id,before=after,after=text)])['changedRows'],1)
            self.assertEqual(base.existing_markdown(folder),original)
            # Legacy writer must never destroy real LF in this DB.
            old=structure(folder)[1];new={**old,'b':old['b']+1000}
            with self.assertRaisesRegex(base.BaseError,'WP23F'):
                base.commit_structure(folder,dict(workspace=str(folder),confirm='commit-v2-structure',
                    changes=[dict(logicalId=row.logical_id,before={k:old[k] for k in base.STRUCTURE_FIELDS},
                      after={k:new[k] for k in base.STRUCTURE_FIELDS})]),Stub())
            with self.assertRaisesRegex(base.BaseError,'禁止旧版'):
                base.rebuild_logical_only(folder,dict(workspace=str(folder),confirm='rebuild-v2-logical-only'),Stub())
            self.assertEqual(load(folder),before)
    def test_unmarked_book_never_implicitly_migrates(self):
        with tempfile.TemporaryDirectory(prefix='wp23e-legacy-') as temp:
            folder=Path(temp);make_book(folder)
            original=base.existing_markdown(folder);before=load(folder)
            row=before[1];change=dict(logicalId=row.logical_id,before=row.markdown_text,after=row.markdown_text+'\n\n')
            with self.assertRaisesRegex(base.BaseError,'协议与数据库不一致'):
                owned_commit(folder,[change])
            self.assertEqual(base.existing_markdown(folder),original)
            self.assertEqual(load(folder),before)

if __name__=='__main__':unittest.main()
