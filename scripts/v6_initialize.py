"""V6 explicit engineering reset of the active CMD-ready Markdown mother document.

The immutable fixture is never touched. The sole CMD planner converts its
legacy OCR block labels to current PBS labels before an optimistic, backed-up,
atomic publication. Exported chapters and original JSON/PDF never change.
"""
import hashlib
import os
from pathlib import Path
import secrets
import shutil
import subprocess
from datetime import datetime, timezone


def digest(data):
    return hashlib.sha256(data).hexdigest()


def cmd_ready_baseline(original):
    """Convert a read-only fixture through the ONE CMD JS parser/planner.

    No Python-owned regex copy of the PBS format. A converter failure cannot
    touch the current document, its backup directory, or the original file.
    """
    node = os.environ.get('V6_NODE_BIN') or shutil.which('node')
    if not node:
        raise RuntimeError('CMD initializer Node runtime unavailable; document untouched')
    command = [node, str(Path(__file__).with_name('v6_initialize_cmd.mjs')),
               str(original)]
    try:
        completed = subprocess.run(command, check=True, capture_output=True,
                                   timeout=30)
    except (OSError, subprocess.SubprocessError) as error:
        raise RuntimeError('CMD initializer conversion failed; document untouched') from error
    if not completed.stdout:
        raise RuntimeError('CMD initializer returned an empty document')
    return completed.stdout


def initialize_document(document, original, expected_sha):
    document, original = Path(document), Path(original)
    raw = original.read_bytes()
    current = document.read_bytes() if document.is_file() else raw
    if digest(current) != expected_sha:
        raise ValueError('Document changed since it was opened')
    baseline = cmd_ready_baseline(original)
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
