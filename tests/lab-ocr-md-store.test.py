"""WCP54 MD line-table, blank lines, trailing newline, CAS, idempotent retry.

All files are in an ephemeral synthetic book.  Never initialize a user book.
"""
import json,sqlite3,sys,tempfile,unittest,uuid
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals,existing_info,OCRImportError
from v6_lab_ocr_block_view import initialize_block_projection
from v6_lab_ocr_md import read_md,initialize_md,persist_md_splice


def make_book(book):
    (book/'mineru json').mkdir();(book/'pdf').mkdir()
    (book/'pdf'/'book.pdf').write_bytes(b'%PDF-1.7\nsource pdf')
    def block(typ,txt=None,level=None,children=None,html=None):
        d={'type':typ,'bbox':[20,20,170,120],
           'lines':[{'spans':[{'type':'table','html':html}] if html else
                              [{'type':'text','content':txt}]}] if txt is not None or html else []}
        if level is not None:d['level']=level
        if children is not None:d['blocks']=children
        return d
    raw=json.dumps({'pdf_info':[{'page_idx':0,'page_size':[595,842],
       'preproc_blocks':[],'discarded_blocks':[],
       'para_blocks':[block('title','Chapter A',2),
         block('text','Alpha line'),
         block('table',children=[block('table_body',html='<table><tr><td>A</td></tr></table>')]),
         block('text','End')]}]},ensure_ascii=False).encode('utf8')
    (book/'mineru json'/'book.json').write_bytes(raw)
    import_workspace(book)
    initialize_block_projection(book)
    return raw


class MDStorage(unittest.TestCase):
    def test_rows_and_exact_newline_roundtrip(self):
        with tempfile.TemporaryDirectory() as root:
            book=Path(root);raw=make_book(book);seal=originals(book)
            self.assertEqual(read_md(book)['status'],'missing')
            initial=initialize_md(book)
            self.assertEqual(initial['status'],'created')
            rows=initial['rows']
            self.assertTrue(rows)
            self.assertEqual([(r['line_no'],r['text']) for r in rows],
                list(enumerate([r['text'] for r in rows],1)))
            self.assertEqual(rows[0]['text'],'## Chapter A')
            self.assertEqual(rows[1]['text'],'')
            self.assertIn('Alpha line',[r['text'] for r in rows])
            self.assertIn('<table><tr><td>A</td></tr></table>',[r['text'] for r in rows])
            self.assertEqual(rows[-1]['text'],'')
            assert ''.join(r['text']+'\n' for r in rows[:-1])+rows[-1]['text']==(
                '\n'.join(r['text'] for r in rows))
            self.assertTrue('\n'.join(r['text'] for r in rows).endswith('\n'))
            self.assertEqual(initialize_md(book)['status'],'existing')
            self.assertEqual([r['line_id'] for r in read_md(book)['rows']],
                             [r['line_id'] for r in rows])
            self.assertEqual(originals(book),seal)
            self.assertEqual((book/'mineru json'/'book.json').read_bytes(),raw)
            # Insert a blank line at the front: every later line shifts, IDs stay stable.
            new={'line_id':'new-'+uuid.uuid4().hex,'block_id':None,'text':''}
            result=persist_md_splice(book,0,'md-test-insert-001',1,0,[new])
            self.assertEqual(result['revision'],1)
            shifted=read_md(book)['rows']
            self.assertEqual(shifted[0]['text'],'')
            self.assertEqual([x['line_id'] for x in shifted[1:]],
                             [x['line_id'] for x in rows])
            self.assertEqual(persist_md_splice(book,0,'md-test-insert-001',1,0,[new]),result)
            with self.assertRaisesRegex(OCRImportError,'版本冲突'):
                persist_md_splice(book,0,'md-test-insert-002',1,0,[new])
            # Replace one text line preserving its line ID.
            target=next(r for r in shifted if r['text']=='Alpha line')
            result=persist_md_splice(book,1,'md-test-edit-0001',target['line_no'],1,
                [{'line_id':target['line_id'],'block_id':target['block_id'],'text':'Corrected Alpha'}])
            self.assertEqual(result['revision'],2)
            self.assertIn('Corrected Alpha',[r['text'] for r in read_md(book)['rows']])
            self.assertEqual(originals(book),seal)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
                self.assertEqual(db.execute('SELECT COUNT(*) FROM md_line').fetchone()[0],len(rows)+1)
                self.assertEqual(db.execute('SELECT revision FROM md_meta').fetchone()[0],2)
            # Existing edited MD must never be re-generated from raw OCR.
            self.assertEqual(initialize_md(book)['status'],'existing')
            self.assertIn('Corrected Alpha',[r['text'] for r in read_md(book)['rows']])
            with self.assertRaisesRegex(OCRImportError,'MD 行表'):
                initialize_block_projection(book)
            # An external Block review must not be followed by a stale MD
            # writer silently persisting the wrong Block provenance.
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                db.execute('''CREATE TABLE IF NOT EXISTS block_edit_meta(
                  id INTEGER PRIMARY KEY,revision INTEGER NOT NULL,
                  cursor INTEGER NOT NULL,import_fingerprint TEXT NOT NULL)''')
                db.execute('INSERT OR REPLACE INTO block_edit_meta VALUES(1,8,0,?)',
                           (existing_info(book)['signature'],))
            with self.assertRaisesRegex(OCRImportError,'Block 版本冲突'):
                persist_md_splice(book,2,'md-stale-block-0001',1,0,[],block_revision=0)

    def test_line_zero_and_terminal_newline_are_distinct(self):
        with tempfile.TemporaryDirectory() as root:
            book=Path(root);make_book(book);initialize_md(book)
            rows=read_md(book)['rows']
            # Deliberately replace document with a single line, NO LF.
            single={'line_id':'md-single','block_id':rows[0]['block_id'],'text':'hello'}
            persist_md_splice(book,0,'md-test-single-01',1,len(rows),[single])
            self.assertEqual('\n'.join(x['text'] for x in read_md(book)['rows']),'hello')
            # One extra blank line represents a trailing LF, losslessly.
            blank={'line_id':'md-blank','block_id':single['block_id'],'text':''}
            persist_md_splice(book,1,'md-test-eof-0001',2,0,[blank])
            self.assertEqual('\n'.join(x['text'] for x in read_md(book)['rows']),'hello\n')
            # Empty line is a first-class record, not a special sentinel.
            persist_md_splice(book,2,'md-test-empty-01',1,2,
                [{'line_id':'md-empty','block_id':None,'text':''}])
            self.assertEqual('\n'.join(x['text'] for x in read_md(book)['rows']),'')

if __name__=='__main__': unittest.main()
