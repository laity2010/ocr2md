"""WP04C direct API, isolated real SQLite and transaction guard tests."""
import copy
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from sentence_store import (SentenceStore, build_sentence_rows, rebuild_markdown, split_mdline, ENGINES)

# Existing upstream test fixture; never access a real user directory.
sys.path.insert(0, str(ROOT.parent / 'lab-ocr-v2' / 'tests'))
from test_v2_owned_edit import prepare_owned_book
import v2_mineru_base as base


def plan(cuts=(), state='no_split', alternatives=None, chosen=None):
    boundaries = list(cuts)
    candidates = {
        engine: dict(version='fixture-v1', status='ok', boundaries=list(values), protected_ranges=[])
        for engine, values in zip(ENGINES, alternatives if alternatives is not None else [cuts]*3)
    }
    return dict(boundaries=boundaries, candidates=candidates, review_state=state, adopted_engine=chosen)


def whole_plans(markdown):
    return [plan() for _ in range(len(markdown.split('\n')) - int(markdown.endswith('\n') or not markdown))]


def upstream_evidence(db):
    return (
        db.execute('SELECT * FROM mineru_base ORDER BY blockid').fetchall(),
        db.execute('SELECT * FROM logical_block ORDER BY logical_order').fetchall(),
        db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name IN ('mineru_base','logical_block') ORDER BY name").fetchall(),
        db.execute('PRAGMA user_version').fetchone(),
    )


class FailConnection(sqlite3.Connection):
    fail_insert = False

    def executemany(self, sql, values):
        if not self.fail_insert:
            return super().executemany(sql, values)
        iterator = iter(values)
        self.execute(sql, next(iterator))
        raise sqlite3.OperationalError('injected failure after first inserted sentence')


class SentenceStoreTests(unittest.TestCase):
    def test_utf16_lossless_and_reject_invalid_cuts(self):
        text = '  😀. Next.  '
        self.assertEqual(split_mdline(text, [5]), ['  😀.', ' Next.  '])
        for cuts in ([3], [0], [5,5], [6,5], [99], [True]):
            with self.subTest(cuts=cuts), self.assertRaises(ValueError):
                split_mdline(text, cuts)
        self.assertEqual(split_mdline('', []), [''])
        with self.assertRaises(ValueError):
            split_mdline('a\nb', [])

    def test_rows_reconstruct_exact_markdown_and_all_review_states(self):
        md = '  😀. Next.  \n\nA. B.\nC. D.\nEnd.  '
        plans = [
            plan([5], 'agreed'),
            plan(),
            plan([], 'disputed', [[2], [], [2]]),
            plan([2], 'adopted', [[2], [], [2]], 'intl'),
            plan([], 'engine_error'),
        ]
        plans[-1]['candidates']['intl']['status'] = 'error'
        # Emoji is protected at UTF-16 2..4. The agreed cut at 5 is legal.
        for candidate in plans[0]['candidates'].values():
            candidate['protected_ranges'] = [[2, 4]]
        rows = build_sentence_rows(md, plans)
        self.assertEqual(rebuild_markdown(rows), md)
        self.assertEqual(len(rows), 7)
        self.assertEqual([r['sentence_text'] for r in rows[:3]], ['  😀.', ' Next.  ', ''])
        self.assertEqual([r['line_eol'] for r in rows[:3]], ['', '\n', '\n'])
        self.assertIsNone(rows[1]['candidates_json'])
        for text in ('', '\n', '\n\n', ' A.  ', 'A\n', 'A\n\n', ' $$a$$ \n<!--\nHi.\n-->\n'):
            self.assertEqual(rebuild_markdown(build_sentence_rows(text, whole_plans(text))), text)
        bad = copy.deepcopy(plans)
        bad[3]['adopted_engine'] = 'sentence-splitter'
        with self.assertRaises(ValueError):
            build_sentence_rows(md, bad)
        bad = copy.deepcopy(plans)
        bad[0]['candidates']['intl']['protected_ranges'] = [[2, 6]]
        with self.assertRaisesRegex(ValueError, 'boundary cuts protected'):
            build_sentence_rows(md, bad)
        for change in (
            lambda r: r[0].update(sentence_text='broken'),
            lambda r: r[1].update(from_utf16=0),
            lambda r: r[1].update(line_eol=''),
            lambda r: r[1].update(review_state='adopted'),
            lambda r: r.pop(),
            lambda r: r.reverse(),
            lambda r: r[0].update(source_document_hash=None),
            lambda r: r.insert(3, r.pop(1)),
        ):
            damaged = copy.deepcopy(rows)
            change(damaged)
            with self.assertRaises(ValueError):
                rebuild_markdown(damaged)

    def test_real_fixture_three_tables_reopen_and_upstream_unchanged(self):
        with tempfile.TemporaryDirectory(prefix='sentence-wp04c-') as temp:
            folder = Path(temp)
            snapshot = prepare_owned_book(folder)
            markdown = snapshot['markdown']
            rows = build_sentence_rows(markdown, whole_plans(markdown))
            self.assertEqual(len(rows), 497)
            path = folder / base.DB_NAME
            with closing(sqlite3.connect(path)) as db:
                before = upstream_evidence(db)
                store = SentenceStore(db)
                store.replace_all(markdown, rows)
                store.replace_all(markdown, rows)
                self.assertEqual(store.read(markdown), rows)
                for sql in ('UPDATE logical_block SET md_block=""',
                            'DELETE FROM mineru_base',
                            'ALTER TABLE logical_block ADD COLUMN pollution TEXT',
                            'DROP TABLE mineru_base',
                            'CREATE TABLE extra(id INTEGER)',
                            'ATTACH DATABASE ":memory:" AS extra'):
                    with self.subTest(sql=sql), self.assertRaises(sqlite3.DatabaseError):
                        db.execute(sql)
                with self.assertRaises(ValueError):
                    store.read(markdown + 'changed')
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(upstream_evidence(db), before)
                names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                self.assertEqual(names, {'mineru_base','logical_block','sentence'})
                self.assertEqual(SentenceStore(db).read(markdown), rows)
            # Existing upstream API still refuses three tables: explicit integration gate.
            with self.assertRaises(base.BaseError):
                base.existing_markdown(folder)

    def test_atomic_failure_first_initialization_and_replacement(self):
        with tempfile.TemporaryDirectory(prefix='sentence-rollback-') as temp:
            path = Path(temp) / 'isolated.sqlite'
            with closing(sqlite3.connect(path, factory=FailConnection)) as db:
                db.executescript('CREATE TABLE mineru_base(id); CREATE TABLE logical_block(id);')
                store = SentenceStore(db)
                initial = 'A. B.\n\n'
                rows = build_sentence_rows(initial, [plan([2], 'agreed'), plan()])
                db.fail_insert = True
                with self.assertRaises(sqlite3.OperationalError):
                    store.replace_all(initial, rows)
                with self.assertRaisesRegex(ValueError, 'not been initialized'):
                    store.read(initial)
                db.fail_insert = False
                store.replace_all(initial, rows)
                new = 'New. More.\n'
                new_rows = build_sentence_rows(new, [plan([4], 'agreed')])
                db.fail_insert = True
                with self.assertRaises(sqlite3.OperationalError):
                    store.replace_all(new, new_rows)
                self.assertEqual(store.read(initial), rows)
                with self.assertRaises(ValueError):
                    store.read(new)

    def test_unknown_table_or_schema_is_rejected(self):
        for extra in ('CREATE TABLE extra(id)', 'CREATE TABLE sentence(id)'):
            with closing(sqlite3.connect(':memory:')) as db:
                db.executescript('CREATE TABLE mineru_base(id); CREATE TABLE logical_block(id);'+extra)
                store = SentenceStore(db)
                with self.assertRaises(ValueError):
                    store.replace_all('', [])
        with closing(sqlite3.connect(':memory:')) as db:
            db.executescript('CREATE TABLE mineru_base(id); CREATE TABLE logical_block(id);')
            store = SentenceStore(db)
            store.replace_all('', [])
            self.assertEqual(store.read(''), [])


if __name__ == '__main__':
    unittest.main()
