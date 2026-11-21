"""V2 auto-init contracts: use disposable books, never the user's SQL/JSON."""
from contextlib import closing
from pathlib import Path
import json,shutil,sqlite3,sys,tempfile,types,io
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as base
import frame_workspace_io as f02
from v2_logical_contract import initial_rows

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class StubF02:
    def __init__(self):self.probes=0
    def probe(self,folder):self.probes+=1

class LogicalInitTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='wp02-v2-')
        self.folder=Path(self.tmp.name)
        (self.folder/'minerujson').mkdir()
        self.source=self.folder/'minerujson'/FIXTURE.name
        shutil.copyfile(FIXTURE,self.source)
        self.original=self.source.read_bytes()
        self.db_path=self.folder/base.DB_NAME
    def tearDown(self):self.tmp.cleanup()
    def import_book(self):
        return base.dispatch('import','POST',self.folder,
            {'confirm':'import-mineru-base'},{},StubF02())
    def test_single_import_creates_base_and_logical_atomically(self):
        adapter=StubF02()
        result=base.dispatch('import','POST',self.folder,
            {'confirm':'import-mineru-base'},{},adapter)
        self.assertTrue(result['created'])
        self.assertEqual((result['blockCount'],result['logicalCount']),(539,224))
        self.assertEqual(adapter.probes,1)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.row_factory=sqlite3.Row
            self.assertEqual(db.execute('SELECT count(*) FROM mineru_base').fetchone()[0],540)
            self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                {'mineru_base','logical_block'})
            originals=list(db.execute('SELECT blockid,block_group,block_json FROM mineru_base WHERE blockid>0 ORDER BY blockid'))
            expected=initial_rows(originals)
            actual=[tuple(r) for r in db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,markdown_text FROM logical_block ORDER BY logical_order')]
            self.assertEqual(len(actual),224)
            self.assertEqual(actual,[(r.logical_id,r.base_blockid,r.parent_id,r.logical_order,r.markdown_text) for r in expected])
            self.assertFalse(list(db.execute('PRAGMA foreign_key_check')))
        self.assertEqual(self.source.read_bytes(),self.original)
        self.assertFalse(list(self.folder.glob('.ocr2md-v2-*.tmp')))
        self.assertEqual(self.import_book()['logicalCount'],224)
        for suf in ('-wal','-shm','-journal'):self.assertFalse((self.folder/(base.DB_NAME+suf)).exists())
    def test_previous_empty_logical_table_is_auto_backfilled_without_base_change(self):
        base.new_book(self.folder)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('DELETE FROM logical_block');db.commit()
            before=list(db.execute('SELECT * FROM mineru_base ORDER BY blockid'))
        self.assertEqual(base.existing_state(self.folder)['logicalCount'],0)
        adapter=StubF02()
        result=base.dispatch('import','POST',self.folder,{'confirm':'import-mineru-base'},{},adapter)
        self.assertFalse(result['created']);self.assertFalse(result['replaced'])
        self.assertTrue(result['backfilled']);self.assertEqual(result['logicalCount'],224)
        self.assertEqual(adapter.probes,1)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(list(db.execute('SELECT * FROM mineru_base ORDER BY blockid')),before)
            self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],224)
        repeat=self.import_book()
        self.assertFalse(repeat['backfilled']);self.assertEqual(repeat['logicalCount'],224)
    def test_reopen_preserves_latest_user_edited_logic(self):
        self.import_book()
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("UPDATE logical_block SET markdown_text='hand edited' WHERE logical_order=1")
            db.commit()
            before=list(db.execute('SELECT * FROM logical_block ORDER BY logical_order'))
        outcome=self.import_book()
        self.assertFalse(outcome['created']);self.assertFalse(outcome['backfilled'])
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(list(db.execute('SELECT * FROM logical_block ORDER BY logical_order')),before)
    def test_no_partial_new_database_if_initial_mapping_fails(self):
        with patch.object(base,'write_initial_logical',side_effect=ValueError('injected')):
            with self.assertRaisesRegex(ValueError,'injected'):
                self.import_book()
        self.assertFalse(self.db_path.exists())
        self.assertFalse(list(self.folder.glob('.ocr2md-v2-*.tmp')))
        self.assertEqual(self.source.read_bytes(),self.original)
    def test_changed_source_and_denied_confirm_never_mutate_existing_state(self):
        self.import_book()
        old=self.db_path.read_bytes()
        self.source.write_bytes(self.original+b' ')
        with self.assertRaisesRegex(base.BaseError,'禁止自动覆盖'):
            self.import_book()
        self.assertEqual(self.db_path.read_bytes(),old)
        self.source.write_bytes(self.original)
        with self.assertRaisesRegex(base.BaseError,'确认'):
            base.dispatch('import','POST',self.folder,{}, {},StubF02())
        self.assertEqual(self.db_path.read_bytes(),old)
    def test_bad_source_rejected_on_old_empty_backfill(self):
        self.import_book()
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute('DELETE FROM logical_block');db.commit()
        before=self.db_path.read_bytes()
        self.source.write_bytes(self.original+b' ')
        # If old base and source differ, a rebuilt database is permitted only
        # when there is no latest logical state to preserve; it is not an
        # in-place backfill of obsolete source rows.
        outcome=self.import_book()
        self.assertTrue(outcome['replaced']);self.assertEqual(outcome['logicalCount'],224)
        self.assertNotEqual(self.db_path.read_bytes(),before)
    def test_valid_empty_paragraph_source_is_a_valid_zero_row_logical_table(self):
        import json
        doc=json.loads(self.original)
        for page in doc['pdf_info']:
            page['para_blocks']=[]
        self.source.write_text(json.dumps(doc,ensure_ascii=False))
        result=self.import_book()
        self.assertEqual(result['logicalCount'],0)
        state=base.existing_state(self.folder)
        self.assertEqual(state['paraBlockCount'],0)
        self.assertEqual(state['logicalCount'],0)
        self.assertEqual(state['tables'][1]['name'],'logical_block')
        self.assertEqual(base.existing_state(self.folder,table='logical_block')['rows'],[])
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],0)
        repeat=self.import_book()
        self.assertEqual(repeat['logicalCount'],0)
        self.assertFalse(repeat['replaced'])

    def test_unauthorized_legacy_initializer_is_gone(self):
        self.assertFalse(self.db_path.exists())
        with self.assertRaisesRegex(base.BaseError,'未知'):
            base.dispatch('logical-init','POST',self.folder,
                {'confirm':'initialize-logical'},{},StubF02())
        self.assertFalse(self.db_path.exists())

    def test_http_auth_and_confirm_gate_for_combined_import(self):
        def call(cookie,origin,confirm):
            req={'workspace':str(self.folder),'confirm':confirm}
            payload=json.dumps(req).encode()
            responses=[]
            handler=types.SimpleNamespace(command='POST',headers={'Origin':origin,'Cookie':cookie,
                'Content-Length':str(len(payload))},rfile=io.BytesIO(payload),
                respond=lambda status,data,*args:responses.append((status,json.loads(data))))
            base.handle(handler,'import',types.SimpleNamespace(query=''),f02)
            return responses[0]
        with patch.object(f02,'authorized_roots',side_effect=lambda cookie:
            [self.folder] if cookie=='yes' else (_ for _ in ()).throw(f02.WorkspaceIOError(403,'未授权'))):
            self.assertEqual(call('no','https://ocr2md.laity.bid','import-mineru-base')[0],403)
            self.assertEqual(call('yes','https://evil.invalid','import-mineru-base')[0],403)
            self.assertEqual(call('yes','https://ocr2md.laity.bid','wrong')[0],422)
            self.assertFalse(self.db_path.exists())
            result=call('yes','https://ocr2md.laity.bid','import-mineru-base')
            self.assertEqual(result[0],200)
            self.assertEqual(result[1]['logicalCount'],224)
if __name__=='__main__':unittest.main()
