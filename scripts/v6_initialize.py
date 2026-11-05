"""Explicit, backed-up initialization of a CMD PBS mother document.

The selected book's ORIGINAL MinerU JSON is the only baseline. Never reset
from a historical checked-in .minerujson.md fixture: those files can omit
image/table native subblocks, per-page evidence and split table HTML.
Conversion uses the existing Workspace public converter (same as new-book
preparation), and all writes remain SHA-checked, backed-up and atomic.
"""
import hashlib
import os
from pathlib import Path
import re
import secrets
from datetime import datetime, timezone


def digest(data):
    return hashlib.sha256(data).hexdigest()


def cmd_ready_baseline(original_json, convert):
    """Pure conversion, no disk changes. Pass the public Workspace converter."""
    source = Path(original_json).read_bytes()
    if not source:
        raise ValueError('Original MinerU JSON is empty')
    baseline = convert(source)
    if not isinstance(baseline, bytes) or not baseline:
        raise ValueError('MinerU converter returned an empty CMD document')
    if b'<!-- minerujson:block:v1:' in baseline or b'<!-- cmd:block:v1 ' not in baseline:
        raise ValueError('MinerU converter did not return CMD PBS anchors')
    # No mistaken book substitution: the embedded immutable OCR source hash
    # must be exactly the selected book's ORIGINAL JSON bytes.
    expected = digest(source).encode('ascii')
    match = re.search(rb'<!-- minerujson:source:v1:([a-f0-9]{64})', baseline)
    if not match or match.group(1) != expected:
        raise ValueError('CMD baseline does not match original MinerU JSON')
    return baseline


def initialize_document(document, original_json, expected_sha, *, convert):
    document, original_json = Path(document), Path(original_json)
    current = document.read_bytes() if document.is_file() else b''
    if digest(current) != expected_sha:
        raise ValueError('Document changed since it was opened')
    original = original_json.read_bytes()
    embedded = re.search(rb'<!-- minerujson:source:v1:([a-f0-9]{64})', current)
    if not embedded or embedded.group(1) != digest(original).encode('ascii'):
        raise ValueError('Active document and selected book MinerU JSON differ; refuse initialization')
    baseline = cmd_ready_baseline(original_json, convert)
    # Fail closed if the original JSON changed while converter was working.
    if digest(original_json.read_bytes()) != digest(original):
        raise ValueError('Original MinerU JSON changed during conversion')
    if current == baseline:
        return {'initialized': True, 'unchanged': True, 'backup': None,
                'sourceSha256': digest(baseline)}
    document.parent.mkdir(parents=True, exist_ok=True)
    backups = document.parent / '.initialize-backups'
    if backups.is_symlink():
        raise ValueError('Backup directory cannot be a symlink')
    backups.mkdir(mode=0o700, exist_ok=True)
    now = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = backups / f'{document.name}.{now}.{secrets.token_hex(4)}.bak'
    with backup.open('xb') as out:
        out.write(current)
        out.flush()
        os.fsync(out.fileno())
    tmp = document.with_name(f'.initialize-{secrets.token_hex(8)}.tmp')
    try:
        with tmp.open('xb') as out:
            out.write(baseline)
            out.flush()
            os.fsync(out.fileno())
        os.replace(tmp, document)
    finally:
        if tmp.exists():
            tmp.unlink()
    return {'initialized': True, 'unchanged': False,
            'backup': backup.name, 'sourceSha256': digest(baseline)}
