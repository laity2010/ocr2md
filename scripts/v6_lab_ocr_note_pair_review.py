"""Lab-OCR note-match WP3.1: narrowly scoped human review decisions.

GET is read-only, including when the table does not yet exist. POST only
writes note_pair_review; MD, Block and source MinerU never change. A review
is attached to an exact source snapshot and stable candidate identifiers.
"""
from __future__ import annotations

import hashlib
import re
import sqlite3
import uuid
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_md import _check_signature
from v6_lab_ocr_store import _db, OCRImportError

TABLE='note_pair_review'
SCHEMA='''CREATE TABLE IF NOT EXISTS note_pair_review(
 ref_id TEXT NOT NULL PRIMARY KEY,
 ref_line_id TEXT NOT NULL,
 ref_block_id INTEGER,
 ref_from INTEGER NOT NULL,
 ref_to INTEGER NOT NULL,
 ref_raw TEXT NOT NULL,
 ref_source_sha256 TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('忽略','待转换')),
 body_id TEXT,
 body_line_id TEXT,
 body_block_id INTEGER,
 body_from INTEGER,
 body_to INTEGER,
 body_raw TEXT,
 body_source_sha256 TEXT,
 conversion_json TEXT,
 revision TEXT NOT NULL,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK((decision='忽略' AND body_id IS NULL) OR
       (decision='待转换' AND body_id IS NOT NULL))
)'''
ID_RE=re.compile(r'^(?:ref|body):([\w:-]{1,130}):([0-9]{1,6}):((?:ref|body)\.[a-z][\w-]*|book\.(?:ref|body)\.[a-z][a-z0-9-]*)$')
LINE_RE=re.compile(r'^[\w:-]{1,130}$')


def _present(db):
    return db.execute('SELECT 1 FROM sqlite_master WHERE type=\'table\' AND name=?',(TABLE,)).fetchone() is not None


def _hash(value):
    return hashlib.sha256(value.encode('utf-8')).hexdigest()


def _utf16_range(text,start,end):
    # WP1 / CodeMirror offsets are JavaScript UTF-16 code units, NOT
    # Python Unicode codepoints. Emoji / astral characters before a marker
    # must not invalidate a correct human review or select a wrong token.
    data=text.encode('utf-16-le','surrogatepass')
    if end*2>len(data):return None
    return data[start*2:end*2].decode('utf-16-le','surrogatepass')


def _read_line(db,line_id,block_id,offset,end,raw,expected_text=None):
    if type(line_id) is not str or not LINE_RE.fullmatch(line_id) or \
       (block_id is not None and (type(block_id) is not int or not 0<block_id<100_000_000)) or \
       type(offset) is not int or type(end) is not int or \
       offset<0 or end<=offset or end>200_000 or \
       type(raw) is not str or not raw or len(raw)>4000:
        raise OCRImportError('注释审阅来源位置无效')
    row=db.execute('SELECT text,block_id FROM md_line WHERE line_id=?',(line_id,)).fetchone()
    if row is None or row[1]!=block_id or _utf16_range(row[0],offset,end)!=raw:
        raise OCRImportError('注释候选 LineID、BlockID 或原文已变化，请重新加载')
    if expected_text is not None and (type(expected_text) is not str or
       len(expected_text)>200_000 or row[0]!=expected_text):
        raise OCRImportError('注释候选原文已变化，请先保存并重新加载')
    return row[0]


def _parse_endpoint(raw,kind):
    if not isinstance(raw,dict):raise OCRImportError('注释端点证据必须是对象')
    values={k:raw.get(k) for k in ('candidateId','lineId','blockId','from','to','raw','sourceText')}
    if not isinstance(values['candidateId'],str):raise OCRImportError('注释候选 ID 无效')
    m=ID_RE.fullmatch(values['candidateId'])
    if not m or not values['candidateId'].startswith(kind+':') or \
       m.group(1)!=values['lineId'] or int(m.group(2))!=values['from']:
        raise OCRImportError('注释候选与 LineID/位置不一致')
    return values


def _valid_record(db,row):
    try:
        ref=_read_line(db,row['ref_line_id'],row['ref_block_id'],
                       row['ref_from'],row['ref_to'],row['ref_raw'])
        if _hash(ref)!=row['ref_source_sha256']:return False
        if row['decision']=='待转换':
            body=_read_line(db,row['body_line_id'],row['body_block_id'],
                            row['body_from'],row['body_to'],row['body_raw'])
            if _hash(body)!=row['body_source_sha256']:return False
        return True
    except OCRImportError:return False


def read_note_pair_reviews(book:Path):
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=10)) as db:
        db.row_factory=sqlite3.Row
        _check_signature(db,book)
        if not _present(db):return {'status':'ready','reviews':[]}
        from v6_lab_ocr_note_pair_conversion import receipt_state
        items=[]
        for row in db.execute('SELECT * FROM note_pair_review ORDER BY ref_line_id,ref_from'):
            item=dict(row)
            state=receipt_state(db,item)
            items.append({'ref_id':item['ref_id'],'ref_line_id':item['ref_line_id'],
              'ref_block_id':item['ref_block_id'],'ref_from':item['ref_from'],
              'ref_to':item['ref_to'],'ref_raw':item['ref_raw'],
              'decision':item['decision'],'body_id':item['body_id'],
              'body_line_id':item['body_line_id'],'body_block_id':item['body_block_id'],
              'body_from':item['body_from'],'body_to':item['body_to'],
              'body_raw':item['body_raw'],'revision':item['revision'],
              'valid':_valid_record(db,item),
              'converted':state['converted'],
              'conversion':state['conversion']})
        return {'status':'ready','reviews':items}


def set_note_pair_review(book:Path,reference,body,decision,expected_revision):
    if decision not in ('待定','忽略','待转换'):
        raise OCRImportError('注释审阅决定无效')
    if expected_revision is not None and (type(expected_revision) is not str or
       not re.fullmatch(r'[0-9a-f]{32}',expected_revision)):
        raise OCRImportError('注释审阅版本号无效')
    ref=_parse_endpoint(reference,'ref')
    if decision=='待转换':
        selected=_parse_endpoint(body,'body')
        if ref['candidateId']==selected['candidateId']:
            raise OCRImportError('注引不能选择自身为注文')
    else:
        if body is not None:raise OCRImportError('忽略或待定时不得携带注文选择')
        selected=None
    with closing(sqlite3.connect(_db(book),timeout=20)) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            ref_text=_read_line(db,ref['lineId'],ref['blockId'],ref['from'],
                                ref['to'],ref['raw'],ref['sourceText'])
            body_text=_read_line(db,selected['lineId'],selected['blockId'],
               selected['from'],selected['to'],selected['raw'],selected['sourceText']) if selected else None
            prior=db.execute('SELECT revision FROM note_pair_review WHERE ref_id=?',
              (ref['candidateId'],)).fetchone() if _present(db) else None
            current_revision=prior[0] if prior else None
            if current_revision!=expected_revision:
                raise OCRImportError('注释审阅状态已有其他修改，须重新加载')
            revision=None
            if decision=='待定':
                if prior:db.execute('DELETE FROM note_pair_review WHERE ref_id=?',
                                    (ref['candidateId'],))
            else:
                db.execute(SCHEMA)
                if 'conversion_json' not in {r[1] for r in db.execute('PRAGMA table_info(note_pair_review)')}:
                    db.execute('ALTER TABLE note_pair_review ADD COLUMN conversion_json TEXT')
                revision=uuid.uuid4().hex
                db.execute('''INSERT INTO note_pair_review(
                  ref_id,ref_line_id,ref_block_id,ref_from,ref_to,ref_raw,
                  ref_source_sha256,decision,body_id,body_line_id,body_block_id,
                  body_from,body_to,body_raw,body_source_sha256,revision)
                  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                  ON CONFLICT(ref_id) DO UPDATE SET
                  ref_line_id=excluded.ref_line_id,ref_block_id=excluded.ref_block_id,
                  ref_from=excluded.ref_from,ref_to=excluded.ref_to,
                  ref_raw=excluded.ref_raw,ref_source_sha256=excluded.ref_source_sha256,
                  decision=excluded.decision,body_id=excluded.body_id,
                  body_line_id=excluded.body_line_id,body_block_id=excluded.body_block_id,
                  body_from=excluded.body_from,body_to=excluded.body_to,
                  body_raw=excluded.body_raw,body_source_sha256=excluded.body_source_sha256,
                  revision=excluded.revision,
                  conversion_json=NULL,
                  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')''',
                  (ref['candidateId'],ref['lineId'],ref['blockId'],ref['from'],ref['to'],
                   ref['raw'],_hash(ref_text),decision,
                   selected['candidateId'] if selected else None,
                   selected['lineId'] if selected else None,
                   selected['blockId'] if selected else None,
                   selected['from'] if selected else None,
                   selected['to'] if selected else None,
                   selected['raw'] if selected else None,
                   _hash(body_text) if selected else None,revision))
            db.commit()
            return {'status':'saved','ref_id':ref['candidateId'],
                    'decision':decision,'body_id':selected['candidateId'] if selected else None,
                    'revision':revision}
        except Exception:
            db.rollback()
            raise
