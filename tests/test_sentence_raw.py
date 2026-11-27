"""WP04F4 exact RAW, attributes, physical line identity and legacy migration."""
import json
import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from test_sentence_store import plan, whole_plans, prepare_owned_book, upstream_evidence, base, FailConnection
from sentence_store import SentenceStore, build_sentence_rows, rebuild_markdown
from lab_backend.sentence_store import LEGACY_DDL, LEGACY_COLUMNS, _build_legacy_rows
from lab_backend.sentence_initialize import classify_markdown
import lab_backend as runtime

def create_legacy(db,md,plans):
    rows=_build_legacy_rows(md,plans)
    db.execute(LEGACY_DDL)
    db.executemany('INSERT INTO sentence ('+','.join(LEGACY_COLUMNS)+') VALUES ('+','.join('?' for _ in LEGACY_COLUMNS)+')',
                   (tuple(r[k] for k in LEGACY_COLUMNS) for r in rows))
    db.commit()
    return rows

class RawTests(unittest.TestCase):
    def test_raw_blank_tail_and_inherited_markdown_attributes(self):
        md='\n \t\n# Heading\n\n>> A. B.\n \t\n\n> > C.\n\n~~~\n# literal\n~~~\n\nEnd.'
        plans=whole_plans(md)
        plans[4]=plan([5],'agreed')
        rows=build_sentence_rows(md,plans)
        self.assertEqual(''.join(r['raw'] for r in rows),md)
        self.assertEqual(rebuild_markdown(rows),md)
        self.assertEqual([(r['source_line'],r['raw'],r['type'],r['level']) for r in rows],[
          (1,'\n \t\n','blank',''),(3,'# Heading\n\n','title',''),
          (5,'>> A.','text','>>'),(5,' B.\n \t\n\n','text','>>'),
          (8,'> > C.\n\n','text','>>'),(10,'~~~\n','text',''),
          (11,'# literal\n','text',''),(12,'~~~\n\n','text',''),(14,'End.','text','')])
        self.assertEqual(rows[3]['to_utf16'],8)
        self.assertNotIn('sentence_text',rows[3])
        self.assertNotIn('line_eol',rows[3])
        for field,value in [('level','>'),('type','title'),('raw',' B.\n')]:
            damaged=[dict(r) for r in rows];damaged[3][field]=value
            with self.assertRaises(ValueError):
                rebuild_markdown(damaged)
        self.assertEqual(build_sentence_rows('',[]),[])
        self.assertEqual(rebuild_markdown(build_sentence_rows('\n \t\n',whole_plans('\n \t\n'))),'\n \t\n')

    def test_exact_legacy_upgrade_retains_adoption_and_foreign_data(self):
        with tempfile.TemporaryDirectory(prefix='sentence-raw-upgrade-') as tmp:
            folder=Path(tmp);snap=prepare_owned_book(folder);md=snap['markdown'];path=folder/base.DB_NAME
            plans=whole_plans(md)
            number=next(i for i,t in enumerate(md.split('\n'),1) if len(t)>5 and t.isascii() and t.strip())
            plans[number-1]=plan([2],'adopted',[[2],[],[2]],'intl')
            with closing(sqlite3.connect(path)) as db:
                before=upstream_evidence(db)
                db.executescript("CREATE TABLE translation(id,body);INSERT INTO translation VALUES(1,'keep');")
                db.commit()
                old=create_legacy(db,md,plans)
                self.assertEqual(SentenceStore(db).inspect(md),('legacy',[]))
            def no_engines(_):raise AssertionError('migration must preserve candidates, not rerun engines')
            result=runtime.dispatch(folder,'open',snap['sha256'],lambda:base.existing_markdown(folder),prepare=no_engines)
            self.assertEqual(result['state'],'ready')
            rows=result['rows'];self.assertEqual(rebuild_markdown(rows),md)
            chosen=[r for r in rows if r['source_line']==number]
            self.assertEqual(chosen[0]['adopted_engine'],'intl')
            self.assertEqual(chosen[0]['candidates_json'],next(r['candidates_json'] for r in old if r['source_line']==number))
            self.assertEqual(len(chosen),2)
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(upstream_evidence(db),before)
                self.assertEqual(db.execute('SELECT * FROM translation').fetchall(),[(1,'keep')])
                self.assertEqual(SentenceStore(db).read(md),rows)

    def test_legacy_upgrade_failure_dependency_and_stale_preserve_original(self):
        md='A. B.\n\n';plans=[plan([2],'adopted',[[2],[],[2]],'intl'),plan()]
        with closing(sqlite3.connect(':memory:',factory=FailConnection)) as db:
            old=create_legacy(db,md,plans)
            store=SentenceStore(db)
            self.assertEqual(store.inspect(md+'changed'),('stale',[]))
            store.upgrade(md+'changed',classify_markdown(md+'changed'))
            self.assertTrue(store.is_legacy())
            db.fail_insert=True
            with self.assertRaises(sqlite3.OperationalError):
                store.upgrade(md,classify_markdown(md))
            self.assertTrue(store.is_legacy())
            self.assertEqual(store.inspect(md),('legacy',[]))
            db.fail_insert=False
            store.upgrade(md,classify_markdown(md))
            self.assertEqual(rebuild_markdown(store.read(md)),md)
        with closing(sqlite3.connect(':memory:')) as db:
            create_legacy(db,md,plans)
            db.execute('CREATE VIEW foreign_view AS SELECT sentence_text FROM sentence');db.commit()
            store=SentenceStore(db)
            with self.assertRaisesRegex(ValueError,'external SQL dependency'):
                store.upgrade(md,classify_markdown(md))
            self.assertTrue(store.is_legacy())
