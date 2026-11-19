"""Direct F02 contract tests: V1 auth, path scope, read/write/CAS/probe."""
import base64
from contextlib import closing
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import frame_workspace_io as port

class WorkspacePortTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='lab-frame-io-test-')
        self.root=Path(self.tmp.name)
        self.book=self.root/'book';self.book.mkdir()
        self.other=self.root/'another';self.other.mkdir()
        (self.book/'sub').mkdir()
        (self.book/'original.pdf').write_bytes(b'%PDF-immutable')
        (self.book/'mineru.json').write_bytes(b'{"raw":true}')
        self.protected={p.name:p.read_bytes() for p in self.book.iterdir() if p.is_file()}
    def tearDown(self):
        for name,raw in self.protected.items():
            self.assertEqual((self.book/name).read_bytes(),raw)
        self.tmp.cleanup()

    def test_real_probe_cleans_up_and_never_touches_source(self):
        self.assertEqual(port.probe(self.book),{
            'readable':True,'writable':True,'verified':True,'method':'create-read-verify-cleanup'})
        self.assertFalse(list(self.book.glob('.ocr2md-frame-io-*')))
        with patch.object(port,'read_exact',side_effect=OSError('simulated read failure')):
            with self.assertRaises(OSError):port.probe(self.book)
        self.assertFalse(list(self.book.glob('.ocr2md-frame-io-*')))

    def test_create_read_list_and_cas_with_nested_path(self):
        created=port.create_file(self.book,'sub/test.bin',b'hello\0workspace')
        self.assertEqual(created['size'],15)
        content=port.read_file(self.book,'sub/test.bin')
        self.assertEqual(base64.b64decode(content['contentBase64']),b'hello\0workspace')
        self.assertEqual(content['sha256'],created['sha256'])
        listed=port.list_files(self.book,'sub')
        self.assertEqual(listed['entries'][0]['name'],'test.bin')
        with self.assertRaises(FileExistsError):port.create_file(self.book,'sub/test.bin',b'bad')
        with self.assertRaisesRegex(port.WorkspaceIOError,'重新读取'):
            port.replace_file(self.book,'sub/test.bin',b'new','0'*64)
        result=port.replace_file(self.book,'sub/test.bin',b'new',created['sha256'])
        self.assertEqual(result['sha256'],port.sha(b'new'))
        self.assertEqual(base64.b64decode(port.read_file(self.book,'sub/test.bin')['contentBase64']),b'new')

    def test_scope_and_symlinks_are_not_followed(self):
        with self.assertRaisesRegex(port.WorkspaceIOError,'授权范围'):
            port.checked_workspace(str(self.book),[self.other])
        with self.assertRaises(port.WorkspaceIOError):
            port.checked_workspace(str(self.root/'book/../another'),[self.root])
        (self.root/'link').symlink_to(self.book,target_is_directory=True)
        with self.assertRaises(port.WorkspaceIOError):
            port.checked_workspace(str(self.root/'link/sub'),[self.root])
        (self.book/'symlink').symlink_to(self.other,target_is_directory=True)
        with self.assertRaises(OSError):port.list_files(self.book,'symlink')
        (self.book/'sub/link').symlink_to(self.book/'mineru.json')
        with self.assertRaises(OSError):port.read_file(self.book,'sub/link')
        (self.book/'sub/hardlink').hardlink_to(self.book/'mineru.json')
        with self.assertRaises(port.WorkspaceIOError):port.read_file(self.book,'sub/hardlink')
        # Hardlink protection also rejects this source file until the test ends.
        (self.book/'sub/hardlink').unlink()
        for evil in ('../original.pdf','/etc/passwd','sub/../../etc/passwd','sub//hi','sub/.git/file','sub/.ocr2md-frame-io-danger','sub\\file'):
            with self.subTest(evil=evil):
                with self.assertRaises(port.WorkspaceIOError):port.read_file(self.book,evil)

    def test_file_size_and_invalid_data_are_rejected(self):
        with patch.object(port,'MAX_FILE',20):
            (self.book/'huge.txt').write_bytes(b'x'*21)
            with self.assertRaises(port.WorkspaceIOError):port.read_file(self.book,'huge.txt')
        with patch.object(port,'MAX_FILE',20):
          for raw in ('!', '====', 'abc$$', 'x'* (20*4//3+9)):
              with self.assertRaises(port.WorkspaceIOError):port.decode_blob({'contentBase64':raw})
        with self.assertRaises(port.WorkspaceIOError):
            port.replace_file(self.book,'original.pdf',b'overwrite','no-checksum')

    def test_http_auth_origin_and_path_method(self):
        payload={'workspace':str(self.book)}
        raw=json.dumps(payload).encode('utf8')
        def request(method,operation,origin='',cookie='',body=raw,query=''):
            responses=[]
            handler=types.SimpleNamespace(command=method,
                headers={'Origin':origin,'Cookie':cookie,'Content-Length':str(len(body))},
                rfile=io.BytesIO(body),
                respond=lambda code,text,*args:responses.append((code,json.loads(text))))
            port.handle(handler,operation,types.SimpleNamespace(query=query))
            return responses[0]
        with patch.object(port,'authorized_roots',side_effect=lambda c:[self.root] if c=='main-session' else (_ for _ in ()).throw(port.WorkspaceIOError(403,'需要 Main 的编辑授权'))):
            for origin in ('https://attacker.invalid','https://192.168.1.10','https://192.168.1.10:9999'):
                self.assertEqual(request('POST','probe',origin,'main-session')[0],403)
            with patch.object(port,'ALLOWED_ORIGINS',frozenset(('https://192.168.1.10:4443',))):
                self.assertEqual(request('POST','probe','https://192.168.1.10:4443','bad')[0],403)
                code,res=request('POST','probe','https://192.168.1.10:4443','main-session')
                self.assertEqual(code,200);self.assertTrue(res['verified'])
                self.assertEqual(request('POST','read','https://192.168.1.10:4443','main-session')[0],405)
                self.assertEqual(request('POST','destroy','https://192.168.1.10:4443','main-session')[0],404)
                self.assertEqual(request('GET','list',cookie='main-session',query='workspace='+str(self.book))[0],200)
        self.assertFalse(list(self.book.glob('.ocr2md-frame-io-*')))

if __name__=='__main__':unittest.main()
