"""Unit/HTTP contract: one SQLite table, multiple MinerU JSON -> one PDF."""
import hashlib
import json
import sqlite3
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import v6_lab_ocr_serve as server
from v6_lab_ocr_store import (OCRImportError,inspect_workspace,import_workspace,
                               existing_info,rows,originals,order_parts)


def part(root, filename, count, block_type, *, spaces=False):
    pages=[{'page_idx':i,'para_blocks':[{'type':block_type,'index':i,'bbox':[i,1,i+2,3],
               'lines':[{'spans':[{'content':'测试 '+str(i)}]}]}],
             'preproc_blocks':[{'type':'raw','index':i}],
             'discarded_blocks':[{'type':'noise','index':i}]} for i in range(count)]
    payload={'pdf_info':pages,'_version_name':'3.4.4','custom':{'a':[1,2,3]}}
    data=json.dumps(payload,ensure_ascii=False,indent=2 if spaces else None).encode()
    (root/'mineru json'/filename).write_bytes(data)
    return data

class OCRSqlTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.book=Path(self.temp.name)/'book'
        (self.book/'mineru json').mkdir(parents=True)
        (self.book/'pdf').mkdir()
        (self.book/'pdf'/'book.pdf').write_bytes(b'%PDF-1.7\nUNTOUCHED\n')
    def tearDown(self):self.temp.cleanup()

    def test_multiple_segments_one_pdf_and_originals_byte_exact(self):
        # Real MinerU export names carry timestamps, not reliable page ranges.
        a=part(self.book,'MinerU_book__20261029123958.json',200,'title',spaces=True)
        b=part(self.book,'MinerU_book__20261029124005.json',159,'text')
        original_pdf=(self.book/'pdf/book.pdf').read_bytes()
        info=inspect_workspace(self.book)
        self.assertEqual(info['ordering'],'full-200-then-short-tail')
        result=import_workspace(self.book)
        self.assertEqual(result['status'],'imported')
        self.assertEqual(result['pages'],359)
        self.assertEqual(result['blocks'],359*3)
        self.assertEqual([r[1] for r in originals(self.book)],[a,b])
        self.assertEqual((self.book/'pdf/book.pdf').read_bytes(),original_pdf)
        with sqlite3.connect(self.book/'ocr2md.sqlite') as db:
            table_list=db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            self.assertEqual(table_list,[('minerujson',)])
            sources=db.execute("SELECT COUNT(*) FROM minerujson WHERE row_kind='source'").fetchone()[0]
            self.assertEqual(sources,2)
            start=db.execute("SELECT source_order,global_page,local_page FROM minerujson WHERE row_kind='block' AND block_group='para_blocks' ORDER BY global_page LIMIT 1 OFFSET 200").fetchone()
            self.assertEqual(start,(1,200,0))
        first=rows(self.book,0,10)
        self.assertEqual(first['total'],1077)
        self.assertEqual(len(first['rows']),10)
        self.assertEqual(json.loads(first['rows'][0]['block_json'])['index'],0)
        self.assertEqual(import_workspace(self.book)['status'],'unchanged')
        self.assertEqual([raw for _,raw in originals(self.book)],[a,b])

    def test_ambiguity_refuses_guessing_but_explicit_order_supported(self):
        part(self.book,'MinerU_book__20261111090000.json',200,'text')
        part(self.book,'MinerU_book__20261111090500.json',200,'text')
        with self.assertRaisesRegex(OCRImportError,'无法可靠判断'):
            inspect_workspace(self.book)
        names=['MinerU_book__20261111090500.json','MinerU_book__20261111090000.json']
        imported=import_workspace(self.book,explicit=names)
        self.assertEqual([p[0] for p in originals(self.book)],names)
        self.assertEqual(imported['ordering'],'manual')

    def test_changed_source_not_overwritten_without_explicit_replace(self):
        part(self.book,'chunk.json',2,'old')
        first=import_workspace(self.book)
        before=originals(self.book)
        part(self.book,'chunk.json',2,'new')
        result=import_workspace(self.book)
        self.assertEqual(result['status'],'changed')
        self.assertEqual(originals(self.book),before)
        updated=import_workspace(self.book,replace=True)
        self.assertEqual(updated['status'],'imported')
        self.assertNotEqual(originals(self.book),before)
        self.assertNotEqual(updated['signature'],first['signature'])

    def test_symlink_rejected_and_unrelated_database_not_overwritten(self):
        part(self.book,'chunk.json',1,'text')
        db=self.book/'ocr2md.sqlite'
        with sqlite3.connect(db) as c:c.execute('CREATE TABLE unrelated (n INTEGER)')
        with self.assertRaisesRegex(OCRImportError,'不是预期'):
            import_workspace(self.book)
        db.unlink()
        target=self.book/'target.sqlite'
        target.write_text('should not overwrite')
        db.symlink_to(target)
        with self.assertRaisesRegex(OCRImportError,'符号链接'):
            import_workspace(self.book)
        self.assertEqual(target.read_text(),'should not overwrite')

    def test_http_verifies_auth_and_origin_and_blocks_out_of_root(self):
        part(self.book,'chunk.json',2,'text')
        root=self.book.parent
        with patch.object(server,'_authorized_roots',side_effect=lambda cookie:[root] if cookie=='valid=yes' else (_ for _ in ()).throw(server.APIError(403,'Unauthorized'))):
            http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            worker=threading.Thread(target=http.serve_forever,daemon=True);worker.start()
            try:
                base=f'http://127.0.0.1:{http.server_address[1]}'
                path=server.PREFIX+'inspect?workspace='+str(self.book)
                with self.assertRaises(HTTPError) as e:urlopen(base+path,timeout=8)
                self.assertEqual(e.exception.code,403)
                req=Request(base+path,headers={'Cookie':'valid=yes'})
                with urlopen(req,timeout=8) as r:
                    self.assertEqual(json.load(r)['status'],'ready')
                import_url=base+server.PREFIX+'import'
                body=json.dumps({'workspace':str(self.book)}).encode()
                req=Request(import_url,data=body,headers={'Cookie':'valid=yes',
                    'Origin':'https://attack.invalid','Content-Type':'application/json'},method='POST')
                with self.assertRaises(HTTPError) as e:urlopen(req,timeout=8)
                self.assertEqual(e.exception.code,403)
                req=Request(import_url,data=body,headers={'Cookie':'valid=yes',
                    'Origin':server.PUBLIC_ORIGIN,'Content-Type':'application/json'},method='POST')
                with urlopen(req,timeout=8) as r:
                    self.assertEqual(json.load(r)['status'],'imported')
                outside=Path(self.temp.name).parent
                req=Request(base+server.PREFIX+'rows?workspace='+str(outside),headers={'Cookie':'valid=yes'})
                with self.assertRaises(HTTPError) as e:urlopen(req,timeout=8)
                self.assertEqual(e.exception.code,403)
            finally:http.shutdown();http.server_close();worker.join(timeout=5)

if __name__=='__main__':unittest.main()
