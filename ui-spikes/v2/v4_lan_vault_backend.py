"""LAN-only V4 candidate Vault HTTP adapter; never public or a generic file API.

Uses production authentication, scoped CAS and ZIP persistence implementation,
but exposes only pre-existing, explicitly allowlisted V3 document endpoints.
It does not restart the shared 4176 public server. Listen on loopback only.
"""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from dev_server import V2DevHandler
from v3_mac_vault import V3MacVault

READ_ROUTES = frozenset(('/__v3/fs','/__v3/ir','/__v3/ir/markings','/__v3/ir/cache'))
WRITE_ROUTES = frozenset(('/__v3/ir/commit','/__v3/ir/markings/commit',
                          '/__v3/ir/publish-chapters','/__v3/chapters/commit',
                          '/__v3/chapters/media/download','/__v3/ir/cache/prepare'))

class Handler(V2DevHandler):
    def do_GET(self):
        if urlparse(self.path).path not in READ_ROUTES:
            self.send_error(404, 'V4 LAN backend allows only scoped Vault reads')
            return
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path not in WRITE_ROUTES:
            self.send_error(404, 'V4 LAN backend allows only scoped Vault writes')
            return
        return super().do_POST()

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--port',type=int,required=True)
    parser.add_argument('--workspace-root',type=Path,required=True)
    parser.add_argument('--existing-key-file',type=Path,required=True)
    args=parser.parse_args()
    if not args.existing_key_file.is_file():raise SystemExit('Existing V3 auth file unavailable')
    Handler.v3_mac_vault=V3MacVault(args.workspace_root,args.existing_key_file,
                                     test_origin=f'http://127.0.0.1:{args.port}')
    with ThreadingHTTPServer(('127.0.0.1',args.port),partial(Handler,directory='/dev/null')) as server:
        print(f'V4_LAN_VAULT_BACKEND_READY port={args.port} scoped-routes={len(READ_ROUTES)+len(WRITE_ROUTES)}',flush=True)
        server.serve_forever()
