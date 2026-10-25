#!/usr/bin/env python3
"""V6 static release + single-document I/O. No Vite runtime, no MD cache."""
import hmac
import hashlib
import subprocess
from v6_lan_lab_proxy import parse_lan_labs,dispatch_lan_lab
from v6_chapters import read_manifest, read_chapter, export as export_chapters, MAX_EXPORT_BYTES
from v6_initialize import initialize_document
from v6_cmd_settings import read as cmd_settings_read, save as cmd_settings_save, fingerprint as cmd_settings_fingerprint, LIMIT as SETTINGS_LIMIT
from v6_media import download_chunk as media_download_chunk, status as media_status, read_local as media_read_local, inventory as media_inventory, store_pasted_image as media_store_pasted_image, MAX_PASTE as MAX_MEDIA_PASTE, chapter_media_references
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
LAB_ID = os.environ.get('V6_LAB_ID', '')
if LAB_ID and re.fullmatch(r'[a-z][a-z0-9-]{0,31}', LAB_ID) is None:
    raise RuntimeError('Invalid V6_LAB_ID')
LAB_DIR = ROOT / 'labs' / LAB_ID if LAB_ID else None
PREFIX = f'/labs/{LAB_ID}/' if LAB_ID else '/'
RUNTIME = LAB_DIR / '.runtime' if LAB_ID else ROOT / '.v6'

def lab_path(env, default):
    path = Path(os.environ.get(env, str(default))).resolve()
    if LAB_ID and not path.is_relative_to(RUNTIME.resolve()):
        raise RuntimeError(f'{env} escapes the experiment runtime')
    return path

DOC = lab_path('V6_DOCUMENT_PATH', RUNTIME / ('document.md' if LAB_ID else 'workspace/buffetts-alpha.minerujson.md'))
FIXTURE = ROOT / 'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md'
ORIGINAL_JSON = ROOT / 'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'
PDF_PATH = lab_path('V6_PDF_PATH', RUNTIME / ('reference.pdf' if LAB_ID else 'workspace/buffetts-alpha.original.pdf'))
TOKEN = lab_path('V6_TOKEN_PATH', RUNTIME / ('private/save-token' if LAB_ID else 'private/editor-token'))
SETTINGS = lab_path('V6_SETTINGS_PATH', RUNTIME / 'settings.json')
HOST = os.environ.get('V6_BIND', '127.0.0.1')
PORT = int(os.environ.get('V6_PORT', os.environ.get('CMHTML_PORT', '4408') if LAB_ID else '4396'))
LAN_TLS_HOST = os.environ.get('V6_LAN_TLS_HOST', '')
LAN_TLS_PORT = int(os.environ.get('V6_LAN_TLS_PORT', '4443'))
LAN_TLS_CERT = os.environ.get('V6_LAN_TLS_CERT', '')
LAN_TLS_KEY = os.environ.get('V6_LAN_TLS_KEY', '')
LAN_LAB_ROUTES = parse_lan_labs(os.environ.get('V6_LAN_LAB_ROUTES', 'cm-html=4408')) if not LAB_ID else {}
LAB_LAN_ORIGIN = os.environ.get('V6_LAB_LAN_ORIGIN', '') if LAB_ID else ''
if LAB_LAN_ORIGIN:
    lab_origin = urlsplit(LAB_LAN_ORIGIN)
    if (lab_origin.scheme != 'https' or not lab_origin.hostname or lab_origin.path
            or lab_origin.query or lab_origin.fragment or lab_origin.username):
        raise RuntimeError('Invalid V6_LAB_LAN_ORIGIN')
STATIC_OVERRIDE = os.environ.get('V6_STATIC_ROOT', str(LAB_DIR / 'dist') if LAB_ID else '')
if LAB_ID:
    if HOST not in ('127.0.0.1','localhost') or LAN_TLS_HOST:
        raise RuntimeError('Lab server may bind loopback only')
    if (not LAB_DIR.is_dir() or LAB_DIR.is_symlink() or RUNTIME.is_symlink()
            or not RUNTIME.resolve().is_relative_to(LAB_DIR.resolve())):
        raise RuntimeError('Lab directory/runtime missing or escaped')
    if STATIC_OVERRIDE and not Path(STATIC_OVERRIDE).resolve().is_relative_to(LAB_DIR.resolve()):
        raise RuntimeError('Lab static release must remain under the lab directory')
COOKIE = f'v6lab_{LAB_ID.replace("-", "_")}' if LAB_ID else 'v6edit'
DOC_WRITE_LOCK = threading.RLock()
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
            item = cookie.get(COOKIE)
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
            self.send_header('Set-Cookie', f'{COOKIE}={KEY}; Path={PREFIX}' + ('; Secure' if not LAB_ID or self.headers.get('Origin','').startswith('https:') else '') + '; HttpOnly; SameSite=Strict; Max-Age=86400')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Location', '/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path == '/api/session':
            self.response(200, json.dumps({'canSave': self.authorized()}), 'application/json; charset=utf-8')
            return
        if path == '/api/pdf':
            self.get_pdf()
            return
        if path == '/api/pdf-map':
            try:
                data = json.loads(ORIGINAL_JSON.read_text(encoding='utf-8'))
                pages=[]
                for page in data['pdf_info']:
                    regions=[]
                    for i, block in enumerate(page['para_blocks']):
                        box = block.get('bbox')
                        if (isinstance(box, list) and len(box) == 4 and
                            all(isinstance(v,(int,float)) for v in box)):
                            regions.append({'blockIndex':i,'bbox':box,'type':block.get('type','unknown')})
                    pages.append({'pageSize':page['page_size'],'regions':regions})
                self.response(200,json.dumps({'pages':pages},ensure_ascii=False),
                    'application/json; charset=utf-8')
            except (OSError,ValueError,KeyError,TypeError):
                self.response(503,'Original OCR geometry unavailable')
            return
        if path == '/api/settings':
            try:
                content = cmd_settings_read(SETTINGS)
            except OSError:
                self.response(503, 'Settings unavailable')
                return
            self.send_response(200)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('ETag',cmd_settings_fingerprint(content))
            self.send_header('Content-Length',str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return
        if path == '/api/document':
            self.response(200, (DOC if DOC.is_file() else FIXTURE).read_bytes(), 'text/plain; charset=utf-8')
            return
        if path == '/api/media/inventory':
            # This HTTP composition point uses only the public Media and
            # chapter-read APIs. The two domains do not import one another.
            # CMD contributes *unsaved* mother-document references in the UI.
            try:
                files = media_inventory(DOC)
                refs = set()
                manifest = read_manifest(DOC)
                if manifest is not None:
                    for entry in manifest.get('files', []):
                        markdown = read_chapter(DOC, entry['name']).decode('utf-8')
                        refs.update(chapter_media_references(markdown))
                self.response(200, json.dumps({'files':files,'chapterReferences':sorted(refs)}),
                              'application/json')
            except (ValueError, OSError, KeyError, TypeError, UnicodeDecodeError):
                self.response(503, 'Media inventory unavailable')
            return
        if path == '/api/media/status':
            from urllib.parse import parse_qs
            url = parse_qs(urlsplit(self.path).query).get('url', [''])[0]
            try:
                result = media_status(DOC, url)
            except (ValueError, OSError):
                self.response(400, 'Invalid media status request')
                return
            self.response(200, json.dumps(result), 'application/json')
            return
        if path.startswith('/media/'):
            try:
                data, kind = media_read_local(DOC, path[len('/media/'):])
            except (ValueError, FileNotFoundError, OSError):
                self.response(404, 'Media not found')
                return
            self.response(200, data, kind, cache_control='public, max-age=86400')
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

    def get_pdf(self):
        # Serve a read-only evidence snapshot. A LaunchAgent may not have TCC
        # permission to read the user's iCloud vault directly. Open BEFORE
        # headers so a failure is a proper 503, never a broken 200/206 or 520.
        try:
            file = PDF_PATH.open('rb')
        except OSError:
            self.response(503, 'Original PDF evidence is not readable by V6 service')
            return
        with file as pdf:
            pdf.seek(0, 2)
            size = pdf.tell()
            header = self.headers.get('Range')
            start, end = 0, size - 1
            if header:
                match = re.fullmatch(r'bytes=(\d+)-(\d*)', header)
                if not match:
                    self.response(416, 'Unsupported PDF range')
                    return
                start = int(match[1])
                end = min(size - 1, int(match[2]) if match[2] else size - 1)
                if start >= size or end < start:
                    self.response(416, 'Invalid PDF range')
                    return
            count=end-start+1
            self.send_response(206 if header else 200)
            self.send_header('Content-Type','application/pdf')
            self.send_header('Cache-Control','no-store, max-age=0')
            self.send_header('Accept-Ranges','bytes')
            self.send_header('Content-Length',str(count))
            self.send_header('X-Content-Type-Options','nosniff')
            if header:
                self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            self.end_headers()
            if self.command=='HEAD':return
            try:
                pdf.seek(start)
                remaining=count
                while remaining>0:
                    chunk=pdf.read(min(65536,remaining))
                    if not chunk:break
                    self.wfile.write(chunk)
                    remaining-=len(chunk)
            except (BrokenPipeError,ConnectionResetError):
                pass

    def same_origin(self):
        allowed = {'https://ocr2md.laity.bid', f'http://127.0.0.1:{PORT}'}
        if LAN_TLS_HOST:
            allowed.add(f'https://{LAN_TLS_HOST}:{LAN_TLS_PORT}')
        if LAB_LAN_ORIGIN:
            allowed.add(LAB_LAN_ORIGIN)
        return self.headers.get('Origin', '') in allowed

    def do_POST(self):
        if urlsplit(self.path).path == '/api/media/paste':
            self.post_media_paste()
            return
        if urlsplit(self.path).path == '/api/media/chunk':
            self.post_media_chunk()
            return
        if urlsplit(self.path).path == '/api/initialize-document':
            self.post_initialize()
            return
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
        self.send_header('Set-Cookie', f'{COOKIE}={KEY}; Path={PREFIX}' + ('; Secure' if not LAB_ID or self.headers.get('Origin','').startswith('https:') else '') + '; HttpOnly; SameSite=Lax; Max-Age=2592000')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', '11')
        self.end_headers()
        self.wfile.write(b'{"ok":true}')

    def post_media_paste(self):
        if not self.authorized() or not self.same_origin():
            self.response(403, 'Editor authorization required')
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
            if length < 1 or length > MAX_MEDIA_PASTE:
                self.response(413, 'Image exceeds paste limit (12 MiB)')
                return
            mime = self.headers.get('Content-Type', '').split(';')[0].strip().lower()
            data = self.rfile.read(length)
            if len(data) != length:
                self.response(400, 'Incomplete clipboard image')
                return
            result = media_store_pasted_image(DOC, data, mime)
        except (ValueError, AttributeError, TypeError) as error:
            self.response(422, str(error))
            return
        except OSError:
            self.response(503, 'Media storage unavailable')
            return
        self.response(200, json.dumps(result), 'application/json')

    def post_media_chunk(self):
        if not self.authorized() or not self.same_origin():
            self.response(403, 'Editor authorization required')
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
            if length < 2 or length > 4096:
                self.response(413, 'Invalid media request size')
                return
            body = json.loads(self.rfile.read(length).decode('utf-8'))
            url = body.get('url')
            result = media_download_chunk(DOC, url)
        except (ValueError, AttributeError, TypeError, UnicodeDecodeError) as error:
            self.response(422, str(error))
            return
        except OSError:
            self.response(503, 'Media storage unavailable')
            return
        self.response(200, json.dumps(result), 'application/json')

    def post_initialize(self):
        if not self.authorized() or not self.same_origin():
            self.response(403, 'Editor authorization required')
            return
        try:
            length = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            length = -1
        if length < 2 or length > 512:
            self.response(413, 'Invalid reset request size')
            return
        try:
            request = json.loads(self.rfile.read(length).decode('utf-8'))
            expected = request.get('expectedSha256')
            if (request.get('confirmation') != '初始化' or
                not isinstance(expected, str) or
                re.fullmatch('[a-f0-9]{64}', expected) is None):
                self.response(400, 'Initialization confirmation and source checksum required')
                return
            with DOC_WRITE_LOCK:
                result = initialize_document(DOC, FIXTURE, expected)
        except (ValueError, AttributeError, TypeError, UnicodeDecodeError) as error:
            if 'Document changed' in str(error):
                self.response(409, 'Document changed; reload before initialization')
            else:
                self.response(400, 'Invalid initialization: '+str(error))
            return
        except OSError:
            self.response(500, 'Initialization failed; previous document retained')
            return
        self.response(200, json.dumps(result, ensure_ascii=False), 'application/json')

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
        if urlsplit(self.path).path == '/api/settings':
            if not self.authorized() or not self.same_origin():
                self.response(403, 'Editor authorization required')
                return
            try:
                length = int(self.headers.get('Content-Length', '-1'))
            except ValueError:
                length = -1
            if length < 2 or length > SETTINGS_LIMIT:
                self.response(413, 'Invalid settings document size')
                return
            content = self.rfile.read(length)
            if len(content) != length:
                self.response(400, 'Incomplete settings document')
                return
            try:
                saved, _ = cmd_settings_save(SETTINGS, content, self.headers.get('If-Match'))
            except ValueError as error:
                self.response(400, str(error))
                return
            except OSError:
                self.response(503, 'Settings storage unavailable')
                return
            self.response(200 if saved else 409, 'saved' if saved else 'Settings changed elsewhere; reload')
            return
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
        with DOC_WRITE_LOCK:
            DOC.parent.mkdir(parents=True, exist_ok=True)
            tmp = DOC.with_name('.' + str(os.getpid()) + '-' + secrets.token_hex(4) + '.tmp')
            try:
                with tmp.open('xb') as out:
                    out.write(value)
                    out.flush()
                    os.fsync(out.fileno())
                os.replace(tmp, DOC)
            finally:
                if tmp.exists():
                    tmp.unlink()
        self.response(200, 'saved')

def start_lan_tls():
    if not LAN_TLS_HOST:
        return
    if not LAN_TLS_CERT or not LAN_TLS_KEY:
        raise RuntimeError('LAN TLS enabled but certificate/key not configured')
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(LAN_TLS_CERT, LAN_TLS_KEY)
    class LANHandler(Handler):
        # Only this HTTPS listener routes labs, never the public/tunnel port.
        def do_GET(self):
            if not dispatch_lan_lab(self, LAN_LAB_ROUTES):
                super().do_GET()
        def do_HEAD(self):
            if not dispatch_lan_lab(self, LAN_LAB_ROUTES):
                super().do_HEAD()
        def do_POST(self):
            if not dispatch_lan_lab(self, LAN_LAB_ROUTES):
                super().do_POST()
        def do_PUT(self):
            if not dispatch_lan_lab(self, LAN_LAB_ROUTES):
                super().do_PUT()
    https = ThreadingHTTPServer((LAN_TLS_HOST, LAN_TLS_PORT), LANHandler)
    https.socket = context.wrap_socket(https.socket, server_side=True)
    thread = threading.Thread(target=https.serve_forever, name='v6-lan-https', daemon=True)
    thread.start()
    print(f'V6 LAN HTTPS READY: https://{LAN_TLS_HOST}:{LAN_TLS_PORT}/', flush=True)

class LabHandler(Handler):
    # Use exactly the production endpoints, but within a lab-only namespace.
    # Any request lacking the lab prefix fails before reaching a handler.
    def dispatch_scoped(self, method):
        parsed = urlsplit(self.path)
        if parsed.path == PREFIX[:-1]:
            self.send_response(302)
            self.send_header('Location', PREFIX)
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if not parsed.path.startswith(PREFIX):
            self.response(404, 'Outside lab scope')
            return
        self.path = '/' + parsed.path[len(PREFIX):] + ('?' + parsed.query if parsed.query else '')
        getattr(Handler, method)(self)

    def do_GET(self): self.dispatch_scoped('do_GET')
    def do_HEAD(self): self.dispatch_scoped('do_HEAD')
    def do_POST(self): self.dispatch_scoped('do_POST')
    def do_PUT(self): self.dispatch_scoped('do_PUT')

    def send_header(self, name, value):
        if LAB_ID and name.lower() == 'location' and value.startswith('/') and not value.startswith(PREFIX):
            value = PREFIX + value.lstrip('/')
        super().send_header(name,value)

start_lan_tls()
print(f'V6 {"LAB "+LAB_ID if LAB_ID else "PUBLIC"} READY: http://{HOST}:{PORT}{PREFIX}', flush=True)
ThreadingHTTPServer((HOST, PORT), LabHandler if LAB_ID else Handler).serve_forever()
