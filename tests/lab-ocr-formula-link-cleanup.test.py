"""Synthetic-only explicit removal of obsolete formula-image references."""
from pathlib import Path
import importlib.util,json,sqlite3,sys,tempfile,unittest,uuid
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_md import initialize_md,read_md,persist_md_splice,_span_text
from v6_lab_ocr_store import originals,OCRImportError
from v6_lab_ocr_reconcile_formula_links import plan_formula_links,apply_formula_links

SPEC=Path(__file__).resolve().with_name('lab-ocr-cm-view-formula.test.py')
spec=importlib.util.spec_from_file_location('lab_ocr_cm_view_formula',SPEC)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)


def legacy(book):
    initial=initialize_md(book)
    assert not any('原始公式图' in row['text'] for row in initial['rows'])
    formula=next(row for row in initial['rows'] if row['text']=='E = mc^2')
    new={'line_id':'legacy-'+uuid.uuid4().hex,'block_id':formula['block_id'],
         'text':'[原始公式图](<https://images.example.org/equation%20(1).png>)'}
    persist_md_splice(book,initial['revision'],'formula-test-add-legacy-01',formula['line_no']+2,0,[new])
    return new

class FormulaLinkCleanup(unittest.TestCase):
    def test_formula_span_content_wins_image_but_media_is_unchanged(self):
        block={'lines':[{'spans':[
            {'type':'inline_equation','content':'x^2','image_path':'https://example.org/ocr.png'},
            {'type':'interline_equation','content':'y^2','image_path':'https://example.org/math.png'},
            {'type':'image','image_path':'https://example.org/normal.png'}]}]}
        text=_span_text(block)
        self.assertEqual(text,['$x^2$y^2![image](<https://example.org/normal.png>)'])
        self.assertNotIn('ocr.png',text[0]);self.assertNotIn('math.png',text[0])

    def test_precise_cleanup_preserves_lines_and_source(self):
        with tempfile.TemporaryDirectory() as folder:
            book=Path(folder)/'book';book.mkdir();original_raw=module.create_book(book)
            addition=legacy(book)
            seal=originals(book)
            before=read_md(book)
            plan=plan_formula_links(book)
            self.assertEqual(plan['removed_link_count'],1)
            self.assertFalse(plan['skipped'])
            output=apply_formula_links(book,Path(folder)/'backup.sqlite')
            self.assertTrue(output['migrated'])
            self.assertEqual(output['newRevision'],before['revision']+1)
            after=read_md(book)
            self.assertEqual(len(before['rows']),len(after['rows']))
            self.assertEqual([r['line_id'] for r in before['rows']],[r['line_id'] for r in after['rows']])
            self.assertEqual([r['block_id'] for r in before['rows']],[r['block_id'] for r in after['rows']])
            differences=[(a,b) for a,b in zip(before['rows'],after['rows']) if a['text']!=b['text']]
            self.assertEqual(len(differences),1)
            self.assertEqual(differences[0][0]['text'],addition['text'])
            self.assertEqual(differences[0][1]['text'],'')
            self.assertEqual(originals(book),seal)
            self.assertEqual((book/'mineru json'/'source.json').read_bytes(),original_raw)
            repeat=apply_formula_links(book,Path(folder)/'should-not-appear.sqlite')
            self.assertFalse(repeat['migrated'])
            self.assertFalse((Path(folder)/'should-not-appear.sqlite').exists())
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertEqual(db.execute('pragma integrity_check').fetchone()[0],'ok')
                self.assertEqual(db.execute('pragma foreign_key_check').fetchall(),[])
            with sqlite3.connect(Path(folder)/'backup.sqlite') as db:
                self.assertEqual(db.execute('select text from md_line where line_id=?',(addition['line_id'],)).fetchone()[0],addition['text'])

    def test_changed_formula_not_deleted(self):
        with tempfile.TemporaryDirectory() as folder:
            book=Path(folder)/'book';book.mkdir();module.create_book(book)
            addition=legacy(book)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                db.execute("update md_line set text='Hand edited E=mc^2' where text='E = mc^2'")
            planned=plan_formula_links(book)
            self.assertFalse(planned['pending']);self.assertEqual(len(planned['skipped']),1)
            output=apply_formula_links(book,Path(folder)/'unneeded.sqlite')
            self.assertFalse(output['migrated'])
            self.assertIn(addition['text'],[r['text'] for r in read_md(book)['rows']])

if __name__=='__main__':unittest.main()
