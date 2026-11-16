"""Inline MinerU Span -> native math MD, CAS reconciliation on synthetic books."""
import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals,OCRImportError
from v6_lab_ocr_block_view import initialize_block_projection
from v6_lab_ocr_md import initialize_md,read_md,persist_md_splice,_inline_math,_span_text
from v6_lab_ocr_reconcile_inline_math import plan_inline_math,apply_inline_math


def setup_book(folder):
    folder.mkdir(parents=True,exist_ok=True)
    (folder/'mineru json').mkdir();(folder/'pdf').mkdir()
    (folder/'pdf'/'book.pdf').write_bytes(b'%PDF-1.7\nfixture')
    def span(kind,content):return {'type':kind,'content':content,'bbox':[25,30,70,41]}
    def para(spans):return {'type':'text','bbox':[20,20,450,75],
                            'lines':[{'bbox':[20,20,450,75],'spans':spans}]}
    blocks=[para([span('text','A '),span('inline_equation','x^2'),
                  span('text',' B '),span('inline_equation','x^2'),span('text',' C')]),
            para([span('text','Here '),span('inline_equation','y_1'),span('text',' end.')]),
            para([span('text','Already '),span('inline_equation','$z^3$'),span('text',' fine')]),
            {'type':'interline_equation','bbox':[30,160,200,190],
             'lines':[{'spans':[span('interline_equation','a+b')]}]}]
    data={'pdf_info':[{'page_idx':0,'page_size':[595,842],
          'preproc_blocks':[],'discarded_blocks':[],'para_blocks':blocks}]}
    raw=json.dumps(data,ensure_ascii=False).encode()
    (folder/'mineru json'/'book.json').write_bytes(raw)
    import_workspace(folder);initialize_block_projection(folder)
    return raw


class InlineMathMarkdown(unittest.TestCase):
    def test_span_projection_and_safe_delimiters(self):
        self.assertEqual(_inline_math('x^2'),'$x^2$')
        self.assertEqual(_inline_math('$x^2$'),'$x^2$')
        self.assertEqual(_inline_math(''),'')
        self.assertEqual(_inline_math('cost $5'), 'cost $5')
        self.assertEqual(_inline_math('\\$ symbol'),'$\\$ symbol$')
        self.assertEqual(_span_text({'lines':[{'spans':[
          {'type':'text','content':'A'},
          {'type':'inline_equation','content':'r_t'},
          {'type':'text','content':'.'}]}]}),['A$r_t$.'])

    def test_fresh_creation_writes_native_math_and_keeps_original(self):
        with tempfile.TemporaryDirectory() as root:
            book=Path(root)/'book';raw=setup_book(book);seal=originals(book)
            first=initialize_md(book)
            texts=[r['text'] for r in first['rows']]
            self.assertIn('A $x^2$ B $x^2$ C',texts)
            self.assertIn('Here $y_1$ end.',texts)
            self.assertIn('Already $z^3$ fine',texts)
            self.assertTrue(any('$$' in s for s in texts))
            self.assertEqual(first['revision'],0)
            self.assertEqual(initialize_md(book)['status'],'existing')
            self.assertEqual(plan_inline_math(book)['updates'],[])
            self.assertEqual(originals(book),seal)
            self.assertEqual((book/'mineru json'/'book.json').read_bytes(),raw)

    def test_existing_edited_line_is_skipped_and_other_lines_safe(self):
        with tempfile.TemporaryDirectory() as root:
            book=Path(root)/'book';raw=setup_book(book);initialize_md(book)
            baseline=read_md(book)
            # Deliberately simulate a legacy book and a user-reviewed paragraph.
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                ids={r[0]:r[1] for r in db.execute("select block_id,line_no from md_line where text like '%$x^2$%' or text like '%$y_1$%'")}
                assert len(ids)==2
                db.execute("update md_line set text='A x^2 B x^2 C' where block_id=? and text<>''",(min(ids),))
                db.execute("update md_line set text='Hand reviewed y_1, cannot infer' where block_id=? and text<>''",(max(ids),))
            seal=originals(book)
            before=read_md(book);snapshot={r['line_id']:dict(r) for r in before['rows']}
            plan=plan_inline_math(book)
            self.assertEqual(plan['updated_lines'],1)
            self.assertEqual(len(plan['skipped']),1)
            self.assertEqual(len(plan['already']),1)
            self.assertEqual(plan['formula_count'],2)
            backup=Path(root)/'backup.sqlite'
            result=apply_inline_math(book,backup)
            self.assertTrue(result['migrated']);self.assertTrue(backup.is_file())
            self.assertEqual(result['newRevision'],before['revision']+1)
            after=read_md(book)
            self.assertEqual([r['line_id'] for r in before['rows']],[r['line_id'] for r in after['rows']])
            for row in after['rows']:
                old=snapshot[row['line_id']]
                self.assertEqual(row['block_id'],old['block_id'])
                self.assertEqual(row['line_no'],old['line_no'])
                if row['block_id']!=min(ids):self.assertEqual(row['text'],old['text'])
            self.assertIn('A $x^2$ B $x^2$ C',[r['text'] for r in after['rows']])
            self.assertIn('Hand reviewed y_1, cannot infer',[r['text'] for r in after['rows']])
            self.assertEqual(originals(book),seal)
            self.assertEqual((book/'mineru json'/'book.json').read_bytes(),raw)
            self.assertFalse(apply_inline_math(book,Path(root)/'never-created.sqlite')['migrated'])
            self.assertFalse((Path(root)/'never-created.sqlite').exists())
            self.assertEqual(initialize_md(book)['status'],'existing')
            with sqlite3.connect(backup) as db:
                self.assertEqual(db.execute('select text from md_line where block_id=?',(min(ids),)).fetchone()[0], 'A x^2 B x^2 C')
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok')
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])


if __name__=='__main__':unittest.main()
