"""Derived-only source links for confirmed MinerU cross-page table merges.

No OCR bytes or reviewed identity are changed. A link references an immutable
preproc JSON node; a shadow marks para content relocated onto the following
page. Fail closed: a link is created only for a uniquely, exactly proven merge.
"""
from __future__ import annotations
import json
import re
import hashlib
from collections import defaultdict

LINK_SCHEMA = '''CREATE TABLE block_source_link (
 block_id INTEGER PRIMARY KEY,
 mode TEXT NOT NULL CHECK(mode IN ('preproc','shadow')),
 source_root_id INTEGER REFERENCES minerujson(id),
 source_json_path TEXT,
 reason TEXT NOT NULL,
 CHECK((mode='preproc' AND source_root_id IS NOT NULL AND source_json_path IS NOT NULL)
    OR (mode='shadow' AND source_root_id IS NULL AND source_json_path IS NULL))
)'''


def _children(root,kind):
    if not isinstance(root,dict):return []
    return [(i,c) for i,c in enumerate(root.get('blocks',[])) if c.get('type')==kind]


def _child(root,kind,bbox=None):
    items=[(i,c) for i,c in _children(root,kind) if bbox is None or c.get('bbox')==bbox]
    return items[0] if len(items)==1 else None


def _span_field(node,field):
    values=[]
    for line in node.get('lines',[]):
        for span in line.get('spans',[]):
            if isinstance(span.get(field),str):values.append(span[field])
    return ''.join(values) if field=='html' else ' '.join(values)


def _table_rows(node):
    text=_span_field(node,'html')
    if not text.startswith('<table>') or not text.endswith('</table>'):
        return None
    rows=re.findall(r'<tr>.*?</tr>',text,re.S)
    if not rows or '<table>'+''.join(rows)+'</table>'!=text:
        return None
    return rows


def _merged_exact(previous,following,merged):
    a,b,m=map(_table_rows,(previous,following,merged))
    if not a or not b or not m or m==a or m==b:return False
    matches=[k for k in range(1,min(len(a),len(b)))
             if a[:k]==b[:k] and m==a+b[k:]]
    return len(matches)==1 and len(a)>matches[0] and len(b)>matches[0]


def _matching_root(roots,para):
    matches=[(i,p) for i,p in enumerate(roots) if
             p.get('type')==para.get('type') and p.get('bbox')==para.get('bbox')]
    return matches[0] if len(matches)==1 else None


def _is_deleted(node):
    return node.get('lines_deleted') is True and node.get('lines')==[]


def _source_links_for_pair(before,after,order,start_page,review,roots):
    """Return a list of links for one adjacent cross-page pair, if unique."""
    before_para=before.get('para_blocks',[])
    after_para=after.get('para_blocks',[])
    pairs=[]
    for bi,broot in enumerate(before_para):
        if broot.get('type')!='table':continue
        pb=_matching_root(before.get('preproc_blocks',[]),broot)
        if pb is None:continue
        pidx,prev_pre=pb
        b1=_child(broot,'table_body')
        a1=_child(prev_pre,'table_body')
        if b1 is None or a1 is None or b1[1].get('bbox')!=a1[1].get('bbox'):continue
        for ci,croot in enumerate(after_para):
            if croot.get('type')!='table':continue
            pc=_matching_root(after.get('preproc_blocks',[]),croot)
            if pc is None:continue
            cidx,cur_pre=pc
            b2=_child(croot,'table_body')
            a2=_child(cur_pre,'table_body')
            if b2 is None or a2 is None or b2[1].get('bbox')!=a2[1].get('bbox'):
                continue
            if not _is_deleted(b2[1]):continue
            if not _merged_exact(a1[1],a2[1],b1[1]):continue
            entries=[]
            def link(page,para_path,pre_page,pre_path,why):
                block_id=review.get((order,page,para_path))
                source_id=roots.get((order,pre_page,pre_path[0]))
                if block_id is None or source_id is None:return False
                path='$'+''.join(f'.blocks[{x}]' for x in pre_path[1:])
                entries.append((block_id,'preproc',source_id,path,why));return True
            def shadow(page,path):
                block_id=review.get((order,page,path))
                if block_id is None:return False
                entries.append((block_id,'shadow',None,None,'cross_page_relocated'))
                return True
            if not link(start_page,(bi,b1[0]),start_page,(pidx,a1[0]),'cross_page_split'):
                continue
            if not link(start_page+1,(ci,b2[0]),start_page+1,(cidx,a2[0]),'cross_page_split'):
                continue
            # The next page's continued caption is physically distinct.
            caption=_child(croot,'table_caption')
            original_caption=_child(cur_pre,'table_caption',caption[1].get('bbox')) if caption else None
            if caption and original_caption and _is_deleted(caption[1]) and original_caption[1].get('lines'):
                if not link(start_page+1,(ci,caption[0]),start_page+1,
                            (cidx,original_caption[0]),'cross_page_caption'):
                    continue
            # MinerU sometimes moves page 5 footnotes into page 4's para
            # table despite the page 4 preproc root having no footnote.
            prev_note=_child(broot,'table_footnote')
            current_note=_child(croot,'table_footnote')
            current_original=_child(cur_pre,'table_footnote',current_note[1].get('bbox')) if current_note else None
            if (prev_note and current_note and current_original and
                _child(prev_pre,'table_footnote') is None and
                _is_deleted(current_note[1]) and
                _span_field(prev_note[1],'content') and
                _span_field(prev_note[1],'content')==_span_field(current_original[1],'content')):
                if not shadow(start_page,(bi,prev_note[0])):continue
                if not link(start_page+1,(ci,current_note[0]),start_page+1,
                            (cidx,current_original[0]),'cross_page_footnote'):
                    continue
            pairs.append(entries)
    return pairs[0] if len(pairs)==1 else []


def derive_source_links(conn):
    """Pure derivation, no writes; keys rely only on immutable source pointers.

    Review may have human-modified PBS/relations. Only block_path and stable
    BlockID identify the underlying source node, never its visual label.
    """
    review={(row[0],row[1],tuple(map(int,row[2].split('.')))):row[3]
            for row in conn.execute('SELECT source_order,global_page,block_path,block_id FROM block_review')}
    roots={(row[0],row[1],row[2]):row[3] for row in conn.execute('''
        SELECT source_order,global_page,block_index,id FROM minerujson
        WHERE row_kind='block' AND block_group='preproc_blocks' ''')}
    found=defaultdict(list)
    offset=0
    for order,page_count,sha,raw in conn.execute('''SELECT source_order,source_page_count,source_sha256,original_bytes
        FROM minerujson WHERE row_kind='source' ORDER BY source_order'''):
        if not isinstance(raw,bytes) or hashlib.sha256(raw).hexdigest()!=sha:
            raise ValueError('original MinerU source integrity mismatch')
        pages=json.loads(raw)['pdf_info']
        if len(pages)!=page_count:raise ValueError('original source page count mismatch')
        for i in range(1,len(pages)):
            for result in _source_links_for_pair(pages[i-1],pages[i],order,offset+i-1,review,roots):
                found[result[0]].append(result)
        offset+=page_count
    # Never choose silently between conflicting source paths.
    return [values[0] for _,values in sorted(found.items()) if len(values)==1]


def rebuild_source_links(conn):
    conn.execute('DROP TABLE IF EXISTS block_source_link')
    conn.execute(LINK_SCHEMA)
    links=derive_source_links(conn)
    conn.executemany('''INSERT INTO block_source_link
        (block_id,mode,source_root_id,source_json_path,reason)
        VALUES (?,?,?,?,?)''',links)
    return len(links)
