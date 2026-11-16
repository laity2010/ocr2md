"""One-time, reviewed-safe addition of native $...$ to existing MinerU inline math.

Pure read-only plan by default. --apply requires an unused, full SQLite online
backup and an unmodified MD/Block revision. Do not regenerate the document or
recreate a SQL table. Only exact original-source paragraphs are eligible.
"""
from __future__ import annotations
import argparse
import json
import sqlite3
from contextlib import closing
from pathlib import Path

from v6_lab_ocr_store import _db, OCRImportError
from v6_lab_ocr_md import _check_signature, _span_text, _inline_math


def _texts(block):
    # For the one-MD-line text blocks handled by this migration, original
    # MinerU joins physical OCR lines with spaces, not hard newlines.
    return (' '.join(_span_text(block, inline_math=False)),
            ' '.join(_span_text(block, inline_math=True)))


def plan_inline_math(book: Path) -> dict:
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='md_line'").fetchone():
            raise OCRImportError('需要先有 MD 行表，迁移不能初始化或重建现有 MD')
        _check_signature(db,book)
        md_revision = db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()[0]
        block_meta = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='block_edit_meta'").fetchone()
        block_revision = (db.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone()[0]
                          if block_meta else 0)
        updates,skipped,already = [],[],[]
        for row in db.execute('''SELECT block_id,pbs,block_type,block_json
                              FROM block WHERE block_group='para_blocks'
                              AND span_types LIKE '%inline_equation%' ORDER BY block_id'''):
            block = json.loads(row['block_json'])
            count = sum(1 for line in block.get('lines',[]) for span in line.get('spans',[])
                        if span.get('type')=='inline_equation')
            if count == 0:continue
            original,projected = _texts(block)
            old = [dict(x) for x in db.execute('''SELECT line_no,line_id,block_id,text
                  FROM md_line WHERE block_id=? AND text<>'' ORDER BY line_no''',
                  (row['block_id'],))]
            detail={'block_id':row['block_id'],'pbs':row['pbs'],'formula_count':count}
            if row['block_type'] not in ('text','ref_text') or len(old)!=1 or not projected:
                skipped.append({**detail,'reason':'unsupported block shape / non-convertible span'})
            elif old[0]['text']==projected:
                already.append(detail)
            elif projected==original:
                skipped.append({**detail,'reason':'inline formula cannot safely be delimited'})
            elif old[0]['text']==original:
                updates.append({**detail,'line_no':old[0]['line_no'],
                                'line_id':old[0]['line_id'], 'old':original,'new':projected})
            else:
                skipped.append({**detail,'reason':'human-reviewed text differs; no guessing'})
        return {'revision':md_revision,'blockRevision':block_revision,
                'updates':updates,'already':already,'skipped':skipped,
                'pending':bool(updates),
                'formula_count':sum(x['formula_count'] for x in updates),
                'updated_lines':len(updates)}


def apply_inline_math(book: Path, backup: Path) -> dict:
    plan=plan_inline_math(book)
    if not plan['updates']:
        return {**plan,'migrated':False,'backup':None}
    if backup.exists():raise OCRImportError('备份路径已存在，拒绝覆盖')
    backup.parent.mkdir(parents=True,exist_ok=True)
    # SQLite online backup makes a consistent snapshot without changing the
    # user's live DB. Do not overwrite a prior recovery point.
    with closing(sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)) as src:
        with closing(sqlite3.connect(backup)) as dest:
            src.backup(dest)
    with closing(sqlite3.connect(_db(book),timeout=30)) as db:
        try:
            db.execute('BEGIN IMMEDIATE')
            _check_signature(db,book)
            current=db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()[0]
            if current!=plan['revision']:
                raise OCRImportError('MD 版本已变；拒绝用过期迁移计划覆盖当前编辑')
            exists=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='block_edit_meta'").fetchone()
            block_revision=(db.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone()[0]
                            if exists else 0)
            if block_revision!=plan['blockRevision']:
                raise OCRImportError('Block 版本已变；拒绝用过期迁移计划修改正文')
            for row in plan['updates']:
                check=db.execute('''SELECT line_no,block_id,text FROM md_line WHERE line_id=?''',
                                 (row['line_id'],)).fetchone()
                if check!=(row['line_no'],row['block_id'],row['old']):
                    raise OCRImportError('MD 源码行已被修改；取消全部公式迁移')
                # Refuse a changed source block even when an upstream writer
                # failed to increment Block revision.
                block=db.execute('SELECT block_json FROM block WHERE block_id=?',
                                 (row['block_id'],)).fetchone()
                if not block or _texts(json.loads(block[0]))!=(row['old'],row['new']):
                    raise OCRImportError('MinerU 公式来源已变；取消全部迁移')
            for row in plan['updates']:
                change=db.execute('''UPDATE md_line SET text=?
                   WHERE line_id=? AND line_no=? AND block_id=? AND text=?''',
                   (row['new'],row['line_id'],row['line_no'],row['block_id'],row['old']))
                if change.rowcount!=1:raise OCRImportError('原子 MD 行更新失败')
            db.execute('UPDATE md_meta SET revision=revision+1 WHERE id=1')
            if db.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise OCRImportError('SQLite 完整性检查失败')
            db.commit()
        except Exception:
            db.rollback()
            raise
    return {**plan,'migrated':True,'backup':str(backup),
            'newRevision':plan['revision']+1}


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--book',required=True,type=Path)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup',type=Path)
    args=parser.parse_args()
    if args.apply:
        if not args.backup:parser.error('--backup is mandatory with --apply')
        report=apply_inline_math(args.book.resolve(),args.backup)
    else:report=plan_inline_math(args.book.resolve())
    print(json.dumps({k:([{x:y for x,y in item.items() if x not in ('old','new')}
                          for item in v] if k in ('updates','skipped','already') else v)
                      for k,v in report.items()},ensure_ascii=False,indent=2))
