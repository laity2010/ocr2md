"""Versioned, isolated handoff from Sentence Lab to read-only Translation Lab.

Source CMD and sentence-review sidecar are never edited; only Lab exports are
atomically replaced after a source-SHA and sentence-review CAS check.
"""
import hashlib
import json
import os
import secrets
from pathlib import Path

SCHEMA = 'ocr2md-reviewed-source/v1'
MAX_BYTES = 8 * 1024 * 1024


def validate(payload, source, revision):
    if not isinstance(payload, dict) or payload.get('schema') != SCHEMA:
        raise ValueError('Invalid reviewed source package schema')
    sha = hashlib.sha256(source).hexdigest()
    baseline = payload.get('baseline')
    clean = payload.get('clean')
    reading = payload.get('reading')
    if (payload.get('sourceSha256') != sha or
            payload.get('reviewRevision') != revision or
            not isinstance(baseline, dict) or
            baseline.get('schema') != 'ocr2md-translation-units/v1' or
            baseline.get('sourceSha256') != sha or
            not isinstance(clean, dict) or not isinstance(reading, dict) or
            clean.get('source') != source.decode('utf-8') or
            not isinstance(clean.get('doc'), str) or
            not isinstance(clean.get('patches'), list) or
            not isinstance(reading.get('doc'), str)):
        raise ValueError('Reviewed source / review revision mismatched')
    rows = baseline.get('rows')
    anchors = reading.get('anchors')
    if (not isinstance(rows, list) or not 1 <= len(rows) <= 100000 or
            not isinstance(anchors, list) or len(anchors) != len(rows) or
            any(not isinstance(r, dict) or not isinstance(r.get('id'), str)
                or not isinstance(a, dict) or a.get('id') != r['id']
                for r, a in zip(rows, anchors)) or
            len({r['id'] for r in rows}) != len(rows)):
        raise ValueError('Reviewed source anchors/units mismatch')
    if (len(clean['doc'].encode('utf-8')) > MAX_BYTES or
            len(reading['doc'].encode('utf-8')) > MAX_BYTES):
        raise ValueError('Reviewed Markdown too large')
    return payload


def read(export_dir: Path, source: bytes):
    path = export_dir / 'reviewed-source.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_BYTES:
        raise ValueError('Reviewed source not yet published')
    payload = json.loads(path.read_text(encoding='utf-8'))
    return validate(payload, source, payload.get('reviewRevision'))


def _atomic_write(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f'.{path.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp')
    try:
        with tmp.open('xb') as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    finally:
        if tmp.exists():
            tmp.unlink()


def save(export_dir: Path, raw: bytes, source: bytes, revision: str):
    if len(raw) > MAX_BYTES:
        raise ValueError('Reviewed source package too large')
    package = validate(json.loads(raw.decode('utf-8')), source, revision)
    serial = json.dumps(package, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if len(serial) > MAX_BYTES:
        raise ValueError('Reviewed source package too large')
    # Keep the rendered Markdown, human-readable MD, and metadata in the same
    # isolated export directory. Older revisions are never rewritten.
    suffix = package['sourceSha256'][:12] + '-' + revision[:12]
    archive = export_dir / ('reviewed-source-' + suffix + '.json')
    if archive.exists():
        if archive.read_bytes() != serial:
            raise ValueError('Attempt to overwrite an existing reviewed version')
    else:
        _atomic_write(archive, serial)
    _atomic_write(export_dir / ('reviewed-document-' + suffix + '.md'),
                  package['clean']['doc'].encode('utf-8'))
    _atomic_write(export_dir / 'reviewed-source.json', serial)
    return package
