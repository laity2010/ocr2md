#!/usr/bin/env python3
"""V6 static release + single-document I/O. No Vite runtime, no MD cache."""
import hmac
import hashlib
import subprocess
from v6_chapters import read_manifest, read_chapter, export as export_chapters, MAX_EXPORT_BYTES
import json
import os
import re
import secrets
import ssl
import threading
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
LAN_TLS_HOST = os.environ.get('V6_LAN_TLS_HOST', '')
LAN_TLS_PORT = int(os.environ.get('V6_LAN_TLS_PORT', '4443'))
LAN_TLS_CERT = os.environ.get('V6_LAN_TLS_CERT', '')
LAN_TLS_KEY = os.environ.get('V6_LAN_TLS_KEY', '')
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

    def headers_only(self, status, content_type, length=0, cache_control='no-store, max-age=0'):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', cache_control)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-OCR2MD-Release', 'v6')
        self.send_header('Content-Length', str(length))
        self.end_headers()

    def response(self, status, data, content_type='text/plain; charset=utf-8', cache_control='no-store, max-age=0'):
        if isinstance(data, str):
            data = data.encode('utf-8')
        self.headers_only(status, content_type, len(data), cache_control)
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
            slot = Path(STATIC_OVERRIDE).resolve() if STATIC_OVERRIDE else (RUNTIME / 'release').resolve()
            version_file = slot / 'release-version.json'
            try:
                version = json.loads(version_file.read_text())['version']
            except (OSError, ValueError, KeyError):
                # Older Git-based assets may predate the version manifest.
                try:
                    version = 'git:' + json.loads((slot / 'release.json').read_text())['commit']
                except (OSError, ValueError, KeyError):
                    version = None
            self.response(200, json.dumps({'service':'ocr2md-v6','release':'single','version':version}), 'application/json')
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
        if path == '/api/chapters':
            try:
                manifest = read_manifest(DOC)
            except (ValueError, OSError, KeyError, json.JSONDecodeError):
                manifest = None
            if manifest is None:
                self.response(404, 'No published chapter files')
            else:
                self.response(200, json.dumps(manifest, ensure_ascii=False), 'application/json')
            return
        if path.startswith('/api/chapters/'):
            try:
                content=read_chapter(DOC,path[len('/api/chapters/'):])
            except (OSError, ValueError, KeyError):
                self.response(404, 'Unknown chapter file')
            else:
                self.response(200, content, 'text/markdown; charset=utf-8')
            return
        # Static artifacts live only in the one V6 release directory.
        static_root = Path(STATIC_OVERRIDE).resolve() if STATIC_OVERRIDE else (RUNTIME / 'release').resolve()
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
        # Only content-hashed, immutable font assets may be cached long-term.
        # HTML, JS, APIs and release manifests retain their no-store behavior.
        font_asset = re.fullmatch(r'/fonts/sarasa-fixed-sc-(?:regular|bold)-[0-9a-f]{16}\.woff2', path)
        cache = 'public, max-age=31536000, immutable' if font_asset else 'no-store, max-age=0'
        self.response(200, asset.read_bytes(), content_type, cache_control=cache)

    def same_origin(self):
        allowed = {'https://ocr2md.laity.bid', f'http://127.0.0.1:{PORT}'}
        if LAN_TLS_HOST:
            allowed.add(f'https://{LAN_TLS_HOST}:{LAN_TLS_PORT}')
        return self.headers.get('Origin', '') in allowed

    def do_POST(self):
        if urlsplit(self.path).path == '/api/export-chapters':
            self.post_chapters()
            return
        if urlsplit(self.path).path == '/api/convert-mineru':
            self.convert_mineru()
            return
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

    def post_chapters(self):
        if not self.authorized() or not self.same_origin():
            self.response(403, 'Editor authorization required')
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            length = -1
        if length < 2 or length > MAX_EXPORT_BYTES:
            self.response(413, 'Invalid chapter export size')
            return
        try:
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            manifest = export_chapters(DOC, body)
        except (ValueError, TypeError, AttributeError, UnicodeDecodeError, KeyError) as error:
            self.response(400, 'Invalid chapter export: '+str(error))
            return
        except OSError:
            self.response(500, 'Unable to publish chapters')
            return
        self.response(200, json.dumps(manifest, ensure_ascii=False), 'application/json')

    def convert_mineru(self):
        if not self.authorized() or not self.same_origin():
            self.response(403, 'Editor authorization required')
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            length = -1
        if length < 2 or length > 4 * 1024 * 1024:
            self.response(413, 'Invalid MinerU JSON size')
            return
        raw = self.rfile.read(length)
        if len(raw) != length:
            self.response(400, 'Incomplete MinerU JSON')
            return
        node = '/opt/homebrew/bin/node'
        if not Path(node).is_file():
            self.response(503, 'Conversion runtime unavailable')
            return
        script = ("import {toMarkdown} from './packages/minerujson-md/dist/index.js';"
                  "const chunks=[];for await(const c of process.stdin)chunks.push(c);"
                  "process.stdout.write(toMarkdown(Buffer.concat(chunks).toString('utf8')));")
        try:
            result = subprocess.run([node,'--input-type=module','-e',script],
                input=raw,cwd=ROOT,capture_output=True,timeout=20,check=False)
        except (OSError, subprocess.TimeoutExpired):
            self.response(503,'MinerU conversion unavailable')
            return
        if result.returncode != 0:
            self.response(422,'Invalid MinerU JSON or unsupported content')
            return
        self.response(200, result.stdout, 'text/markdown; charset=utf-8')

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

def start_lan_tls():
    if not LAN_TLS_HOST:
        return
    if not LAN_TLS_CERT or not LAN_TLS_KEY:
        raise RuntimeError('LAN TLS enabled but certificate/key not configured')
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(LAN_TLS_CERT, LAN_TLS_KEY)
    https = ThreadingHTTPServer((LAN_TLS_HOST, LAN_TLS_PORT), Handler)
    https.socket = context.wrap_socket(https.socket, server_side=True)
    thread = threading.Thread(target=https.serve_forever, name='v6-lan-https', daemon=True)
    thread.start()
    print(f'V6 LAN HTTPS READY: https://{LAN_TLS_HOST}:{LAN_TLS_PORT}/', flush=True)

start_lan_tls()
print(f'V6 PUBLIC ORIGIN READY: http://{HOST}:{PORT}/', flush=True)
ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
