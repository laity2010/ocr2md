"""WP04D real Node engines -> Python store -> isolated three-table SQLite."""
import copy
import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from collections import Counter, defaultdict
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sentence_initialize import initialize_sentence_table
from sentence_store import SentenceStore, rebuild_markdown
from test_sentence_store import prepare_owned_book, upstream_evidence, base, FailConnection


class InitializationTests(unittest.TestCase):
    def test_real_three_engines_initialize_and_reopen(self):
        with tempfile.TemporaryDirectory(prefix='sentence-wp04d-') as temp:
            folder = Path(temp)
            snapshot = prepare_owned_book(folder)
            markdown = snapshot['markdown']
            path = folder / base.DB_NAME
            with closing(sqlite3.connect(path)) as db:
                before = upstream_evidence(db)
                rows = initialize_sentence_table(db, snapshot)
                self.assertEqual(rebuild_markdown(rows), markdown)
                self.assertEqual(SentenceStore(db).read(markdown), rows)
                # Refusal protects existing data, even if called again.
                with self.assertRaisesRegex(ValueError, 'already exists'):
                    initialize_sentence_table(db, snapshot)
                self.assertEqual(SentenceStore(db).read(markdown), rows)
            groups = defaultdict(list)
            for r in rows:
                groups[r['source_line']].append(r)
            states = Counter(g[0]['review_state'] for g in groups.values())
            self.assertEqual(len(groups), 497)
            self.assertGreater(states['agreed'], 0)
            self.assertGreater(states['disputed'], 0)
            self.assertGreater(states['no_split'], 0)
            self.assertEqual(states['engine_error'], 0)
            self.assertEqual(states['adopted'], 0)
            for number, group in groups.items():
                first = group[0]
                c = json.loads(first['candidates_json'])
                self.assertTrue(all(v['version'].find('config=') >= 0 for v in c.values()))
                if first['review_state'] == 'agreed':
                    self.assertEqual(len(group), len(c['intl']['boundaries'])+1)
                else:
                    self.assertEqual(len(group), 1)
                self.assertIsNone(first['adopted_engine'])
                self.assertEqual(''.join(r['sentence_text']+r['line_eol'] for r in group),
                                 markdown.split('\n')[number-1]+'\n')
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(upstream_evidence(db), before)
                self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                                 {'mineru_base','logical_block','sentence'})
                self.assertEqual(SentenceStore(db).read(markdown), rows)
            with self.assertRaises(base.BaseError):
                base.existing_markdown(folder)
            print('WP04D_REAL_INIT', json.dumps(dict(mdlines=len(groups), sentence_rows=len(rows), states=states),sort_keys=True))

    def test_failed_init_keeps_upstream_and_can_retry(self):
        with tempfile.TemporaryDirectory(prefix='sentence-wp04d-failure-') as temp:
            folder = Path(temp)
            snapshot = prepare_owned_book(folder)
            path = folder / base.DB_NAME
            with closing(sqlite3.connect(path, factory=FailConnection)) as db:
                before = upstream_evidence(db)
                bad = copy.deepcopy(snapshot)
                bad['sha256'] = '0'*64
                with self.assertRaises(subprocess.CalledProcessError):
                    initialize_sentence_table(db, bad)
                self.assertEqual(upstream_evidence(db), before)
                db.fail_insert = True
                with self.assertRaises(sqlite3.OperationalError):
                    initialize_sentence_table(db, snapshot)
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(upstream_evidence(db), before)
                self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},
                                 {'mineru_base','logical_block'})
                rows = initialize_sentence_table(db, snapshot)
                self.assertEqual(rebuild_markdown(rows), snapshot['markdown'])


if __name__ == '__main__':
    unittest.main()
