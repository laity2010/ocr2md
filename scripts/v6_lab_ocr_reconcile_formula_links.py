"""Remove obsolete MinerU original-formula image *link rows* from existing MD.

Explicit one-shot migration. Dry-run by default; --apply requires a unique
SQLite online backup. The formula's own LaTeX/$$ and every other MD row,
LineID, numbering, BlockID, and immutable OCR record are preserved.
"""
from __future__ import annotations
import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path
from v6_lab_ocr_store import _db, OCRImportError
from v6_lab_ocr_md import _check_signature
from v6_lab_ocr_formula import display_equation


def plan_formula_links(book:Path)->dict:
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as db:
        db.row_factory=sqlite3.Row
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='md_line'").fetchone():
            raise OCRImportError('先初始化 MD 行表，禁止以迁移重建正文')
        _check_signature(db,book)
        rev=db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()[0]
        has_meta=db.execute("SELECT 1 FROM sqlite_master WHERE name='block_edit_meta' AND type='table'").fetchone()
        block_rev=(db.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone()[0]
                   if has_meta else 0)
        updates,already,skipped=[],[],[]
        for block in db.execute('''SELECT block_id,pbs,block_json,block_type
                     FROM block WHERE block_type='interline_equation'
                       AND block_group='para_blocks' ORDER BY block_id'''):
            bid=block['block_id']
            data=json.loads(block['block_json'])
            formula=display_equation(data)
            legacy=display_equation(data,legacy_links=True)
            if legacy==formula:continue
            expected=legacy.split('\n')
            keep=formula.split('\n')
            rows=[dict(r) for r in db.execute('''SELECT line_id,line_no,block_id,text
                  FROM md_line WHERE block_id=? AND text<>'' ORDER BY line_no''',(bid,))]
            current=[r['text'] for r in rows]
            note={'block_id':bid,'pbs':block['pbs']}
            if current==keep:
                already.append(note)
            elif current!=expected or len(keep)>=len(expected) or expected[:len(keep)]!=keep:
                skipped.append({**note,'reason':'公式源码行已经人工编辑或结构不一致，不删除'})
            elif any(not text.startswith('[原始公式图') for text in expected[len(keep):]):
                skipped.append({**note,'reason':'尾行并非纯公式图片链接，不删除'})
            else:
                for row in rows[len(keep):]:
                    updates.append({**note,'line_id':row['line_id'],
                                   'line_no':row['line_no'],'old':row['text']})
        return {'revision':rev,'blockRevision':block_rev,'updates':updates,
                'already':already,'skipped':skipped,'pending':bool(updates),
                'removed_link_count':len(updates)}


def apply_formula_links(book:Path,backup:Path)->dict:
    plan=plan_formula_links(book)
    if not plan['pending']:
        return {**plan,'migrated':False,'backup':None}
    if backup.exists():raise OCRImportError('备份文件已存在，拒绝覆盖')
    backup.parent.mkdir(parents=True,exist_ok=True)
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as source:
        with closing(sqlite3.connect(backup)) as dest:source.backup(dest)
    with closing(sqlite3.connect(_db(book),timeout=30)) as db:
        db.row_factory=sqlite3.Row
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            rev=db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()[0]
            if rev!=plan['revision']:raise OCRImportError('MD 版本已变化，停止删除链接')
            has_meta=db.execute("SELECT 1 FROM sqlite_master WHERE name='block_edit_meta' AND type='table'").fetchone()
            block_rev=(db.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone()[0]
                       if has_meta else 0)
            if block_rev!=plan['blockRevision']:
                raise OCRImportError('Block 版本已变化，停止删除链接')
            for row in plan['updates']:
                old=db.execute('''SELECT line_no,block_id,text FROM md_line WHERE line_id=?''',
                               (row['line_id'],)).fetchone()
                if old is None or tuple(old)!=(row['line_no'],row['block_id'],row['old']):
                    raise OCRImportError('公式图片链接行已变化，拒绝覆盖')
            # The original block JSON must still produce identical source
            # links; a revision-less OCR source change must not be ignored.
            for bid in {r['block_id'] for r in plan['updates']}:
                block=db.execute('SELECT block_json FROM block WHERE block_id=?',(bid,)).fetchone()
                if not block:raise OCRImportError('Block 已不存在')
                source=display_equation(json.loads(block[0]),legacy_links=True)
                for row in (r for r in plan['updates'] if r['block_id']==bid):
                    if row['old'] not in source.split('\n'):
                        raise OCRImportError('来源图链接已变化，取消迁移')
            for row in plan['updates']:
                updated=db.execute('''UPDATE md_line SET text='' WHERE
                       line_id=? AND line_no=? AND block_id=? AND text=?''',
                       (row['line_id'],row['line_no'],row['block_id'],row['old']))
                if updated.rowcount!=1:raise OCRImportError('公式图片链接 CAS 失败')
            db.execute('UPDATE md_meta SET revision=revision+1 WHERE id=1')
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise OCRImportError('SQLite 完整性验证失败')
            db.commit()
        except Exception:
            db.rollback();raise
    return {**plan,'migrated':True,'backup':str(backup),'newRevision':plan['revision']+1}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--book',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup',type=Path)
    a=parser.parse_args()
    if a.apply:
        if a.backup is None:parser.error('--backup is required with --apply')
        result=apply_formula_links(a.book.resolve(),a.backup)
    else:result=plan_formula_links(a.book.resolve())
    print(json.dumps({k:v if k not in ('updates',) else
      [{key:val for key,val in row.items() if key!='old'} for row in v]
      for k,v in result.items()},ensure_ascii=False,indent=2))
