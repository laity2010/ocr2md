"""Direct API acceptance: exact bytes, integer IDs, 2 tables and atomic old-db replace."""
import base64
import hashlib
import io
import types
from unittest.mock import patch
import json
from pathlib import Path
from contextlib import closing
import shutil
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v
import frame_workspace_io as f02
import frame_access

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class StubF02:
    calls=0
    def probe(self,path):self.calls+=1

class MineruBaseTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.book=Path(self.temp.name)
        self.folder=self.book/'minerujson';self.folder.mkdir()
        self.source=self.folder/FIXTURE.name
        shutil.copyfile(FIXTURE,self.source)
        self.original=self.source.read_bytes()
    def tearDown(self):self.temp.cleanup()
    def test_lossless_source_archive_and_every_raw_group(self):
        adapter=StubF02()
        created=v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},adapter)
        self.assertTrue(created['created']);self.assertEqual(adapter.calls,1)
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).digest(),hashlib.sha256(self.original).digest())
        db=sqlite3.connect(self.book/v.DB_NAME)
        self.assertEqual({row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
            {'mineru_base','logical_block'})
        self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],224)
        blocks=db.execute('SELECT blockid,block_group,source_json_path,block_json FROM mineru_base WHERE blockid>0 ORDER BY blockid').fetchall()
        self.assertEqual(len(blocks),539)
        self.assertEqual([r[0] for r in blocks],list(range(1,540)))
        self.assertEqual(set(r[1] for r in blocks),set(v.BLOCK_LISTS))
        original_json=json.loads(self.original)
        for ident,group,path,text in blocks:
            pageidx=int(path.split('.pdf_info[')[1].split(']')[0])
            i=int(path.rsplit('[',1)[1][:-1])
            self.assertEqual(json.loads(text),original_json['pdf_info'][pageidx][group][i])
        archive=json.loads(db.execute('SELECT original_bytes FROM mineru_base WHERE blockid=0').fetchone()[0])
        self.assertEqual(base64.b64decode(archive[0]['contentBase64']),self.original)
        state=v.existing_state(self.book)
        self.assertEqual(state['blockCount'],539)
        self.assertEqual(state['columns'],list(v.COLUMNS))
        self.assertEqual(len(state['rows']),120)
        self.assertEqual(v.existing_state(self.book,offset=480)['rows'][-1]['blockid'],539)
        db.close()
        existing=v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},adapter)
        self.assertFalse(existing['created']);self.assertEqual(adapter.calls,1)
    def test_sql_catalog_reflects_all_physical_tables_including_empty(self):
        v.new_book(self.book)
        state=v.existing_state(self.book)
        self.assertEqual([t['name'] for t in state['tables']],['mineru_base','logical_block'])
        self.assertEqual(state['tables'][0]['columns'],list(v.COLUMNS))
        self.assertEqual(state['tables'][1]['columns'],
            ['logical_id','base_blockid','parent_id','logical_order','markdown_text','block_type'])
        self.assertEqual(state['tableName'],'mineru_base')
        self.assertEqual(state['rowCount'],539)
        logical=v.existing_state(self.book,table='logical_block')
        self.assertEqual(logical['tableName'],'logical_block')
        self.assertEqual(logical['rowCount'],224)
        self.assertEqual(len(logical['rows']),120)
        self.assertEqual(len(logical['columns']),6)
        self.assertEqual(logical['tables'],state['tables'])
        self.assertEqual(logical['blockCount'],539)
        self.assertEqual(v.dispatch('state','GET',self.book,{},
            {'table':['logical_block']},StubF02())['rowCount'],224)
        with self.assertRaisesRegex(v.BaseError,'不存在'):
            v.dispatch('state','GET',self.book,{},
                {'table':['mineru_base; DROP TABLE logical_block']},StubF02())
        with closing(sqlite3.connect(self.book/v.DB_NAME)) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],224)
            self.assertEqual(db.execute('SELECT count(*) FROM mineru_base').fetchone()[0],540)
        self.assertEqual(self.source.read_bytes(),self.original)

    def test_catalog_reflection_uses_sqlite_master_not_a_hardcoded_table_list(self):
        with closing(sqlite3.connect(':memory:')) as db:
            db.row_factory=sqlite3.Row
            db.execute('CREATE TABLE first (x INTEGER PRIMARY KEY, value TEXT)')
            db.execute('CREATE TABLE "third table" (name TEXT PRIMARY KEY) WITHOUT ROWID')
            db.execute('CREATE VIEW not_a_table AS SELECT x FROM first')
            db.execute('INSERT INTO "third table" VALUES ("visible")')
            self.assertEqual(v.physical_tables(db),['first','third table'])
            selected=v.read_table(db,'third table',0)
            self.assertEqual(selected['rowCount'],1)
            self.assertEqual(selected['rows'],[{'name':'visible'}])
            with self.assertRaisesRegex(v.BaseError,'不存在'):
                v.read_table(db,'not_a_table',0)
            with self.assertRaisesRegex(v.BaseError,'不存在'):
                v.read_table(db,'first;DROP TABLE first',0)

    def test_source_changed_rebuilds_only_v2_sqlite(self):
        v.new_book(self.book)
        with closing(sqlite3.connect(self.book/v.DB_NAME)) as db:
            oldsha=db.execute('SELECT source_sha256 FROM mineru_base WHERE blockid=1').fetchone()[0]
        # Only a legacy empty logic table may be rebuilt due to source changes.
        with closing(sqlite3.connect(self.book/v.DB_NAME)) as db:
            db.execute('DELETE FROM logical_block');db.commit()
        self.source.write_bytes(self.original+b' ')
        result=v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},StubF02())
        self.assertTrue(result['created']);self.assertTrue(result['replaced'])
        with closing(sqlite3.connect(self.book/v.DB_NAME)) as db:
            newsha=db.execute('SELECT source_sha256 FROM mineru_base WHERE blockid=1').fetchone()[0]
        self.assertNotEqual(newsha,oldsha)
        self.assertEqual(newsha,hashlib.sha256(self.source.read_bytes()).hexdigest())
        self.assertEqual(self.source.read_bytes(),self.original+b' ')
        self.assertEqual(v.existing_state(self.book)['blockCount'],539)
    def test_old_database_atomic_replace_after_verified_import(self):
        path=self.book/v.DB_NAME
        with closing(sqlite3.connect(path)) as db:
            db.execute('CREATE TABLE unrelated(a INTEGER)');db.execute('INSERT INTO unrelated VALUES (12)');db.commit()
        before=path.read_bytes()
        with self.assertRaisesRegex(v.BaseError,'两表结构'):
            v.existing_state(self.book)
        adapter=StubF02()
        replaced=v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},adapter)
        self.assertEqual(adapter.calls,1)
        self.assertTrue(replaced['created']);self.assertTrue(replaced['replaced'])
        self.assertNotEqual(path.read_bytes(),before)
        with closing(sqlite3.connect(path)) as db:
            self.assertEqual({x[0] for x in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                {'mineru_base','logical_block'})
        self.assertEqual(v.existing_state(self.book)['blockCount'],539)
        self.assertEqual(self.source.read_bytes(),self.original)
        self.assertFalse(list(self.book.glob('.ocr2md-v2-*.tmp')))
        repeat=v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},adapter)
        self.assertEqual(repeat['created'],False);self.assertEqual(adapter.calls,1)
    def test_populated_nine_column_logical_sqlite_rebuilds_as_wp00(self):
        v.new_book(self.book)
        db_path=self.book/v.DB_NAME
        with closing(sqlite3.connect(db_path)) as db:
            db.execute('DROP TABLE logical_block')
            db.execute("""CREATE TABLE logical_block(
                logical_id INTEGER PRIMARY KEY, parent_id INTEGER, sort_order INTEGER,
                node_kind TEXT, block_type TEXT, markdown TEXT,
                source_refs TEXT, attrs TEXT, revision INTEGER)""")
            db.execute("INSERT INTO logical_block VALUES(1,NULL,1,'content','text','edited','[]','{}',7)")
            db.commit()
        with self.assertRaisesRegex(v.BaseError,'不兼容'):
            v.existing_state(self.book)
        written=v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},StubF02())
        self.assertTrue(written['created']);self.assertTrue(written['replaced'])
        with closing(sqlite3.connect(db_path)) as db:
            columns=[r[1] for r in db.execute('PRAGMA table_info(logical_block)')]
            self.assertEqual(columns,['logical_id','base_blockid','parent_id','logical_order','markdown_text','block_type'])
            self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],224)
            self.assertEqual(db.execute('SELECT count(*) FROM mineru_base WHERE blockid>0').fetchone()[0],539)
        self.assertEqual(self.source.read_bytes(),self.original)

    def test_bad_source_keeps_incompatible_old_database(self):
        path=self.book/v.DB_NAME
        with closing(sqlite3.connect(path)) as db:
            db.execute('CREATE TABLE old_schema(value TEXT)');db.execute('INSERT INTO old_schema VALUES ("retain")');db.commit()
        old=path.read_bytes()
        self.source.unlink()
        with self.assertRaisesRegex(v.BaseError,'未找到'):
            v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},StubF02())
        self.assertEqual(path.read_bytes(),old)
        self.assertFalse(list(self.book.glob('.ocr2md-v2-*.tmp')))
    def test_busy_sqlite_journal_refuses_unsafe_swap(self):
        path=self.book/v.DB_NAME
        with closing(sqlite3.connect(path)) as db:db.execute('CREATE TABLE old_schema(value TEXT)');db.commit()
        marker=self.book/(v.DB_NAME+'-wal');marker.write_bytes(b'active')
        old=path.read_bytes()
        with self.assertRaisesRegex(v.BaseError,'日志文件'):
            v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},StubF02())
        self.assertEqual(path.read_bytes(),old)
        self.assertEqual(marker.read_bytes(),b'active')
    def test_no_implicit_import_without_confirm(self):
        with self.assertRaisesRegex(v.BaseError,'确认'):
            v.dispatch('import','POST',self.book,{}, {},StubF02())
        self.assertFalse((self.book/v.DB_NAME).exists())
    def test_http_requires_frame_session_and_same_origin(self):
        def req(method,op,origin,cookie,payload=None):
            data=json.dumps(payload or {}).encode('utf8')
            out=[]
            handler=types.SimpleNamespace(command=method,headers={
                'Origin':origin,'Cookie':cookie,'Content-Length':str(len(data))},
                rfile=io.BytesIO(data),respond=lambda code,body,*args:out.append((code,json.loads(body))))
            parsed=types.SimpleNamespace(query='workspace='+__import__('urllib.parse',fromlist=['quote']).quote(str(self.book),safe=''))
            v.handle(handler,op,parsed,f02)
            return out[0]
        with patch.object(f02,'authorized_roots',side_effect=lambda cookie:
            [self.book] if cookie=='valid-session' else (_ for _ in ()).throw(f02.WorkspaceIOError(403,'未授权'))):
            self.assertEqual(req('GET','state','', 'bad')[0],403)
            self.assertEqual(req('POST','import','https://evil.invalid','valid-session',{'workspace':str(self.book),'confirm':'import-mineru-base'})[0],403)
            self.assertEqual(req('POST','import','https://ocr2md.laity.bid','bad',{'workspace':str(self.book),'confirm':'import-mineru-base'})[0],403)
            self.assertFalse((self.book/v.DB_NAME).exists())
            self.assertEqual(req('POST','import','https://ocr2md.laity.bid','valid-session',{'workspace':str(self.book)})[0],422)
            self.assertFalse((self.book/v.DB_NAME).exists())
            code,created=req('POST','import','https://ocr2md.laity.bid','valid-session',{'workspace':str(self.book),'confirm':'import-mineru-base'})
            self.assertEqual(code,200);self.assertEqual(created['blockCount'],539)
            self.assertEqual(req('GET','state','', 'valid-session')[1]['blockCount'],539)
            self.assertEqual(self.source.read_bytes(),self.original)
            self.assertEqual(req('POST','import','https://ocr2md.laity.bid','valid-session',{'workspace':str(self.book),'confirm':'import-mineru-base'})[1]['created'],False)
    def test_real_independent_frame_session_rejected_then_authorized(self):
        config=self.book/'frame-private.json'
        config.write_text(json.dumps({'schema':'ocr2md-frame-access/v1',
            'code':'ABCD1234ABCD1234','secret':'a'*64,
            'allowedRoots':[str(self.book)]}))
        config.chmod(0o600)
        query='workspace='+__import__('urllib.parse',fromlist=['quote']).quote(str(self.book),safe='')
        def request(cookie):
            responses=[]
            handler=types.SimpleNamespace(command='GET',headers={'Cookie':cookie},
                respond=lambda status,body,*args:responses.append((status,json.loads(body))))
            v.handle(handler,'state',types.SimpleNamespace(query=query),f02)
            return responses[0]
        with patch.object(frame_access,'CONFIG',config):
            self.assertEqual(request('')[0],403)
            cookie=frame_access.unlock('ABCD1234ABCD1234').split(';')[0]
            status,body=request(cookie)
            self.assertEqual(status,200);self.assertFalse(body['exists'])
        self.assertEqual(self.source.read_bytes(),self.original)

    def test_source_empty(self):
        self.source.unlink()
        with self.assertRaisesRegex(v.BaseError,'未找到'):
            v.new_book(self.book)
        self.assertFalse((self.book/v.DB_NAME).exists())
if __name__=='__main__':unittest.main()
