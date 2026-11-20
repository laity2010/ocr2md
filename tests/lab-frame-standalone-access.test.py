"""True standalone Frame authentication + roots/browse/F02 I/O without Main."""
import base64,io,json,os,sys,tempfile,types,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import frame_access as auth
import frame_workspace_io as f02

class AccessTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.home=Path(self.tmp.name)
        self.root=self.home/'books';self.root.mkdir()
        self.book=self.root/'a-book';self.book.mkdir()
        (self.book/'sample.json').write_bytes(b'abc')
        self.cfg=self.home/'config.json'
        self.cfg.write_text(json.dumps({'schema':'ocr2md-frame-access/v1',
            'code':'ABCD1234ABCD1234','secret':'a'*64,'allowedRoots':[str(self.root)]}))
        os.chmod(self.cfg,0o600)
        self.patcher=patch.object(auth,'CONFIG',self.cfg);self.patcher.start();self.addCleanup(self.patcher.stop)
    def request(self,method,operation,body=None,cookie='',query='',origin='https://ocr2md.laity.bid'):
        raw=json.dumps(body or {}).encode()
        result=[]
        handler=types.SimpleNamespace(command=method,headers={
            'Origin':origin,'Cookie':cookie,'Content-Length':str(len(raw))},rfile=io.BytesIO(raw),
            respond=lambda code,data,*args:result.append((code,json.loads(data),args)))
        f02.handle(handler,operation,types.SimpleNamespace(query=query))
        return result[0]
    def login(self):
        code,data,args=self.request('POST','unlock',{'code':'ABCD1234ABCD1234'})
        self.assertEqual(code,200)
        cookie=args[-1][0][1].split(';')[0]
        return cookie
    def test_access_without_main_and_full_public_io(self):
        # Intentionally no Main /api/session, /api/workspace/roots or port 4396.
        self.assertEqual(self.request('GET','session')[1]['authorized'],False)
        self.assertEqual(self.request('GET','roots')[0],403)
        cookie=self.login()
        self.assertTrue(self.request('GET','session',cookie=cookie)[1]['authorized'])
        self.assertEqual(self.request('GET','roots',cookie=cookie)[1]['allowedRoots'],[str(self.root)])
        listing=self.request('GET','browse',cookie=cookie,query='path='+str(self.root))
        self.assertEqual(listing[0],200)
        self.assertEqual(listing[1]['children'],[{'path':str(self.book),'name':'a-book'}])
        ws=str(self.book)
        verified=self.request('POST','probe',{'workspace':ws},cookie)
        self.assertEqual(verified[0],200);self.assertTrue(verified[1]['verified'])
        got=self.request('GET','read',cookie=cookie,query='workspace='+ws+'&path=sample.json')
        self.assertEqual(base64.b64decode(got[1]['contentBase64']),b'abc')
        created=self.request('POST','create',{'workspace':ws,'path':'made.txt','contentBase64':'aGk='},cookie)
        self.assertEqual(created[0],200)
        replaced=self.request('POST','replace',{'workspace':ws,'path':'made.txt','contentBase64':'Ynll',
            'expectedSha256':created[1]['sha256']},cookie)
        self.assertEqual(replaced[0],200)
        self.assertEqual((self.book/'made.txt').read_bytes(),b'bye')
        self.assertEqual((self.book/'sample.json').read_bytes(),b'abc')
    def test_security_guards(self):
        self.assertEqual(self.request('POST','unlock',{'code':'ABCD1234ABCD1234'},
            origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request('POST','unlock',{'code':'wrong'})[0],403)
        cookie=self.login()
        self.assertEqual(self.request('GET','roots',cookie=cookie+'.tampered')[0],403)
        self.assertIn(self.request('GET','browse',cookie=cookie,query='path=/etc')[0],(403,422))
        self.assertEqual(self.request('POST','probe',{'workspace':str(self.book)},cookie,
            origin='https://evil.invalid')[0],403)
        self.assertEqual(self.request('POST','create',{'workspace':str(self.book),'path':'sample.json',
            'contentBase64':'eA=='},cookie)[0],409)
        self.assertEqual(self.request('GET','unlock',cookie=cookie)[0],405)
        os.chmod(self.cfg,0o644)
        self.assertEqual(self.request('GET','roots',cookie=cookie)[0],503)

if __name__=='__main__':unittest.main()
