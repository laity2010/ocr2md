"""V6 generated chapter storage. This module only manages its own manifest-marked
chapter directory beside the active CM6 Markdown mother document.
No existing unrelated folders are overwritten.
"""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import uuid

CHAPTER_NAME = re.compile(r'[0-9]{1,6}-[\w-]{1,110}\.md')
MAX_EXPORT_BYTES = 8 * 1024 * 1024


def chapter_dir(document):
    return Path(document).parent / 'chapters'


def valid_name(name):
    return isinstance(name, str) and CHAPTER_NAME.fullmatch(name) is not None


def read_manifest(document):
    folder = chapter_dir(document)
    if folder.is_symlink():
        raise ValueError('Chapter folder is a symlink')
    path = folder / 'manifest.json'
    if not path.is_file() or path.is_symlink():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def read_chapter(document, name):
    if not valid_name(name):
        raise ValueError('Invalid chapter name')
    manifest = read_manifest(document)
    if not manifest or name not in {f['name'] for f in manifest['files']}:
        raise FileNotFoundError(name)
    path = chapter_dir(document) / name
    if path.is_symlink():
        raise ValueError('Chapter file is a symlink')
    return path.read_bytes()


def export(document, body):
    source_hash = body.get('sourceSha256') if isinstance(body, dict) else None
    files = body.get('files') if isinstance(body, dict) else None
    if not isinstance(source_hash, str) or not re.fullmatch('[a-f0-9]{64}', source_hash):
        raise ValueError('Bad source checksum')
    if not isinstance(files, list) or not 1 <= len(files) <= 200:
        raise ValueError('Bad chapter count')
    document = Path(document)
    if not document.is_file():
        raise ValueError('Save the source Markdown before exporting chapters')
    if hashlib.sha256(document.read_bytes()).hexdigest() != source_hash:
        raise ValueError('Source Markdown changed; save current document first')
    entries, names, size = [], set(), 0
    for item in files:
        name = item.get('name') if isinstance(item, dict) else None
        content = item.get('content') if isinstance(item, dict) else None
        if not valid_name(name) or name in names:
            raise ValueError('Bad or repeated chapter filename')
        if (not isinstance(content, str) or not content.strip() or
            '<!-- minerujson:source:v1:' in content or
            '<!-- minerujson:block:v1:' not in content):
            raise ValueError('Bad chapter Markdown content')
        data = content.encode('utf-8')
        size += len(data)
        if size > MAX_EXPORT_BYTES:
            raise ValueError('Chapter export too large')
        names.add(name)
        entries.append((name, data))
    destination = chapter_dir(document)
    if destination.is_symlink() or destination.exists() and read_manifest(document) is None:
        raise ValueError('Refusing to overwrite an unmanaged chapter directory')
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.chapters-stage-', dir=destination.parent))
    backup = destination.parent / ('.chapters-previous-' + uuid.uuid4().hex)
    old_moved = False
    try:
        manifest = {'sourceSha256':source_hash,'generatedAt':datetime.now(timezone.utc).isoformat(), 'files':[]}
        for name, data in entries:
            with (stage / name).open('xb') as out:
                out.write(data)
                out.flush()
                os.fsync(out.fileno())
            manifest['files'].append({'name':name,'bytes':len(data),
                'sha256':hashlib.sha256(data).hexdigest()})
        (stage / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False), encoding='utf-8')
        if destination.exists():
            os.replace(destination, backup)
            old_moved = True
        try:
            os.replace(stage,destination)
        except OSError:
            if old_moved:
                os.replace(backup, destination)
                old_moved = False
            raise
        if old_moved:
            shutil.rmtree(backup)
        return manifest
    finally:
        if stage.exists():
            shutil.rmtree(stage)
