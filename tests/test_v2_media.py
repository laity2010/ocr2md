import hashlib,os,sys,tempfile,threading,unittest
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as base
import v6_media as media
from test_v2_owned_lf import Stub
DATA=b'\x89PNG\r\n\x1a\n'+b'x'*(media.CHUNK+123)
class Handler(BaseHTTPRequestHandler):
 def do_GET(self):
  start,end=map(int,self.headers['Range'][6:].split('-'))
  end=min(end,len(DATA)-1)
  self.server.ranges.append(start)
  self.send_response(206);self.send_header('Content-Type','image/png')
  self.send_header('Content-Range',f'bytes {start}-{end}/{len(DATA)}')
  self.send_header('ETag','"stable"');self.end_headers();self.wfile.write(DATA[start:end+1])
 def log_message(self,*a):pass
class MediaTest(unittest.TestCase):
 def test_range_resume_inventory_readonly_and_boundaries(self):
  with tempfile.TemporaryDirectory(prefix='wp29-media-') as d:
   book=Path(d);server=ThreadingHTTPServer(('127.0.0.1',0),Handler);server.ranges=[]
   t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
   origin=f'http://127.0.0.1:{server.server_port}';url=origin+'/a.png'
   def call(op,method='GET',**args):
    return base.dispatch(op,method,book,args,{k:[v] for k,v in args.items()},Stub())
   try:
    with patch.dict(os.environ,{'V6_MEDIA_TEST_ORIGIN':origin}):
     self.assertEqual(call('media-status',url=url)['state'],'pending')
     self.assertEqual(call('media-inventory'),{'files':[]})
     self.assertFalse((book/'media').exists())
     first=call('media-chunk','POST',url=url)
     self.assertEqual(first['bytes'],media.CHUNK);self.assertEqual(first['state'],'partial')
     self.assertEqual(call('media-status',url=url),first)
     final=call('media-chunk','POST',url=url)
     self.assertEqual(final['state'],'complete')
     self.assertEqual(server.ranges,[0,media.CHUNK])
     self.assertEqual(call('media-file',path=final['path']),(DATA,'image/png'))
     self.assertEqual(call('media-inventory')['files'][0]['path'],final['path'])
     self.assertEqual(call('media-chunk','POST',url=url),final)
     self.assertEqual(len(server.ranges),2)
     for op,method,args,status in [('media-file','GET',{'path':'media/../secret'},422),('media-chunk','GET',{'url':url},405),('media-status','GET',{'url':'http://169.254.169.254/a.png'},422)]:
      with self.assertRaises(base.BaseError) as err:call(op,method,**args)
      self.assertEqual(err.exception.status,status)
     outside=book/'outside.png';outside.write_bytes(DATA)
     link=book/'media'/('a'*24+'.png');link.symlink_to(outside)
     with self.assertRaises(base.BaseError):call('media-file',path='media/'+link.name)
   finally:server.shutdown();server.server_close();t.join()
if __name__=='__main__':unittest.main()
