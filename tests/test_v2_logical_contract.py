"""WP01 pure contract: no SQL or workdir output side effects."""
import json,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from v2_logical_contract import LogicalRow,initial_rows,validate_initial,project_block

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class LogicalContract(unittest.TestCase):
    def setUp(self):
        source=json.loads(FIXTURE.read_bytes())
        self.entries=[]
        blockid=1
        for page in source['pdf_info']:
            for group in ('preproc_blocks','discarded_blocks','para_blocks'):
                for raw in page.get(group,[]):
                    self.entries.append({'blockid':blockid,'block_group':group,'block_json':json.dumps(raw,ensure_ascii=False)})
                    blockid+=1
    def test_flat_mapping_full_coverage_and_all_types(self):
        mapped=initial_rows(self.entries)
        para={row['blockid'] for row in self.entries if row['block_group']=='para_blocks'}
        self.assertEqual((len(mapped),len(self.entries)),(224,539))
        validate_initial(mapped,para)
        self.assertEqual([r.logical_order for r in mapped],list(range(1,225)))
        self.assertEqual([r.base_blockid for r in mapped],sorted(para))
        self.assertTrue(all(r.parent_id is None and r.logical_id==r.base_blockid for r in mapped))
        self.assertEqual(mapped,initial_rows(self.entries))
        self.assertTrue(any('$$' in r.markdown_text for r in mapped))
        self.assertTrue(any('![](' in r.markdown_text for r in mapped))
        self.assertTrue(any('<table' in r.markdown_text for r in mapped))
        self.assertTrue(any(r.markdown_text=='' for r in mapped))
    def test_invalid_order_and_partial_relation_fail_closed(self):
        rows=initial_rows(self.entries)
        para={r.base_blockid for r in rows}
        with self.assertRaisesRegex(ValueError,'顺序'):
            validate_initial([rows[1],rows[0],*rows[2:]],para)
        with self.assertRaisesRegex(ValueError,'数量'):
            validate_initial(rows[:-1],para)
        with self.assertRaisesRegex(ValueError,'递增'):
            initial_rows([self.entries[1],self.entries[0]])
        with self.assertRaisesRegex(ValueError,'初始逻辑'):
            validate_initial([LogicalRow(rows[0].logical_id,rows[0].base_blockid,2,1,rows[0].markdown_text),*rows[1:]],para)
    def test_conservative_projection_does_not_fabricate(self):
        self.assertEqual(project_block({'type':'title','level':3,'lines':[{'spans':[{'content':'T'}]}]}),'### T')
        self.assertEqual(project_block({'type':'text','lines':[]}), '')
        self.assertEqual(project_block({'type':'interline_equation','lines':[{'spans':[{'content':'x=1'}]}]}),'$$\nx=1\n$$')
        self.assertEqual(project_block({'type':'text','lines':[{'spans':[{'content':'A'},{'content':'B'}]},{'spans':[{'content':'C'}]}]}),'AB C')
if __name__=='__main__':unittest.main()
