"""V6 explicit engineering reset of the active Markdown mother document.

The immutable original is the checked-in MinerU-to-Markdown fixture. Reset is
conditional on the browser's last saved revision, creates a durable backup and
atomically publishes the original. It never changes exported chapter files.
"""
import hashlib
import os
from pathlib import Path
import secrets
from datetime import datetime, timezone


def digest(data):
    return hashlib.sha256(data).hexdigest()


def initialize_document(document, original, expected_sha):
    document, original = Path(document), Path(original)
    baseline = original.read_bytes()
    current = document.read_bytes() if document.is_file() else baseline
    if digest(current) != expected_sha:
        raise ValueError('Document changed since it was opened')
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
    # Exclusive, synced backup precedes any overwrite of working data.
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
