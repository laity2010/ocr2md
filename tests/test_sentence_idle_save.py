"""WP04F2: atomic multi-MDLine checkpoints, no history tables, idempotent retry."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from test_sentence_store import prepare_owned_book, upstream_evidence, base, FailConnection
from sentence_initialize import initialize_sentence_table
from sentence_store import SentenceStore,rebuild_markdown
import lab_backend as runtime

def change(row,before,after):
    return dict(source_line=row['source_line'],source_line_hash=row['source_line_hash'],
                candidates_hash=hashlib.sha256(row['candidates_json'].encode()).hexdigest(),
                previous_engine=before,adopted_engine=after)

class IdleSaveTests(unittest.TestCase):
    def test_batch_atomicity_conflict_retry_and_foreign_rows(self):
        with tempfile.TemporaryDirectory(prefix='sentence-idle-save-') as temp:
            folder=Path(temp);snap=prepare_owned_book(folder);path=folder/base.DB_NAME
            reader=lambda:base.existing_markdown(folder)
            with closing(sqlite3.connect(path)) as db:
                before=upstream_evidence(db)
                db.executescript("CREATE TABLE translation(id,body);INSERT INTO translation VALUES(1,'keep');")
                db.commit()
                original=initialize_sentence_table(db,snap)
            a,b=[r for r in original if r['review_state']=='disputed'][:2]
            edits=[change(a,None,'intl'),change(b,None,'wink-nlp')]
            with closing(sqlite3.connect(path,factory=FailConnection)) as db:
                store=SentenceStore(db)
                db.fail_insert=True
                with self.assertRaises(sqlite3.OperationalError):
                    store.save_choices(snap['markdown'],edits)
                self.assertEqual(store.read(snap['markdown']),original)
                db.fail_insert=False
                with self.assertRaises(ValueError):
                    store.save_choices(snap['markdown'],[edits[0],{**edits[1],'candidates_hash':'0'*64}])
                self.assertEqual(store.read(snap['markdown']),original)
            result=runtime.dispatch(folder,'save',snap['sha256'],reader,changes=edits)
            self.assertEqual({r['source_line'] for r in result['rows']},{a['source_line'],b['source_line']})
            self.assertEqual(runtime.dispatch(folder,'save',snap['sha256'],reader,changes=edits),result)
            with self.assertRaisesRegex(ValueError,'concurrent arbitration conflict'):
                runtime.dispatch(folder,'save',snap['sha256'],reader,changes=[change(a,None,'sentence-splitter')])
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(upstream_evidence(db),before)
                self.assertEqual(db.execute('SELECT * FROM translation').fetchall(),[(1,'keep')])
                self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                                 {'mineru_base','logical_block','sentence','translation'})
                allrows=SentenceStore(db).read(snap['markdown'])
                self.assertEqual(rebuild_markdown(allrows),snap['markdown'])
                self.assertEqual([r for r in allrows if r['source_line'] not in (a['source_line'],b['source_line'])],
                                 [r for r in original if r['source_line'] not in (a['source_line'],b['source_line'])])
            runtime.dispatch(folder,'save',snap['sha256'],reader,changes=[change(a,'intl',None),change(b,'wink-nlp',None)])
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(SentenceStore(db).read(snap['markdown']),original)
