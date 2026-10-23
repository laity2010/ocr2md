"""Independent V6 LaTeX human-review sidecar; the original Markdown is read-only.

Small per-row writes are atomic, bounded and keyed by content/occurrence rather
than shifting source offsets. All callers serialize updates under DOC_WRITE_LOCK.
"""
import json
import os
import re
import tempfile
from pathlib import Path

_VALUES = {'待复核', 'latex', '忽略'}
_KEY = re.compile(r'[a-f0-9]{16}:[0-9]{1,5}')
_MAX_ROWS = 3000
_MAX_BYTES = 160_000


def review_path(document):
    return Path(str(document) + '.latex-review.json')


def read_reviews(document):
    path = review_path(document)
    if not path.is_file():
        return {}
    if path.stat().st_size > _MAX_BYTES:
        raise ValueError('Review file too large')
    payload = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(payload, dict) or payload.get('version') != 1:
        raise ValueError('Invalid LaTeX review format')
    rows = payload.get('reviews')
    if not isinstance(rows, dict) or len(rows) > _MAX_ROWS:
        raise ValueError('Invalid LaTeX review rows')
    if any(not isinstance(k, str) or _KEY.fullmatch(k) is None or
           v not in _VALUES - {'待复核'} for k, v in rows.items()):
        raise ValueError('Invalid LaTeX review annotation')
    return rows


def write_review(document, key, value):
    if not isinstance(key, str) or _KEY.fullmatch(key) is None:
        raise ValueError('Invalid review key')
    if not isinstance(value, str) or value not in _VALUES:
        raise ValueError('Invalid review value')
    path = review_path(document)
    old = read_reviews(document)
    updated = old.copy()
    if value == '待复核':
        updated.pop(key, None)
    else:
        updated[key] = value
    if len(updated) > _MAX_ROWS:
        raise ValueError('Too many reviews')
    data = json.dumps({'version': 1, 'reviews': updated}, ensure_ascii=False,
                      separators=(',', ':'), sort_keys=True).encode('utf-8')
    if len(data) > _MAX_BYTES:
        raise ValueError('Review file too large')
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix='.latex-review-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return value
