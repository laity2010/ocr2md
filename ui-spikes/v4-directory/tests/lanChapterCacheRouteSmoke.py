#!/usr/bin/env python3
"""Read-only HTTPS 4443 Chapter Cache routing gate; does not use Vault credentials."""
import hashlib
import json
import ssl
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

origin = 'https://192.168.1.10:4443'
ca = Path.home() / 'Library/Application Support/ocr2md/lan-tls/root-ca.crt'
context = ssl.create_default_context(cafile=str(ca))


def request(path, method='GET', body=None, headers=None, expected=200):
    req = Request(origin + path, data=body, method=method, headers=headers or {})
    try:
        with urlopen(req, timeout=12, context=context) as response:
            status, payload = response.status, response.read()
    except HTTPError as error:
        status, payload = error.code, error.read()
    assert status == expected, f'{path.split("?")[0]}: expected {expected}, got {status}'
    return payload


for slot, expected in [('v4-directory', 'v4-261014-0816'),
                       ('v4-wp3-candidate', 'v4-261015-0114')]:
    html = request(f'/{slot}/').decode('utf-8')
    assert f'data-build-id="{expected}"' in html
    build = json.loads(request(f'/{slot}/build-info.json'))
    assert build['id'] == expected
    for filename in ('app.js', 'plugins/chapter-boundary/legacy.js',
                     'plugins/filesystem/workspace-fs.js'):
        if filename not in build['assets']:
            continue
        received = request(f'/{slot}/{filename}')
        assert hashlib.sha256(received).hexdigest() == build['assets'][filename]
    print('LAN_CACHE_STATIC_PASS', slot, expected)

query = urlencode({'book': '/ocr2md/Bufett’s Alpha', 'part': 'status'})
request('/__v3/ir/cache?' + query, expected=401)
request('/__v3/ir/markings?' + urlencode({'book': '/ocr2md/Bufett’s Alpha'}), expected=401)
body = b'{}'  # untrusted/missing-key paths reject before reaching any write handler
request('/__v3/ir/cache/prepare', method='POST', body=body,
        headers={'Origin': 'https://invalid.example', 'Content-Type': 'application/json'}, expected=403)
request('/__v3/ir/cache/prepare', method='POST', body=body,
        headers={'Origin': origin, 'Content-Type': 'application/json'}, expected=401)
request('/__v3/ir/cache/unknown', expected=404)
print('LAN_CACHE_ROUTE_AUTH_GATES_PASS (401/403/404, zero Vault writes)')
