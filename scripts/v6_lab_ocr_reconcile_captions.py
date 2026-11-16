#!/usr/bin/env python3
"""Explicit one-time reconcile of missing continued captions in reviewed MD.

Default: read-only inspection. --apply requires a NEW backup path, validates
stable BlockID/review/MD CAS revisions, refreshes only the Block VIEW, then
splices missing physical Markdown lines. No full MD/Block regeneration.
"""
from __future__ import annotations
import argparse
import json
import sqlite3
from pathlib import Path

from v6_lab_ocr_block_view import refresh_block_view
from v6_lab_ocr_md import project_md_lines, persist_md_splice
from v6_lab_ocr_store import _db, OCRImportError


def _connection(book):
    db=sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True,timeout=10)
    db.row_factory=sqlite3.Row
    return db


def plan_caption_repairs(book:Path):
    """Plan only unambiguous caption gaps bounded by existing MD separators."""
    with _connection(book) as db:
        cols={c[1] for c in db.execute("PRAGMA table_info('block')")}
        if 'content_source' not in cols:
            raise OCRImportError('Block VIEW 尚未采用修复规则，请先刷新')
        candidates=[dict(x) for x in db.execute('''SELECT block_id,pbs,global_page,
               parent_block_id,block_type,block_json
               FROM block WHERE content_source='preproc_caption' ORDER BY global_page,block_id''')]
        md=[dict(x) for x in db.execute('''SELECT line_no,line_id,block_id,text
            FROM md_line ORDER BY line_no''')]
        version=db.execute('SELECT revision FROM md_meta WHERE id=1').fetchone()[0]
        block_table=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='block_edit_meta'").fetchone()
        block_rev=(db.execute('SELECT revision FROM block_edit_meta WHERE id=1').fetchone()
                   if block_table else None)
        block_version=block_rev[0] if block_rev else 0
        plans=[]
        for c in candidates:
            bid=c['block_id']
            # Existing manually edited rows win, even when they differ from OCR.
            if any(r['block_id']==bid and r['text'] for r in md):continue
            projected=project_md_lines([c])
            content=[r['text'] for r in projected if r['text']]
            if not content or any(len(t)>20000 for t in content):
                continue
            # Same-page subsequent logical blocks provide a stable insertion
            # bound. No speculative placement into rearranged/damaged MD.
            future={r[0] for r in db.execute('''SELECT block_id FROM block
                WHERE global_page=? AND block_id>? AND absorbed_into_block_id IS NULL''',
                (c['global_page'],bid))}
            next_lines=[r for r in md if r['block_id'] in future and r['text']]
            if not next_lines:continue
            next_no=min(r['line_no'] for r in next_lines)
            if next_no<3 or md[next_no-2]['text'] or md[next_no-3]['text']:
                # Require two existing empty separators, as in a skipped
                # intermediate root. Without them, do not risk MD ordering.
                continue
            before=[r for r in md[:next_no-1] if r['text']]
            if not before or before[-1]['block_id']==bid:continue
            start=next_no-1  # Preserve the final blank before next root.
            plans.append({'block_id':bid,'pbs':c['pbs'],'start':start,
                          'texts':content,'next_line_id':md[next_no-1]['line_id'],
                          'preceding_line_id':before[-1]['line_id']})
        if len(plans)>1:
            # Multi-edit requires a coherent batch ordering and recheck.
            raise OCRImportError('发现多处续表缺失，请逐处审核插入位置')
        return {'revision':version,'block_revision':block_version,'plans':plans}


def apply_caption_repairs(book:Path,backup:Path):
    if backup.exists():raise OCRImportError('备份路径已存在，拒绝覆盖')
    backup.parent.mkdir(parents=True,exist_ok=True)
    # SQLite online backup: preserves committed WAL state, not an unsafe copy.
    with _connection(book) as src,sqlite3.connect(backup) as dst:
        src.backup(dst)
    refresh=refresh_block_view(book)
    plan=plan_caption_repairs(book)
    results=[]
    for item in plan['plans']:
        with _connection(book) as check:
            row=check.execute('SELECT line_id FROM md_line WHERE line_no=?',
                              (item['start']+1,)).fetchone()
            if not row or row['line_id']!=item['next_line_id']:
                raise OCRImportError('MD 插入锚点已经变化，拒绝提交')
        items=[{'line_id':f'recovered-caption-{item["block_id"]}-{index}',
                'block_id':item['block_id'],'text':value}
               for index,value in enumerate(item['texts'])]
        result=persist_md_splice(book,plan['revision'],
             f'caption-recover-{item["block_id"]}-{plan["revision"]}',
             item['start'],0,items,block_revision=plan['block_revision'])
        results.append({'pbs':item['pbs'],**result})
    return {'refresh':refresh,'backup':str(backup),'repaired':results}


def main():
    cli=argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--book',type=Path,required=True)
    cli.add_argument('--apply',action='store_true')
    cli.add_argument('--backup',type=Path)
    args=cli.parse_args()
    book=args.book.resolve()
    if args.apply:
        if not args.backup:cli.error('--apply 必须指定新备份文件 --backup')
        print(json.dumps(apply_caption_repairs(book,args.backup),ensure_ascii=False))
    else:
        print(json.dumps(plan_caption_repairs(book),ensure_ascii=False,indent=2))

if __name__=='__main__':main()
