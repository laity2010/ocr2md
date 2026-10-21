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
import hashlib
import shutil
import uuid
import subprocess
from datetime import datetime, timezone
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
MAX_CONVERT_BYTES = 4 * 1024 * 1024
# Tests using CMHTML_WORKFILE get isolated chapter exports as well as a separate DOC.
CHAPTERS = RUNTIME / ('chapters' if name == 'document.md' else Path(name).stem + '-chapters')
CHAPTER_NAME = re.compile(r'[0-9]{3}-[\w-]{1,110}\.md')


def allowed_chapter_filename(name):
    return isinstance(name, str) and CHAPTER_NAME.fullmatch(name) is not None


def replace_chapter_directory(files, source_hash):
    # Stage all outputs before changing the visible export generation. Never
    # touch the mother DOC, fixture, or V6 mainline document/release.
    if CHAPTERS.is_symlink():
        raise ValueError('Invalid lab chapter directory')
    stage = Path(tempfile.mkdtemp(prefix='.chapters-stage-', dir=RUNTIME))
    backup = RUNTIME / ('.chapters-previous-' + uuid.uuid4().hex)
    swapped = False
    try:
        manifest = {'sourceSha256': source_hash, 'generatedAt':
                    datetime.now(timezone.utc).isoformat(), 'files': []}
        for name, content in files:
            encoded = content.encode('utf-8')
            with (stage / name).open('xb') as out:
                out.write(encoded)
                out.flush()
                os.fsync(out.fileno())
            manifest['files'].append({'name': name, 'bytes': len(encoded),
                'sha256': hashlib.sha256(encoded).hexdigest()})
        (stage / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
        if CHAPTERS.exists():
            os.replace(CHAPTERS, backup)
            swapped = True
        try:
            os.replace(stage, CHAPTERS)
        except OSError:
            if swapped:
                os.replace(backup, CHAPTERS)
                swapped = False
            raise
        if swapped:
            shutil.rmtree(backup)
        return manifest
    finally:
        if stage.exists():
            shutil.rmtree(stage)


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
        if relative == 'api/chapters':
            manifest = CHAPTERS / 'manifest.json'
            if not manifest.is_file() or CHAPTERS.is_symlink():
                self.reply(404, 'No chapter export yet')
            else:
                self.reply(200, manifest.read_bytes(), 'application/json; charset=utf-8')
            return
        if relative.startswith('api/chapters/'):
            name = relative[len('api/chapters/'):]
            if not allowed_chapter_filename(name) or CHAPTERS.is_symlink():
                self.reply(404, 'Unknown chapter file')
                return
            file = CHAPTERS / name
            if not file.is_file() or file.is_symlink():
                self.reply(404, 'Unknown chapter file')
                return
            self.reply(200, file.read_bytes(), 'text/markdown; charset=utf-8')
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
        if urlsplit(self.path).path == PREFIX+'api/convert-mineru':
            self.convert_mineru()
            return
        if urlsplit(self.path).path == PREFIX+'api/export-chapters':
            self.export_chapters()
            return
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

    def convert_mineru(self):
        # The already-built V6 converter uses Node core crypto/zlib. Keep it
        # on the server, do not duplicate the algorithm in the browser or
        # change its source. Conversion itself is memory-only, no file writes.
        if not self.has_auth() or not self.allowed_origin():
            self.reply(403, 'Lab conversion authorization required')
            return
        try:
            size = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            size = -1
        if size < 2 or size > MAX_CONVERT_BYTES:
            self.reply(413, 'MinerU JSON payload out of bounds')
            return
        raw = self.rfile.read(size)
        if len(raw) != size:
            self.reply(400, 'Incomplete MinerU JSON')
            return
        node = '/opt/homebrew/bin/node'
        if not Path(node).is_file():
            self.reply(503, 'Conversion runtime unavailable')
            return
        script = ("import {toMarkdown} from './packages/minerujson-md/dist/index.js';"
                  "const chunks=[];for await(const c of process.stdin)chunks.push(c);"
                  "process.stdout.write(toMarkdown(Buffer.concat(chunks).toString('utf8')));")
        try:
            result = subprocess.run([node, '--input-type=module', '-e', script],
                input=raw,cwd=ROOT,capture_output=True,timeout=20,check=False)
        except (OSError, subprocess.TimeoutExpired):
            self.reply(503, 'MinerU conversion unavailable')
            return
        if result.returncode != 0:
            self.reply(422, 'Invalid MinerU JSON or unsupported content')
            return
        if len(result.stdout) > MAX_CONVERT_BYTES:
            self.reply(413, 'Converted Markdown too large')
            return
        self.reply(200, result.stdout, 'text/markdown; charset=utf-8')

    def export_chapters(self):
        if not self.has_auth() or not self.allowed_origin():
            self.reply(403, 'Lab export authorization required')
            return
        try:
            size = int(self.headers.get('Content-Length', '-1'))
        except ValueError:
            size = -1
        if size < 1 or size > MAX_BYTES:
            self.reply(413, 'Chapter payload out of bounds')
            return
        try:
            payload = json.loads(self.rfile.read(size).decode('utf-8'))
            source_hash = payload.get('sourceSha256')
            files = payload.get('files')
            if not isinstance(source_hash, str) or not re.fullmatch(r'[a-f0-9]{64}', source_hash):
                raise ValueError('Invalid source checksum')
            if not isinstance(files, list) or not 1 <= len(files) <= 200:
                raise ValueError('Invalid chapter count')
            seen, entries = set(), []
            for entry in files:
                name = entry.get('name') if isinstance(entry, dict) else None
                content = entry.get('content') if isinstance(entry, dict) else None
                if not allowed_chapter_filename(name) or name in seen:
                    raise ValueError('Invalid or duplicate chapter filename')
                if (not isinstance(content, str) or not content.strip() or
                        '<!-- minerujson:source:v1:' in content):
                    raise ValueError('Invalid chapter Markdown content')
                if '<!-- minerujson:block:v1:' not in content:
                    raise ValueError('Chapter is missing its MinerU evidence')
                seen.add(name)
                entries.append((name, content))
        except (ValueError, TypeError, UnicodeDecodeError, AttributeError) as error:
            self.reply(400, 'Invalid chapter export: ' + str(error))
            return
        try:
            manifest = replace_chapter_directory(entries, source_hash)
        except (OSError, ValueError) as error:
            self.reply(500, 'Failed to publish lab chapters: ' + str(error))
            return
        self.reply(200, json.dumps(manifest, ensure_ascii=False),
                   'application/json; charset=utf-8')

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
