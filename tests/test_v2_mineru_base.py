"""Direct API acceptance: exact source bytes, integer IDs, 2 tables, no overwrite."""
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
        self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],0)
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
    def test_source_modified_after_import_fails_closed(self):
        v.new_book(self.book)
        self.source.write_bytes(self.original+b' ')
        with self.assertRaisesRegex(v.BaseError,'不得覆盖'):
            v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},StubF02())
    def test_other_database_refused_without_migration(self):
        path=self.book/v.DB_NAME
        with closing(sqlite3.connect(path)) as db:db.execute('CREATE TABLE unrelated(a INTEGER)');db.commit()
        with self.assertRaisesRegex(v.BaseError,'两表结构'):
            v.existing_state(self.book)
        with self.assertRaisesRegex(v.BaseError,'两表结构'):
            v.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},StubF02())
    def test_no_implicit_import_without_confirm(self):
        with self.assertRaisesRegex(v.BaseError,'确认'):
            v.dispatch('import','POST',self.book,{}, {},StubF02())
        self.assertFalse((self.book/v.DB_NAME).exists())
    def test_http_requires_main_session_and_same_origin(self):
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
    def test_source_empty(self):
        self.source.unlink()
        with self.assertRaisesRegex(v.BaseError,'未找到'):
            v.new_book(self.book)
        self.assertFalse((self.book/v.DB_NAME).exists())
if __name__=='__main__':unittest.main()
