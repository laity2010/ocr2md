"""Book-local rules: isolated temporary workspace, CAS, symlink & HTTP authorization."""
import tempfile,unittest,sys,json,threading
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from unittest.mock import patch
from http.server import ThreadingHTTPServer
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import v6_lab_ocr_serve as api
from v6_lab_ocr_note_match_config import (read_note_match_config,save_note_match_config,
  validate_note_match_config,FILENAME,LOCKFILE)
from v6_lab_ocr_store import OCRImportError

class Storage(unittest.TestCase):
 def test_read_write_atomic_per_book_cas_without_sql(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp);a=root/'book-a';b=root/'book-b';a.mkdir();b.mkdir()
   prior=read_note_match_config(a)
   self.assertFalse((a/FILENAME).exists(),'GET must not write rule config')
   self.assertFalse((a/'ocr2md.sqlite').exists())
   cfg={**prior['config'],'referenceRules':['ref.html-sup'],
     'bodyRules':['body.number-dot'],'scope':'chapter','chapterLevel':2,
     'customRules':[{'id':'book.ref.section','kind':'reference',
       'pattern':'§(?<id>[0-9]+)','strength':'strong'}]}
   self.assertEqual(validate_note_match_config(cfg),cfg)
   saved=save_note_match_config(a,cfg,prior['revision'])
   self.assertEqual(saved['status'],'saved')
   self.assertEqual(read_note_match_config(a)['config'],cfg)
   self.assertEqual(read_note_match_config(b),prior,'Another book must stay on defaults')
   with self.assertRaisesRegex(OCRImportError,'已有其他修改'):
    save_note_match_config(a,prior['config'],prior['revision'])
   self.assertEqual(save_note_match_config(a,cfg,saved['revision'])['revision'],saved['revision'])
   self.assertFalse((a/'ocr2md.sqlite').exists())
   self.assertFalse(list(a.glob('*.tmp')))

 def test_invalid_and_symlink_guards(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp)/'book';book.mkdir()
   rev=read_note_match_config(book)['revision']
   for config in [None,{}, {'scope':'nonsense'}, {'chapterLevel':True},
                  {'referenceRules':['ref.html-sup','ref.html-sup']},
                  {'customRules':[{'id':'book.body.not-anchored','kind':'body',
                    'pattern':'(?<id>\\d+) (?<content>.*)','strength':'strong'}]}]:
    if config=={}:continue
    with self.assertRaises(OCRImportError):save_note_match_config(book,config,rev)
   external=Path(tmp)/'sensitive.json';external.write_text('unrelated')
   (book/FILENAME).symlink_to(external)
   with self.assertRaisesRegex(OCRImportError,'符号链接'):
    read_note_match_config(book)
   with self.assertRaisesRegex(OCRImportError,'符号链接'):
    save_note_match_config(book,read_note_match_config(Path(tmp))['config'],rev)
   self.assertEqual(external.read_text(),'unrelated')

 def test_real_http_origin_method_cookie_and_cas(self):
  with tempfile.TemporaryDirectory() as tmp:
   book=Path(tmp)/'book';book.mkdir()
   srv=ThreadingHTTPServer(('127.0.0.1',0),api.Handler)
   thread=threading.Thread(target=srv.serve_forever,daemon=True);thread.start()
   url=f'http://127.0.0.1:{srv.server_port}/labs/lab-ocr/api/ocr/'
   try:
    with patch.object(api,'_authorized_roots',side_effect=lambda cookie:
         [book.parent] if cookie=='authorized' else (_ for _ in ()).throw(api.APIError(403,'没有权限'))):
     def call(op,data=None,cookie='authorized',origin='http://127.0.0.1:4414'):
      from urllib.parse import urlencode
      uri=url+op+(('?'+urlencode({'workspace':str(book)})) if data is None else '')
      req=Request(uri,headers={'Cookie':cookie,'Origin':origin,
                  'Content-Type':'application/json'},
                  data=json.dumps({'workspace':str(book),**data}).encode() if data is not None else None)
      with urlopen(req,timeout=6) as res:return json.loads(res.read())
     data=call('note-match-rules')
     config={**data['config'],'referenceRules':[]}
     saved=call('note-match-rules-save',{'config':config,'expectedRevision':data['revision']})
     self.assertEqual(saved['config']['referenceRules'],[])
     self.assertEqual(call('note-match-rules')['revision'],saved['revision'])
     with self.assertRaises(HTTPError) as error:call('note-match-rules-save',{'config':config,
       'expectedRevision':data['revision']})
     self.assertEqual(error.exception.code,422)
     with self.assertRaises(HTTPError) as error:call('note-match-rules',cookie='bad')
     self.assertEqual(error.exception.code,403)
     with self.assertRaises(HTTPError) as error:call('note-match-rules-save',{'config':config,
       'expectedRevision':saved['revision']},origin='https://evil.example')
     self.assertEqual(error.exception.code,403)
     with self.assertRaises(HTTPError) as error:call('note-match-rules-save')
     self.assertEqual(error.exception.code,405)
   finally:srv.shutdown();thread.join();srv.server_close()

if __name__=='__main__':unittest.main()
