"""Direct contract: physical continued captions survive MinerU para cross-page merges.

Fixture is synthetic and isolated. Original bytes remain authoritative; neither
Block review nor existing edited MD can be reset by a read-only view refresh.
"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from v6_lab_ocr_store import import_workspace, originals
from v6_lab_ocr_block_view import initialize_block_projection, refresh_block_view
from v6_lab_ocr_md import initialize_md, read_md, persist_md_splice
from v6_lab_ocr_reconcile_captions import plan_caption_repairs, apply_caption_repairs


def _line(text):
    return {'spans': [{'type': 'text', 'content': text}]}


def _table_child(typ, box, lines, deleted=False):
    result = {'type': typ, 'bbox': box, 'lines': lines}
    if deleted:
        result['lines_deleted'] = True
    return result


def _book(book, ambiguous=False):
    (book / 'mineru json').mkdir()
    (book / 'pdf').mkdir()
    (book / 'pdf' / 'a.pdf').write_bytes(b'%PDF-1.4\nfixture')
    root = [20, 90, 520, 400]
    caption = [25, 70, 505, 90]
    body = [25, 100, 505, 300]
    note = [25, 310, 505, 340]
    continuation = [
        _table_child('table_caption', caption,
                     [_line('Table 1. Sample'), _line('(continued)')]),
        _table_child('table_body', body, [_line('CHILD-DUPLICATE-BODY')]),
        _table_child('table_footnote', note, [_line('CHILD-DUPLICATE-NOTE')]),
    ]
    if ambiguous:
        continuation.append(_table_child('table_caption', caption,
                                         [_line('Ambiguous caption')]))
    deleted = [
        _table_child('table_caption', caption, [], True),
        _table_child('table_body', body, [], True),
        _table_child('table_footnote', note, [], True),
    ]
    page1 = {'page_idx': 0, 'page_size': [600, 800],
             'preproc_blocks': [{'type': 'table', 'bbox': root,
                                 'blocks': [_table_child('table_body', body,
                                                        [_line('FIRST BODY')])]}],
             'para_blocks': [{'type': 'text', 'bbox': [10, 10, 50, 50],
                              'lines': [_line('Start')]},
                             {'type': 'table', 'bbox': root,
                              'blocks': [_table_child('table_body', body,
                                                     [_line('FIRST BODY + MERGED BODY + MERGED NOTE')])]}],
             'discarded_blocks': []}
    page2 = {'page_idx': 1, 'page_size': [600, 800],
             'preproc_blocks': [{'type': 'table', 'bbox': root,
                                 'blocks': continuation}],
             'para_blocks': [{'type': 'table', 'bbox': root,
                              'blocks': deleted},
                             {'type': 'text', 'bbox': [20, 400, 100, 500],
                              'lines': [_line('After the table')]}],
             'discarded_blocks': []}
    raw = json.dumps({'pdf_info': [page1, page2]}).encode()
    (book / 'mineru json' / 'a.json').write_bytes(raw)
    import_workspace(book)
    initialize_block_projection(book)
    return raw


class CrossPageCaptionRecovery(unittest.TestCase):
    def test_fresh_init_and_review_refresh_preserve_caption_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            book = Path(tmp)
            raw = _book(book)
            original = originals(book)
            with sqlite3.connect(book / 'ocr2md.sqlite') as db:
                rows = db.execute("SELECT block_id,pbs,block_type,line_count,content_preview,content_source,block_json "
                                  "FROM block WHERE global_page=1 ORDER BY block_id").fetchall()
                cap = next(row for row in rows if row[2] == 'table_caption')
                self.assertEqual((cap[3], cap[5]), (2, 'preproc_caption'))
                self.assertIn('(continued)', cap[4])
                self.assertTrue(json.loads(cap[6])['lines_deleted'])
                for kind in ('table_body', 'table_footnote'):
                    row = next(row for row in rows if row[2] == kind)
                    self.assertEqual((row[3], row[4], row[5]), (0, '', 'para_deleted'))
                db.execute('UPDATE block_review SET pbs=? WHERE block_id=?',
                           ('p2b77s0', cap[0]))
            created = initialize_md(book)
            doc = read_md(book)
            caplines = [r for r in doc['rows'] if r['block_id'] == cap[0] and r['text']]
            self.assertEqual([r['text'] for r in caplines], ['Table 1. Sample', '(continued)'])
            self.assertEqual(sum('CHILD-DUPLICATE' in r['text'] for r in doc['rows']), 0)
            edited = next(r for r in doc['rows'] if r['text'] == 'Start')
            persist_md_splice(book, 0, 'caption-test-cas-0001', edited['line_no'], 1,
                              [{**edited, 'text': 'User reviewed Start'}])
            snapshot = read_md(book)
            self.assertEqual(refresh_block_view(book)['status'], 'refreshed')
            self.assertEqual(refresh_block_view(book)['status'], 'refreshed')
            with sqlite3.connect(book / 'ocr2md.sqlite') as db:
                self.assertEqual(db.execute('SELECT pbs FROM block WHERE block_id=?',
                                            (cap[0],)).fetchone()[0], 'p2b77s0')
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(read_md(book), snapshot)
            self.assertEqual(originals(book), original)
            self.assertEqual((book / 'mineru json' / 'a.json').read_bytes(), raw)

    def test_existing_missing_caption_cas_repair_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            book=Path(tmp)/'book'
            book.mkdir()
            _book(book)
            original=originals(book)
            initialize_md(book)
            before=read_md(book)
            cap=next(row for row in before['rows'] if row['text']=='Table 1. Sample')
            cont=next(row for row in before['rows'] if row['text']=='(continued)')
            self.assertEqual(cont['line_no'],cap['line_no']+1)
            # Simulate a previously generated MD table, where caption text
            # was omitted even though separators and source data survived.
            persist_md_splice(book,0,'caption-fixture-erase-1',cap['line_no'],2,[])
            edited=read_md(book)
            start=next(row for row in edited['rows'] if row['text']=='Start')
            persist_md_splice(book,1,'caption-fixture-useredit',start['line_no'],1,
                              [{**start,'text':'Reviewed original Start'}])
            stable=read_md(book)
            backup=Path(tmp)/'prior.db'
            result=apply_caption_repairs(book,backup)
            self.assertEqual(len(result['repaired']),1)
            self.assertEqual(result['repaired'][0]['inserted'],2)
            self.assertTrue(backup.exists())
            after=read_md(book)
            self.assertEqual(after['revision'],stable['revision']+1)
            self.assertEqual([r['text'] for r in after['rows'] if r['block_id']==cap['block_id']
                              and r['text']],['Table 1. Sample','(continued)'])
            self.assertIn('Reviewed original Start',[r['text'] for r in after['rows']])
            self.assertTrue({r['line_id'] for r in stable['rows']}.issubset(
                            {r['line_id'] for r in after['rows']}))
            self.assertFalse(plan_caption_repairs(book)['plans'])
            self.assertEqual(originals(book),original)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_ambiguous_original_must_not_restore(self):
        with tempfile.TemporaryDirectory() as tmp:
            book = Path(tmp)
            _book(book, ambiguous=True)
            with sqlite3.connect(book / 'ocr2md.sqlite') as db:
                row = db.execute("SELECT line_count,content_source,content_preview "
                                 "FROM block WHERE global_page=1 AND block_type='table_caption'").fetchone()
                self.assertEqual(row, (0, 'para_deleted', ''))


if __name__ == '__main__':
    unittest.main()
