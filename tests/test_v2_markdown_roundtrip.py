"""WP03: strict no-inline-label Markdown roundtrip from latest logical rows.

All DB and source files are isolated disposable fixtures; no user workspace.
"""
import copy,json,sqlite3,sys,tempfile,shutil,io,types
from pathlib import Path
from contextlib import closing
from unittest.mock import patch
import unittest
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as base
import frame_workspace_io as f02
from v2_logical_contract import LogicalRow
from v2_markdown_roundtrip import to_markdown,from_markdown,from_sql_rows,length_utf16,mdline_type_rows,OWNED_FORMAT
FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
class StubF02:
    def probe(self,path):pass

class MarkdownRoundtripTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='v2-wp03-');self.book=Path(self.tmp.name)
        (self.book/'minerujson').mkdir();self.source=self.book/'minerujson'/FIXTURE.name
        shutil.copyfile(FIXTURE,self.source);self.original=self.source.read_bytes()
        base.new_book(self.book)
    def tearDown(self):self.tmp.cleanup()
    def initialize(self):
        # Auto-generated in the same staged database import as mineru_base.
        self.assertEqual(base.existing_state(self.book)['logicalCount'],267)
    def test_full_267_roundtrip_and_no_sql_or_mineru_mutation(self):
        self.initialize()
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.row_factory=sqlite3.Row
            before=from_sql_rows(db.execute('SELECT * FROM logical_block ORDER BY logical_order'))
            base_before=[tuple(r) for r in db.execute('SELECT * FROM mineru_base ORDER BY blockid')]
        result=base.dispatch('markdown','GET',self.book,{}, {},StubF02())
        self.assertEqual(result['schema'],'v2-logical-md/v2')
        self.assertEqual(result['rowCount'],267)
        self.assertTrue(all(isinstance(segment['blockType'],str) for segment in result['segments']))
        self.assertEqual(len(result['segments']),267)
        self.assertEqual(from_markdown(result),before)
        self.assertEqual(result,base.existing_markdown(self.book))
        self.assertTrue(any(x['startChar']==x['endChar'] for x in result['segments']))
        self.assertIn('<table',result['markdown'])
        self.assertIn('![](',result['markdown'],
            'MD Block must derive Markdown image syntax from Raw Block')
        self.assertIn('https://cdn-mineru.openxlab.org.cn/',result['markdown'],
            'the original OCR media path survives unchanged')
        self.assertTrue(any(s['blockType']=='table_caption' for s in result['segments']))
        self.assertTrue(any(s['blockType']=='table_footnote' for s in result['segments']))
        self.assertNotIn('<!-- cmd:block:',result['markdown'])
        self.assertNotIn('<!-- minerujson:source:',result['markdown'])
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            self.assertEqual([tuple(r) for r in db.execute('SELECT * FROM mineru_base ORDER BY blockid')],base_before)
            self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],267)
            self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},{'mineru_base','logical_block'})
        self.assertEqual(self.source.read_bytes(),self.original)
    def test_missing_init_and_tampering_fail_closed(self):
        self.initialize()
        snap=base.existing_markdown(self.book)
        changed=copy.deepcopy(snap);changed['markdown']=snap['markdown'].replace('Bufett','Buffett',1)
        with self.assertRaisesRegex(ValueError,'SHA'):
            from_markdown(changed)
        changed=copy.deepcopy(snap);changed['segments'][2]['startChar']+=1
        with self.assertRaisesRegex(ValueError,'字符区间'):
            from_markdown(changed)
        changed=copy.deepcopy(snap);changed['segments'][1]['fragmentSha256']='0'*64
        with self.assertRaisesRegex(ValueError,'哈希'):
            from_markdown(changed)
        changed=copy.deepcopy(snap);changed['segments'].pop()
        with self.assertRaisesRegex(ValueError,'数量'):
            from_markdown(changed)
    def test_roundtrip_unicode_empty_and_ancestry(self):
        rows=[LogicalRow(1,4,None,1,'## 标题🧪','title'),LogicalRow(2,7,1,2,'','text'),
              LogicalRow(9,8,1,3,'A\n\nB\r\n表格 😀','table')]
        snap=to_markdown(rows)
        self.assertEqual(from_markdown(snap),rows)
        self.assertEqual([x['blockType'] for x in snap['segments']],['title','text','table'])
        self.assertEqual(snap['lengthUtf16'],length_utf16(snap['markdown']))
        self.assertNotEqual(snap['segments'][0]['endUtf16'],snap['segments'][0]['endChar'])
        self.assertEqual(snap['segments'][1]['startChar'],snap['segments'][1]['endChar'])
        with self.assertRaisesRegex(ValueError,'循环'):
            to_markdown([LogicalRow(1,1,2,1,'x'),LogicalRow(2,2,1,2,'y')])
        with self.assertRaisesRegex(ValueError,'父节点'):
            to_markdown([LogicalRow(1,1,2,1,'x')])
        with self.assertRaisesRegex(ValueError,'顺序'):
            to_markdown([LogicalRow(1,1,None,2,'x')])
    def test_physical_mdline_type_inherits_original_element_without_reclassification(self):
        rows=[
            LogicalRow(1,1,None,1,'# edited😀\n\n','text',0,0,0),
            LogicalRow(2,2,None,2,'\n','table',0,1,0),
            LogicalRow(3,2,2,3,'> Table 1. Caption\n','table_caption',0,1,1),
            LogicalRow(4,2,2,4,'>> <!-- image -->\n>> <table>\n>> </table>\n','table_body',0,1,2),
            LogicalRow(5,2,2,5,'> Note.\n\n','table_footnote',0,1,3),
            LogicalRow(6,6,None,6,'\n','image',0,2,0),
            LogicalRow(7,6,6,7,'![](a.png)\n\n','image_body',0,2,1),
        ]
        snap=to_markdown(rows,format=OWNED_FORMAT)
        mdlines=mdline_type_rows(rows)
        self.assertEqual([r['type'] for r in mdlines],
                         ['text','text','table','table_caption','table_body','table_body','table_body',
                          'table_footnote','table_footnote','image','image_body','image_body'])
        self.assertEqual(mdlines[0]['textTo'],length_utf16('# edited😀'))
        self.assertEqual(mdlines[3]['logical_id'],3)
        self.assertEqual(mdlines[3]['base_blockid'],2)
        self.assertEqual([r['source_line'] for r in mdlines],list(range(1,13)))
        self.assertEqual(mdlines[-1]['to'],snap['lengthUtf16'])
        data=snap['markdown'].encode('utf-16-le')
        self.assertEqual(b''.join(data[r['from']*2:r['to']*2] for r in mdlines),data)
        self.assertEqual(mdline_type_rows([]),[])
        self.assertEqual(from_markdown({**snap,'mdLines':mdlines}),rows)
        with self.assertRaises(ValueError):
            mdline_type_rows([LogicalRow(1,1,None,1,'no owned LF','text',0,0,0)])

    def test_sql_read_only_refuses_invalid_ancestry_or_null_text(self):
        self.initialize()
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.execute('UPDATE logical_block SET parent_id=99999 WHERE logical_order=2');db.commit()
        with self.assertRaisesRegex(base.BaseError,'父节点'):
            base.existing_markdown(self.book)
        with closing(sqlite3.connect(self.book/base.DB_NAME)) as db:
            db.execute("UPDATE logical_block SET parent_id=NULL,md_block=x'FF' WHERE logical_order=2");db.commit()
        with self.assertRaisesRegex(base.BaseError,'文本无效'):
            base.existing_markdown(self.book)
    def test_http_denied_without_frame_session_and_get_only(self):
        self.initialize()
        def request(cookie,method='GET'):
            responses=[]
            payload=json.dumps({'workspace':str(self.book)}).encode()
            handler=types.SimpleNamespace(command=method,headers={'Cookie':cookie,'Content-Length':str(len(payload)),'Origin':'https://ocr2md.laity.bid'},
                rfile=io.BytesIO(payload),respond=lambda code,body,*args:responses.append((code,json.loads(body))))
            parsed=types.SimpleNamespace(query='workspace='+__import__('urllib.parse',fromlist=['quote']).quote(str(self.book),safe=''))
            base.handle(handler,'markdown',parsed,f02)
            return responses[0]
        with patch.object(f02,'authorized_roots',side_effect=lambda cookie:
            [self.book] if cookie=='yes' else (_ for _ in ()).throw(f02.WorkspaceIOError(403,'未授权'))):
            self.assertEqual(request('no')[0],403)
            self.assertEqual(request('yes','POST')[0],405)
            code,body=request('yes')
            self.assertEqual(code,200);self.assertEqual(body['rowCount'],267)
            self.assertEqual(len(body['segments']),267)
if __name__=='__main__':unittest.main()
