"""WP04F isolated real SQLite local transaction, CAS and rollback."""
import hashlib
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from test_sentence_store import prepare_owned_book, upstream_evidence, base, FailConnection
from sentence_initialize import initialize_sentence_table
from sentence_store import SentenceStore, rebuild_markdown
import lab_backend as runtime

def params(row, before, after):
    return dict(source_line=row['source_line'],source_line_hash=row['source_line_hash'],
                candidates_hash=hashlib.sha256(row['candidates_json'].encode()).hexdigest(),
                previous_engine=before,adopted_engine=after)

class ArbitrationTests(unittest.TestCase):
    def test_runtime_adopt_switch_cancel_conflict_and_reopen(self):
        with tempfile.TemporaryDirectory(prefix='sentence-arbitrate-') as tmp:
            folder=Path(tmp)
            snap=prepare_owned_book(folder);path=folder/base.DB_NAME
            reader=lambda:base.existing_markdown(folder)
            with closing(sqlite3.connect(path)) as db:
                before=upstream_evidence(db)
                db.executescript("CREATE TABLE translation(id,body);INSERT INTO translation VALUES(1,'keep');")
                db.commit()
                original=initialize_sentence_table(db,snap)
            row=next(r for r in original if r['review_state']=='disputed' and json.loads(r['candidates_json'])['intl']['boundaries'])
            line=row['source_line']
            def apply(a,b):
                result=runtime.dispatch(folder,'arbitrate',snap['sha256'],reader,arbitration=params(row,a,b))
                self.assertEqual(result['state'],'ready')
                self.assertTrue(all(r['source_line']==line for r in result['rows']))
                self.assertEqual(result['rows'][0]['adopted_engine'],b)
                with closing(sqlite3.connect(path)) as db:
                    self.assertEqual(upstream_evidence(db),before)
                    self.assertEqual(db.execute('SELECT * FROM translation').fetchall(),[(1,'keep')])
                    allrows=SentenceStore(db).read(snap['markdown'])
                    self.assertEqual(rebuild_markdown(allrows),snap['markdown'])
                    self.assertEqual([r for r in allrows if r['source_line']!=line],[r for r in original if r['source_line']!=line])
                    self.assertEqual([r for r in allrows if r['source_line']==line],result['rows'])
                return result['rows']
            adopted=apply(None,'intl')
            self.assertGreater(len(adopted),1)
            with self.assertRaisesRegex(ValueError,'arbitration conflict'):
                apply(None,'wink-nlp')
            with self.assertRaisesRegex(ValueError,'arbitration conflict'):
                runtime.dispatch(folder,'arbitrate',snap['sha256'],reader,arbitration={**params(row,'intl','wink-nlp'),'candidates_hash':'0'*64})
            self.assertEqual(runtime.dispatch(folder,'open',snap['sha256'],reader)['rows'][sum(r['source_line']<line for r in original):][:len(adopted)],adopted)
            apply('intl','wink-nlp')
            cancelled=apply('wink-nlp',None)
            self.assertEqual(cancelled,[row])
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(SentenceStore(db).read(snap['markdown']),original)
    def test_failed_local_insert_and_invalid_choice_preserve_rows(self):
        with tempfile.TemporaryDirectory(prefix='sentence-arbitrate-fail-') as tmp:
            folder=Path(tmp);snap=prepare_owned_book(folder);path=folder/base.DB_NAME
            with closing(sqlite3.connect(path,factory=FailConnection)) as db:
                original=initialize_sentence_table(db,snap)
                store=SentenceStore(db)
                row=next(r for r in original if r['review_state']=='disputed')
                db.fail_insert=True
                with self.assertRaises(sqlite3.OperationalError):
                    store.arbitrate(snap['markdown'],**params(row,None,'intl'))
                self.assertEqual(store.read(snap['markdown']),original)
                db.fail_insert=False
                agreed=next(r for r in original if r['review_state']=='agreed')
                with self.assertRaisesRegex(ValueError,'arbitration conflict'):
                    store.arbitrate(snap['markdown'],**params(agreed,None,'intl'))
                with self.assertRaisesRegex(ValueError,'arbitration conflict'):
                    store.arbitrate(snap['markdown'],**{**params(row,None,'intl'),'source_line_hash':'0'*64})
                self.assertEqual(store.read(snap['markdown']),original)
