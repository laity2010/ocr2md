"""Disposable fixture server using the production V2DevHandler/v3 FS route."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from dev_server import V2DevHandler
from v3_mac_vault import V3MacVault

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', required=True)
    p.add_argument('--static', required=True)
    p.add_argument('--port', type=int, default=4293)
    args = p.parse_args()
    root = Path(args.root)
    V2DevHandler.v3_mac_vault = V3MacVault(root, root.parent / 'private' / 'access-key',
                                           test_origin=f'http://127.0.0.1:{args.port}')
    handler = partial(V2DevHandler, directory=args.static)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), handler)
    print('v3 isolated disk fixture HTTP ready', flush=True)
    server.serve_forever()
