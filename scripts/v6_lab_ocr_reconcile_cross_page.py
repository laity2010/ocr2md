"""Explicit, CAS-safe reconciliation of a split cross-page table in edited MD.

Read-only unless called via apply_table_split; never regenerate edited MD.
"""
from pathlib import Path
import sqlite3, json, uuid
from v6_lab_ocr_store import _db,OCRImportError
from v6_lab_ocr_block_view import refresh_block_view
from v6_lab_ocr_md import _span_text,persist_md_splice

def connect(book):
    c=sqlite3.connect(f'file:{_db(book)}?mode=ro',uri=True)
    c.row_factory=sqlite3.Row
    return c

def plan_table_split(book):
    with connect(book) as db:
        links=[dict(row) for row in db.execute('''SELECT l.block_id,l.reason,b.global_page,b.parent_block_id,b.block_type
          FROM block_source_link l JOIN block b ON b.block_id=l.block_id ORDER BY b.global_page''')]
        before=[x for x in links if x['reason']=='cross_page_split' and x['block_type']=='table_body']
        after=[x for x in before if any(y['global_page']==x['global_page']-1 for y in before)]
        if len(after)!=1:return None
        tail=after[0];head=next(x for x in before if x['global_page']==tail['global_page']-1)
        def sibling(reason,page,parent):
            matches=[x for x in links if x['reason']==reason and x['global_page']==page and x['parent_block_id']==parent]
            return matches[0]['block_id'] if len(matches)==1 else None
        shadow=sibling('cross_page_relocated',head['global_page'],head['parent_block_id'])
        foot=sibling('cross_page_footnote',tail['global_page'],tail['parent_block_id'])
        cap=sibling('cross_page_caption',tail['global_page'],tail['parent_block_id'])
        if not all((shadow,foot,cap)):return None
        md=[dict(x) for x in db.execute('select line_no,line_id,block_id,text from md_line order by line_no')]
        if any(x['block_id'] in (tail['block_id'],foot) and x['text'] for x in md):return None
        def content(id):return [r for r in md if r['block_id']==id and r['text']]
        oldbody=content(head['block_id']);oldnote=content(shadow);captions=content(cap)
        if len(oldbody)!=1 or len(oldnote)!=1 or not captions:return None
        a,b=oldbody[0],oldnote[0]
        window=md[a['line_no']-1:captions[-1]['line_no']+1]
        if len(window)!=len(captions)+4:return None
        if window[0]['line_id']!=a['line_id'] or window[1]['line_id']!=b['line_id']:return None
        if window[2]['text'] or window[-1]['text']:return None
        if [r['line_id'] for r in window[3:-1]]!=[r['line_id'] for r in captions]:return None
        original=db.execute('''SELECT json_extract(m.block_json,r.source_json_path) FROM block_review r
          JOIN minerujson m ON m.id=r.source_root_id WHERE r.block_id=?''',(head['block_id'],)).fetchone()[0]
        if a['text']!='\n'.join(_span_text(json.loads(original))):return None
        def resolved(bid):
            row=db.execute('select block_json from block where block_id=?',(bid,)).fetchone()
            return '\n'.join(_span_text(json.loads(row[0]))) if row else ''
        first,last=resolved(head['block_id']),resolved(tail['block_id'])
        if not first or not last or first==a['text']:return None
        insert=[{**a,'text':first},{**window[2],'block_id':head['block_id']},
                *window[3:-1],{'line_id':f'crosspage-{tail["block_id"]}-{uuid.uuid4().hex}',
                 'block_id':tail['block_id'],'text':last},
                {**b,'block_id':foot},{**window[-1],'block_id':foot}]
        for row in insert:row.pop('line_no',None)
        meta=db.execute('select revision from md_meta where id=1').fetchone()[0]
        hasmeta=db.execute("select 1 from sqlite_master where name='block_edit_meta' and type='table'").fetchone()
        blockmeta=(db.execute('select revision from block_edit_meta where id=1').fetchone()
                   if hasmeta else None)
        return {'start':a['line_no'],'delete':len(window),'insert':insert,
                'revision':meta,'blockRevision':blockmeta[0] if blockmeta else 0,
                'before':head['block_id'],'after':tail['block_id'],'foot':foot}

def apply_table_split(book:Path,backup:Path):
    if backup.exists():raise OCRImportError('备份路径已存在，拒绝覆盖')
    backup.parent.mkdir(parents=True,exist_ok=True)
    with connect(book) as source,sqlite3.connect(backup) as dest:source.backup(dest)
    refreshed=refresh_block_view(book)
    p=plan_table_split(book)
    if not p:return {'refreshed':refreshed,'backup':str(backup),'migrated':False}
    result=persist_md_splice(book,p['revision'],
       f'crosspage-split-{p["before"]}-{p["after"]}-{p["revision"]}',
       p['start'],p['delete'],p['insert'],block_revision=p['blockRevision'])
    return {'refreshed':refreshed,'backup':str(backup),'migrated':True,
            'before':p['before'],'after':p['after'],'foot':p['foot'],**result}

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--book',type=Path,required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--backup',type=Path)
    a=parser.parse_args()
    if a.apply:
        if not a.backup:parser.error('--backup is required with --apply')
        result=apply_table_split(a.book.resolve(),a.backup)
    else:
        p=plan_table_split(a.book.resolve())
        result={k:v for k,v in p.items() if k!='insert'} if p else {'pending':False}
    print(json.dumps(result,ensure_ascii=False,indent=2))
