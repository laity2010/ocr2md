"""Lab OCR MD line table: one SQLite row per CM6 source line, including blank lines.

Non-destructive first initialization from reviewed Block order.  Thereafter
only CM6-authored splice batches change this table; MinerU remains immutable.
"""
from __future__ import annotations
import hashlib
import json
import re
import sqlite3
import uuid
from contextlib import closing
from pathlib import Path
from v6_lab_ocr_store import _db, existing_info, OCRImportError
from v6_lab_ocr_cm_view import ensure_cm_view
from v6_lab_ocr_formula import display_equation

MAX_LINES = 40000
MAX_INSERT = 16000
MAX_CHARS = 2_000_000
MD_TABLES = ('md_line', 'md_meta', 'md_receipt')


def _object_tables(db):
    return {x[0] for x in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}


def _check_signature(db, book):
    info = existing_info(book)
    if not info or not info['signature']:
        raise OCRImportError('需要先导入无损 MinerU 基础表')
    row = db.execute('SELECT source_fingerprint FROM md_meta WHERE id=1').fetchone()
    if not row or row[0] != info['signature']:
        raise OCRImportError('MD 来源指纹与 MinerU 不一致；拒绝覆盖人工校正')
    return row[0]


def _span_text(block):
    fragments = []
    for line in block.get('lines') or []:
        if not isinstance(line, dict):
            continue
        pieces = []
        for span in line.get('spans') or []:
            if not isinstance(span, dict):
                continue
            if isinstance(span.get('html'), str):
                pieces.append(span['html'])
            elif isinstance(span.get('image_path'), str):
                path = span['image_path'].replace('>', '%3E')
                pieces.append('![image](<' + path + '>)')
            elif isinstance(span.get('content'), str):
                pieces.append(span['content'])
        if pieces:
            fragments.append(''.join(pieces))
    return fragments


def _markdown_block(row):
    """Conservative reviewed-atom projection; no raw-JSON field is rewritten."""
    try:
        data = json.loads(row['block_json'])
        if not isinstance(data, dict):
            raise ValueError('block_json is not an object')
    except (ValueError, TypeError) as error:
        raise OCRImportError('Block JSON 无法投影 Markdown: ' + str(row['block_id'])) from error
    typ = str(row['block_type'] or '')
    pieces = _span_text(data)
    text = ('\n'.join(pieces) if typ in ('table', 'table_body', 'table_caption',
                                         'image', 'image_body', 'chart', 'chart_body')
            else ' '.join(pieces))
    if typ == 'title':
        level = data.get('level', data.get('text_level'))
        depth = level if type(level) is int and 1 <= level <= 6 else 1
        return '#' * depth + ' ' + text if text else ''
    if typ == 'interline_equation':
        return display_equation(data)
    # Unmapped types with OCR content retain that content, rather than
    # silently deleting it.  Unconvertible metadata stays in the raw source.
    return text


def _ordered_review_blocks(db):
    db.row_factory = sqlite3.Row
    kinds = _object_tables(db)
    if 'block' not in kinds and not db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='view' AND name='block'").fetchone():
        raise OCRImportError('请先初始化 Block VIEW，再生成 MD')
    cols = {r[1] for r in db.execute("PRAGMA table_info('block')")}
    archived = 'absorbed_into_block_id' if 'absorbed_into_block_id' in cols else 'NULL'
    rows = [dict(r) for r in db.execute(
        "SELECT block_id,pbs,global_page,parent_block_id,sibling_order,"
        "block_type,block_json," + archived + " AS absorbed_into_block_id "
        "FROM block WHERE block_group='para_blocks' ORDER BY block_id")]
    if not rows or len(rows) > MAX_LINES:
        raise OCRImportError('Block 数量为空或超过 MD 初始化上限')
    active = {r['block_id']: r for r in rows if r['absorbed_into_block_id'] is None}
    children = {}
    for r in active.values():
        parent = r['parent_block_id']
        if parent is not None and parent not in active:
            raise OCRImportError('Block 父子关系不完整，拒绝生成错序 MD')
        children.setdefault(parent, []).append(r)
    def rank(r):
        match = re.match(r'^p(\d+)b(\d+)', str(r['pbs'] or ''))
        return (int(match[1]) if match else r['global_page'] + 1,
                int(match[2]) if match else r['sibling_order'],
                r['sibling_order'], r['block_id'])
    for parent, group in children.items():
        if parent is None:
            group.sort(key=rank)
        else:
            group.sort(key=lambda x:(x['sibling_order'],x['block_id']))
    ordered, seen = [], set()
    def walk(r):
        key = r['block_id']
        if key in seen:
            raise OCRImportError('Block 层级存在重复或循环')
        seen.add(key)
        ordered.append(r)
        for child in children.get(key, []):
            walk(child)
    for r in children.get(None, []):
        walk(r)
    if len(ordered) != len(active):
        raise OCRImportError('Block 层级存在循环或缺失根节点')
    return ordered


def project_md_lines(blocks):
    """Return contiguous numbered MD rows, including every blank/EOF line."""
    result = []
    last_owner = None
    for block in blocks:
        # Children of the same top-level parent are contiguous. A root-group
        # separator is a real physical MD row, owned by the preceding block.
        # Its emptiness is formatting, NEVER the authority for block identity.
        if block['parent_block_id'] is None and result:
            result.append({'line_id':uuid.uuid4().hex,
                           'block_id':last_owner,'text':''})
        body = _markdown_block(block).replace('\r\n','\n')
        if '\r' in body:
            body = body.replace('\r', '\n')
        if body:
            for line in body.split('\n'):
                result.append({'line_id':uuid.uuid4().hex,
                               'block_id':block['block_id'], 'text':line})
            last_owner = block['block_id']
    # Trailing LF is represented by a last physical blank row, not hidden
    # serialization logic. Contentless logical blocks need no dummy MD line.
    result.append({'line_id':uuid.uuid4().hex,'block_id':last_owner,'text':''})
    for index, row in enumerate(result, 1):
        row['line_no'] = index
    if len(result) > MAX_LINES:
        raise OCRImportError('MD 转换后的行数超过上限，拒绝不完整文稿')
    return result


def initialize_md(book:Path) -> dict:
    info = existing_info(book)
    if not info:
        raise OCRImportError('尚未初始化无损 MinerU 基础表')
    with closing(sqlite3.connect(_db(book),timeout=30)) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            existing = _object_tables(db).intersection(MD_TABLES)
            if existing:
                if existing != set(MD_TABLES):
                    raise OCRImportError('MD 表结构不完整，拒绝自动重建或覆盖')
                _check_signature(db,book)
                # Add only a read-only SQL view. Never regenerate existing MD
                # or touch its saved LineID/BlockID/text/revision.
                ensure_cm_view(db)
                db.commit()
                return {**read_md(book),'status':'existing'}
            blocks = _ordered_review_blocks(db)
            generated = project_md_lines(blocks)
            db.execute('''CREATE TABLE md_line(
               line_id TEXT PRIMARY KEY,
               line_no INTEGER NOT NULL UNIQUE,
               block_id INTEGER,
               text TEXT NOT NULL
            )''')
            db.execute('''CREATE TABLE md_meta(
               id INTEGER PRIMARY KEY CHECK(id=1),
               revision INTEGER NOT NULL,
               source_fingerprint TEXT NOT NULL
            )''')
            db.execute('''CREATE TABLE md_receipt(
               request_id TEXT PRIMARY KEY,
               payload_hash TEXT NOT NULL,
               response_json TEXT NOT NULL
            )''')
            db.executemany('INSERT INTO md_line(line_id,line_no,block_id,text) VALUES(?,?,?,?)',
                [(r['line_id'],r['line_no'],r['block_id'],r['text']) for r in generated])
            db.execute('INSERT INTO md_meta VALUES (1,0,?)',(info['signature'],))
            ensure_cm_view(db)
            db.commit()
            return {'status':'created','revision':0,'rows':generated,'total':len(generated)}
        except Exception:
            db.rollback()
            raise


def read_md(book:Path) -> dict:
    if not existing_info(book):
        raise OCRImportError('尚未初始化 MinerU')
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=10)) as db:
        db.row_factory = sqlite3.Row
        known = _object_tables(db).intersection(MD_TABLES)
        if not known:
            return {'status':'missing','revision':None,'rows':[],'total':0}
        if known != set(MD_TABLES):
            raise OCRImportError('MD 表结构不完整，拒绝无提示自动修复')
        _check_signature(db,book)
        meta = db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()
        if not meta:
            raise OCRImportError('MD 版本不存在')
        # An already-edited legacy book without cm_view remains readable
        # without an automatic GET-side SQLite schema mutation.
        from_view=db.execute("SELECT type FROM sqlite_master WHERE name='cm_view'").fetchone()
        source='cm_view' if from_view and from_view['type']=='view' else 'md_line'
        records = [dict(r) for r in db.execute(
            f'SELECT line_id,line_no,block_id,text FROM {source} ORDER BY line_no')]
        if not records or len(records)>MAX_LINES or any(
            r['line_no']!=idx or '\n' in r['text'] or '\r' in r['text']
            for idx,r in enumerate(records,1)):
            raise OCRImportError('MD 行表不连续或含多行文本，拒绝加载')
        return {'status':'ready','revision':meta['revision'],
                'rows':records,'total':len(records)}


def persist_md_splice(book:Path, expected_revision, request_id, start,
                      delete_count, inserted, block_revision=None):
    """CAS/idempotent splice; only touched rows and shifted suffix are written."""
    if type(expected_revision) is not int or expected_revision<0:
        raise OCRImportError('MD 版本号无效')
    if block_revision is not None and (type(block_revision) is not int or block_revision<0):
        raise OCRImportError('MD 所属 Block 关系版本无效')
    if not isinstance(request_id,str) or not re.fullmatch(r'[a-zA-Z0-9-]{8,80}',request_id):
        raise OCRImportError('MD 批次ID无效')
    if type(start) is not int or start<1 or type(delete_count) is not int or delete_count<0:
        raise OCRImportError('MD 范围无效')
    if not isinstance(inserted,list) or len(inserted)>MAX_INSERT:
        raise OCRImportError('MD 批次插入行超出限制')
    total_chars = 0
    known_ids = set()
    for row in inserted:
        if not isinstance(row,dict) or not isinstance(row.get('line_id'),str) or not re.fullmatch(
             r'[a-zA-Z0-9_:-]{1,100}',row['line_id']):
            raise OCRImportError('MD 行ID无效')
        if row['line_id'] in known_ids:
            raise OCRImportError('MD 批次存在重复行ID')
        known_ids.add(row['line_id'])
        if row.get('block_id') is not None and (type(row['block_id']) is not int or row['block_id']<1):
            raise OCRImportError('MD 的 BlockID 无效')
        text = row.get('text')
        if not isinstance(text,str) or '\n' in text or '\r' in text:
            raise OCRImportError('MD 每行不能包含换行符')
        total_chars += len(text)
    if total_chars>MAX_CHARS:
        raise OCRImportError('MD 批次文本超出上限')
    canonical = json.dumps([expected_revision,start,delete_count,inserted],
                            sort_keys=True,ensure_ascii=False,separators=(',',':'))
    digest=hashlib.sha256(canonical.encode('utf-8')).hexdigest()
    with closing(sqlite3.connect(_db(book),timeout=30)) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            receipt=db.execute('SELECT payload_hash,response_json FROM md_receipt WHERE request_id=?',
                               (request_id,)).fetchone()
            if receipt:
                if receipt[0]!=digest:
                    raise OCRImportError('MD 相同批次编号携带不同正文，拒绝重复应用')
                db.commit()
                return json.loads(receipt[1])
            (revision,) = db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()
            if revision != expected_revision:
                raise OCRImportError('MD 版本冲突：已有另一会话写入，CM 未保存的修改不得覆盖')
            if block_revision is not None:
                snapshot=db.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone() if (
                    'block_edit_meta' in _object_tables(db)) else None
                current_block_revision=snapshot[0] if snapshot else 0
                if block_revision!=current_block_revision:
                    raise OCRImportError('MD 所属 Block 版本冲突：已有外部结构改动，拒绝覆盖')
            count=db.execute('SELECT COUNT(*) FROM md_line').fetchone()[0]
            if start>count+1 or start+delete_count>count+1 or count-delete_count+len(inserted)<1:
                raise OCRImportError('MD 修改区间越界')
            if count-delete_count+len(inserted)>MAX_LINES:
                raise OCRImportError('MD 行数超出上限')
            # Block provenance is required for every non-null reference, even
            # though the referenced Block may come from a SQLite VIEW.
            for block_id in {r['block_id'] for r in inserted if r['block_id'] is not None}:
                if not db.execute("SELECT 1 FROM block WHERE block_id=? AND block_group='para_blocks'",
                                  (block_id,)).fetchone():
                    raise OCRImportError('MD 的 BlockID 不属于当前书籍')
            suffix = [r[0:2] for r in db.execute(
                'SELECT line_id,line_no FROM md_line WHERE line_no>=? ORDER BY line_no',
                (start+delete_count,))]
            # Move suffix to a disjoint negative temporary namespace, so
            # unique(line_no) never collides while shifting any number of rows.
            db.executemany('UPDATE md_line SET line_no=? WHERE line_id=?',
                           [(-line_no,line_id) for line_id,line_no in suffix])
            db.execute('DELETE FROM md_line WHERE line_no>=? AND line_no<?',
                       (start,start+delete_count))
            db.executemany('INSERT INTO md_line(line_id,line_no,block_id,text) VALUES(?,?,?,?)',
                [(r['line_id'],start+i,r['block_id'],r['text'])
                 for i,r in enumerate(inserted)])
            change=len(inserted)-delete_count
            db.executemany('UPDATE md_line SET line_no=? WHERE line_id=?',
                [(old_number+change,line_id) for line_id,old_number in suffix])
            ensure_cm_view(db)
            db.execute('UPDATE md_meta SET revision=? WHERE id=1',(revision+1,))
            response={'status':'saved','revision':revision+1,
                      'total':count+change,'inserted':len(inserted),'deleted':delete_count}
            db.execute('INSERT INTO md_receipt VALUES (?,?,?)',
                       (request_id,digest,json.dumps(response,ensure_ascii=False)))
            db.commit()
            return response
        except Exception:
            db.rollback()
            raise
