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
        versions=[entry]+entry.get('alternates',[])
        for version in versions:
            updates=version['updates']
            if not updates:continue
            valid=True
            for item in updates:
                row=db.execute('SELECT block_id,text FROM md_line WHERE line_id=?',
                               (item['line_id'],)).fetchone()
                if row is None or row[0]!=item['block_id'] or \
                   _hash(row[1])!=item['after_sha256']:
                    valid=False;break
            if valid:
                # The selected variant supplies the correct ref offset, also
                # after Undo restores a previously verified partial state.
                return {'converted':True,'conversion':version}
        return {'converted':False,'conversion':entry}
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
            if 'conversion_issue' not in {row[1] for row in db.execute('PRAGMA table_info(note_pair_review)')}:
                db.execute('ALTER TABLE note_pair_review ADD COLUMN conversion_issue TEXT')
            converted_id=plan['convertedReferenceId']
            result={'number':label,'converted_ref_id':converted_id,
                    'converted_body_id':plan['convertedBodyId'],
                    'updates':receipt}
            revision=uuid.uuid4().hex
            db.execute('UPDATE note_pair_review SET conversion_json=?,conversion_issue=NULL,revision=?, '
                  "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ref_id=?",
                  (json.dumps(result,ensure_ascii=False,separators=(',',':')),
                   revision,reference_id))
            db.commit()
            return {'status':'prepared','ref_id':reference_id,
                    'revision':revision,'conversion':result}
        except Exception:
            db.rollback()
            raise


def arm_note_pair_group_conversion(book:Path,members,updates,anchors=None):
    """Prepare ALL members' receipts in one SQLite transaction; never write MD.

    The whole changed line is shared evidence, so every member must have the
    SAME after-state hashes. A failed member, revision or source guard rolls
    back the entire group. Client must then commit one CM6 transaction.
    """
    anchors=[] if anchors is None else anchors
    if not isinstance(members,list) or not isinstance(anchors,list) or \
       not 1<=len(members)<=32 or not 2<=len(members)+len(anchors)<=32 or \
       not isinstance(updates,list) or not 1<=len(updates)<=132:
        raise OCRImportError('注释同一行转换组的大小无效')
    if any(not isinstance(m,dict) or set(m)!={'referenceId','expectedRevision',
           'number','convertedReferenceId','convertedBodyId'} for m in members):
        raise OCRImportError('注释分组成员字段无效')
    if any(not isinstance(a,dict) or set(a)!={'referenceId','expectedRevision',
           'convertedReferenceId'} for a in anchors):
        raise OCRImportError('已有转换注引的保留信息不合法')
    if any(not isinstance(u,dict) or set(u)!={'lineId','blockId','beforeText','afterText'}
           for u in updates):
        raise OCRImportError('注释分组行更新字段无效')
    ref_ids=[m['referenceId'] for m in members]
    if len(set(ref_ids))!=len(ref_ids) or any(not isinstance(i,str) or
       not i.startswith('ref:') for i in ref_ids):
        raise OCRImportError('注释分组包含无效或重复的注引')
    with closing(sqlite3.connect(_db(book),timeout=20)) as db:
        db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            if not _present(db):raise OCRImportError('缺少人工确认的注释')
            sources=[]
            for m in members:
                old=db.execute('SELECT * FROM note_pair_review WHERE ref_id=?',
                               (m['referenceId'],)).fetchone()
                if not old or old['revision']!=m['expectedRevision'] or \
                   old['decision']!='待转换' or \
                   not isinstance(m['expectedRevision'],str) or \
                   not re.fullmatch(r'[0-9a-f]{32}',m['expectedRevision']):
                    raise OCRImportError('注释分组中存在版本冲突或未人工确认的配对')
                if not _valid_record(db,old):
                    raise OCRImportError('注释分组的原文证据已经变化')
                if type(m['number']) is not str or not re.fullmatch(r'(?:[0-9]{1,3}|[*†‡])',m['number']):
                    raise OCRImportError('注释分组注号非法')
                if m['convertedBodyId']!=('body:'+old['body_line_id']+':0:body.md-footnote'):
                    raise OCRImportError('分组转换注文身份错误')
                sources.append(old)
            line_ids={old['ref_line_id'] for old in sources}
            if len(line_ids)!=1:raise OCRImportError('分组注引不在同一物理行')
            source_line_id=next(iter(line_ids))
            anchored=[]
            for item in anchors:
                ref_id=item['referenceId']
                if ref_id in ref_ids or not isinstance(ref_id,str):
                    raise OCRImportError('已有转换注引身份重复')
                ref_ids.append(ref_id)
                old=db.execute('SELECT * FROM note_pair_review WHERE ref_id=?',(ref_id,)).fetchone()
                if not old or old['revision']!=item['expectedRevision'] or \
                   old['ref_line_id']!=source_line_id:
                    raise OCRImportError('已有转换注引版本冲突')
                previous=receipt_state(db,dict(old))
                if not previous['converted']:
                    raise OCRImportError('既有注引转换尚未保存，不能保留回执')
                anchor_ref=previous['conversion']['converted_ref_id']
                if not isinstance(anchor_ref,str) or not anchor_ref.startswith('ref:'+source_line_id+':'):
                    raise OCRImportError('既有注引坐标不是原物理行')
                try:old_offset=int(anchor_ref.rsplit(':',2)[1])
                except (ValueError,IndexError):raise OCRImportError('既有注引坐标错误')
                anchored.append((old,item,previous['conversion'],old_offset))
            changes={}
            for item in updates:
                line_id=item['lineId'];block_id=item['blockId']
                before=item['beforeText'];after=item['afterText']
                if type(line_id) is not str or not re.fullmatch(r'[\w:-]{1,130}',line_id) or \
                   line_id in changes or \
                   (block_id is not None and (type(block_id) is not int or block_id<1)) or \
                   any(type(value) is not str or len(value)>200_000 or '\n' in value or '\r' in value
                       for value in (before,after)) or before==after:
                    raise OCRImportError('分组变更行不合法或包含重复身份')
                row=db.execute('SELECT block_id,text FROM md_line WHERE line_id=?',
                               (line_id,)).fetchone()
                if row is None or row['block_id']!=block_id or row['text']!=before:
                    raise OCRImportError('分组转换计划已经过期，拒绝覆盖 MD')
                changes[line_id]=item
            if source_line_id not in changes:
                raise OCRImportError('同一行分组没有修改注引原文')
            source_change=changes[source_line_id]
            data=source_change['beforeText'].encode('utf-16-le','surrogatepass')
            result=b'';cursor=0;shift=0
            sorted_pairs=sorted(zip(sources,members),key=lambda pair:pair[0]['ref_from'])
            for old,member in sorted_pairs:
                begin=old['ref_from']*2;end=old['ref_to']*2
                if begin<cursor or end>len(data):
                    raise OCRImportError('注引位置重叠或偏移越界')
                result+=data[cursor:begin]
                token='[^'+member['number']+']'
                new_offset=old['ref_from']+shift
                if member['convertedReferenceId']!=('ref:'+source_line_id+':'+
                                                    str(new_offset)+':ref.md-footnote'):
                    raise OCRImportError('同一行转换后的注引位置不正确')
                encoded=token.encode('utf-16-le')
                result+=encoded;cursor=end
                shift+=len(encoded)//2-(old['ref_to']-old['ref_from'])
            result+=data[cursor:]
            if result.decode('utf-16-le','surrogatepass')!=source_change['afterText']:
                raise OCRImportError('同一行更新包含与注引无关的修改')
            for old,item,version,offset in anchored:
                number=version.get('number')
                if type(number) is not str or not re.fullmatch(r'(?:[0-9]{1,3}|[*†‡])',number):
                    raise OCRImportError('已转换注号非法')
                token='[^'+number+']'
                if data[offset*2:(offset+len(token))*2].decode('utf-16-le','surrogatepass')!=token:
                    raise OCRImportError('原已转换注引不在校验位置')
                shift=sum(len(('[^'+member['number']+']').encode('utf-16-le'))//2-
                    (previous_row['ref_to']-previous_row['ref_from'])
                    for previous_row,member in sorted_pairs if previous_row['ref_from']<offset)
                new_offset=offset+shift
                if item['convertedReferenceId']!=('ref:'+source_line_id+':'+
                    str(new_offset)+':ref.md-footnote'):
                    raise OCRImportError('已有注引后移/前移的位置不正确')
                if source_change['afterText'].encode('utf-16-le','surrogatepass')[
                      new_offset*2:(new_offset+len(token))*2].decode('utf-16-le','surrogatepass')!=token:
                    raise OCRImportError('既有注引在组合后的原文中未保留')
            for old,m in zip(sources,members):
                body=changes.get(old['body_line_id'])
                label='[^'+m['number']+']:'
                if body:
                    if not body['afterText'].startswith(label):
                        raise OCRImportError('转换组的注文没有正确的新 Markdown 标记')
                elif not db.execute('SELECT 1 FROM md_line WHERE line_id=? AND text LIKE ?',
                                    (old['body_line_id'],label+'%')).fetchone():
                    raise OCRImportError('转换组缺少注文变更')
            entry=[{'line_id':i['lineId'],'block_id':i['blockId'],
                    'before_sha256':_hash(i['beforeText']),
                    'after_sha256':_hash(i['afterText'])} for i in updates]
            if COL not in {row[1] for row in db.execute('PRAGMA table_info(note_pair_review)')}:
                db.execute('ALTER TABLE note_pair_review ADD COLUMN conversion_json TEXT')
            if 'conversion_issue' not in {row[1] for row in db.execute('PRAGMA table_info(note_pair_review)')}:
                db.execute('ALTER TABLE note_pair_review ADD COLUMN conversion_issue TEXT')
            group_id=uuid.uuid4().hex
            prepared=[]
            for old,item,previous,offset in anchored:
                # Previous successfully saved states are valid Undo targets.
                # Keep bounded alternatives, each with its OWN ref position
                # and post-state hash set, so that Undo does not falsely mark
                # an already converted note as pending.
                current=next(change for change in entry if change['line_id']==source_line_id)
                inherited=[{**change} for change in previous['updates']]
                source_seen=False
                for change in inherited:
                    if change['line_id']==source_line_id:
                        change['after_sha256']=current['after_sha256'];source_seen=True
                if not source_seen:inherited.append(current)
                old_json=json.loads(old['conversion_json'])
                old_versions=[{k:v for k,v in previous.items() if k!='alternates'}]
                old_versions.extend(old_json.get('alternates',[]))
                if len(old_versions)>12:raise OCRImportError('转换历史变体超过安全上限')
                latest={**previous,'converted_ref_id':item['convertedReferenceId'],
                        'updates':inherited,'alternates':old_versions}
                revision=uuid.uuid4().hex
                db.execute('UPDATE note_pair_review SET conversion_json=?,conversion_issue=NULL,revision=?, '
                          "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ref_id=?",
                           (json.dumps(latest,ensure_ascii=False,separators=(',',':')),
                            revision,item['referenceId']))
                prepared.append({'ref_id':item['referenceId'],'revision':revision,
                                 'conversion':latest})
            for old,m in zip(sources,members):
                conversion={'number':m['number'],'converted_ref_id':m['convertedReferenceId'],
                   'converted_body_id':m['convertedBodyId'],
                   'group_id':group_id,'updates':entry}
                revision=uuid.uuid4().hex
                db.execute('UPDATE note_pair_review SET conversion_json=?,conversion_issue=NULL,revision=?, '
                           "updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ref_id=?",
                           (json.dumps(conversion,ensure_ascii=False,separators=(',',':')),
                            revision,m['referenceId']))
                prepared.append({'ref_id':m['referenceId'],'revision':revision,
                                 'conversion':conversion})
            db.commit()
            return {'status':'prepared','group_id':group_id,'members':prepared}
        except Exception:
            db.rollback()
            raise
