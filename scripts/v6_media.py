"""Media download domain: durable bounded Range chunks, never edits Markdown.

Only the currently verified MinerU CDN is allowed on the public service. An
explicit loopback fixture URL is permitted for isolated tests only. All files
live beside the active mother document; partials survive HTTP/browser restarts.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import threading
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

CHUNK = 512 * 1024
MAX_MEDIA = 40 * 1024 * 1024
DOWNLOAD_HOST = 'cdn-mineru.openxlab.org.cn'
EXT = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
       '.gif': 'image/gif', '.webp': 'image/webp'}
MIME_EXT = {v: k for k, v in EXT.items() if k != '.jpeg'}
LOCK = threading.Lock()
KEY_LOCKS = {}

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise ValueError('Remote redirect is not permitted')

OPENER = build_opener(NoRedirect())


def validate_url(url):
    if not isinstance(url, str) or len(url) > 2048 or '\\' in url:
        raise ValueError('Invalid media URL')
    parsed = urlsplit(url)
    test_origin = os.environ.get('V6_MEDIA_TEST_ORIGIN', '')
    origin = f'{parsed.scheme}://{parsed.netloc}'
    approved = (parsed.scheme == 'https' and parsed.hostname == DOWNLOAD_HOST
                and parsed.port in (None, 443) and not parsed.username and not parsed.password)
    testing = (test_origin.startswith('http://127.0.0.1:') and origin == test_origin
               and parsed.hostname == '127.0.0.1')
    if not (approved or testing) or not parsed.path or parsed.fragment:
        raise ValueError('Media host not approved; only MinerU CDN supported')
    return parsed


def media_home(doc):
    root = Path(doc).parent / 'media'
    if root.is_symlink():
        raise ValueError('Media folder must not be a symlink')
    root.mkdir(parents=True, exist_ok=True)
    return root


def paths(doc, url):
    parsed = validate_url(url)
    digest = hashlib.sha256(url.encode('utf-8')).hexdigest()[:24]
    ext = Path(parsed.path).suffix.lower()
    if ext not in EXT:
        raise ValueError('Unsupported media extension (jpg/png/gif/webp only)')
    root = media_home(doc)
    return digest, ext, root / (digest + ext), root / ('.' + digest + '.part'), root / ('.' + digest + '.json')


def _plain_file(path):
    if path.is_symlink():
        raise ValueError('Media path is a symlink')
    return path.exists()


def _read_meta(path):
    if not _plain_file(path):
        return None
    return json.loads(path.read_text('utf-8'))


def _save_meta(path, metadata):
    staged = path.with_name('.' + secrets.token_hex(9) + '.tmp')
    try:
        with staged.open('xb') as out:
            out.write(json.dumps(metadata).encode('utf-8'))
            out.flush()
            os.fsync(out.fileno())
        os.replace(staged, path)
    finally:
        staged.unlink(missing_ok=True)


def status(doc, url):
    digest, ext, final, part, info = paths(doc, url)
    if _plain_file(final):
        return {'state': 'complete', 'bytes': final.stat().st_size,
                'total': final.stat().st_size, 'path': 'media/' + final.name}
    meta = _read_meta(info)
    size = part.stat().st_size if _plain_file(part) else 0
    if meta and meta.get('urlHash') == hashlib.sha256(url.encode()).hexdigest() and size:
        return {'state': 'partial', 'bytes': size, 'total': meta.get('total')}
    return {'state': 'pending', 'bytes': 0, 'total': None}


def _check_magic(data, extension):
    headers = {'.jpg': data[:3] == b'\xff\xd8\xff',
               '.jpeg': data[:3] == b'\xff\xd8\xff',
               '.png': data[:8] == b'\x89PNG\r\n\x1a\n',
               '.gif': data[:6] in (b'GIF87a', b'GIF89a'),
               '.webp': data[:4] == b'RIFF' and data[8:12] == b'WEBP'}
    if not headers[extension]:
        raise ValueError('Downloaded file does not match its image extension')


def download_chunk(doc, url):
    digest, ext, final, part, info = paths(doc, url)
    with LOCK:
        mutex = KEY_LOCKS.setdefault(digest, threading.Lock())
    with mutex:
        previous = status(doc, url)
        if previous['state'] == 'complete':
            return previous
        metadata = _read_meta(info)
        current = part.stat().st_size if _plain_file(part) else 0
        expected_hash = hashlib.sha256(url.encode()).hexdigest()
        if current and (not metadata or metadata.get('urlHash') != expected_hash):
            raise ValueError('Interrupted media metadata mismatch')
        if metadata and current and current == metadata.get('total'):
            # A previous request may have finished writing the final chunk
            # just before an interrupted publish/rename.
            with part.open('rb') as f:
                _check_magic(f.read(16), ext)
            os.replace(part, final)
            info.unlink(missing_ok=True)
            return status(doc, url)
        if current >= MAX_MEDIA:
            raise ValueError('Media exceeds maximum size')
        headers = {'Range': f'bytes={current}-{min(current + CHUNK - 1, MAX_MEDIA - 1)}',
                   'Accept': 'image/*', 'User-Agent': 'OCR2MD-V6-Media/1.0'}
        if current and metadata.get('validator'):
            headers['If-Range'] = metadata['validator']
        request = Request(url, headers=headers, method='GET')
        try:
            with OPENER.open(request, timeout=25) as response:
                code = response.status
                mime = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
                if mime and mime != EXT[ext]:
                    raise ValueError('Unexpected remote image content type')
                if code == 206:
                    match = re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',
                                         response.headers.get('Content-Range', ''))
                    if not match or int(match[1]) != current:
                        raise ValueError('Remote resume range mismatch')
                    last, total = int(match[2]), int(match[3])
                    count = last-current+1
                    if total > MAX_MEDIA or count > CHUNK or count <= 0 or last >= total:
                        raise ValueError('Invalid remote media range or size')
                    if metadata and current and metadata.get('total') != total:
                        raise ValueError('Remote media changed; cannot safely resume')
                    data = response.read(count+1)
                    if len(data) != count:
                        raise ValueError('Truncated remote media chunk')
                    complete = last + 1 == total
                elif code == 200:
                    # Some small-media servers ignore Range; a safe complete
                    # response can still be stored atomically. Resume becomes
                    # restart if the If-Range validator changed.
                    data = response.read(CHUNK+1)
                    if len(data) > CHUNK:
                        raise ValueError('Remote server ignores Range for large file')
                    current = 0
                    total = len(data)
                    complete = True
                else:
                    raise ValueError('Remote media HTTP ' + str(code))
                if not data or total == 0:
                    raise ValueError('Empty remote image')
                validator = response.headers.get('ETag') or response.headers.get('Last-Modified')
        except HTTPError as error:
            raise ValueError('Remote media HTTP ' + str(error.code)) from error
        except (URLError, TimeoutError) as error:
            raise ValueError('Remote media connection failed') from error
        if current == 0:
            # Restart only the uncommitted temp file; existing completed files
            # are immutable, and the mother document remains untouched.
            if _plain_file(part):
                part.unlink()
        with part.open('ab' if current else 'xb') as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        _save_meta(info, {'urlHash': expected_hash, 'validator': validator,
                          'total': total})
        if complete:
            with part.open('rb') as f:
                _check_magic(f.read(16), ext)
            os.replace(part, final)
            info.unlink(missing_ok=True)
        return status(doc, url)


def read_local(doc, filename):
    if not isinstance(filename, str) or not re.fullmatch(r'[0-9a-f]{24}\.(?:jpg|jpeg|png|gif|webp)', filename):
        raise ValueError('Invalid media path')
    root = Path(doc).parent / 'media'
    if root.is_symlink():
        raise ValueError('Media folder is a symlink')
    file = root / filename
    if not file.is_file() or file.is_symlink():
        raise FileNotFoundError(filename)
    return file.read_bytes(), EXT[Path(filename).suffix]
