"""Lab file selection: same V6 HTTP workbench, per-file document I/O.

GET/PUT /api/document?chapter=<manifest name> access only manifest entries.
The original V6 chapter exporter atomically persists files and recalculates
hashes; no alternate storage format, no source shadow, and no global DOC swap.
"""
import hashlib
import json
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from v6_chapters import read_manifest, read_chapter, export, valid_name

LIMIT = 8 * 1024 * 1024


def _chapter(query):
    params = parse_qs(query, keep_blank_values=True)
    names = params.get('chapter', [])
    if not names:
        return None
    if len(names) != 1 or not valid_name(names[0]):
        raise ValueError('Invalid chapter name')
    return names[0]


def route(handler, method, document, write_lock):
    parsed = urlsplit(handler.path)
    if parsed.path not in ('/api/document', '/api/export-chapters', '/api/initialize-document'):
        return False
    try:
        name = _chapter(parsed.query)
    except ValueError:
        handler.response(400, 'Invalid chapter name')
        return True
    if not name:
        return False
    if parsed.path != '/api/document':
        # Re-export / initialize of a derived chapter must not overwrite the
        # mother document or its managed chapter/ directory.
        handler.response(409, 'Already bounded chapter; export/initialize from the mother document')
        return True
    if method not in ('do_GET', 'do_HEAD', 'do_PUT'):
        handler.response(405, 'Unsupported chapter document operation')
        return True
    if method in ('do_GET', 'do_HEAD'):
        try:
            content = read_chapter(document, name)
        except (OSError, KeyError, ValueError, TypeError):
            handler.response(404, 'Chapter not found in manifest')
            return True
        handler.response(200, content, 'text/plain; charset=utf-8')
        return True
    if not handler.authorized() or not handler.same_origin():
        handler.response(403, 'Editor authorization required')
        return True
    try:
        length = int(handler.headers.get('Content-Length', '-1'))
    except ValueError:
        length = -1
    if length < 0 or length > LIMIT:
        handler.response(413, 'Invalid chapter size')
        return True
    body = handler.rfile.read(length)
    if len(body) != length:
        handler.response(400, 'Incomplete chapter')
        return True
    try:
        content = body.decode('utf-8')
    except UnicodeDecodeError:
        handler.response(400, 'Invalid UTF-8')
        return True
    with write_lock:
        try:
            manifest = read_manifest(document)
            if not manifest or name not in {f['name'] for f in manifest['files']}:
                raise FileNotFoundError(name)
            # Preserve all sibling chapters when atomically updating just one.
            files = []
            for entry in manifest['files']:
                item = entry['name']
                files.append({'name': item, 'content': content if item == name else
                              read_chapter(document, item).decode('utf-8')})
            export(document, {'sourceSha256':manifest['sourceSha256'], 'files':files})
        except FileNotFoundError:
            handler.response(404, 'Chapter not found in manifest')
            return True
        except (ValueError, KeyError, TypeError, UnicodeDecodeError) as error:
            handler.response(409, 'Chapter save rejected: ' + str(error))
            return True
        except OSError:
            handler.response(503, 'Chapter storage unavailable')
            return True
    handler.response(200, 'saved')
    return True
