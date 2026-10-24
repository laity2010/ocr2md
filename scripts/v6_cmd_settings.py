"""CMD settings JSON transport: opaque UTF-8 document, atomic compare-and-save.

Semantic key definitions belong to the registered settings module, not this I/O.
"""
import hashlib
import json
import os
from pathlib import Path
import secrets
import threading

DEFAULT = (
    '{\n  "settings": {\n'
    '    "globalUi.cmSource.defaultFontSize": {\n'
    '      "key": "defaultFontSize",\n'
    '      "category1": "全局 UI",\n'
    '      "category2": "CM 源码窗",\n'
    '      "comment": "所有 CM6 源码窗的默认字号（8–32 pt）",\n'
    '      "value": 12,\n'
    '      "range": {"min": 8, "max": 32, "step": 1}\n'
    '    }\n  }\n}\n'
)
LIMIT = 64 * 1024
LOCK = threading.Lock()


def read(path):
    file = Path(path)
    return file.read_bytes() if file.is_file() else DEFAULT.encode('utf-8')


def fingerprint(data):
    return hashlib.sha256(data).hexdigest()


def save(path, content, expected):
    if len(content) > LIMIT:
        raise ValueError('Settings JSON exceeds 64 KiB')
    try:
        data = json.loads(content.decode('utf-8'))
    except (UnicodeError, ValueError) as error:
        raise ValueError('Settings must be valid UTF-8 JSON') from error
    if not isinstance(data, dict):
        raise ValueError('Settings root must be a JSON object')
    if not isinstance(expected, str) or len(expected) != 64:
        raise ValueError('Expected source fingerprint required')
    path = Path(path)
    with LOCK:
        current = read(path)
        if fingerprint(current) != expected:
            return False, fingerprint(current)
        path.parent.mkdir(parents=True, exist_ok=True)
        staged = path.with_name('.settings-'+secrets.token_hex(8)+'.tmp')
        try:
            with staged.open('xb') as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(staged, path)
        finally:
            staged.unlink(missing_ok=True)
        return True, fingerprint(content)
