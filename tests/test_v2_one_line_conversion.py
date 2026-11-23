"""WP14: import-only MD normalization must not mutate raw OCR or SQL shape."""
import sys,shutil,tempfile,unittest,sqlite3
from pathlib import Path
from contextlib import closing
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as base
from v2_md_block import initial_md,single_line_md
FIX=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class OneLineTest(unittest.TestCase):
 def test_one_line_derivation(self):
  self.assertEqual(single_line_md('Foo  \n Bar\r\n Baz'),'Foo Bar Baz')
  self.assertEqual(initial_md('x \n y','text',{}),'x y')
  self.assertEqual(initial_md('Big \n Title','title',{'level':2}),'## Big Title')
  self.assertEqual(initial_md('x\ny','interline_equation',{}),'$$x y$$')
  self.assertEqual(initial_md('A\n', 'table_caption',{}),'A')
  self.assertEqual(initial_md('\nNote\n', 'table_footnote',{}),'Note')
 def test_real_267_sql_blocks_and_immutable_base(self):
  with tempfile.TemporaryDirectory() as t:
   folder=Path(t);(folder/'minerujson').mkdir()
   shutil.copyfile(FIX,folder/'minerujson'/'book.json')
   original=FIX.read_bytes()
   base.new_book(folder)
   with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
    texts=[x[0] for x in db.execute('SELECT md_block FROM logical_block ORDER BY logical_order')]
    groups=[x[0] for x in db.execute('SELECT block_group FROM mineru_base WHERE blockid>0')]
    self.assertEqual(len(texts),267)
    self.assertEqual(len(groups),539)
    self.assertTrue(any(x.startswith('$$') and x.endswith('$$') for x in texts))
    self.assertTrue(all('\n' not in x and '\r' not in x for x in texts))
   self.assertEqual((folder/'minerujson'/'book.json').read_bytes(),original)
   source=base.existing_markdown(folder)
   self.assertEqual(source['rowCount'],267)

if __name__=='__main__':unittest.main()
