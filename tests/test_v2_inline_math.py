import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from v2_md_block import inline_math,initial_md
from v2_logical_contract import raw_element_text
class InlineMath(unittest.TestCase):
 def test_typed_span_projection(self):
  raw={'type':'text','lines':[{'spans':[{'type':'text','content':'A '},{'type':'inline_equation','content':'x^2'},{'type':'text','content':' B '},{'type':'inline_equation','content':'x^2'}]},{'spans':[{'type':'text','content':'end.'}]}]}
  old=raw_element_text(raw)
  self.assertEqual(old,'A x^2 B x^2\nend.')
  self.assertEqual(initial_md(old,'text',raw),'A $x^2$ B $x^2$ end.')
  self.assertEqual(raw_element_text(raw),old)
  self.assertEqual(initial_md('recovered table','table_body',raw),'recovered table')
 def test_v1_safe_delimiters(self):
  self.assertEqual(inline_math('$x$'),'$x$')
  self.assertEqual(inline_math('cost $5'),'cost $5')
  self.assertEqual(inline_math(''),'')
  self.assertEqual(inline_math('x\ny'),'x\ny')
if __name__=='__main__':unittest.main()
