"""WP15 · Real Buffett continued table, immutable MinerU and safe MD-only recovery."""
from contextlib import closing
from pathlib import Path
import copy,hashlib,json,sqlite3,sys,shutil,tempfile,unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v
from v2_md_block import initial_md,raw_at
from v2_logical_contract import raw_element_text
from v2_table_recovery import table_overrides

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class Authorization:
 def probe(self,path):self.path=path

class TestTableRecovery(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory()
  self.folder=Path(self.tmp.name)
  (self.folder/'minerujson').mkdir()
  self.source=self.folder/'minerujson'/'book.json'
  shutil.copyfile(FIXTURE,self.source)
  self.digest=hashlib.sha256(self.source.read_bytes()).hexdigest()
  v.new_book(self.folder)
  self.path=self.folder/v.DB_NAME
 def tearDown(self):self.tmp.cleanup()
 def rows(self):
  with closing(sqlite3.connect(self.path)) as db:
   db.row_factory=sqlite3.Row
   return [dict(r) for r in db.execute('SELECT * FROM logical_block ORDER BY logical_order')]
 def test_new_page_local_table_including_html_and_footnote(self):
  rows=self.rows()
  table=[r for r in rows if r['p']==4 and r['b']==0]
  self.assertEqual([r['block_type'] for r in table],
                   ['table','table_caption','table_body','table_footnote'])
  self.assertEqual(table[0]['md_block'],'') # container has no synthetic text
  self.assertIn('continued',table[1]['md_block'])
  self.assertTrue(table[2]['md_block'].startswith('<table>'))
  self.assertIn('Information Ratios',table[2]['md_block'])
  self.assertIn('Notes:',table[3]['md_block'])
  previous=[r for r in rows if r['p']==3 and r['b']==1]
  self.assertEqual(len(previous),3)
  self.assertEqual(previous[2]['md_block'],'','duplicate note moved to physical page 5')
  self.assertIn('B. Sample Distribution',previous[1]['md_block'])
  self.assertNotEqual(previous[1]['md_block'],table[2]['md_block'],
                      'continued portions must be per-page, not a duplicate of merged table')
  self.assertEqual(len(rows),267)
  self.assertTrue(all('\n' not in r['md_block'] for r in rows))
  self.assertEqual(self.source.read_bytes(),FIXTURE.read_bytes())
  self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.digest)
  self.assertEqual(v.table_repair_preview(self.folder)['changeCount'],0)
 def make_old(self):
  # Simulate the live V2 WP14 persisted state by restoring ONLY the five
  # original para text values in a fixture DB, without touching any base row.
  with closing(sqlite3.connect(self.path)) as db:
   db.row_factory=sqlite3.Row
   before_base=[tuple(r) for r in db.execute('SELECT * FROM mineru_base ORDER BY blockid')]
   full={r['blockid']:r['block_json'] for r in db.execute('SELECT blockid,block_json FROM mineru_base WHERE blockid>0')}
   lookup=table_overrides(db.execute('SELECT blockid,block_group,source_path,page_index,block_json FROM mineru_base WHERE blockid>0'))
   self.assertEqual(len(lookup),5)
   old_map={}
   for r in db.execute('SELECT * FROM logical_block'):
    if (r['base_blockid'],r['raw_path']) not in lookup:continue
    part=raw_at(full[r['base_blockid']],r['raw_path'])
    old=initial_md(raw_element_text(part),r['block_type'],part)
    old_map[r['logical_id']]=old
    db.execute('UPDATE logical_block SET md_block=? WHERE logical_id=?',(old,r['logical_id']))
   db.commit()
   return before_base,old_map
 def test_readonly_preview_and_atomic_md_commit_undo_without_pbs_changes(self):
  before_base,old=self.make_old()
  before_rows=self.rows()
  before_pbs=[(r['logical_id'],r['parent_id'],r['logical_order'],r['p'],r['b'],r['s']) for r in before_rows]
  result=v.dispatch('table-repair-preview','GET',self.folder,{}, {},Authorization())
  self.assertEqual(result['schema'],'v2-table-repair/v1')
  self.assertEqual(result['changeCount'],5)
  self.assertEqual(result['skippedEdited'],0)
  self.assertEqual({x['reason'] for x in result['candidates']},{'same-page-preproc','next-page-footnote'})
  self.assertEqual(self.rows(),before_rows,'preview must be read-only')
  self.assertEqual(self.source.read_bytes(),FIXTURE.read_bytes())
  changes=[{k:c[k] for k in ('logicalId','before','after')} for c in result['candidates']]
  # Existing per-row optimistic commit (no special table write API):
  write=v.commit_md(self.folder,{'workspace':str(self.folder),'confirm':'commit-v2-md','changes':changes},Authorization())
  self.assertEqual(write['changedRows'],5)
  after=self.rows()
  self.assertEqual([(r['logical_id'],r['parent_id'],r['logical_order'],r['p'],r['b'],r['s']) for r in after],before_pbs)
  self.assertEqual(v.table_repair_preview(self.folder)['changeCount'],0)
  reverse=[dict(logicalId=x['logicalId'],before=x['after'],after=x['before']) for x in changes]
  self.assertEqual(v.commit_md(self.folder,{'workspace':str(self.folder),'confirm':'commit-v2-md','changes':reverse},Authorization())['changedRows'],5)
  self.assertEqual(self.rows(),before_rows)
  with closing(sqlite3.connect(self.path)) as db:
   self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM mineru_base ORDER BY blockid')],before_base)
 def test_manual_edits_and_ambiguous_preproc_are_protected(self):
  before_base,old=self.make_old()
  candidate=v.table_repair_preview(self.folder)['candidates']
  edited=candidate[0]
  with closing(sqlite3.connect(self.path)) as db:
   db.execute('UPDATE logical_block SET md_block=? WHERE logical_id=?',('CUSTOM MANUAL HTML',edited['logicalId']))
   db.commit()
  after=v.table_repair_preview(self.folder)
  self.assertEqual(after['changeCount'],4)
  self.assertEqual(after['skippedEdited'],1)
  self.assertNotIn(edited['logicalId'],{r['logicalId'] for r in after['candidates']})
  with self.assertRaisesRegex(v.BaseError,'其他会话'):
   v.commit_md(self.folder,{'workspace':str(self.folder),'confirm':'commit-v2-md','changes':[{k:c[k] for k in ('logicalId','before','after')} for c in candidate]},Authorization())
  self.assertEqual(next(r['md_block'] for r in self.rows() if r['logical_id']==edited['logicalId']),'CUSTOM MANUAL HTML')
  # An exact duplicate preproc root makes the recovery mapping ambiguous.
  with closing(sqlite3.connect(self.path)) as db:
   db.row_factory=sqlite3.Row
   base=[dict(r) for r in db.execute('SELECT blockid,block_group,source_path,page_index,block_json FROM mineru_base WHERE blockid>0')]
  target=next(r for r in base if r['block_group']=='preproc_blocks' and r['page_index']==4 and json.loads(r['block_json']).get('type')=='table')
  extra=dict(target,blockid=max(r['blockid'] for r in base)+1)
  result=table_overrides(base+[extra])
  # Ambiguous page-5 source cannot silently restore any of its three children.
  ids={r['base_blockid'] for r in self.rows() if r['p']==4 and r['b']==0}
  self.assertFalse(any(key[0] in ids for key in result))

if __name__=='__main__':unittest.main()
