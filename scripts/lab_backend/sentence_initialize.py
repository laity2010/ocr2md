"""WP04D: initialize the sentence table from a verified public V2 snapshot.

The caller supplies an already authorized isolated DB connection. The Node
adapter runs the existing engines; no new engines, HTTP routes or DB opener.
"""
import hashlib
import json
import subprocess
import os
import shutil
from pathlib import Path
from .sentence_store import SentenceStore, build_sentence_rows


def prepare_sentence_rows(snapshot):
    """Compute plans outside the SQLite write lock, using the same WP04D engines."""
    engine = Path(__file__).resolve().parent.parent / 'sentence_init_engine.mjs'
    # launchd has a minimal PATH. Allow an explicit runtime setting; otherwise
    # search normal Unix package-manager locations as well as the process PATH.
    node = os.environ.get('OCR2MD_NODE') or shutil.which(
        'node', path=os.environ.get('PATH', os.defpath) + ':/opt/homebrew/bin:/usr/local/bin')
    if not node:
        raise OSError('Node runtime unavailable')
    response = subprocess.run(
        [node, str(engine)], input=json.dumps(snapshot, ensure_ascii=False),
        text=True, encoding='utf-8', capture_output=True, check=True, timeout=120,
    )
    result = json.loads(response.stdout)
    markdown = snapshot['markdown']
    digest = hashlib.sha256(markdown.encode('utf-8')).hexdigest()
    if result['source_document_hash'] != digest:
        raise ValueError('candidate document hash mismatch')
    return build_sentence_rows(markdown, result['plans'])


def initialize_sentence_table(connection, snapshot):
    """WP04D public API: create once on a dedicated authorized connection."""
    if connection.in_transaction:
        raise ValueError('dedicated idle connection required')
    rows = prepare_sentence_rows(snapshot)
    SentenceStore(connection).initialize(snapshot['markdown'], rows)
    return rows
