"""WP01–WP03 direct tests: nine logical fields, V1 CMD projection, old-book migration."""
import base64
from contextlib import closing
import hashlib
import io
import types
from urllib.parse import urlencode
import json
from pathlib import Path
import shutil
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as base
import v2_logical as logic
import frame_workspace_io as f02

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class Grant:
    n=0
    def probe(self,root):self.n+=1

class LogicalTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='v2-logical-test-');self.book=Path(self.temp.name)
        self.dir=self.book/'minerujson';self.dir.mkdir();self.original=FIXTURE.read_bytes();(self.dir/'sample.json').write_bytes(self.original)
        base.new_book(self.book)
    def tearDown(self):self.temp.cleanup()
    def sql(self,query):
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            return db.execute(query).fetchall()
    def legacy_wp00(self):
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.execute('DROP TABLE logical_block')
            db.execute('CREATE TABLE logical_block(logical_id INTEGER PRIMARY KEY,base_blockid INTEGER,parent_id INTEGER,logical_order INTEGER,markdown_text TEXT,FOREIGN KEY(base_blockid) REFERENCES mineru_base(blockid))')
            db.commit()
    def test_real_sample_all_source_roots_children_html_math_images(self):
        initial=logic.logical_state(self.book)
        self.assertFalse(initial['initialized'])
        self.assertEqual(tuple(initial['columns']),logic.FIELDS)
        grant=Grant()
        result=base.dispatch('initialize-logical','POST',self.book,{'confirm':'initialize-logical'},{},grant)
        self.assertEqual(grant.n,1)
        self.assertTrue(result['created']);self.assertEqual(result['blockCount'],267)
        rows=self.sql('SELECT * FROM logical_block ORDER BY logical_id')
        self.assertEqual(len(rows),267)
        self.assertEqual([r[0] for r in rows],list(range(1,268)))
        self.assertEqual(sum(r[1] is None for r in rows),224)
        self.assertEqual(sum(r[3]=='group' for r in rows),20)
        self.assertEqual(sum('<table' in r[5] for r in rows),9)
        self.assertEqual(sum('![' in r[5] for r in rows),11)
        self.assertEqual(sum('```math' in r[5] for r in rows),20)
        self.assertTrue(all(r[5]=='' for r in rows if r[3]=='group'))
        self.assertEqual([r[8] for r in rows], [0]*267)
        by_marker={json.loads(r[7])['source_marker']:r for r in rows}
        for marker in ('p3b1s0','p4b0s1'):
            self.assertEqual(len(json.loads(by_marker[marker][6])),2,marker)
            self.assertEqual(json.loads(by_marker[marker][6])[1]['role'],'recovered_preproc')
        self.assertEqual({x[0] for x in self.sql("SELECT name FROM sqlite_master WHERE type='table'")},{'mineru_base','logical_block'})
        self.assertEqual([x[1] for x in self.sql('PRAGMA table_info(logical_block)')],list(logic.FIELDS))
        bases={id for id, in self.sql('SELECT blockid FROM mineru_base WHERE blockid>0')}
        for row in rows:
            self.assertTrue(json.loads(row[6]));self.assertTrue(json.loads(row[7]))
            self.assertIn(json.loads(row[6])[0]['blockid'],bases)
        self.assertEqual((self.dir/'sample.json').read_bytes(),self.original)
        archived=json.loads(self.sql('SELECT original_bytes FROM mineru_base WHERE blockid=0')[0][0])[0]
        self.assertEqual(base64.b64decode(archived['contentBase64']),self.original)
        paged=logic.logical_state(self.book,240)
        self.assertEqual(paged['blockCount'],267);self.assertEqual(len(paged['rows']),27)
        again=base.dispatch('initialize-logical','POST',self.book,{'confirm':'initialize-logical'},{},grant)
        self.assertEqual(again['created'],False);self.assertEqual(grant.n,2)
    def test_upgrade_empty_wp00_is_transactional_base_unchanged(self):
        self.legacy_wp00()
        baseline=hashlib.sha256(self.sql('SELECT original_bytes FROM mineru_base WHERE blockid=0')[0][0]).hexdigest()
        self.assertFalse(logic.logical_state(self.book)['initialized'])
        result=logic.initialize_logical(self.book)
        self.assertTrue(result['created']);self.assertEqual(result['blockCount'],267)
        self.assertEqual(tuple(x[1] for x in self.sql('PRAGMA table_info(logical_block)')),logic.FIELDS)
        self.assertEqual(hashlib.sha256(self.sql('SELECT original_bytes FROM mineru_base WHERE blockid=0')[0][0]).hexdigest(),baseline)
    def test_populated_old_schema_rejected_without_any_mutation(self):
        self.legacy_wp00()
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.execute('INSERT INTO logical_block(logical_id,base_blockid,markdown_text) VALUES(9,23,?)',('do-not-erase',));db.commit()
        before=self.sql('SELECT * FROM logical_block')
        with self.assertRaisesRegex(base.BaseError,'包含用户数据'):
            logic.initialize_logical(self.book)
        self.assertEqual(self.sql('SELECT * FROM logical_block'),before)
        self.assertEqual(tuple(x[1] for x in self.sql('PRAGMA table_info(logical_block)')),logic.OLD_FIELDS)
    def test_edited_latest_state_blocks_dangerous_reimport(self):
        logic.initialize_logical(self.book)
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.execute("UPDATE logical_block SET markdown='my edits',revision=7 WHERE logical_id=1");db.commit()
        changed=json.loads(self.original);changed['_extra_source_change']='new'
        (self.dir/'sample.json').write_text(json.dumps(changed),encoding='utf8')
        with self.assertRaisesRegex(base.BaseError,'禁止重新导入覆盖'):
            base.dispatch('import','POST',self.book,{'confirm':'import-mineru-base'},{},Grant())
        self.assertEqual(self.sql('SELECT markdown,revision FROM logical_block WHERE logical_id=1'),[('my edits',7)])
    def test_converter_failure_keeps_old_table_untouched(self):
        self.legacy_wp00()
        with patch.object(logic,'markdown_from_source',side_effect=base.BaseError(422,'converter unavailable')):
            with self.assertRaisesRegex(base.BaseError,'converter unavailable'):
                logic.initialize_logical(self.book)
        self.assertEqual(tuple(x[1] for x in self.sql('PRAGMA table_info(logical_block)')),logic.OLD_FIELDS)
        self.assertEqual(self.sql('SELECT count(*) FROM logical_block'),[(0,)])
    def test_split_parts_same_local_source_markers_unique_logic_ids(self):
        # Keep the normal data isolated. Use multiple JSON parts in a fresh book.
        with tempfile.TemporaryDirectory(prefix='v2-logic-splits-') as d:
            book=Path(d)
            one={'pdf_info':[{'page_idx':0,'para_blocks':[{'type':'title','level':2,'lines':[{'spans':[{'content':'Title A','type':'text'}]}]}]}]}
            two={'pdf_info':[{'page_idx':0,'para_blocks':[{'type':'text','lines':[{'spans':[{'content':'Content B','type':'text'}]}]}]}]}
            (book/'a.json').write_text(json.dumps(one));(book/'b.json').write_text(json.dumps(two))
            base.new_book(book)
            result=logic.initialize_logical(book)
            self.assertEqual(result['blockCount'],2)
            rows=logic.logical_state(book)['rows'];self.assertEqual([r['logical_id'] for r in rows],[1,2])
            self.assertEqual([r['markdown'] for r in rows],['## Title A','Content B'])
            self.assertEqual([json.loads(r['source_refs'])[0]['blockid'] for r in rows],[1,2])
    def test_business_http_auth_confirm_and_logical_read(self):
        def request(method,operation,cookie,origin='',confirm=None):
            data=json.dumps({'workspace':str(self.book),**({'confirm':confirm} if confirm else {})}).encode()
            responses=[]
            handler=types.SimpleNamespace(command=method,headers={
                'Cookie':cookie,'Origin':origin,'Content-Length':str(len(data))},
                rfile=io.BytesIO(data),respond=lambda code,raw,*args:responses.append((code,json.loads(raw))))
            parsed=types.SimpleNamespace(query=urlencode({'workspace':str(self.book)}))
            base.handle(handler,operation,parsed,f02)
            return responses[0]
        with patch.object(f02,'authorized_roots',side_effect=lambda cookie:
            [self.book] if cookie=='grant' else (_ for _ in ()).throw(f02.WorkspaceIOError(403,'not authorized'))):
            self.assertEqual(request('GET','logical-state','bad')[0],403)
            self.assertEqual(request('POST','initialize-logical','grant','https://attacker.example','initialize-logical')[0],403)
            self.assertEqual(request('POST','initialize-logical','grant','https://ocr2md.laity.bid')[0],422)
            self.assertFalse(request('GET','logical-state','grant')[1]['initialized'])
            code,created=request('POST','initialize-logical','grant','https://ocr2md.laity.bid','initialize-logical')
            self.assertEqual(code,200);self.assertEqual(created['blockCount'],267)
            code,result=request('GET','logical-state','grant')
            self.assertEqual(code,200);self.assertTrue(result['initialized']);self.assertEqual(len(result['columns']),9)
            self.assertEqual(request('POST','initialize-logical','grant','https://ocr2md.laity.bid','initialize-logical')[1]['created'],False)
    def test_unknown_schema_rejected(self):
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.execute('ALTER TABLE logical_block ADD COLUMN rogue TEXT');db.commit()
        with self.assertRaisesRegex(base.BaseError,'结构未知'):
            logic.logical_state(self.book)
        with self.assertRaisesRegex(base.BaseError,'结构未知'):
            logic.initialize_logical(self.book)
if __name__=='__main__':unittest.main()
