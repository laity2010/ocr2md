"""WP02: work only in disposable SQL + MinerUJSON fixtures, never user files."""
from contextlib import closing
from pathlib import Path
import hashlib,json,shutil,sqlite3,sys,tempfile,types,io
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
        base.new_book(self.folder)
        self.db_path=self.folder/base.DB_NAME
    def tearDown(self):self.tmp.cleanup()
    def test_explicit_init_exact_224_preserves_base_and_source(self):
        with closing(sqlite3.connect(self.db_path)) as db:
            before=list(db.execute('SELECT * FROM mineru_base ORDER BY blockid'))
        baseline=base.existing_state(self.folder,table='logical_block')
        self.assertEqual(baseline['rowCount'],0)
        a=StubF02()
        result=base.dispatch('logical-init','POST',self.folder,
                {'confirm':'initialize-logical'},{},a)
        self.assertTrue(result['created']);self.assertFalse(result['preserved'])
        self.assertEqual(result['logicalCount'],224)
        self.assertFalse(result['baseChanged'])
        self.assertEqual(a.probes,1)
        with closing(sqlite3.connect(self.db_path)) as db:
            db.row_factory=sqlite3.Row
            self.assertEqual(len(list(db.execute('SELECT * FROM mineru_base'))),540)
            self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},{'mineru_base','logical_block'})
            after=[tuple(x) for x in db.execute('SELECT * FROM mineru_base ORDER BY blockid')]
            self.assertEqual(before,after)
            base_rows=list(db.execute('SELECT blockid,block_group,block_json FROM mineru_base WHERE blockid>0 ORDER BY blockid'))
            wanted=initial_rows(base_rows)
            actual=[tuple(r) for r in db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,markdown_text FROM logical_block ORDER BY logical_order')]
            self.assertEqual(actual,[(r.logical_id,r.base_blockid,r.parent_id,r.logical_order,r.markdown_text) for r in wanted])
            self.assertFalse(list(db.execute('PRAGMA foreign_key_check')))
        logical=base.existing_state(self.folder,table='logical_block')
        self.assertEqual(logical['rowCount'],224)
        self.assertEqual(len(logical['rows']),120)
        self.assertEqual(len(base.existing_state(self.folder,offset=120,table='logical_block')['rows']),104)
        self.assertEqual(self.source.read_bytes(),self.original)
        for suf in ('-wal','-shm','-journal'):self.assertFalse((self.folder/(base.DB_NAME+suf)).exists())
    def test_reinit_idempotent_and_protect_future_edit(self):
        adapter=StubF02()
        self.assertTrue(base.dispatch('logical-init','POST',self.folder,{'confirm':'initialize-logical'},{},adapter)['created'])
        with closing(sqlite3.connect(self.db_path)) as db:
            db.execute("UPDATE logical_block SET markdown_text='hand edited' WHERE logical_order=1");db.commit()
        outcome=base.dispatch('logical-init','POST',self.folder,{'confirm':'initialize-logical'},{},adapter)
        self.assertFalse(outcome['created']);self.assertTrue(outcome['preserved'])
        self.assertEqual(outcome['logicalCount'],224)
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute('SELECT markdown_text FROM logical_block WHERE logical_order=1').fetchone()[0],'hand edited')
        self.assertEqual(adapter.probes,2)
    def test_unapproved_and_changed_source_fail_closed(self):
        with self.assertRaisesRegex(base.BaseError,'确认'):
            base.dispatch('logical-init','POST',self.folder,{}, {},StubF02())
        self.assertEqual(base.existing_state(self.folder,table='logical_block')['rowCount'],0)
        before=self.db_path.read_bytes()
        self.source.write_bytes(self.original+b' ')
        with self.assertRaisesRegex(base.BaseError,'来源'):
            base.dispatch('logical-init','POST',self.folder,{'confirm':'initialize-logical'},{},StubF02())
        self.assertEqual(self.db_path.read_bytes(),before)
        self.assertEqual(base.existing_state(self.folder,table='logical_block')['rowCount'],0)
        # Existing latest logical state must not be silently overwritten by import.
        self.source.write_bytes(self.original)
        base.dispatch('logical-init','POST',self.folder,{'confirm':'initialize-logical'},{},StubF02())
        self.source.write_bytes(self.original+b' ')
        with self.assertRaisesRegex(base.BaseError,'禁止自动覆盖'):
            base.dispatch('import','POST',self.folder,{'confirm':'import-mineru-base'},{},StubF02())
        self.assertEqual(base.existing_state(self.folder,table='logical_block')['rowCount'],224)
    def test_http_auth_and_confirm_gate(self):
        def call(cookie,origin,confirm):
            req={'workspace':str(self.folder),'confirm':confirm}
            payload=json.dumps(req).encode()
            responses=[]
            handler=types.SimpleNamespace(command='POST',headers={'Origin':origin,'Cookie':cookie,
                'Content-Length':str(len(payload))},rfile=io.BytesIO(payload),
                respond=lambda status,data,*args:responses.append((status,json.loads(data))))
            base.handle(handler,'logical-init',types.SimpleNamespace(query=''),f02)
            return responses[0]
        with patch.object(f02,'authorized_roots',side_effect=lambda cookie:
            [self.folder] if cookie=='yes' else (_ for _ in ()).throw(f02.WorkspaceIOError(403,'未授权'))):
            self.assertEqual(call('no','https://ocr2md.laity.bid','initialize-logical')[0],403)
            self.assertEqual(call('yes','https://evil.invalid','initialize-logical')[0],403)
            self.assertEqual(call('yes','https://ocr2md.laity.bid','wrong')[0],422)
            self.assertEqual(base.existing_state(self.folder,table='logical_block')['rowCount'],0)
            self.assertEqual(call('yes','https://ocr2md.laity.bid','initialize-logical')[1]['logicalCount'],224)
if __name__=='__main__':unittest.main()
