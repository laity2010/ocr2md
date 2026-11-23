"""WP09 explicit logical-only reset: source/base untouched, rollback on error."""
import hashlib,sqlite3,sys,tempfile,shutil,unittest
from pathlib import Path
from unittest.mock import patch
from contextlib import closing
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v
from v2_logical_contract import raw_element_text

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class Authorized:
    def __init__(self):self.calls=0
    def probe(self,p):self.calls+=1
class WP09Rebuild(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.folder=Path(self.temp.name)
        p=self.folder/'minerujson';p.mkdir();self.source=p/'fixture.json'
        shutil.copyfile(FIXTURE,self.source)
        v.new_book(self.folder)
        self.db=self.folder/v.DB_NAME
        self.raw=self.source.read_bytes()
        with closing(sqlite3.connect(self.db)) as db:
            self.base=[tuple(x) for x in db.execute('SELECT * FROM mineru_base ORDER BY blockid')]
            self.original=[tuple(x) for x in db.execute('SELECT * FROM logical_block ORDER BY logical_order')]
    def tearDown(self):self.temp.cleanup()
    def table(self,table):
        with closing(sqlite3.connect(self.db)) as db:
            return [tuple(x) for x in db.execute('SELECT * FROM '+table+' ORDER BY '+('blockid' if table=='mineru_base' else 'logical_order'))]
    def reset(self,auth=None):
        return v.dispatch('logical-rebuild','POST',self.folder,
            {'workspace':str(self.folder),'confirm':'rebuild-v2-logical-only'}, {},auth or Authorized())
    def test_clear_prior_logic_and_rebuild_267_typed_exact_rows(self):
        with closing(sqlite3.connect(self.db)) as db:
            db.execute("UPDATE logical_block SET markdown_text='DELIBERATE-USER-OLD',block_type='corrupted' WHERE logical_order=1")
            db.execute("UPDATE logical_block SET p=100,b=1 WHERE logical_order=2")
            db.commit()
        auth=Authorized();result=self.reset(auth)
        self.assertEqual(auth.calls,1)
        self.assertEqual(result,dict(rebuilt=True,previousLogicalCount=267,logicalCount=267,
            blockCount=539,baseChanged=False,dbFile='ocr2md.v2.sqlite'))
        self.assertEqual(self.table('logical_block'),self.original)
        self.assertEqual(self.table('mineru_base'),self.base)
        self.assertEqual(self.source.read_bytes(),self.raw)
        current=v.existing_state(self.folder,table='logical_block')
        self.assertEqual(current['rowCount'],267)
        rows=current['rows']
        self.assertEqual([r['logical_order'] for r in rows],list(range(1,268)))
        self.assertEqual({r['block_type'] for r in rows if r['base_blockid']==112},
          {'table','table_caption','table_body'})
        self.assertEqual([r['block_type'] for r in rows if r['base_blockid']==113],
          ['table','table_body','table_footnote'])
        self.assertEqual([r['block_type'] for r in rows if r['base_blockid']==120],
          ['table','table_caption','table_body','table_footnote'])
        self.assertEqual(rows[0]['markdown_text'],'Bufett’s Alpha')
        self.assertFalse(rows[0]['markdown_text'].startswith('#'))
        self.assertEqual(len(v.existing_pdf_map(self.folder)['covers']),267)
        self.assertEqual(v.existing_markdown(self.folder)['rowCount'],267)
        self.assertEqual(len({r['base_blockid'] for r in rows if r['parent_id'] is None}),224)
        self.assertEqual(self.reset()['logicalCount'],267,'rebuild is deterministic/idempotent on unchanged raw')
    def test_reject_unauthorized_source_and_abort_without_write(self):
        with self.assertRaisesRegex(v.BaseError,'确认'):
            v.dispatch('logical-rebuild','POST',self.folder,
                {'workspace':str(self.folder),'confirm':'wrong'}, {},Authorized())
        with self.assertRaisesRegex(v.BaseError,'POST'):
            v.dispatch('logical-rebuild','GET',self.folder,{}, {},Authorized())
        self.source.write_bytes(self.raw+b' ')
        with self.assertRaisesRegex(v.BaseError,'不一致'):self.reset()
        self.assertEqual(self.table('logical_block'),self.original)
        self.assertEqual(self.table('mineru_base'),self.base)
    def test_failure_between_delete_and_insert_rolls_back(self):
        with patch.object(v,'write_initial_logical',side_effect=RuntimeError('INJECTED_AFTER_DELETE')):
            with self.assertRaisesRegex(RuntimeError,'INJECTED_AFTER_DELETE'):self.reset()
        self.assertEqual(self.table('logical_block'),self.original)
        self.assertEqual(self.table('mineru_base'),self.base)
        self.assertEqual(self.source.read_bytes(),self.raw)
    def test_base_is_never_recreated_and_unknown_schema_blocked(self):
        with closing(sqlite3.connect(self.db)) as db:
            db.execute('DROP TABLE logical_block')
            db.commit()
        with self.assertRaisesRegex(v.BaseError,'两表'):self.reset()
        self.assertEqual(self.table('mineru_base'),self.base)
if __name__=='__main__':unittest.main()
