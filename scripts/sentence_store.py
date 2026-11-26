"""WP04C: isolated sentence-table persistence. No filesystem or upstream write API.

Callers supply a dedicated SQLite connection to an authorized isolated database,
and Markdown from the upstream public snapshot. No live V2 route is mounted.
"""
import hashlib
import json
import sqlite3
from collections import defaultdict

ENGINES = ('intl', 'sentence-splitter', 'wink-nlp')
COLUMNS = (
    'source_document_hash', 'source_line', 'source_line_hash', 'sentence_index',
    'from_utf16', 'to_utf16', 'sentence_text', 'line_eol', 'candidates_json',
    'review_state', 'adopted_engine',
)
DDL = """CREATE TABLE sentence(
    source_document_hash TEXT NOT NULL,
    source_line INTEGER NOT NULL CHECK(source_line >= 1),
    source_line_hash TEXT NOT NULL,
    sentence_index INTEGER NOT NULL CHECK(sentence_index >= 0),
    from_utf16 INTEGER NOT NULL CHECK(from_utf16 >= 0),
    to_utf16 INTEGER NOT NULL CHECK(to_utf16 >= from_utf16),
    sentence_text TEXT NOT NULL,
    line_eol TEXT NOT NULL CHECK(line_eol IN ('', char(10))),
    candidates_json TEXT,
    review_state TEXT,
    adopted_engine TEXT,
    PRIMARY KEY(source_line, sentence_index),
    CHECK((sentence_index = 0 AND candidates_json IS NOT NULL AND review_state IS NOT NULL)
       OR (sentence_index > 0 AND candidates_json IS NULL AND review_state IS NULL AND adopted_engine IS NULL))
) WITHOUT ROWID"""
INSERT = 'INSERT INTO main.sentence (' + ','.join(COLUMNS) + ') VALUES (' + ','.join('?' for _ in COLUMNS) + ')'
SELECT = 'SELECT ' + ','.join(COLUMNS) + ' FROM main.sentence ORDER BY source_line,sentence_index'


def _require(condition, message):
    if not condition:
        raise ValueError(message)


def _sha(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def _offsets(text):
    result = {0: 0}
    offset = 0
    for i, char in enumerate(text, 1):
        offset += 2 if ord(char) > 0xffff else 1
        result[offset] = i
    return result, offset


def _cuts(text, boundaries):
    _require(isinstance(boundaries, (list, tuple)), 'boundaries must be an array')
    offsets, end = _offsets(text)
    previous = 0
    for pos in boundaries:
        _require(type(pos) is int and previous < pos < end and pos in offsets,
                 'invalid, repeated, terminal or surrogate-cut boundary')
        previous = pos
    return offsets, end


def split_mdline(text, boundaries):
    """Split at internal UTF-16 offsets; return exact contiguous text pieces."""
    _require(isinstance(text, str) and '\n' not in text, 'expected a single MDLine without LF')
    offsets, end = _cuts(text, boundaries)
    points = [0, *boundaries, end]
    return [text[offsets[a]:offsets[b]] for a, b in zip(points, points[1:])]


def _metadata(text, boundaries, candidates, state, adopted):
    _require(isinstance(candidates, dict) and set(candidates) == set(ENGINES),
             'exactly three engine candidates required')
    signatures = []
    for name in ENGINES:
        c = candidates[name]
        _require(isinstance(c, dict) and set(c) == {'version', 'status', 'boundaries', 'protected_ranges'},
                 'invalid candidate metadata')
        _require(isinstance(c['version'], str) and bool(c['version'].strip()), 'missing engine version')
        _require(c['status'] in ('ok', 'error'), 'invalid engine status')
        _require(isinstance(c['boundaries'], list), 'invalid candidate cuts')
        offsets, _ = _cuts(text, c['boundaries'])
        _require(isinstance(c['protected_ranges'], list), 'invalid protected ranges')
        last = 0
        for item in c['protected_ranges']:
            _require(isinstance(item, list) and len(item) == 2
                     and all(type(pos) is int and pos in offsets for pos in item)
                     and last <= item[0] < item[1], 'invalid protected range')
            _require(not any(item[0] < pos < item[1] for pos in c['boundaries']),
                     'boundary cuts protected content')
            last = item[1]
        _require(c['status'] == 'ok' or not c['boundaries'], 'failed candidate has cuts')
        signatures.append(tuple(c['boundaries']) if c['status'] == 'ok' else None)
    cuts = tuple(boundaries)
    all_ok = None not in signatures
    consensus = all_ok and len(set(signatures)) == 1
    if state == 'agreed':
        valid = consensus and bool(cuts) and cuts == signatures[0] and adopted is None
    elif state == 'no_split':
        valid = consensus and not cuts and not signatures[0] and adopted is None
    elif state == 'disputed':
        valid = all_ok and not consensus and not cuts and adopted is None
    elif state == 'engine_error':
        valid = not all_ok and not cuts and adopted is None
    elif state == 'adopted':
        valid = (all_ok and not consensus and adopted in ENGINES
                 and cuts == signatures[ENGINES.index(adopted)])
    else:
        valid = False
    _require(valid, 'review state, candidate and selected cuts disagree')
    return json.dumps(candidates, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def _mdlines(markdown):
    _require(isinstance(markdown, str), 'expected Markdown string')
    parts = markdown.split('\n')
    for i, text in enumerate(parts):
        if i == len(parts) - 1 and not text:
            break
        yield text, '\n' if i < len(parts) - 1 else ''


def build_sentence_rows(markdown, plans):
    """Build exact sentence rows from explicit plans, not automatic arbitration.

    One plan per real MDLine: boundaries, candidates, review_state, adopted_engine.
    A cut is internal; LF belongs to the final record. Empty lines have one row.
    """
    lines = list(_mdlines(markdown))
    _require(isinstance(plans, (list, tuple)) and len(plans) == len(lines), 'plan count must match real MDLines')
    digest = _sha(markdown)
    result = []
    for number, ((text, eol), plan) in enumerate(zip(lines, plans), 1):
        _require(isinstance(plan, dict) and set(plan) == {'boundaries', 'candidates', 'review_state', 'adopted_engine'},
                 'invalid line plan')
        cuts = plan['boundaries']
        pieces = split_mdline(text, cuts)
        metadata = _metadata(text, cuts, plan['candidates'], plan['review_state'], plan['adopted_engine'])
        _, end = _offsets(text)
        points = [0, *cuts, end]
        line_digest = _sha(text + eol)
        for index, piece in enumerate(pieces):
            result.append(dict(zip(COLUMNS, (
                digest, number, line_digest, index, points[index], points[index + 1],
                piece, eol if index == len(pieces) - 1 else '',
                metadata if index == 0 else None,
                plan['review_state'] if index == 0 else None,
                plan['adopted_engine'] if index == 0 else None,
            ))))
    return result


def rebuild_markdown(rows):
    """Validate rows and reconstruct original Markdown without reading upstream."""
    _require(isinstance(rows, (list, tuple)), 'expected ordered sentence records')
    groups = defaultdict(list)
    previous = (0, -1)
    for row in rows:
        _require(isinstance(row, dict) and set(row) == set(COLUMNS), 'invalid sentence row')
        _require(type(row['source_line']) is int and type(row['sentence_index']) is int, 'invalid row identity')
        identity = (row['source_line'], row['sentence_index'])
        _require(identity > previous, 'out-of-order or duplicate sentence row')
        previous = identity
        for key in ('source_document_hash', 'source_line_hash'):
            value = row[key]
            _require(isinstance(value, str) and len(value) == 64
                     and all(ch in '0123456789abcdef' for ch in value), 'invalid SHA-256 digest')
        groups[row['source_line']].append(row)
    _require(list(groups) == list(range(1, len(groups) + 1)), 'missing or out-of-order MDLine')
    output = []
    digest = None
    for number, group in groups.items():
        line_parts = []
        offset = 0
        cuts = []
        first = group[0]
        for index, row in enumerate(group):
            text = row['sentence_text']
            _require(isinstance(text, str) and '\n' not in text, 'invalid sentence text')
            _, length = _offsets(text)
            _require(row['sentence_index'] == index and type(row['from_utf16']) is int
                     and type(row['to_utf16']) is int and row['from_utf16'] == offset
                     and row['to_utf16'] == offset + length, 'noncontiguous sentence range')
            _require(length > 0 or len(group) == 1, 'empty interior sentence')
            offset += length
            last = index == len(group) - 1
            _require(row['line_eol'] in ('', '\n') and (last or not row['line_eol']), 'invalid LF ownership')
            _require(row['source_line_hash'] == first['source_line_hash'], 'mixed line hashes')
            digest = row['source_document_hash'] if digest is None else digest
            _require(row['source_document_hash'] == digest, 'mixed document revisions')
            if index:
                _require(all(row[k] is None for k in COLUMNS[-3:]), 'metadata belongs to first sentence only')
            if not last:
                cuts.append(offset)
            line_parts.append(text)
        text = ''.join(line_parts)
        eol = group[-1]['line_eol']
        _require(eol == '\n' or number == len(groups), 'nonfinal line without LF')
        _require(bool(text or eol), 'virtual EOF line is not a source record')
        _require(_sha(text + eol) == first['source_line_hash'], 'line digest mismatch')
        _require(isinstance(first['candidates_json'], str), 'missing candidate metadata')
        _metadata(text, cuts, json.loads(first['candidates_json']), first['review_state'], first['adopted_engine'])
        output.append(text + eol)
    markdown = ''.join(output)
    _require(digest is None or _sha(markdown) == digest, 'document digest mismatch')
    return markdown


class SentenceStore:
    """Dedicated isolated SQLite connection; all mutations restricted to sentence.

    The caller owns authorization and lifetime of the connection. The guard stays
    installed until connection closure. No path-based opener or live gateway.
    """
    def __init__(self, connection):
        _require(not connection.in_transaction, 'dedicated idle connection required')
        self._db = connection
        self._creating = False
        connection.set_authorizer(self._authorize)

    def _authorize(self, action, arg1, arg2, database, source):
        if source is not None:
            return sqlite3.SQLITE_DENY
        if action in (sqlite3.SQLITE_SELECT, sqlite3.SQLITE_TRANSACTION):
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_READ and database == 'main' and arg1 in ('sentence', 'sqlite_master', 'sqlite_schema'):
            return sqlite3.SQLITE_OK
        if action == sqlite3.SQLITE_FUNCTION and arg2 == 'char':
            return sqlite3.SQLITE_OK
        if action in (sqlite3.SQLITE_INSERT, sqlite3.SQLITE_UPDATE, sqlite3.SQLITE_DELETE) and database == 'main':
            if arg1 == 'sentence' or (self._creating and arg1 in ('sqlite_master', 'sqlite_schema')):
                return sqlite3.SQLITE_OK
        if self._creating and database == 'main':
            if action == sqlite3.SQLITE_CREATE_TABLE and arg1 == 'sentence':
                return sqlite3.SQLITE_OK
            if action == sqlite3.SQLITE_CREATE_INDEX and arg2 == 'sentence' and arg1 == 'sqlite_autoindex_sentence_1':
                return sqlite3.SQLITE_OK
        return sqlite3.SQLITE_DENY

    def _schema(self, create=False):
        catalog = self._db.execute("SELECT type,name,tbl_name,sql FROM main.sqlite_master").fetchall()
        tables = {row[1]: row[3] for row in catalog if row[0] == 'table' and not row[1].startswith('sqlite_')}
        _require(set(tables) in ({'mineru_base', 'logical_block'}, {'mineru_base', 'logical_block', 'sentence'}),
                 'unexpected database table inventory')
        _require(not any(row[0] in ('trigger', 'view') and (row[1] == 'sentence' or row[2] == 'sentence')
                         for row in catalog), 'unexpected sentence trigger/view')
        if 'sentence' in tables:
            _require(tables['sentence'] == DDL, 'unsupported sentence schema')
        else:
            _require(create, 'sentence table has not been initialized')
            self._creating = True
            try:
                self._db.execute(DDL)
            finally:
                self._creating = False

    def replace_all(self, markdown, rows):
        """Initialize/replace only sentence, atomically; supplied source is immutable."""
        _require(rebuild_markdown(rows) == markdown, 'rows differ from supplied Markdown snapshot')
        db = self._db
        _require(not db.in_transaction, 'unexpected active transaction')
        db.execute('BEGIN IMMEDIATE')
        try:
            self._schema(create=True)
            db.execute('DELETE FROM main.sentence')
            db.executemany(INSERT, (tuple(r[c] for c in COLUMNS) for r in rows))
            _require(rebuild_markdown(self._read()) == markdown, 'SQLite roundtrip mismatch')
            db.commit()
        except BaseException:
            db.rollback()
            raise

    def _read(self):
        return [dict(zip(COLUMNS, row)) for row in self._db.execute(SELECT)]

    def read(self, markdown):
        """Read a single transactional snapshot; reject stale or corrupt rows."""
        db = self._db
        _require(not db.in_transaction, 'unexpected active transaction')
        db.execute('BEGIN')
        try:
            self._schema()
            rows = self._read()
            _require(rebuild_markdown(rows) == markdown, 'stale or incomplete sentence table')
            db.commit()
            return rows
        except BaseException:
            db.rollback()
            raise
