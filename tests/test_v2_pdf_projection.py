from pathlib import Path
import base64,shutil,sqlite3,sys,tempfile,unittest
from contextlib import closing
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v
from v2_pdf_projection import PDFProjectionError,valid_bbox,project_pdf
FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class PdfProjectionTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='wp-pdf-v2-')
  self.folder=Path(self.temp.name);(self.folder/'minerujson').mkdir();shutil.copy(FIXTURE,self.folder/'minerujson'/FIXTURE.name)
  v.new_book(self.folder)
 def tearDown(self):self.temp.cleanup()
 def test_original_22_pages_267_mapped_and_pbs_immutable_original(self):
  m=v.existing_pdf_map(self.folder)
  self.assertEqual((m['pageCount'],m['mappedCount'],m['logicalCount']),(22,267,267))
  self.assertEqual(len(m['unmappedLogicalIds']),0)
  self.assertEqual(m['covers'][0]['pbs'],'p0b0s0')
  self.assertEqual(m['covers'][-1]['pbs'],'p21b20s0')
  self.assertEqual(len({c['pbs'] for c in m['covers']}),267)
  self.assertTrue(all(valid_bbox(c['bbox'],c['pageSize']) for c in m['covers']))
  with closing(sqlite3.connect(self.folder/v.DB_NAME)) as db:
   self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}, {'mineru_base','logical_block'})
 def test_parent_child_cross_page_does_not_move_cover(self):
  before=v.existing_pdf_map(self.folder)
  first=before['covers'][0];last=before['covers'][-1]
  with closing(sqlite3.connect(self.folder/v.DB_NAME)) as db:
   db.execute('UPDATE logical_block SET p=0,b=0,s=1,parent_id=? WHERE logical_id=?',
              (first['logicalId'],last['logicalId']))
   db.commit()
  after=v.existing_pdf_map(self.folder)
  child=next(c for c in after['covers'] if c['logicalId']==last['logicalId'])
  self.assertEqual(child['pbs'],'p0b0s1')
  self.assertEqual(child['physicalPageIndex'],21)
  self.assertEqual(child['bbox'],last['bbox'])
  self.assertEqual(child['rootLogicalId'],first['logicalId'])
 def test_empty_and_type_changes_do_not_replace_coordinates(self):
  initial=v.existing_pdf_map(self.folder);block=initial['covers'][0]
  with closing(sqlite3.connect(self.folder/v.DB_NAME)) as db:
   db.execute("UPDATE logical_block SET md_block='',block_type='table' WHERE logical_id=?",(block['logicalId'],));db.commit()
  modified=next(c for c in v.existing_pdf_map(self.folder)['covers'] if c['logicalId']==block['logicalId'])
  self.assertTrue(modified['empty']);self.assertEqual(modified['bbox'],block['bbox'])
 def test_missing_pdf_reported_not_fake_pdf(self):
  with self.assertRaisesRegex(v.BaseError,'没有'):
   v.read_verified_pdf(self.folder)
 def test_single_pdf_file_and_reject_symlink_and_multiple(self):
  (self.folder/'original.pdf').write_bytes(b'%PDF-1.4\n%%EOF\n')
  self.assertTrue(v.read_verified_pdf(self.folder).startswith(b'%PDF-'))
  (self.folder/'extra.pdf').write_bytes(b'%PDF-1.4\n%%EOF\n')
  with self.assertRaisesRegex(v.BaseError,'多个'):v.read_verified_pdf(self.folder)
  (self.folder/'extra.pdf').unlink();(self.folder/'original.pdf').unlink()
  (self.folder/'original.pdf').symlink_to(FIXTURE)
  with self.assertRaisesRegex(v.BaseError,'符号链接'):v.read_verified_pdf(self.folder)
 def test_invalid_original_bbox_not_drawn(self):
  with closing(sqlite3.connect(self.folder/v.DB_NAME)) as db:
   row=db.execute('SELECT base_blockid FROM logical_block ORDER BY logical_order LIMIT 1').fetchone()
   db.execute('UPDATE mineru_base SET bbox_json=? WHERE blockid=?',('[9999,0,10000,1]',row[0]));db.commit()
  m=v.existing_pdf_map(self.folder)
  self.assertEqual(m['mappedCount'],266);self.assertEqual(len(m['unmappedLogicalIds']),1)
 def test_authored_pdf_mapping_never_touches_files(self):
  original=(self.folder/'minerujson'/FIXTURE.name).read_bytes()
  first=v.existing_pdf_map(self.folder);second=v.existing_pdf_map(self.folder)
  self.assertEqual(first,second)
  self.assertEqual((self.folder/'minerujson'/FIXTURE.name).read_bytes(),original)
if __name__=='__main__':unittest.main()
