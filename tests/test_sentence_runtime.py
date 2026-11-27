"""WP04E runtime API against isolated V2 fixtures, never a user book."""
import io
import json
import sqlite3
import tempfile
import types
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit
from test_sentence_store import prepare_owned_book, upstream_evidence, base
from test_v2_owned_edit import owned_commit
import lab_backend as runtime
from lab_backend.sentence_store import rebuild_markdown


class RuntimeTests(unittest.TestCase):
    def test_first_open_restore_stale_and_explicit_reinitialization(self):
        with tempfile.TemporaryDirectory(prefix='sentence-runtime-') as tmp:
            folder=Path(tmp)
            snap=prepare_owned_book(folder)
            dbpath=folder/base.DB_NAME
            reader=lambda:base.existing_markdown(folder)
            with closing(sqlite3.connect(dbpath)) as db:
                before=upstream_evidence(db)
                db.executescript("CREATE TABLE translation(id INTEGER PRIMARY KEY,body TEXT); INSERT INTO translation VALUES(1,'keep');")
                db.commit()
            result=runtime.dispatch(folder,'open',snap['sha256'],reader)
            self.assertEqual(result['state'],'ready')
            self.assertLess(len(result['rows']),677)
            self.assertEqual(''.join(r['raw'] for r in result['rows']),snap['markdown'])
            self.assertEqual(rebuild_markdown(result['rows']),snap['markdown'])
            with closing(sqlite3.connect(dbpath)) as db:
                self.assertEqual(upstream_evidence(db),before)
                self.assertEqual(db.execute('SELECT * FROM translation').fetchall(),[(1,'keep')])
            def no_engine(_):
                raise AssertionError('existing sentence table must not run engines')
            self.assertEqual(runtime.dispatch(folder,'open',snap['sha256'],reader,prepare=no_engine),result)
            with closing(sqlite3.connect(dbpath)) as db:
                old=db.execute('SELECT * FROM sentence ORDER BY source_line,sentence_index').fetchall()
                lid,text=db.execute('SELECT logical_id,md_block FROM logical_block WHERE length(md_block)>0 AND substr(md_block,-1)=char(10) ORDER BY logical_order LIMIT 1').fetchone()
            owned_commit(folder,[dict(logicalId=lid,before=text,after='Test '+text)])
            current=reader()
            self.assertNotEqual(current['sha256'],snap['sha256'])
            self.assertEqual(runtime.dispatch(folder,'open',current['sha256'],reader,prepare=no_engine),
                             {'state':'stale','source_document_hash':current['sha256'],'rows':[]})
            with self.assertRaises(runtime.SentenceError):
                runtime.dispatch(folder,'open',snap['sha256'],reader,prepare=no_engine)
            with closing(sqlite3.connect(dbpath)) as db:
                self.assertEqual(db.execute('SELECT * FROM sentence ORDER BY source_line,sentence_index').fetchall(),old)
                before=upstream_evidence(db)
            # Failure of planning leaves the existing table intact.
            with self.assertRaises(AssertionError):
                runtime.dispatch(folder,'reinitialize',current['sha256'],reader,prepare=no_engine)
            with closing(sqlite3.connect(dbpath)) as db:
                self.assertEqual(db.execute('SELECT * FROM sentence ORDER BY source_line,sentence_index').fetchall(),old)
            reset=runtime.dispatch(folder,'reinitialize',current['sha256'],reader)
            self.assertEqual(reset['state'],'ready')
            self.assertEqual(rebuild_markdown(reset['rows']),current['markdown'])
            with closing(sqlite3.connect(dbpath)) as db:
                self.assertEqual(upstream_evidence(db),before)
                self.assertEqual(db.execute('SELECT * FROM translation').fetchall(),[(1,'keep')])

    def test_source_drift_before_write_refused(self):
        with tempfile.TemporaryDirectory(prefix='sentence-drift-') as tmp:
            folder=Path(tmp)
            snap=prepare_owned_book(folder)
            calls=0
            def reader():
                nonlocal calls
                calls+=1
                if calls>=3:
                    return {**snap,'sha256':'0'*64}
                return snap
            with self.assertRaises(runtime.SentenceError):
                runtime.dispatch(folder,'open',snap['sha256'],reader)
            with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
                self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},{'mineru_base','logical_block'})

    def test_http_auth_method_confirmation_and_payload(self):
        def request(op,method,origin,payload,cookie='valid'):
            encoded=json.dumps(payload).encode()
            out=[]
            handler=types.SimpleNamespace(command=method,headers={'Origin':origin,'Cookie':cookie,'Content-Length':str(len(encoded))},
                rfile=io.BytesIO(encoded),respond=lambda code,body,*args:out.append((code,json.loads(body))))
            def roots(value):
                if value!='valid':
                    raise runtime.SentenceError(403,'not authorized')
                return []
            common=types.SimpleNamespace(ALLOWED_ORIGINS={'https://example.test'},authorized_roots=roots,
                checked_workspace=lambda p,roots:Path(p),probe=lambda p:None)
            with patch.object(runtime,'dispatch',return_value={'state':'ready','rows':[]}) as dispatch:
                runtime.handle(handler,op,urlsplit('/'),common)
                return out[0],dispatch.call_count
        body={'workspace':'/fixture','source_document_hash':'a'*64}
        for op,method,origin,payload,cookie,expected in [
            ('sentence/open','GET','https://example.test',body,'valid',405),
            ('sentence/open','POST','https://evil.test',body,'valid',403),
            ('sentence/open','POST','https://example.test',body,'bad',403),
            ('sentence/reinitialize','POST','https://example.test',body,'valid',422),
            ('sentence/open','POST','https://example.test',{**body,'rows':[]},'valid',422),
        ]:
            result,calls=request(op,method,origin,payload,cookie)
            self.assertEqual(result[0],expected)
            self.assertEqual(calls,0)
        result,calls=request('sentence/open','POST','https://example.test',body)
        self.assertEqual(result[0],200)
        self.assertEqual(calls,1)
        batch={**body,'changes':[{'source_line':1,'source_line_hash':'b'*64,'candidates_hash':'c'*64,'previous_engine':None,'adopted_engine':'intl'}]}
        for payload in ({**batch,'changes':[]},{**batch,'changes':batch['changes']*2},{**batch,'rows':[]}):
            result,calls=request('sentence/save','POST','https://example.test',payload)
            self.assertEqual(result[0],422);self.assertEqual(calls,0)
        result,calls=request('sentence/save','POST','https://example.test',batch,'bad')
        self.assertEqual(result[0],403);self.assertEqual(calls,0)
        result,calls=request('sentence/save','POST','https://example.test',batch)
        self.assertEqual(result[0],200);self.assertEqual(calls,1)
        result,calls=request('sentence/reinitialize','POST','https://example.test',{**body,'confirm':'reinitialize-sentence-table'})
        self.assertEqual(result[0],200)
        self.assertEqual(calls,1)
