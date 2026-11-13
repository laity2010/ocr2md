"""Lab OCR para-only block-structure editing.

Stable block_id identifies the immutable OCR atom. Only parent_block_id,
sibling_order, and display PBS are mutable. Every write is one SQLite
transaction with a revision precondition and an undoable before/after snapshot.
Original MinerU bytes, source_block_key, block_path, bbox and spans are untouched.
"""
from __future__ import annotations

import json
import hashlib
import re
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import OCRImportError, REVIEW_BLOCK_GROUP, _db, existing_info

META = """CREATE TABLE IF NOT EXISTS block_edit_meta(
    id INTEGER PRIMARY KEY CHECK(id=1),
    revision INTEGER NOT NULL,
    cursor INTEGER NOT NULL,
    import_fingerprint TEXT NOT NULL
)"""
HISTORY = """CREATE TABLE IF NOT EXISTS block_edit_history(
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_json TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    global_page INTEGER NOT NULL,
    import_fingerprint TEXT NOT NULL
)"""
RECEIPTS = """CREATE TABLE IF NOT EXISTS block_edit_receipt(
    batch_id TEXT PRIMARY KEY,
    payload_sha256 TEXT NOT NULL,
    response_json TEXT NOT NULL,
    import_fingerprint TEXT NOT NULL
)"""
MAX_PAGE_BLOCKS = 5000
MAX_BATCH = 32
MAX_LOADED_HISTORY = 128


def _revision(connection, signature):
    row = connection.execute(
        "SELECT revision,cursor,import_fingerprint FROM block_edit_meta WHERE id=1"
    ).fetchone() if _has_table(connection, 'block_edit_meta') else None
    if row and row[2] != signature:
        raise OCRImportError('Block 操作历史与 MinerU 来源签名不匹配，拒绝覆写')
    return (row[0], row[1]) if row else (0, 0)


def _has_table(connection, name):
    return bool(connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)
    ).fetchone())


def _source_signature(book):
    info = existing_info(book)
    if not info:
        raise OCRImportError('书籍尚未导入 MinerU')
    return info['signature']


def _ensure_block(connection):
    if not _has_table(connection, 'block'):
        raise OCRImportError('请先生成 para Block 表')


def _fetch_page(connection, page):
    connection.row_factory = sqlite3.Row
    rows = connection.execute("""SELECT block_id,global_page,parent_block_id,
       sibling_order,pbs,block_group,source_order FROM block
       WHERE global_page=? AND block_group=? ORDER BY block_id""",
       (page, REVIEW_BLOCK_GROUP)).fetchall()
    if not rows or len(rows) > MAX_PAGE_BLOCKS:
        raise OCRImportError('页内无 para Block，或单页块数超过安全上限')
    return [dict(r) for r in rows]


def _snapshot(rows):
    return [[r['block_id'],r['parent_block_id'],r['sibling_order'],r['pbs']]
            for r in sorted(rows,key=lambda r:r['block_id'])]


def _parse_id(value):
    if type(value) is not int or value <= 0 or value > 500000:
        raise OCRImportError('BlockID 必须是已存在的正整数')
    return value


def plan_block_move(rows, source_id, target_id, placement):
    """Pure page-local relationship plan; no DB, no PBS-as-identity lookup."""
    source_id = _parse_id(source_id)
    target_id = _parse_id(target_id)
    if placement not in ('before','child','after'):
        raise OCRImportError('Block 落点无效')
    nodes = {row['block_id']:dict(row) for row in rows}
    if len(nodes) != len(rows) or source_id not in nodes or target_id not in nodes:
        raise OCRImportError('Block 源或目标不存在')
    if source_id == target_id:
        raise OCRImportError('不能把块移动到自身')
    page = nodes[source_id]['global_page']
    if page != nodes[target_id]['global_page']:
        raise OCRImportError('第一版只允许同页 Block 结构操作')
    if any(row['global_page'] != page or row['block_group'] != REVIEW_BLOCK_GROUP
           for row in rows):
        raise OCRImportError('关系计划中含跨页或非 para Block')

    siblings = {}
    for row in rows:
        parent = row['parent_block_id']
        if parent is not None and parent not in nodes:
            raise OCRImportError('块关系存在缺失或跨页父块')
        siblings.setdefault(parent, []).append(row['block_id'])
    for members in siblings.values():
        members.sort(key=lambda bid:(nodes[bid]['sibling_order'],bid))

    # Validate the entire input graph before modifying it; no silent loss
    # of nodes in a pre-existing cycle.
    for bid in nodes:
        cursor=bid
        traversed=set()
        while cursor is not None:
            if cursor in traversed:
                raise OCRImportError('已有块关系存在循环')
            traversed.add(cursor)
            cursor=nodes[cursor]['parent_block_id']
    visited=set()
    def verify(node, visiting):
        if node in visiting: raise OCRImportError('已有块关系存在循环')
        if node in visited:return
        visiting.add(node)
        for child in siblings.get(node,[]):verify(child,visiting)
        visiting.remove(node)
        visited.add(node)
    for root in siblings.get(None,[]):verify(root,set())
    if len(visited) != len(rows):
        raise OCRImportError('存在没有有效根节点的 Block')

    source = nodes[source_id]
    target = nodes[target_id]
    current_parent = source['parent_block_id']
    if placement == 'child':
        if current_parent is not None:
            raise OCRImportError('第一版只允许父块归入另一父块')
        # Main semantics: dropping on an existing s1 means append to that
        # child's parent, not nest into s1.
        new_parent = target_id if target['parent_block_id'] is None else target['parent_block_id']
        if new_parent == source_id:
            raise OCRImportError('不能把父块归入自身的子孙')
        cursor = new_parent
        guard=set()
        while cursor is not None:
            if cursor == source_id:
                raise OCRImportError('不能把父块归入自身后代')
            if cursor in guard:raise OCRImportError('父块关系循环')
            guard.add(cursor)
            cursor=nodes[cursor]['parent_block_id']
        siblings[current_parent].remove(source_id)
        siblings.setdefault(new_parent,[]).append(source_id)
        nodes[source_id]['parent_block_id']=new_parent
    else:
        target_parent=target['parent_block_id']
        if current_parent != target_parent:
            raise OCRImportError('之前／之后只允许同级块，子块只能同父排序')
        members=siblings[current_parent]
        members.remove(source_id)
        index=members.index(target_id)+(1 if placement == 'after' else 0)
        members.insert(index,source_id)

    output=[]
    def number(parent, prefix):
        for index,bid in enumerate(siblings.get(parent,[])):
            item=nodes[bid]
            item['sibling_order']=index
            item['pbs']=prefix+str(index) if parent is None else prefix+'s'+str(index)
            output.append(item)
            number(bid,item['pbs'])
    number(None, f'p{page+1}b')
    if len(output)!=len(rows) or len({r['pbs'] for r in output})!=len(rows):
        raise OCRImportError('块编号重建失败')
    before=_snapshot(rows)
    after=_snapshot(output)
    changed=[dict(block_id=a[0],parent_block_id=a[1],sibling_order=a[2],pbs=a[3])
             for b,a in zip(before,after) if b!=a]
    return dict(changed=bool(changed),sourceBlockId=source_id,targetBlockId=target_id,
                placement=placement,page=page+1,changedRows=changed,
                before=before,after=after)


def _write_snapshot(connection, snapshot):
    ids=[row[0] for row in snapshot]
    if len(set(ids))!=len(ids): raise OCRImportError('重复 BlockID')
    # PBS is UNIQUE; stage each label before assigning final labels to
    # prevent a valid renumber from transiently colliding with an old label.
    for bid in ids:
        connection.execute('UPDATE block SET pbs=? WHERE block_id=?',
                           (f'__lab_ocr_pending_{bid}__',bid))
    for bid,parent,order,pbs in snapshot:
        connection.execute("""UPDATE block SET parent_block_id=?,sibling_order=?,pbs=?
                              WHERE block_id=? AND block_group=?""",
                           (parent,order,pbs,bid,REVIEW_BLOCK_GROUP))


def _check_signature(connection, signature):
    _ensure_block(connection)
    fingerprints={row[0] for row in connection.execute(
        'SELECT DISTINCT import_fingerprint FROM block')}
    if fingerprints!={signature}:
        raise OCRImportError('派生 Block 来源指纹不一致，拒绝结构写入')


def _start_write(book, expected_revision):
    if type(expected_revision) is not int or expected_revision < 0:
        raise OCRImportError('缺少合法的 expectedRevision')
    sig=_source_signature(book)
    conn=sqlite3.connect(_db(book), timeout=15)
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        conn.execute('BEGIN IMMEDIATE')
        _check_signature(conn,sig)
        rev,cursor=_revision(conn,sig)
        if rev != expected_revision:
            raise OCRImportError(f'块关系版本冲突：服务器已是 {rev}，请刷新后重试')
        conn.execute(META)
        conn.execute(HISTORY)
        conn.execute("""INSERT OR IGNORE INTO block_edit_meta
                     (id,revision,cursor,import_fingerprint) VALUES (1,0,0,?)""",(sig,))
        return conn,sig,rev,cursor
    except Exception:
        conn.rollback();conn.close();raise


def _finish(connection, revision, cursor):
    connection.execute('UPDATE block_edit_meta SET revision=?,cursor=? WHERE id=1',
                       (revision,cursor))
    connection.commit()


def _history_flags(conn,cursor):
    return dict(canUndo=cursor>0,canRedo=bool(conn.execute(
        'SELECT 1 FROM block_edit_history WHERE seq>? LIMIT 1',(cursor,)
    ).fetchone()))


def block_move_state(book, include_history=False):
    signature=_source_signature(book)
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as conn:
        _ensure_block(conn)
        rev,cursor=_revision(conn,signature)
        flags=_history_flags(conn,cursor) if _has_table(conn,'block_edit_history') else dict(canUndo=False,canRedo=False)
        result=dict(revision=rev,**flags)
        if include_history:
            records=conn.execute('''SELECT seq,operation_json,before_json,after_json,global_page
                 FROM block_edit_history ORDER BY seq DESC LIMIT ?''',
                 (MAX_LOADED_HISTORY+1,)).fetchall() if _has_table(conn,'block_edit_history') else []
            result['historyTruncated']=len(records)>MAX_LOADED_HISTORY
            result['history']=[dict(seq=seq,operation=json.loads(op),
                 before=json.loads(before),after=json.loads(after),page=page+1)
                 for seq,op,before,after,page in reversed(records[:MAX_LOADED_HISTORY])]
            result['cursor']=cursor
    return result


def persist_block_edit_batch(book,expected_revision,batch_id,operations):
    """CAS + idempotent receipt + ordered commands in ONE SQLite transaction.

    The browser already applied these edits in CM6 memory. A lost HTTP reply
    may resend the *same* batch ID safely; no operation executes twice.
    """
    if (type(batch_id) is not str or not re.fullmatch(r'[A-Za-z0-9_-]{8,100}',batch_id)
        or type(expected_revision) is not int or expected_revision<0
        or type(operations) is not list or not 1<=len(operations)<=MAX_BATCH
        or any(type(op) is not dict for op in operations)):
        raise OCRImportError('Block 待持久批次结构不合法')
    for command in operations:
        action=command.get('action')
        if action not in ('apply','undo','redo'):
            raise OCRImportError('Block 批量写入动作无效')
        if action=='apply' and (type(command.get('sourceBlockId')) is not int or
            type(command.get('targetBlockId')) is not int or
            command.get('placement') not in ('before','child','after')):
            raise OCRImportError('Block 批量移动参数非法')
    payload_sha=hashlib.sha256(json.dumps(operations,sort_keys=True,
        separators=(',',':')).encode('utf8')).hexdigest()
    signature=_source_signature(book)
    conn=sqlite3.connect(_db(book),timeout=15)
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        conn.execute('BEGIN IMMEDIATE')
        _check_signature(conn,signature)
        conn.execute(RECEIPTS)
        previous=conn.execute('''SELECT payload_sha256,response_json,import_fingerprint
                 FROM block_edit_receipt WHERE batch_id=?''',(batch_id,)).fetchone()
        if previous:
            if previous[0]!=payload_sha or previous[2]!=signature:
                raise OCRImportError('Block 批次编号已被其他内容占用')
            conn.rollback()
            return json.loads(previous[1])
        revision,cursor=_revision(conn,signature)
        if revision!=expected_revision:
            raise OCRImportError(f'块关系版本冲突：服务器已是 {revision}，未修改 CM 内存数据')
        conn.execute(META);conn.execute(HISTORY)
        conn.execute('''INSERT OR IGNORE INTO block_edit_meta
               (id,revision,cursor,import_fingerprint) VALUES(1,0,0,?)''',(signature,))
        for command in operations:
            action=command['action']
            if action=='apply':
                source,target=command['sourceBlockId'],command['targetBlockId']
                pair=conn.execute('''SELECT block_id,global_page FROM block
                    WHERE block_id IN (?,?) AND block_group=?''',
                    (source,target,REVIEW_BLOCK_GROUP)).fetchall()
                if len(pair)!=2 or pair[0][1]!=pair[1][1]:
                    raise OCRImportError('批次包含非同页 para Block')
                plan=plan_block_move(_fetch_page(conn,pair[0][1]),
                    source,target,command['placement'])
                if not plan['changed']:
                    raise OCRImportError('CM 与 SQLite 移动结果不一致（意外空操作）')
                _write_snapshot(conn,plan['after'])
                conn.execute('DELETE FROM block_edit_history WHERE seq>?',(cursor,))
                op=json.dumps({key:plan[key] for key in
                    ('sourceBlockId','targetBlockId','placement')},sort_keys=True)
                cursor=conn.execute('''INSERT INTO block_edit_history
                    (operation_json,before_json,after_json,global_page,import_fingerprint)
                    VALUES(?,?,?,?,?)''',(op,json.dumps(plan['before']),
                        json.dumps(plan['after']),plan['page']-1,signature)).lastrowid
            else:
                if action=='undo':
                    if not cursor:raise OCRImportError('SQLite 无可撤销 Block 历史')
                    entry=conn.execute('''SELECT seq,before_json,after_json,global_page
                        FROM block_edit_history WHERE seq=?''',(cursor,)).fetchone()
                    if not entry:raise OCRImportError('SQLite 撤销指针失效')
                    next_cursor=conn.execute('''SELECT COALESCE(MAX(seq),0)
                        FROM block_edit_history WHERE seq<?''',(cursor,)).fetchone()[0]
                    old=json.loads(entry[2]);new=json.loads(entry[1])
                else:
                    entry=conn.execute('''SELECT seq,before_json,after_json,global_page
                        FROM block_edit_history WHERE seq>? ORDER BY seq LIMIT 1''',
                        (cursor,)).fetchone()
                    if not entry:raise OCRImportError('SQLite 无可重做 Block 历史')
                    next_cursor=entry[0]
                    old=json.loads(entry[1]);new=json.loads(entry[2])
                if _snapshot(_fetch_page(conn,entry[3]))!=old:
                    raise OCRImportError('SQLite 关系与 CM 预期历史不符，整批回滚')
                _write_snapshot(conn,new)
                cursor=next_cursor
            revision+=1
        conn.execute('UPDATE block_edit_meta SET revision=?,cursor=? WHERE id=1',
                     (revision,cursor))
        response=dict(revision=revision,appliedCount=len(operations),
            **_history_flags(conn,cursor))
        conn.execute('''INSERT INTO block_edit_receipt
             (batch_id,payload_sha256,response_json,import_fingerprint)
             VALUES(?,?,?,?)''',(batch_id,payload_sha,json.dumps(response),signature))
        if conn.execute('PRAGMA foreign_key_check').fetchall():
            raise OCRImportError('Block 批次产生无效外键，整批回滚')
        conn.commit()
        return response
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def preview_block_move(book, source_id, target_id, placement):
    state=block_move_state(book)
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as conn:
        _check_signature(conn,_source_signature(book))
        pair=conn.execute(
            'SELECT block_id,global_page FROM block WHERE block_id IN (?,?) AND block_group=?',
            (source_id,target_id,REVIEW_BLOCK_GROUP)).fetchall()
        if len(pair)!=2: raise OCRImportError('源或目标 BlockID 不在 para 表')
        if pair[0][1]!=pair[1][1]:
            raise OCRImportError('第一版不支持跨页改变块关系')
        plan=plan_block_move(_fetch_page(conn,pair[0][1]),source_id,target_id,placement)
    return {key:value for key,value in plan.items() if key not in ('before','after')}|state


def apply_block_move(book, source_id, target_id, placement, expected_revision):
    conn,sig,rev,cursor=_start_write(book,expected_revision)
    try:
        pair=conn.execute(
            'SELECT block_id,global_page FROM block WHERE block_id IN (?,?) AND block_group=?',
            (source_id,target_id,REVIEW_BLOCK_GROUP)).fetchall()
        if len(pair)!=2 or pair[0][1]!=pair[1][1]:
            raise OCRImportError('只能操作同页 para Block')
        plan=plan_block_move(_fetch_page(conn,pair[0][1]),source_id,target_id,placement)
        if not plan['changed']:
            conn.rollback()
            return dict(revision=rev,canUndo=cursor>0,
                        canRedo=bool(conn.execute('SELECT 1 FROM block_edit_history WHERE seq>? LIMIT 1',(cursor,)).fetchone()),
                        changed=False,changedRows=[],page=plan['page'])
        _write_snapshot(conn,plan['after'])
        conn.execute('DELETE FROM block_edit_history WHERE seq>?',(cursor,))
        operation=json.dumps({k:plan[k] for k in ('sourceBlockId','targetBlockId','placement')})
        new=conn.execute("""INSERT INTO block_edit_history
             (operation_json,before_json,after_json,global_page,import_fingerprint)
             VALUES (?,?,?,?,?)""",(operation,json.dumps(plan['before']),
                  json.dumps(plan['after']),plan['page']-1,sig))
        cursor=new.lastrowid
        _finish(conn,rev+1,cursor)
        return dict(revision=rev+1,changed=True,changedRows=plan['changedRows'],
                    page=plan['page'],**_history_flags(conn,cursor))
    except Exception:
        conn.rollback();raise
    finally: conn.close()


def undo_block_move(book, expected_revision, redo=False):
    conn,sig,rev,cursor=_start_write(book,expected_revision)
    try:
        if redo:
            row=conn.execute("""SELECT seq,before_json,after_json,global_page
                  FROM block_edit_history WHERE seq>? ORDER BY seq LIMIT 1""",
                  (cursor,)).fetchone()
            if not row:raise OCRImportError('没有可以重做的块操作')
            new_cursor=row[0]
            restore=json.loads(row[2])
        else:
            if not cursor:raise OCRImportError('没有可以撤销的块操作')
            row=conn.execute("""SELECT seq,before_json,after_json,global_page
                FROM block_edit_history WHERE seq=?""",(cursor,)).fetchone()
            if not row:raise OCRImportError('块撤销历史不完整')
            preceding=conn.execute('SELECT COALESCE(MAX(seq),0) FROM block_edit_history WHERE seq<?',(cursor,)).fetchone()
            new_cursor=preceding[0]
            restore=json.loads(row[1])
        current=_snapshot(_fetch_page(conn,row[3]))
        if [x[0] for x in current]!=[x[0] for x in restore]:
            raise OCRImportError('块集合在撤销期间变化，拒绝覆盖')
        _write_snapshot(conn,restore)
        _finish(conn,rev+1,new_cursor)
        changes=[dict(block_id=a[0],parent_block_id=a[1],sibling_order=a[2],pbs=a[3])
                 for b,a in zip(current,restore) if b!=a]
        return dict(revision=rev+1,changed=True,changedRows=changes,
                    page=row[3]+1,**_history_flags(conn,new_cursor))
    except Exception:
        conn.rollback();raise
    finally:conn.close()
