"""Read-only dataset gateway for an independent translation-review Lab.

No relation to sentence-engine results or sentence-review/Gold persistence.
It reads only a dedicated Lab input directory, never the sentence Lab exports
or the Main document. The caller owns HTTP routing and permissions.
"""
import hashlib
import json
import re
from pathlib import Path

MAX_FILE_BYTES = 5 * 1024 * 1024
MAX_AI = 8
AI_NAME = re.compile(r"[a-z][a-z0-9-]{0,15}\Z")
SCHEMA = 'ocr2md-translation-units/v1'


def _json(path):
    if not path.is_file() or path.stat().st_size > MAX_FILE_BYTES:
        raise ValueError('Missing or oversized translation input')
    return json.loads(path.read_text(encoding='utf-8'))


def load_dataset(directory: Path):
    """Read independent input and confirm all AI files match the baseline."""
    directory = Path(directory)
    source_file = directory / 'document.md'
    if not source_file.is_file() or source_file.stat().st_size > MAX_FILE_BYTES:
        raise ValueError('Missing or oversized independent CMD source')
    source = source_file.read_text(encoding='utf-8')
    base = _json(directory / 'translation-units.json')
    sha = hashlib.sha256(source.encode('utf-8')).hexdigest()
    if base.get('schema') != SCHEMA or base.get('sourceSha256') != sha:
        raise ValueError('Baseline source checksum mismatch')
    rows = base.get('rows')
    if not isinstance(rows, list) or not rows or len(rows) > 100000:
        raise ValueError('Missing baseline rows')
    if not all(isinstance(row, dict) and isinstance(row.get('id'), str)
               for row in rows):
        raise ValueError('Invalid baseline IDs')
    ids = [row['id'] for row in rows]
    if len(set(ids)) != len(ids):
        raise ValueError('Invalid or repeated baseline IDs')

    entries = sorted(directory.glob('translated-*.json'))
    if len(entries) > MAX_AI:
        raise ValueError('Too many AI translation inputs')
    translations = {}
    for path in entries:
        ai = path.stem.removeprefix('translated-')
        if not AI_NAME.fullmatch(ai):
            raise ValueError('Invalid AI ID')
        reply = _json(path)
        if reply.get('schema') != SCHEMA or reply.get('sourceSha256') != sha:
            raise ValueError('AI source checksum mismatch: ' + ai)
        if set(reply) != set(base) or any(reply[k] != base[k] for k in base if k != 'rows'):
            raise ValueError('AI header differs: ' + ai)
        translated_rows = reply.get('rows')
        if not isinstance(translated_rows, list) or len(translated_rows) != len(rows):
            raise ValueError('AI row count differs: ' + ai)
        for original, actual in zip(rows, translated_rows):
            if (not isinstance(actual, dict) or set(actual) != set(original) or
                    any(actual[k] != original[k] for k in original if k not in ('corrected', 'translation')) or
                    not all(isinstance(actual.get(k), str) and actual[k].strip()
                            for k in ('corrected','translation'))):
                raise ValueError('AI record differs or is incomplete: ' + ai)
        translations[ai] = reply
    return {'schema': 'ocr2md-translation-review-dataset/v1',
            'source': source, 'baseline': base, 'translations': translations}
