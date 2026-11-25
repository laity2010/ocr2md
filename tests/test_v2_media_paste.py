import base64,hashlib,io,json,tempfile,unittest
from pathlib import Path
from urllib.parse import urlencode,urlsplit
from test_v2_media import base,media,Stub
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=')

class AccessError(Exception):
 def __init__(self,code,msg):self.code=code;super().__init__(msg)
class Common(Stub):
 ALLOWED_ORIGINS={'http://127.0.0.1'}
 AccessError=WorkspaceIOError=AccessError
 def __init__(self,folder):self.folder=folder;self.probes=0
 def authorized_roots(self,cookie):
  if cookie!='fixture':raise AccessError(403,'Unauthorized')
  return [self.folder]
 def checked_workspace(self,path,roots):
  if path!=str(self.folder):raise AccessError(403,'Wrong book')
  return self.folder
 def probe(self,folder):
  assert folder==self.folder;self.probes+=1
class Handler:
 def __init__(self,body,headers,method):
  self.command=method;self.rfile=io.BytesIO(body);self.headers=headers
 def respond(self,code,body,mime):
  self.code=code;self.body=json.loads(body) if 'json' in mime else body
def call(folder,body=PNG,mime='image/png',cookie='fixture',origin='http://127.0.0.1',size=None,workspace=None,method='POST',common=None):
 common=common or Common(folder)
 h=Handler(body,{'Cookie':cookie,'Origin':origin,'Content-Type':mime,'Content-Length':str(len(body) if size is None else size)},method)
 base.handle(h,'media-paste',urlsplit('/media-paste?'+urlencode({'workspace':str(folder) if workspace is None else workspace})),common)
 return h.code,h.body
class PasteTest(unittest.TestCase):
 def test_authorization_limits_and_atomic_content_store(self):
  with tempfile.TemporaryDirectory() as d:
   book=Path(d);common=Common(book)
   for kw,status in [({'cookie':'bad'},403),({'origin':'https://other'},403),({'workspace':'/other'},403),({'mime':'image/svg+xml'},422),({'mime':'image/jpeg'},422),({'size':0},413),({'size':media.MAX_PASTE+1},413),({'size':len(PNG)+1},400),({'method':'GET'},405)]:
    self.assertEqual(call(book,common=common,**kw)[0],status,kw)
    self.assertFalse((book/'media').exists())
   code,first=call(book,common=common);self.assertEqual(code,200)
   path='media/'+hashlib.sha256(PNG).hexdigest()[:24]+'.png'
   self.assertEqual(first['path'],path);self.assertEqual((book/path).read_bytes(),PNG)
   code,again=call(book,common=common);self.assertEqual(code,200);self.assertTrue(again['unchanged'])
   self.assertEqual(list((book/'media').iterdir()),[book/path]);self.assertGreaterEqual(common.probes,2)
   self.assertFalse((book/base.DB_NAME).exists())
   self.assertEqual(base.dispatch('media-file','GET',book,{}, {'path':[path]},common),(PNG,'image/png'))
   (book/path).write_bytes(b'collision');self.assertEqual(call(book)[0],422)
   self.assertEqual((book/path).read_bytes(),b'collision')
 def test_symlink_directory(self):
  with tempfile.TemporaryDirectory() as d,tempfile.TemporaryDirectory() as other:
   book=Path(d);(book/'media').symlink_to(other,target_is_directory=True)
   self.assertEqual(call(book)[0],422);self.assertEqual(list(Path(other).iterdir()),[])
if __name__=='__main__':unittest.main()
