"""WP04D2: isolated SQLite table ownership; no user DB."""
import shutil
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from test_v2_owned_edit import prepare_owned_book, owned_commit, Stub, structure
import v2_mineru_base as v


class JurisdictionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='v2-jurisdiction-')
        self.folder=Path(self.temp.name)
        self.snapshot=prepare_owned_book(self.folder)
        self.path=self.folder/v.DB_NAME
        with closing(sqlite3.connect(self.path)) as db:
            db.executescript("CREATE TABLE sentence(id INTEGER PRIMARY KEY, body TEXT);"
                             "INSERT INTO sentence VALUES(1,'keep sentence');"
                             "CREATE TABLE translation(id INTEGER PRIMARY KEY, body TEXT);"
                             "INSERT INTO translation VALUES(1,'keep translation');")
            db.commit()
        self.before=self.foreign_evidence()
    def tearDown(self):
        self.temp.cleanup()
    def foreign_evidence(self):
        with closing(sqlite3.connect(self.path)) as db:
            return (db.execute("SELECT * FROM sentence").fetchall(),
                    db.execute("SELECT * FROM translation").fetchall(),
                    db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('sentence','translation') ORDER BY name").fetchall())
    def edit(self):
        with closing(sqlite3.connect(self.path)) as db:
            lid,old=db.execute("SELECT logical_id,md_block FROM logical_block WHERE length(md_block)>0 AND substr(md_block,-1)=char(10) ORDER BY logical_order LIMIT 1").fetchone()
        return owned_commit(self.folder,[dict(logicalId=lid,before=old,after='test '+old)])
    def test_read_edit_import_rebuild_with_foreign_tables(self):
        self.assertEqual(v.existing_markdown(self.folder),self.snapshot)
        state=v.existing_state(self.folder)
        self.assertEqual({t['name'] for t in state['tables']},v.OWN_TABLES)
        with self.assertRaisesRegex(v.BaseError,'不属于 V2'):
            v.existing_state(self.folder,table='sentence')
        self.assertTrue(self.edit()['saved'])
        self.assertEqual(self.foreign_evidence(),self.before)
        edited=v.existing_markdown(self.folder)
        result=v.dispatch('import','POST',self.folder,{'confirm':'import-mineru-base'},{},Stub())
        self.assertFalse(result['replaced'])
        self.assertEqual(v.existing_markdown(self.folder),edited)
        v.rebuild_logical_only(self.folder,dict(workspace=str(self.folder),confirm='initialize-v2-owned-logical'),Stub())
        self.assertEqual(self.foreign_evidence(),self.before)
        with tempfile.TemporaryDirectory(prefix='v2-jurisdiction-fresh-') as temp:
            fresh=Path(temp)
            shutil.copytree(self.folder/'minerujson',fresh/'minerujson')
            v.new_book(fresh,owned=True)
            self.assertEqual(v.existing_markdown(self.folder),v.existing_markdown(fresh))
    def test_whole_container_overwrite_rejected_without_any_change(self):
        before=self.path.read_bytes()
        with self.assertRaisesRegex(v.BaseError,'禁止整库覆盖'):
            v.new_book(self.folder,overwrite=True,owned=True)
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.foreign_evidence(),self.before)
    def test_cross_table_trigger_and_foreign_key_are_rejected(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("CREATE TRIGGER contaminate AFTER UPDATE ON logical_block BEGIN UPDATE sentence SET body='bad'; END")
            db.commit()
        self.assertEqual(v.existing_markdown(self.folder),self.snapshot)
        with self.assertRaisesRegex(v.BaseError,'触发器'):
            self.edit()
        self.assertEqual(self.foreign_evidence(),self.before)
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("DROP TRIGGER contaminate")
            db.execute("CREATE TABLE cross_ref(id INTEGER REFERENCES logical_block(logical_id) ON DELETE CASCADE)")
            db.execute("INSERT INTO cross_ref SELECT logical_id FROM logical_block LIMIT 1")
            db.commit()
            before=db.execute("SELECT * FROM cross_ref").fetchall()
        with self.assertRaisesRegex(v.BaseError,'外键依赖'):
            v.rebuild_logical_only(self.folder,dict(workspace=str(self.folder),confirm='initialize-v2-owned-logical'),Stub())
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute("SELECT * FROM cross_ref").fetchall(),before)
        self.assertEqual(self.foreign_evidence(),self.before)
        self.assertEqual(v.existing_markdown(self.folder),self.snapshot)
    def test_unrelated_broken_foreign_key_does_not_own_v2_validation(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("CREATE TABLE foreign_child(pid INTEGER REFERENCES translation(id))")
            db.execute("INSERT INTO foreign_child VALUES(99)")
            db.commit()
        self.assertTrue(self.edit()['saved'])
        v.rebuild_logical_only(self.folder,dict(workspace=str(self.folder),confirm='initialize-v2-owned-logical'),Stub())
        self.assertEqual(self.foreign_evidence(),self.before)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(db.execute('SELECT * FROM foreign_child').fetchall(),[(99,)])


if __name__=='__main__':
    unittest.main()
