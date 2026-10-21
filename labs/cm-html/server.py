#!/usr/bin/env python3
"""Independent cm-html experiment HTTP service; never opens the mainline MD.

Only serves /labs/cm-html/, with its own session cookie, document path,
authentication key, static build and save API. No main V6 service modification.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from http.cookies import SimpleCookie
from pathlib import Path
from urllib.parse import unquote, urlsplit
from mimetypes import guess_type
import hmac
import json
import os
import re
import secrets
import tempfile

LAB = Path(__file__).resolve().parent
ROOT = LAB.parents[1]
PREFIX = '/labs/cm-html/'
STATIC = LAB / 'dist'
RUNTIME = LAB / '.runtime'
PRIVATE = RUNTIME / 'private'
PRIVATE.mkdir(parents=True, exist_ok=True)

name = os.getenv('CMHTML_WORKFILE', 'document.md')
# An experiment may choose its isolated fixture; never accept absolute,
# parent-relative, or symlinked paths outside its own runtime.
if not re.fullmatch(r'[\w.-]+\.md', name):
    raise RuntimeError('CMHTML_WORKFILE must be one local .md filename')
DOC = (RUNTIME / name).resolve()
if not DOC.is_relative_to(RUNTIME.resolve()):
    raise RuntimeError('Experiment document path escaped its runtime')
FIXTURE = ROOT / 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md'
AUTH = PRIVATE / 'save-token'
if not AUTH.exists():
    fd = os.open(AUTH, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as writer:
        writer.write(secrets.token_urlsafe(36))
TOKEN = AUTH.read_text().strip()
HOST = '127.0.0.1'
PORT = int(os.getenv('CMHTML_PORT', '4408'))
MAX_BYTES = 2 * 1024 * 1024


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # No token or user-written data should enter logs.
        pass

    def reply(self, status, body=b'', ctype='text/plain; charset=utf-8'):
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store, max-age=0')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-OCR2MD-Scope', 'lab-cm-html')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def has_auth(self):
        try:
            cookie = SimpleCookie()
            cookie.load(self.headers.get('Cookie', ''))
            item = cookie.get('cmhtml_edit')
            return item is not None and hmac.compare_digest(item.value, TOKEN)
        except Exception:
            return False

    def allowed_origin(self):
        return self.headers.get('Origin') in {
            'https://ocr2md.laity.bid', f'http://127.0.0.1:{PORT}'
        }

    def do_HEAD(self):
        self.do_GET()

    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        if path == PREFIX[:-1]:
            self.send_response(302)
            self.send_header('Location', PREFIX)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if not path.startswith(PREFIX):
            self.reply(404, 'Outside cm-html laboratory')
            return
        relative = path[len(PREFIX):]
        if relative == 'healthz':
            version_file = STATIC / 'release-version.json'
            try:
                version = json.loads(version_file.read_text())['version']
            except (OSError, KeyError, ValueError):
                version = None
            self.reply(200, json.dumps({'service': 'cm-html-lab',
                                         'scope': PREFIX, 'version': version}),
                       'application/json; charset=utf-8')
            return
        if relative == 'api/session':
            self.reply(200, json.dumps({'canSave': self.has_auth()}),
                       'application/json; charset=utf-8')
            return
        if relative == 'api/document':
            self.reply(200, (DOC if DOC.is_file() else FIXTURE).read_bytes())
            return
        if not relative:
            relative = 'index.html'
        if relative.startswith('api/'):
            self.reply(404, 'Unknown lab API')
            return
        asset = (STATIC / relative).resolve()
        if not asset.is_relative_to(STATIC.resolve()) or not asset.is_file():
            self.reply(404, 'Unknown lab asset')
            return
        ctype = guess_type(asset.name)[0] or 'application/octet-stream'
        if ctype.startswith('text/') or ctype == 'application/javascript':
            ctype += '; charset=utf-8'
        self.reply(200, asset.read_bytes(), ctype)

    def do_POST(self):
        if urlsplit(self.path).path != PREFIX+'api/unlock':
            self.reply(404)
            return
        if not self.allowed_origin():
            self.reply(403, 'Invalid lab origin')
            return
        try:
            size = int(self.headers.get('Content-Length', '-1'))
            if not 2 <= size <= 160:
                self.reply(413)
                return
            code = json.loads(self.rfile.read(size).decode('utf-8')).get('code')
            valid = isinstance(code, str) and hmac.compare_digest(code, TOKEN[:12])
        except (ValueError, UnicodeDecodeError, AttributeError):
            valid = False
        if not valid:
            self.reply(403, 'Invalid lab code')
            return
        payload=b'{"ok":true}'
        self.send_response(200)
        # Production HTTPS always receives Secure cookies; the localhost
        # test origin may use plain HTTP without changing public protection.
        secure = '; Secure' if self.headers.get('Origin', '').startswith('https://') else ''
        self.send_header('Set-Cookie',
                         f'cmhtml_edit={TOKEN}; Path={PREFIX}{secure}; HttpOnly; SameSite=Lax; Max-Age=86400')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_PUT(self):
        if urlsplit(self.path).path != PREFIX+'api/document':
            self.reply(404)
            return
        if not self.has_auth() or not self.allowed_origin():
            self.reply(403, 'Lab save authorization required')
            return
        try:
            size = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            size = -1
        if size < 0 or size > MAX_BYTES:
            self.reply(413, 'Lab document too large')
            return
        data = self.rfile.read(size)
        if len(data) != size:
            self.reply(400, 'Incomplete write')
            return
        try:
            data.decode('utf-8')
        except UnicodeDecodeError:
            self.reply(400, 'Non UTF-8 document')
            return
        # Only a local, atomic file replacement under the lab directory.
        RUNTIME.mkdir(exist_ok=True)
        name = None
        try:
            fd, name = tempfile.mkstemp(prefix='.cmhtml-save-', dir=RUNTIME)
            with os.fdopen(fd, 'wb') as out:
                out.write(data)
                out.flush()
                os.fsync(out.fileno())
            os.replace(name, DOC)
            self.reply(200, 'saved in cm-html lab')
        finally:
            if name and os.path.exists(name):
                os.unlink(name)


if __name__ == '__main__':
    print(f'CM_HTML_LAB_READY http://{HOST}:{PORT}{PREFIX}', flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
