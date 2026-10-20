#!/usr/bin/env python3
"""V6 static release + single-document I/O. No Vite runtime, no MD cache."""
import hmac
import json
import os
import secrets
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from mimetypes import guess_type
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.v6'
DOC = Path(os.environ.get('V6_DOCUMENT_PATH', RUNTIME / 'workspace' / 'buffetts-alpha.minerujson.md')).resolve()
FIXTURE = ROOT / 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md'
TOKEN = RUNTIME / 'private' / 'editor-token'
HOST = os.environ.get('V6_BIND', '127.0.0.1')
PORT = int(os.environ.get('V6_PORT', '4396'))
STATIC_OVERRIDE = os.environ.get('V6_STATIC_ROOT')
LIMIT = 8 * 1024 * 1024

TOKEN.parent.mkdir(parents=True, exist_ok=True)
if not TOKEN.is_file():
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as writer:
        writer.write(secrets.token_urlsafe(36))
KEY = TOKEN.read_text().strip()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # No access codes, document text, or URLs logged.
        pass

    def headers_only(self, status, content_type, length=0):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-OCR2MD-Release', 'v6')
        self.send_header('Content-Length', str(length))
        self.end_headers()

    def response(self, status, data, content_type='text/plain; charset=utf-8'):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self.headers_only(status, content_type, len(data))
        if self.command != 'HEAD':
            self.wfile.write(data)

    def authorized(self):
        try:
            cookie = SimpleCookie()
            cookie.load(self.headers.get('Cookie', ''))
            item = cookie.get('v6edit')
            return bool(item and hmac.compare_digest(item.value, KEY))
        except Exception:
            return False

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == '/healthz':
            slot = Path(STATIC_OVERRIDE).resolve() if STATIC_OVERRIDE else (RUNTIME / 'current').resolve()
            version_file = slot / 'release-version.json'
            try:
                version = json.loads(version_file.read_text())['version']
            except (OSError, ValueError, KeyError):
                version = None
            self.response(200, json.dumps({'service':'ocr2md-v6','release':slot.name,'version':version}), 'application/json')
            return
        if path == '/access/' + KEY:
            self.send_response(302)
            self.send_header('Set-Cookie', f'v6edit={KEY}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=86400')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Location', '/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path == '/api/session':
            self.response(200, json.dumps({'canSave': self.authorized()}), 'application/json; charset=utf-8')
            return
        if path == '/api/document':
            self.response(200, (DOC if DOC.is_file() else FIXTURE).read_bytes(), 'text/plain; charset=utf-8')
            return
        # Static artifacts are read only from the active A/B slot; never from source.
        static_root = Path(STATIC_OVERRIDE).resolve() if STATIC_OVERRIDE else (RUNTIME / 'current').resolve()
        if not static_root.is_dir():
            self.response(503, 'No V6 release')
            return
        if path == '/':
            path = '/index.html'
        asset = (static_root / path.lstrip('/')).resolve()
        if not asset.is_relative_to(static_root) or not asset.is_file():
            self.response(404, 'Not found')
            return
        content_type = guess_type(asset.name)[0] or 'application/octet-stream'
        if content_type.startswith('text/') or content_type == 'application/javascript':
            content_type += '; charset=utf-8'
        self.response(200, asset.read_bytes(), content_type)

    def same_origin(self):
        return self.headers.get('Origin', '') in ('https://ocr2md.laity.bid', f'http://127.0.0.1:{PORT}')

    def do_POST(self):
        if urlsplit(self.path).path != '/api/unlock':
            self.response(404, 'Not found')
            return
        if not self.same_origin():
            self.response(403, 'Invalid origin')
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            length = -1
        if length < 2 or length > 160:
            self.response(413, 'Invalid request size')
            return
        try:
            code = json.loads(self.rfile.read(length).decode('utf-8')).get('code')
        except (ValueError, UnicodeDecodeError, AttributeError):
            self.response(400, 'Invalid request')
            return
        if not isinstance(code, str) or not hmac.compare_digest(code, KEY[:12]):
            self.response(403, 'Invalid code')
            return
        self.send_response(200)
        self.send_header('Set-Cookie', f'v6edit={KEY}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', '11')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def do_PUT(self):
        if urlsplit(self.path).path != '/api/document':
            self.response(404, 'Not found')
            return
        # Both cookie authorization and same-origin guard protect public writes.
        origin = self.headers.get('Origin', '')
        if not self.authorized() or not self.same_origin():
            self.response(403, 'Editor authorization required')
            return
        try:
            length = int(self.headers.get('Content-Length','-1'))
        except ValueError:
            length = -1
        if length < 0 or length > LIMIT:
            self.response(413, 'Invalid document size')
            return
        value = self.rfile.read(length)
        if len(value) != length:
            self.response(400, 'Incomplete document')
            return
        try:
            value.decode('utf-8')
        except UnicodeDecodeError:
            self.response(400, 'Invalid UTF-8')
            return
        DOC.parent.mkdir(parents=True, exist_ok=True)
        tmp = DOC.with_name('.' + str(os.getpid()) + '-' + secrets.token_hex(4) + '.tmp')
        with tmp.open('xb') as out:
            out.write(value)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, DOC)
        self.response(200, 'saved')

print(f'V6 RELEASE READY: http://{HOST}:{PORT}/', flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
