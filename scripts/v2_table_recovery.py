"""WP15 · Original per-page MinerU table recovery, NO source mutation.

para_blocks can mark cross-page table child lines_deleted=true and move its
text to the previous page. preproc_blocks keeps that page's caption/HTML/note.
Use only matching immutable base rows (source, page, index, type, bbox), and
retain all logical IDs/PBS. SQL writes remain the existing optimistic md-commit.
"""
from __future__ import annotations
import json
from collections import defaultdict
from v2_logical_contract import raw_element_text


def _key(row, obj):
    bbox=obj.get('bbox')
    if not isinstance(bbox,list) or len(bbox)!=4 or any(type(n) not in (int,float) for n in bbox):
        return None
    index=obj.get('index')
    if not isinstance(index,int):return None
    return (row['source_path'],row['page_index'],obj.get('type'),index,tuple(bbox))


def _child_key(obj):
    bbox=obj.get('bbox')
    if not isinstance(bbox,list) or len(bbox)!=4:return None
    return (obj.get('type'),obj.get('index'),tuple(bbox))


def table_overrides(base_rows):
    """Return {(para base ID, '$.blocks[i]'): (per-page raw text, reason)}.

    No JSON, SQL or source files are modified. Unsupported/ambiguous matches
    are skipped. Non-table OCR blocks are never rewritten.
    """
    rows=list(base_rows)
    prelim=defaultdict(list)
    para=[]
    for row in rows:
        if row['block_group'] not in ('preproc_blocks','para_blocks'):continue
        obj=json.loads(row['block_json'])
        if not isinstance(obj,dict) or obj.get('type')!='table':continue
        key=_key(row,obj)
        if key is None:continue
        if row['block_group']=='preproc_blocks':prelim[key].append(obj)
        else:para.append((row,obj,key))
    # First match the same page and exact table geometry, not table title
    # similarity across pages. This prevents mixing similarly named tables.
    matched=[]
    result={}
    for row,original,key in para:
        pre=prelim.get(key,[])
        if len(pre)!=1:continue
        source=pre[0]
        source_children=defaultdict(list)
        for part in source.get('blocks',[]) or []:
            if isinstance(part,dict) and _child_key(part):
                source_children[_child_key(part)].append(part)
        matched.append((row,original,source,source_children))
        for i,child in enumerate(original.get('blocks',[]) or []):
            if not isinstance(child,dict):continue
            choices=source_children.get(_child_key(child),[])
            if len(choices)!=1:continue
            old,new=raw_element_text(child),raw_element_text(choices[0])
            if old!=new and new:
                result[(row['blockid'],f'$.blocks[{i}]')]=(new,'same-page-preproc')
    # MinerU sometimes duplicates a continued table's footnote into the
    # PREVIOUS page para table although the physical note belongs to the
    # continued page. Transfer only when next-page table body is explicitly
    # deleted in para, both preproc table headers match, and note bytes match.
    for row,original,source,source_children in matched:
        source_parts=source.get('blocks',[]) or []
        prev_bodies=[raw_element_text(c) for c in source_parts if c.get('type')=='table_body']
        if len(prev_bodies)!=1 or not prev_bodies[0].startswith('<table>'):continue
        for next_row,next_original,next_source,_ in matched:
            if next_row['source_path']!=row['source_path'] or next_row['page_index']!=row['page_index']+1:continue
            deleted=[c for c in next_original.get('blocks',[]) or [] if c.get('type')=='table_body' and c.get('lines_deleted') is True]
            next_bodies=[raw_element_text(c) for c in next_source.get('blocks',[]) or [] if c.get('type')=='table_body']
            if len(deleted)!=1 or len(next_bodies)!=1 or prev_bodies[0][:100]!=next_bodies[0][:100]:continue
            next_footnotes={raw_element_text(c) for c in next_source.get('blocks',[]) or [] if c.get('type')=='table_footnote'}
            for i,child in enumerate(original.get('blocks',[]) or []):
                if child.get('type')!='table_footnote' or _child_key(child) in source_children:continue
                note=raw_element_text(child)
                if note and note in next_footnotes:
                    result[(row['blockid'],f'$.blocks[{i}]')]=('', 'next-page-footnote')
    return result
