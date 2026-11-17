"""WP3.2 conversion receipt PREPARE: metadata-only SQL CAS.

CM6 remains the only text writer. A prepared receipt is visible as converted
ONLY if persisted MD text matches *every* planned new-line SHA. If a browser
closes before its CM6 edit is persisted, existing review stays '待转换'.
Undo restores original evidence, Redo restores the converted evidence.
"""
from __future__ import annotations
import json
import re
import sqlite3
import uuid
from contextlib import closing
from pathlib import Path
from v6_lab_ocr_store import _db, OCRImportError
from v6_lab_ocr_md import _check_signature
from v6_lab_ocr_note_pair_review import _present, _hash, _valid_record

COL='conversion_json'


def receipt_state(db,record):
    raw=record.get(COL)
    if not raw:return {'converted':False,'conversion':None}
    try:
        entry=json.loads(raw)
        updates=entry['updates']
        statuses=[]
        for item in updates:
            row=db.execute('SELECT block_id,text FROM md_line WHERE line_id=?',
                           (item['line_id'],)).fetchone()
            if row is None or row[0]!=item['block_id']:return {'converted':False,'conversion':entry}
            statuses.append(_hash(row[1])==item['after_sha256'])
        converted=bool(statuses) and all(statuses)
        return {'converted':converted,'conversion':entry}
    except (ValueError,TypeError,KeyError,sqlite3.DatabaseError):
        return {'converted':False,'conversion':None}


def arm_note_pair_conversion(book:Path,reference_id,expected_revision,plan):
    if not isinstance(reference_id,str) or not reference_id.startswith('ref:') or \
       not isinstance(expected_revision,str) or not re.fullmatch(r'[0-9a-f]{32}',expected_revision):
        raise OCRImportError('注释转换的审阅身份或版本无效')
    if not isinstance(plan,dict) or set(plan)!={'number','convertedReferenceId',
                 'convertedBodyId','updates'}:
        raise OCRImportError('注释转换计划字段无效')
    label=plan['number']
    if type(label) is not str or not re.fullmatch(r'(?:[0-9]{1,3}|[*†‡])',label):
        raise OCRImportError('注号无效')
    updates=plan['updates']
    if not isinstance(updates,list) or not 1<=len(updates)<=102:
        raise OCRImportError('注释转换改动行数超限')
    with closing(sqlite3.connect(_db(book),timeout=20)) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            if not _present(db):raise OCRImportError('尚无人工确认的注释')
            db.row_factory=sqlite3.Row
            old=db.execute('SELECT * FROM note_pair_review WHERE ref_id=?',
                           (reference_id,)).fetchone()
            if not old or old['revision']!=expected_revision or old['decision']!='待转换':
                raise OCRImportError('注释转换审阅状态已有其他修改，须重新加载')
            if not _valid_record(db,old):
                raise OCRImportError('注释转换的源码证据已变化')
            if plan['convertedReferenceId']!=('ref:'+old['ref_line_id']+':'+
                       str(old['ref_from'])+':ref.md-footnote') or \
               plan['convertedBodyId']!=('body:'+old['body_line_id']+':0:body.md-footnote'):
                raise OCRImportError('转换后的端点身份无效')
            ids=set();receipt=[]
            for item in updates:
                if not isinstance(item,dict) or set(item)!={'lineId','blockId','beforeText','afterText'}:
                    raise OCRImportError('单行转换改动字段无效')
                line_id=item['lineId'];block_id=item['blockId']
                before=item['beforeText'];after=item['afterText']
                if type(line_id) is not str or not re.fullmatch(r'[\w:-]{1,130}',line_id) or \
                   line_id in ids or \
                   (block_id is not None and (type(block_id) is not int or block_id<1)) or \
                   any(type(v) is not str or len(v)>200_000 or '\n' in v or '\r' in v
                       for v in (before,after)) or before==after:
                    raise OCRImportError('注释转换行身份或文本无效')
                ids.add(line_id)
                row=db.execute('SELECT block_id,text FROM md_line WHERE line_id=?',
                               (line_id,)).fetchone()
                if row is None or row[0]!=block_id or row[1]!=before:
                    raise OCRImportError('注释转换计划过期，MD 原文已改变')
                receipt.append({'line_id':line_id,'block_id':block_id,
                  'before_sha256':_hash(before),'after_sha256':_hash(after)})
            if old['ref_line_id'] not in ids and \
               old['body_line_id'] not in ids:
                raise OCRImportError('转换计划没有涉及审阅的任一端点')
            current=db.execute('PRAGMA table_info(note_pair_review)').fetchall()
            if COL not in {row[1] for row in current}:
                db.execute('ALTER TABLE note_pair_review ADD COLUMN conversion_json TEXT')
            converted_id=plan['convertedReferenceId']
            result={'number':label,'converted_ref_id':converted_id,
                    'converted_body_id':plan['convertedBodyId'],
                    'updates':receipt}
            revision=uuid.uuid4().hex
            db.execute('UPDATE note_pair_review SET conversion_json=?,revision=?, '
                  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ref_id=?",
                  (json.dumps(result,ensure_ascii=False,separators=(',',':')),
                   revision,reference_id))
            db.commit()
            return {'status':'prepared','ref_id':reference_id,
                    'revision':revision,'conversion':result}
        except Exception:
            db.rollback()
            raise
