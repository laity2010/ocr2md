"""WP04D: initialize the sentence table from a verified public V2 snapshot.

The caller supplies an already authorized isolated DB connection. The Node
adapter runs the existing engines; no new engines, HTTP routes or DB opener.
"""
import hashlib
import json
import subprocess
from pathlib import Path
from sentence_store import SentenceStore, build_sentence_rows


def initialize_sentence_table(connection, snapshot):
    """Run three engines and atomically create the sentence table once.

    Reject an existing table instead of silently erasing manual decisions.
    The connection's upstream source identity/authorization remains the
    caller's responsibility until the shared V2 integration gate is resolved.
    """
    if connection.in_transaction:
        raise ValueError('dedicated idle connection required')
    engine = Path(__file__).with_name('sentence_init_engine.mjs')
    # Explicit public snapshot only; never infer an upstream database path.
    response = subprocess.run(
        ['node', str(engine)], input=json.dumps(snapshot, ensure_ascii=False),
        text=True, encoding='utf-8', capture_output=True, check=True, timeout=120,
    )
    result = json.loads(response.stdout)
    markdown = snapshot['markdown']
    digest = hashlib.sha256(markdown.encode('utf-8')).hexdigest()
    if result['source_document_hash'] != digest:
        raise ValueError('candidate document hash mismatch')
    rows = build_sentence_rows(markdown, result['plans'])
    store = SentenceStore(connection)
    store.initialize(markdown, rows)
    return rows
