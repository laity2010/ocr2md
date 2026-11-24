"""WP24: explicit fresh init, never migrate old edited content."""
import sys,tempfile,unittest,sqlite3,shutil
from pathlib import Path
from contextlib import closing
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from test_v2_owned_lf import make_book,load,evidence,Stub,FIXTURE
import v2_mineru_base as base
from v2_markdown_roundtrip import OWNED_FORMAT

class FreshOwned(unittest.TestCase):
    def test_explicit_reset_backup_and_rollback(self):
        with tempfile.TemporaryDirectory(prefix='wp24-') as tmp:
            folder=Path(tmp);make_book(folder)
            old=load(folder);raw=evidence(folder)[0]
            original=base.existing_markdown(folder)
            packet=dict(workspace=str(folder),confirm='initialize-v2-owned-logical')
            with patch.object(base,'finish_fresh_owned_logical',side_effect=RuntimeError('injected')):
                with self.assertRaisesRegex(RuntimeError,'injected'):
                    base.dispatch('logical-rebuild','POST',folder,packet,{},Stub())
            self.assertEqual(load(folder),old)
            self.assertEqual(base.existing_markdown(folder),original)
            result=base.dispatch('logical-rebuild','POST',folder,packet,{},Stub())
            self.assertEqual(result['schema'],OWNED_FORMAT)
            self.assertEqual(result['logicalCount'],267)
            self.assertTrue(result['backupFile'])
            with closing(sqlite3.connect(folder/result['backupFile'])) as backup:
                self.assertEqual(backup.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertEqual(backup.execute('SELECT md_block FROM logical_block ORDER BY logical_order').fetchall(),
                                 [(r.markdown_text,) for r in old])
                self.assertEqual(backup.execute('PRAGMA user_version').fetchone()[0],0)
            self.assertEqual(evidence(folder)[0],raw)
            snapshot=base.existing_markdown(folder)
            self.assertEqual(snapshot['schema'],OWNED_FORMAT)
            self.assertEqual(snapshot['markdown'],''.join(r.markdown_text for r in load(folder)))
            self.assertNotIn('手工修改',snapshot['markdown'])
            self.assertNotIn('新标题',snapshot['markdown'])
            again=base.dispatch('logical-rebuild','POST',folder,packet,{},Stub())
            self.assertEqual(base.existing_markdown(folder),snapshot)
            self.assertNotEqual(again['backupFile'],result['backupFile'])
            with self.assertRaisesRegex(base.BaseError,'禁止旧版'):
                base.rebuild_logical_only(folder,dict(workspace=str(folder),confirm='rebuild-v2-logical-only'),Stub())
    def test_import_fresh_and_preserve_existing(self):
        with tempfile.TemporaryDirectory(prefix='wp24-new-') as tmp:
            folder=Path(tmp);(folder/'minerujson').mkdir()
            shutil.copyfile(FIXTURE,folder/'minerujson'/FIXTURE.name)
            packet=dict(workspace=str(folder),confirm='import-mineru-base')
            self.assertTrue(base.dispatch('import','POST',folder,packet,{},Stub())['created'])
            snap=base.existing_markdown(folder)
            self.assertEqual(snap['schema'],OWNED_FORMAT)
            self.assertFalse(base.dispatch('import','POST',folder,packet,{},Stub())['created'])
            self.assertEqual(base.existing_markdown(folder),snap)
            self.assertEqual(len(evidence(folder)[2]),2)
if __name__=='__main__':unittest.main()
