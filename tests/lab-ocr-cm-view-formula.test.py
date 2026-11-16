"""Three tables + CM View + display-TeX without embedded image links.

All SQLite writes occur in an isolated temporary synthetic book. Original
MinerU bytes and every reviewed/edited MD line must remain intact on reload.
"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_block_view import initialize_block_projection
from v6_lab_ocr_md import initialize_md,read_md,persist_md_splice
from v6_lab_ocr_formula import display_equation


def create_book(book):
    (book/'mineru json').mkdir()
    (book/'pdf').mkdir()
    (book/'pdf'/'original.pdf').write_bytes(b'%PDF-1.7\nsynthetic PDF')
    formula={'type':'interline_equation','bbox':[20,70,180,110],
             'lines':[{'spans':[{
                 'type':'interline_equation','content':'E = mc^2',
                 'image_path':'https://images.example.org/equation%20(1).png'}]}]}
    plain=lambda text:{'type':'text','bbox':[20,20,160,40],
                       'lines':[{'spans':[{'type':'text','content':text}]}]}
    nested={**plain('Introductory text'),'blocks':[formula,plain('after equation')]}
    data={'pdf_info':[{'page_idx':0,'page_size':[595,842],
        'preproc_blocks':[],'discarded_blocks':[],
        'para_blocks':[nested,plain('Another parent')]}]}
    raw=json.dumps(data,ensure_ascii=False).encode()
    (book/'mineru json'/'source.json').write_bytes(raw)
    import_workspace(book)
    initialize_block_projection(book)
    return raw


class CMViewFormulaContract(unittest.TestCase):
    def test_formula_precedence_delimiters_and_url_safety(self):
        formula={'lines':[{'spans':[{'content':'\\frac{a}{b}',
                  'image_path':'https://example.org/formula%3E1.png'}]}]}
        self.assertEqual(display_equation(formula),'$$\n\\frac{a}{b}\n$$')
        self.assertEqual(display_equation(formula,legacy_links=True),
            '$$\n\\frac{a}{b}\n$$\n[原始公式图](<https://example.org/formula%3E1.png>)')
        # No TeX? A formula image is available through PDF bbox only,
        # and the immutable MinerU JSON still contains image_path.
        self.assertEqual(display_equation({'lines':[{'spans':[
            {'image_path':'figures/a.jpg'}]}]}),'')
        self.assertEqual(display_equation({'lines':[{'spans':[
            {'image_path':'figures/a.jpg'}]}]},legacy_links=True),'[原始公式图](<figures/a.jpg>)')
        self.assertEqual(display_equation({'lines':[{'spans':[
            {'content':'abc','image_path':'javascript:alert(1)'}]}]}),'$$\nabc\n$$')
        self.assertEqual(display_equation({'lines':[{'spans':[
            {'content':'x\n$$\ny'}]}]}),'```math\nx\n$$\ny\n```')
        self.assertEqual(display_equation({'lines':[{'spans':[
            {'content':'line1\n\nline3'}]}]}),'$$\nline1\n\nline3\n$$')

    def test_sql_three_business_tables_views_and_no_blank_between_siblings(self):
        with tempfile.TemporaryDirectory() as folder:
            book=Path(folder)
            raw=create_book(book)
            original=originals(book)
            created=initialize_md(book)
            self.assertEqual(created['status'],'created')
            rows=created['rows']
            text='\n'.join(row['text'] for row in rows)
            self.assertEqual(text,
                'Introductory text\n$$\nE = mc^2\n$$\n'
                'after equation\n\nAnother parent\n')
            self.assertEqual([r['line_no'] for r in rows],list(range(1,len(rows)+1)))
            self.assertEqual(rows[-1]['text'],'')
            self.assertEqual(rows[5]['text'],'','Only parent groups get a separator')
            self.assertEqual(rows[2]['text'],'E = mc^2')
            self.assertEqual(rows[3]['text'],'$$')
            self.assertEqual(rows[4]['text'],'after equation')
            self.assertEqual(rows[2]['block_id'],rows[3]['block_id'])
            self.assertNotEqual(rows[2]['block_id'],rows[4]['block_id'])
            self.assertNotEqual(rows[1]['block_id'],rows[0]['block_id'],
                'Parent and child remain separate logical BlockIDs')
            self.assertEqual(rows[5]['block_id'],rows[4]['block_id'],
                'Separator physical row is owned by preceding child block')
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                objects=dict(db.execute("SELECT name,type FROM sqlite_master "
                  "WHERE name IN ('minerujson','block_review','md_line','block','cm_view')"))
                self.assertEqual(objects,{'minerujson':'table','block_review':'table',
                     'md_line':'table','block':'view','cm_view':'view'})
                projected=db.execute('''SELECT line_no,line_id,block_id,text,pbs,
                     parent_block_id,source_root_id,source_json_path FROM cm_view
                     ORDER BY line_no''').fetchall()
                self.assertEqual(len(projected),len(rows))
                self.assertEqual([r[1] for r in projected],[r['line_id'] for r in rows])
                self.assertEqual([r[3] for r in projected],[r['text'] for r in rows])
                self.assertTrue(projected[2][4].endswith('s0'))
                self.assertIsNotNone(projected[2][5])
                self.assertIsNotNone(projected[2][6])
                self.assertEqual(projected[2][7],'$.blocks[0]')
                self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
            self.assertEqual(originals(book),original)
            self.assertEqual((book/'mineru json'/'source.json').read_bytes(),raw)

    def test_old_edited_md_never_reinitialized_or_silently_replaced(self):
        with tempfile.TemporaryDirectory() as folder:
            book=Path(folder);create_book(book)
            rows=initialize_md(book)['rows']
            source=next(r for r in rows if r['text']=='E = mc^2')
            edited={'line_id':source['line_id'],'block_id':source['block_id'],
                    'text':'E = m c^2'}
            persist_md_splice(book,0,'cm-view-save-001',source['line_no'],1,[edited])
            before=read_md(book)['rows']
            # Simulate a pre-CM-View database: no automatic writes on GET.
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                db.execute('DROP VIEW cm_view')
            self.assertEqual(read_md(book)['rows'],before)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertFalse(db.execute("SELECT 1 FROM sqlite_master "
                    "WHERE name='cm_view'").fetchone())
            # Explicit idempotent initializer adds only the read model.
            result=initialize_md(book)
            self.assertEqual(result['status'],'existing')
            self.assertEqual(result['revision'],1)
            self.assertEqual(result['rows'],before)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM cm_view').fetchone()[0],len(before))
            self.assertEqual(initialize_md(book)['rows'],before)
            self.assertEqual(originals(book)[0][0],'source.json')


if __name__=='__main__':
    unittest.main()
