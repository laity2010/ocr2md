"""WP09 immutable MinerU -> raw typed two-level logical rows, pure API."""
import collections,json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from v2_logical_contract import LogicalRow,initial_rows,validate_initial,raw_element_text

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class LogicalContract(unittest.TestCase):
 def setUp(self):
  source=json.loads(FIXTURE.read_bytes());self.entries=[];blockid=1
  for page in source['pdf_info']:
   for group in ('preproc_blocks','discarded_blocks','para_blocks'):
    for raw in page.get(group,[]):
     self.entries.append({'blockid':blockid,'block_group':group,
       'block_json':json.dumps(raw,ensure_ascii=False),'block_type':raw['type']})
     blockid+=1
 def test_typed_children_and_raw_originals(self):
  rows=initial_rows(self.entries)
  para={r['blockid'] for r in self.entries if r['block_group']=='para_blocks'}
  self.assertEqual((len(rows),len(self.entries)),(267,539))
  validate_initial(rows,para)
  self.assertEqual([r.logical_order for r in rows],list(range(1,268)))
  roots=[r for r in rows if r.parent_id is None]
  self.assertEqual([r.logical_id for r in roots],sorted(para))
  self.assertEqual(rows,initial_rows(self.entries))
  self.assertTrue(all(r.logical_id>539 for r in rows if r.parent_id is not None))
  counts=collections.Counter(r.block_type for r in rows)
  self.assertEqual({t:counts[t] for t in ('table','table_caption','table_body',
     'table_footnote','chart_caption','chart_body','chart_footnote','image_body')},
     dict(table=9,table_caption=8,table_body=9,table_footnote=6,
          chart_caption=6,chart_body=4,chart_footnote=3,image_body=7))
  self.assertTrue(any(r.markdown_text.startswith('<table>') for r in rows if r.block_type=='table_body'))
  self.assertTrue(any(r.markdown_text.startswith('https://') for r in rows if r.block_type=='image_body'))
  self.assertTrue(all(not r.markdown_text.startswith('![](') for r in rows))
  self.assertTrue(all('$$\n' not in r.markdown_text for r in rows if r.block_type=='interline_equation'))
  self.assertTrue(all(not r.markdown_text.startswith('# ') for r in rows if r.block_type=='title'))
  table=[r for r in rows if r.base_blockid==112]
  self.assertEqual([(r.block_type,r.parent_id,r.markdown_text[:6]) for r in table],
     [('table',None,''),('table_caption',112,'Table '),('table_body',112,'<table')])
  self.assertTrue(any(r.markdown_text=='' for r in rows))
 def test_bad_order_and_invalid_relation_rejected(self):
  rows=initial_rows(self.entries)
  para={r.base_blockid for r in rows if r.parent_id is None}
  with self.assertRaisesRegex(ValueError,'顺序'):validate_initial([rows[1],rows[0],*rows[2:]],para)
  with self.assertRaisesRegex(ValueError,'父块数量'):validate_initial(rows[:-1],para) if rows[-1].parent_id is None else validate_initial([r for r in rows if r.parent_id is not None],para)
  with self.assertRaisesRegex(ValueError,'递增'):initial_rows([self.entries[1],self.entries[0]])
  i=next(i for i,r in enumerate(rows) if r.parent_id is not None)
  wrong=[*rows]
  wrong[i]=LogicalRow(rows[i].logical_id,rows[i].base_blockid,999999,rows[i].logical_order,rows[i].markdown_text)
  with self.assertRaisesRegex(ValueError,'子块'):validate_initial(wrong,para)
 def test_no_synthesized_markdown_and_source_span_contract(self):
  self.assertEqual(raw_element_text({'type':'title','level':3,'lines':[{'spans':[{'content':'T'}]}]}),'T')
  self.assertEqual(raw_element_text({'type':'text','lines':[]}), '')
  self.assertEqual(raw_element_text({'type':'interline_equation','lines':[{'spans':[{'content':'x=1'}]}]}),'x=1')
  self.assertEqual(raw_element_text({'type':'text','lines':[{'spans':[{'content':'A'},{'content':'B'}]},{'spans':[{'content':'C'}]}]}),'AB\nC')
  self.assertEqual(raw_element_text({'lines':[{'spans':[{'html':'<table>RAW</table>'}]}]}),'<table>RAW</table>')
  self.assertEqual(raw_element_text({'lines':[{'spans':[{'image_path':'raw.png'}]}]}),'raw.png')
  self.assertEqual(raw_element_text({'lines':[{'spans':[{'content':'','html':'<table/>'}]}]}),'<table/>')
  with self.assertRaisesRegex(ValueError,'第三级'):initial_rows([{'blockid':1,'block_group':'para_blocks','block_json':json.dumps({'type':'table','blocks':[{'type':'table_body','blocks':[{'type':'text'}]}]})}])
if __name__=='__main__':unittest.main()
