"""Lab-OCR WCP43: durable decisions for read-only logical-block break candidates.

No MD text or original Block relation is written here. Review decisions are
snapshots tied to two stable BlockIDs + LineIDs + full MD line evidence.
GET never changes schema; POST creates this extension table only on demand.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import _db, OCRImportError
from v6_lab_ocr_md import _check_signature

TABLE='block_break_review'
DECISIONS=('待定','断块合并','忽略')
SCHEMA='''CREATE TABLE IF NOT EXISTS block_break_review(
 before_block_id INTEGER NOT NULL,
 after_block_id INTEGER NOT NULL,
 before_line_id TEXT NOT NULL,
 after_line_id TEXT NOT NULL,
 evidence_sha256 TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('断块合并','忽略')),
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY(before_block_id,after_block_id)
)'''


def _has_table(db):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                      (TABLE,)).fetchone() is not None


def _evidence(before_id,after_id,before_text,after_text):
    raw=json.dumps([before_id,after_id,before_text,after_text],
                   ensure_ascii=False,separators=(',',':'))
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _line_and_block(db,before_block_id,after_block_id,before_line_id,after_line_id):
    if before_block_id==after_block_id:
        raise OCRImportError('断块的前后 BlockID 必须不同')
    blocks=[db.execute('''SELECT block_id,parent_block_id,sibling_order,
                   block_type,block_group,absorbed_into_block_id
                   FROM block WHERE block_id=?''',(block_id,)).fetchone()
            for block_id in (before_block_id,after_block_id)]
    if any(b is None or b[4]!='para_blocks' or b[5] is not None or
           b[3] not in ('text','paragraph') for b in blocks):
        raise OCRImportError('断块原始正文 Block 已不存在或结构变化')
    before,after=blocks
    # The pair must be directly adjacent INSIDE one logical parent, never
    # adjacent arbitrary paragraphs or across an equation/HTML sibling.
    root=(before[1] is None and after[1]==before_block_id)
    siblings=(before[1] is not None and before[1]==after[1])
    if not (root or siblings):raise OCRImportError('断块父子关系已变化')
    parent=before_block_id if root else before[1]
    bounds=(None,after[2]) if root else (before[2],after[2])
    if siblings and before[2]>=after[2]:
        raise OCRImportError('断块相邻顺序已变化')
    if root:
        between=db.execute('''SELECT 1 FROM block WHERE parent_block_id=?
                    AND absorbed_into_block_id IS NULL AND sibling_order<? LIMIT 1''',
                    (parent,after[2])).fetchone()
    else:
        between=db.execute('''SELECT 1 FROM block WHERE parent_block_id=?
                    AND absorbed_into_block_id IS NULL
                    AND sibling_order>? AND sibling_order<? LIMIT 1''',
                    (parent,*bounds)).fetchone()
    if between:raise OCRImportError('两个文本块中间存在其他子块，拒绝审阅过期候选')
    lines=[]
    for block_id,line_id in ((before_block_id,before_line_id),
                              (after_block_id,after_line_id)):
        row=db.execute('SELECT line_no,text,block_id FROM md_line WHERE line_id=?',
                       (line_id,)).fetchone()
        if not row or row[2]!=block_id or not row[1].strip():
            raise OCRImportError('断块 MD LineID 所属关系已经变化')
        boundary=db.execute('''SELECT line_id FROM md_line WHERE block_id=?
                     AND trim(text)<>'' ORDER BY line_no {} LIMIT 1'''.format(
                        'DESC' if block_id==before_block_id else 'ASC'),
                        (block_id,)).fetchone()
        if not boundary or boundary[0]!=line_id:
            raise OCRImportError('断块接续端点已不再是该 Block 的首末正文行')
        lines.append(row)
    if lines[0][0]>=lines[1][0]:
        raise OCRImportError('断块接续 MD 行顺序已变化')
    return lines


def read_block_break_reviews(book:Path):
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=10)) as db:
        _check_signature(db,book)
        if not _has_table(db):return {'status':'ready','reviews':[]}
        result=[]
        for row in db.execute('''SELECT before_block_id,after_block_id,
                       before_line_id,after_line_id,evidence_sha256,decision
                       FROM block_break_review ORDER BY before_block_id,after_block_id'''):
            before_id,after_id,before_line_id,after_line_id,evidence,decision=row
            try:lines=_line_and_block(db,before_id,after_id,before_line_id,after_line_id)
            except OCRImportError:continue
            if _evidence(before_line_id,after_line_id,lines[0][1],lines[1][1])!=evidence:
                continue
            result.append({'issue_id':f'block-break:{before_id}:{after_id}',
                           'before_line_id':before_line_id,'after_line_id':after_line_id,
                           'decision':decision})
        return {'status':'ready','reviews':result}


def set_block_break_review(book:Path,before_block_id,after_block_id,
                           before_line_id,after_line_id,before_text,after_text,
                           decision,expected_decision):
    if (type(before_block_id) is not int or type(after_block_id) is not int or
        not 0<before_block_id<1_000_000 or not 0<after_block_id<1_000_000):
        raise OCRImportError('审阅 BlockID 无效')
    if any(not isinstance(line_id,str) or not re.fullmatch(r'[\w:-]{1,100}',line_id)
           for line_id in (before_line_id,after_line_id)):
        raise OCRImportError('审阅 LineID 无效')
    if any(not isinstance(text,str) or not text.strip() or len(text)>200_000 or
           '\r' in text or '\n' in text for text in (before_text,after_text)):
        raise OCRImportError('审阅正文证据无效')
    if decision not in DECISIONS or expected_decision not in DECISIONS:
        raise OCRImportError('不支持的断块审阅决定')
    with closing(sqlite3.connect(_db(book),timeout=20)) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            lines=_line_and_block(db,before_block_id,after_block_id,
                                   before_line_id,after_line_id)
            if lines[0][1]!=before_text or lines[1][1]!=after_text:
                raise OCRImportError('断块文本已变化，先保存并重新加载候选')
            evidence=_evidence(before_line_id,after_line_id,before_text,after_text)
            prior=db.execute('''SELECT decision,evidence_sha256 FROM block_break_review
                    WHERE before_block_id=? AND after_block_id=?''',
                    (before_block_id,after_block_id)).fetchone() if _has_table(db) else None
            current=prior[0] if prior and prior[1]==evidence else '待定'
            if current!=expected_decision:
                raise OCRImportError('审阅状态已有其他修改，须重新加载')
            if decision=='待定':
                if prior:db.execute('''DELETE FROM block_break_review WHERE
                          before_block_id=? AND after_block_id=?''',
                          (before_block_id,after_block_id))
            else:
                db.execute(SCHEMA)
                db.execute('''INSERT INTO block_break_review
                   (before_block_id,after_block_id,before_line_id,after_line_id,
                    evidence_sha256,decision) VALUES(?,?,?,?,?,?)
                   ON CONFLICT(before_block_id,after_block_id) DO UPDATE SET
                   before_line_id=excluded.before_line_id,
                   after_line_id=excluded.after_line_id,
                   evidence_sha256=excluded.evidence_sha256,
                   decision=excluded.decision,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')''',
                   (before_block_id,after_block_id,before_line_id,after_line_id,
                    evidence,decision))
            db.commit()
            return {'status':'saved','issue_id':f'block-break:{before_block_id}:{after_block_id}',
                    'decision':decision}
        except Exception:
            db.rollback()
            raise
