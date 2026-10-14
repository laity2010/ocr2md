"""V3 public versioned assets cacheable; all sensitive paths remain no-store."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import threading
import urllib.request
import urllib.error
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'v2'))
from dev_server import V2DevHandler

root=Path(__file__).resolve().parents[2]/'v2'
Handler=partial(V2DevHandler,directory=str(root))
server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
server_thread=threading.Thread(target=server.serve_forever,daemon=True)
server_thread.start()
base=f'http://127.0.0.1:{server.server_port}'
try:
    rev='v3-static-cache-20261010t'
    for path,expected in [
        (f'/v3-directory/dist/app.js?rev={rev}','public'),
        (f'/v3-directory/dist/app.css?rev={rev}','public'),
        ('/v3-directory/dist/app.js','no-store'),
        ('/v3-directory/dist/app.css','no-store'),
        ('/v3-directory/dist/KaTeX_Main-Regular-W74P5G27.ttf','public'),
        ('/v3-directory/','no-store'),
        ('/v3-directory/index.html','no-store'),
        ('/v3-directory/sw.js','no-store'),
    ]:
        req=urllib.request.Request(base+path,method='HEAD')
        with urllib.request.urlopen(req,timeout=5) as response:
            cache=response.headers.get('cache-control','')
            assert response.status==200 and expected in cache,(path,response.status,cache)
            print('HEADER_OK',path,cache)
    req=urllib.request.Request(base+'/__v3/fs?op=status')
    try:
        response=urllib.request.urlopen(req,timeout=5)
    except urllib.error.HTTPError as error:
        response=error  # 503 is expected: fixture has no private Vault
    with response:
        assert 'no-store' in response.headers.get('cache-control',''),response.headers
    print('V3_PUBLIC_STATIC_CACHE_HEADERS_PASS')
finally:
    server.shutdown();server.server_close()
