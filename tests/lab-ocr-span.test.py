"""Direct contract tests for minerujson2span: nested lineage, losslessness, idempotence."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from v6_lab_ocr_store import import_workspace, originals
from v6_lab_ocr_span import minerujson2span, span_rows

class SpanContract(unittest.TestCase):
    def test_realistic_nested_and_unusual_fields(self):
        with tempfile.TemporaryDirectory() as td:
            book = Path(td)
            (book/'mineru json').mkdir()
            (book/'pdf').mkdir()
            (book/'pdf'/'book.pdf').write_bytes(b'%PDF-1.7\n')
            bbox = [1, 2, 30, 40]
            def span(typ, **data):return {'type':typ,'bbox':bbox,**data}
            def line(*spans):return {'bbox':bbox,'spans':list(spans),'line_extra':{'untouched':42}}
            sample = {'pdf_info': [
                {'page_idx':0,'page_size':[594,783],'x_custom':'page info',
                 'preproc_blocks':[{'type':'text','bbox':bbox,'index':0,'lines':[line(span('text',content='before'))]}],
                 'discarded_blocks':[{'type':'page_number','index':5,'bbox':bbox,'lines':[line(span('text',content='35'))]}],
                 'para_blocks':[
                     {'type':'text','bbox':bbox,'index':0,'merge_prev':False,'lines':[
                         line(span('text',content='Hello '))]}
                     ]}
            ]}
            # Replace the initial text's synthetic metadata with normal MinerU fields.
            root=sample['pdf_info'][0]['para_blocks']
            root[0]['lines'][0]['spans']=[span('text',content='Hello ',score=0.99,extra='retain'),span('inline_equation',content='x^2')]
            root.append({'type':'image','bbox':bbox,'index':1,'blocks':[
                {'type':'image_body','bbox':bbox,'index':0,'angle':0,'lines':[line(span('image',image_path='https://example.org/a.jpg'))]}]})
            root.append({'type':'table','bbox':bbox,'index':2,'blocks':[
                {'type':'table_caption','bbox':bbox,'index':0,'lines':[line(span('text',content='Caption'))]},
                {'type':'table_body','bbox':bbox,'index':1,'lines':[line(span('table',html='<table><tr><td>X</td></tr></table>',image_path='https://example.org/t.jpg'))]}]})
            root.append({'type':'empty','bbox':bbox,'index':3,'lines':[]})
            payload=json.dumps(sample,ensure_ascii=False,indent=2).encode()
            src=book/'mineru json'/'sample.json';src.write_bytes(payload)
            imported=import_workspace(book)
            assert imported['status']=='imported'
            before=originals(book)
            assert before==[('sample.json',payload)]
            first=minerujson2span(book)
            self.assertEqual((first['status'],first['spans']),('created',5))
            self.assertEqual(minerujson2span(book)['status'],'unchanged')
            result=span_rows(book,0,100)
            self.assertEqual(result['total'],5)
            ids=[x['span_id'] for x in result['rows']]
            self.assertEqual(len(set(ids)),5)
            self.assertTrue(all(row['block_group']=='para_blocks' for row in result['rows']))
            image=next(x for x in result['rows'] if x['span_type']=='image')
            self.assertEqual(image['block_type'],'image_body')
            self.assertEqual(image['parent_block_id'],'s0:p0:para_blocks:b1')
            self.assertEqual(image['block_id'],'s0:p0:para_blocks:b1.0')
            self.assertEqual(image['span_bbox_json'],json.dumps(bbox,separators=(',',':')))
            self.assertEqual(json.loads(image['line_attrs_json'])['line_extra'],{'untouched':42})
            eq=next(x for x in result['rows'] if x['span_type']=='inline_equation')
            self.assertEqual(eq['span_id'],'s0:p0:para_blocks:b0:l0:s1')
            txt=next(x for x in result['rows'] if x['span_type']=='text' and x['content']=='Hello ')
            self.assertEqual(json.loads(txt['span_json'])['extra'],'retain')
            self.assertEqual(json.loads(txt['block_attrs_json'])['merge_prev'],False)
            table=next(x for x in result['rows'] if x['span_type']=='table')
            self.assertIn('<table>',table['html'])
            self.assertEqual(table['image_path'],'https://example.org/t.jpg')
            self.assertEqual(originals(book),before)
            self.assertEqual(src.read_bytes(),payload)
            self.assertEqual(hashlib.sha256(src.read_bytes()).hexdigest(),hashlib.sha256(payload).hexdigest())
            self.assertEqual(span_rows(book,2,2)['rows'],result['rows'][2:4])
            with sqlite3.connect(book/'ocr2md.sqlite') as conn:
                self.assertEqual(conn.execute("SELECT count(*) FROM minerujson WHERE row_kind='block'").fetchone()[0],6)
                self.assertEqual(conn.execute("SELECT count(*) FROM span").fetchone()[0],5)

if __name__=='__main__':unittest.main()
