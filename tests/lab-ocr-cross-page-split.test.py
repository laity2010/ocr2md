"""Prove exact physical table split, old MD migration and guard rails."""
import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_ocr_store import import_workspace,originals
from v6_lab_ocr_block_view import initialize_block_projection
from v6_lab_ocr_md import initialize_md,read_md,persist_md_splice
from v6_lab_ocr_reconcile_cross_page import plan_table_split,apply_table_split
from v6_lab_ocr_cross_page_sources import _merged_exact

def span(kind,value):
 return [{'spans':[{'type':kind, 'html' if kind=='table' else 'content':value}]}]
def node(kind,bbox,lines,deleted=False):
 x={'type':kind,'bbox':bbox,'lines':lines}
 if deleted:x['lines_deleted']=True
 return x

def make_book(book):
 (book/'mineru json').mkdir();(book/'pdf').mkdir()
 (book/'pdf'/'fixture.pdf').write_bytes(b'%PDF-1.4\n')
 root1=[20,100,500,300];root2=[25,101,503,301]
 b1=[20,100,500,300];b2=[25,101,503,301];cap=[25,70,503,99];foot=[25,310,503,339]
 headers=['<tr><th>Title</th></tr>','<tr><th>Number</th></tr>']
 p1='<table>'+''.join(headers+['<tr><td>PAGE 1 DATA</td></tr>'])+'</table>'
 p2='<table>'+''.join(headers+['<tr><td>PAGE 2 DATA</td></tr>'])+'</table>'
 merged='<table>'+''.join(headers+['<tr><td>PAGE 1 DATA</td></tr>','<tr><td>PAGE 2 DATA</td></tr>'])+'</table>'
 pre1={'type':'table','bbox':root1,'blocks':[node('table_body',b1,span('table',p1))]}
 para1={'type':'table','bbox':root1,'blocks':[node('table_body',b1,span('table',merged)),
                                             node('table_footnote',foot,span('text','Notes: kept on page 2'))]}
 pre2={'type':'table','bbox':root2,'blocks':[node('table_caption',cap,[*span('text','Table A'),*span('text','(continued)')]),
                                            node('table_body',b2,span('table',p2)),
                                            node('table_footnote',foot,span('text','Notes: kept on page 2'))]}
 para2={'type':'table','bbox':root2,'blocks':[node('table_caption',cap,[],True),
                                             node('table_body',b2,[],True),
                                             node('table_footnote',foot,[],True)]}
 data={'pdf_info':[{'page_idx':0,'page_size':[600,800],'preproc_blocks':[pre1],
                    'para_blocks':[para1],'discarded_blocks':[]},
                   {'page_idx':1,'page_size':[600,800],'preproc_blocks':[pre2],
                    'para_blocks':[para2],'discarded_blocks':[]}]}
 raw=json.dumps(data).encode()
 (book/'mineru json'/'fixture.json').write_bytes(raw)
 import_workspace(book);initialize_block_projection(book)
 return raw,p1,p2,merged

class PhysicalCrossPageSplit(unittest.TestCase):
 def test_complete_new_book_and_safe_existing_migration(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp)/'book';book.mkdir()
   raw,p1,p2,merged=make_book(book);seal=originals(book)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    links=list(db.execute('select block_id,reason from block_source_link order by block_id'))
    self.assertEqual([x[1] for x in links],['cross_page_split','cross_page_relocated',
      'cross_page_caption','cross_page_split','cross_page_footnote'])
    self.assertEqual(list(db.execute('select line_count from block where content_source="cross_page_relocated"')),[(0,)])
    ids={r[1]:r[0] for r in db.execute('select block_id,source_block_key from block_review')}
   created=initialize_md(book)
   r=read_md(book)['rows']
   self.assertEqual(len([x for x in r if x['text']==p1]),1)
   self.assertEqual(len([x for x in r if x['text']==p2]),1)
   self.assertFalse(any(x['text']==merged for x in r))
   body1=next(x for x in r if x['text']==p1)
   body2=next(x for x in r if x['text']==p2)
   foot=next(x for x in r if x['text'].startswith('Notes:'))
   caption=[x for x in r if x['text'] in ('Table A','(continued)')]
   self.assertEqual(body2['line_no'],caption[-1]['line_no']+1)
   self.assertEqual(foot['line_no'],body2['line_no']+1)
   # Make an old persisted MD with exactly the cross-page error that was
   # fixed once, retaining original line IDs and a manually revised note.
   start=body1['line_no']
   stop=next(x for x in r if x['line_no']==foot['line_no']+1)
   blank=next(x for x in r if x['line_no']==start+1)
   history=[{**body1,'text':merged},{**foot,'block_id':body1['block_id']+1,
            'text':'Notes: user-edited keep this version'},
            {**blank},*caption,{**stop,'block_id':body1['block_id']+1}]
   for x in history:x.pop('line_no',None)
   persist_md_splice(book,0,'fixture-create-legacy-1',start,stop['line_no']-start+1,history)
   before=read_md(book)
   plan=plan_table_split(book)
   self.assertIsNotNone(plan)
   self.assertEqual((plan['delete'],len(plan['insert'])),(6,7))
   backup=Path(tmp)/'old.sqlite'
   result=apply_table_split(book,backup)
   self.assertTrue(result['migrated'])
   self.assertTrue(backup.is_file())
   self.assertIsNone(plan_table_split(book))
   after=read_md(book)
   self.assertEqual(after['revision'],before['revision']+1)
   self.assertEqual({x['line_id'] for x in before['rows']},
                    {x['line_id'] for x in after['rows']}-
                    {x['line_id'] for x in after['rows'] if x['line_id'] not in {y['line_id'] for y in before['rows']}})
   self.assertEqual(len([x for x in after['rows'] if x['text']==p2]),1)
   self.assertIn('Notes: user-edited keep this version',[x['text'] for x in after['rows']])
   self.assertEqual(originals(book),seal)
   self.assertEqual((book/'mineru json'/'fixture.json').read_bytes(),raw)
   with sqlite3.connect(book/'ocr2md.sqlite') as db:
    self.assertEqual(db.execute('pragma integrity_check').fetchone()[0],'ok')
    self.assertEqual(db.execute('pragma foreign_key_check').fetchall(),[])

 def test_unproven_table_merge_not_split(self):
  good=node('table_body',[1,2,3,4],span('table','<table><tr><th>A</th></tr><tr><td>old</td></tr></table>'))
  next=node('table_body',[1,2,3,4],span('table','<table><tr><th>A</th></tr><tr><td>new</td></tr></table>'))
  wrong=node('table_body',[1,2,3,4],span('table','<table><tr><td>unrelated</td></tr></table>'))
  self.assertFalse(_merged_exact(good,next,wrong))

if __name__=='__main__':unittest.main()
