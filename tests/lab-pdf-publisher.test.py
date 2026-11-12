"""Direct contract: new Lab card is added exactly once beside existing Labs."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_frame_publish import add_lab_card

class CardContract(unittest.TestCase):
 def test_add_one_new_lab_and_preserve_other_cards(self):
  home='''<section class="cards">
    <article id="lab-frame"></article>
    <article id="lab-ocr"></article>
    </section>'''
  card='    <article id="lab-pdf"></article>\n'
  updated=add_lab_card(home,'lab-pdf',card)
  self.assertIn('id="lab-pdf"',updated)
  self.assertEqual(updated.count('id="lab-pdf"'),1)
  self.assertIn('id="lab-frame"',updated)
  self.assertIn('id="lab-ocr"',updated)
  self.assertEqual(add_lab_card(updated,'lab-pdf',card),updated)
  self.assertEqual(add_lab_card(updated,'lab-frame','wrong'),updated)
 def test_no_closing_section_refuses_ambiguous_publish(self):
  with self.assertRaisesRegex(RuntimeError,'closing tag'):
   add_lab_card('<div>no cards</div>','lab-pdf','test')

if __name__=='__main__':unittest.main()
