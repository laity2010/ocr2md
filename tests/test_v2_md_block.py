"""WP10: exclusive MD Block persistence and immutable Raw Block reference."""
from pathlib import Path
from contextlib import closing
import sqlite3,sys,tempfile,shutil,unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class Auth:
 def probe(self,folder):assert folder.is_dir()
class MDTest(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.folder=Path(self.tmp.name)
  source=self.folder/'minerujson';source.mkdir();shutil.copyfile(FIXTURE,source/'fixture.json')
  v.new_book(self.folder);self.db=self.folder/v.DB_NAME
  with closing(sqlite3.connect(self.db)) as db:
   self.original_base=[tuple(r) for r in db.execute('select * from mineru_base order by blockid')]
 def tearDown(self):self.tmp.cleanup()
 def records(self):
  return v.existing_state(self.folder,table='logical_block')['rows']
 def test_md_and_readonly_raw_external(self):
  cols=v.existing_state(self.folder,table='logical_block')['columns']
  self.assertEqual(cols,list(v.LOGICAL_COLS));self.assertNotIn('raw_block',cols)
  self.assertEqual(len(cols),10)
  rows=self.records()
  self.assertEqual(rows[0]['raw_block'],'Bufett’s Alpha')
  self.assertTrue(rows[0]['md_block'].startswith('## '))
  self.assertEqual(rows[0]['raw_path'],'$')
  child=next(r for r in rows if r['block_type']=='table_body')
  self.assertTrue(child['raw_path'].startswith('$.blocks['))
  self.assertTrue(child['raw_block'].startswith('<table>'))
  image=next(r for r in rows if r['block_type']=='image_body')
  self.assertTrue(image['md_block'].startswith('![](<'))
  self.assertTrue(image['raw_block'].startswith('https://'))
  self.assertNotIn('raw_block',self.records()[0].keys()-{'raw_block'})
 def test_optimistic_md_update_undo_and_conflict(self):
  before=self.records()[0]
  request={'workspace':str(self.folder),'confirm':'commit-v2-md',
           'changes':[{'logicalId':before['logical_id'],
                       'before':before['md_block'],'after':'### Edited Title\n\nNote'}]}
  resp=v.commit_md(self.folder,request,Auth())
  self.assertEqual(resp['changedRows'],1)
  now=self.records()[0]
  self.assertEqual(now['md_block'],'### Edited Title\n\nNote')
  self.assertEqual(now['raw_block'],before['raw_block'])
  with self.assertRaisesRegex(v.BaseError,'其他会话'):
   v.commit_md(self.folder,request,Auth())
  self.assertEqual(self.records()[0]['md_block'],request['changes'][0]['after'])
  reverse=[{'logicalId':before['logical_id'],
            'before':request['changes'][0]['after'],'after':before['md_block']}]
  self.assertEqual(v.commit_md(self.folder,{**request,'changes':reverse},Auth())['changedRows'],1)
  self.assertEqual(self.records()[0]['md_block'],before['md_block'])
  with closing(sqlite3.connect(self.db)) as db:
   self.assertEqual([tuple(r) for r in db.execute('select * from mineru_base order by blockid')],
                    self.original_base)
 def test_existing_9_col_upgrade_preserves_modified_text_pbs(self):
  before=self.records();first=before[0]
  with closing(sqlite3.connect(self.db)) as db:
   db.execute('ALTER TABLE logical_block DROP COLUMN raw_path')
   db.execute('ALTER TABLE logical_block RENAME COLUMN md_block TO markdown_text')
   db.execute('UPDATE logical_block SET markdown_text=? WHERE logical_id=?',
              ('USER CUSTOM TEXT',first['logical_id']))
   other=next(row for row in before if row['block_type']=='image_body')
   db.execute('UPDATE logical_block SET markdown_text=? WHERE logical_id=?',
              (other['raw_block'],other['logical_id']))
   db.commit()
  upgrade=v.migrate_legacy_type_column(self.folder,Auth())
  self.assertTrue(upgrade['migrated'])
  after=self.records()
  self.assertEqual(len(after),len(before))
  self.assertEqual(after[0]['md_block'],'USER CUSTOM TEXT')
  self.assertEqual(after[0]['p'],first['p'])
  self.assertEqual(after[0]['b'],first['b'])
  updated=next(row for row in after if row['logical_id']==other['logical_id'])
  self.assertTrue(updated['md_block'].startswith('![](<'))
  self.assertEqual(updated['raw_path'],other['raw_path'])
  with closing(sqlite3.connect(self.db)) as db:
   self.assertEqual([tuple(r) for r in db.execute('select * from mineru_base order by blockid')],
                    self.original_base)
 def test_multirow_md_conflict_rolls_back_every_row(self):
  first,second=self.records()[:2]
  attempted={'workspace':str(self.folder),'confirm':'commit-v2-md',
    'changes':[{'logicalId':first['logical_id'],'before':first['md_block'],
                'after':'changed first'},
               {'logicalId':second['logical_id'],'before':'STALE WRONG VALUE',
                'after':'changed second'}]}
  with self.assertRaisesRegex(v.BaseError,'其他会话'):
   v.commit_md(self.folder,attempted,Auth())
  after=self.records()[:2]
  self.assertEqual([r['md_block'] for r in after],
                   [first['md_block'],second['md_block']])
  self.assertEqual([r['raw_block'] for r in after],
                   [first['raw_block'],second['raw_block']])
  with closing(sqlite3.connect(self.db)) as db:
   self.assertEqual([tuple(r) for r in db.execute('select * from mineru_base order by blockid')],
                    self.original_base)
if __name__=='__main__':unittest.main()
