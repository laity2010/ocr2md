"""WCP53: title Level is a read-only raw MinerU field, not PBS depth.

Check existing SQL VIEW and legacy materialized Block without reinitializing
or altering any original source bytes, parent relations or revision history.
"""
import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_block_view import initialize_block_projection,inspect_block_projection
from v6_lab_ocr_block import block_rows,minerujson2block

def make_book(path):
    (path/'mineru json').mkdir()
    (path/'pdf').mkdir()
    (path/'pdf'/'x.pdf').write_bytes(b'%PDF-1.7\n')
    def block(typ,label,**extra):
        return {'type':typ,'bbox':[20,30,100,80], 'lines':[{'spans':[
            {'type':'text','content':label}]}],**extra}
    page={'page_idx':0,'page_size':[595,842],'preproc_blocks':[],
      'discarded_blocks':[],
      'para_blocks':[
        block('title','Heading 1',level=1),
        block('title','Heading 3',level=3),
        block('title','No declared heading level'),
        block('title','Legacy text level',text_level=2),
        block('text','Body with irrelevant level',level=5),
        block('title','String level must not be guessed',level='2'),
      ]}
    raw=json.dumps({'pdf_info':[page]},ensure_ascii=False).encode()
    (path/'mineru json'/'x.json').write_bytes(raw)
    import_workspace(path)
    return raw

class LevelContract(unittest.TestCase):
    def _check(self,book,raw):
        initial=originals(book)
        rows=block_rows(book)['rows']
        self.assertEqual([(r['block_type'],r['level']) for r in rows],[
            ('title',1),('title',3),('title',None),('title',2),
            ('text',None),('title',None)])
        # Even when a title's PBS changes after review, its MinerU title level
        # is a separate unchanged datum, not inferred from s0 nesting.
        with sqlite3.connect(book/'ocr2md.sqlite') as db:
            table=('block_review' if db.execute(
              "SELECT 1 FROM sqlite_master WHERE type='table' AND name='block_review'"
            ).fetchone() else 'block')
            db.execute(f"UPDATE {table} SET pbs='p1b0s2' WHERE block_id=?",
                       (rows[1]['block_id'],))
        reviewed=block_rows(book)['rows'][1]
        self.assertEqual(reviewed['pbs'],'p1b0s2')
        self.assertEqual(reviewed['level'],3)
        self.assertEqual(originals(book),initial)
        self.assertEqual((book/'mineru json'/'x.json').read_bytes(),raw)

    def test_existing_view_no_schema_reinitialization(self):
        with tempfile.TemporaryDirectory() as td:
            book=Path(td)
            raw=make_book(book)
            initialize_block_projection(book)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                before=db.execute("SELECT sql FROM sqlite_master WHERE name='block'").fetchone()[0]
            self._check(book,raw)
            with sqlite3.connect(book/'ocr2md.sqlite') as db:
                self.assertEqual(db.execute(
                  "SELECT sql FROM sqlite_master WHERE name='block'").fetchone()[0],before)
            self.assertEqual(inspect_block_projection(book)['kind'],'view')

    def test_existing_legacy_entity_no_schema_migration(self):
        with tempfile.TemporaryDirectory() as td:
            book=Path(td)
            raw=make_book(book)
            minerujson2block(book)
            self._check(book,raw)
            self.assertEqual(inspect_block_projection(book)['kind'],'table')

if __name__=='__main__':
    unittest.main()
