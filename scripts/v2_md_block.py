"""WP10: immutable OCR reference -> one initial editable Markdown block.

Raw Block is a read-only projection of mineru_base (base ID + raw_path),
never copied into the logical table. The only stored working text is md_block.
"""
from __future__ import annotations
import json
from v2_logical_contract import raw_element_text


def raw_bindings(base_rows):
    """Map original WP09 logical IDs to stable (base ID, path, raw element).

    IDs for original direct children were allocated above the *entire* base
    inventory. Later manual logical blocks have no fabricated original path.
    """
    records=list(base_rows)
    max_id=max((r['blockid'] for r in records),default=0)
    next_child=max_id+1
    result={}
    for row in records:
        if row['block_group']!='para_blocks':continue
        obj=json.loads(row['block_json'])
        root=row['blockid']
        result[root]=(root,'$',obj)
        for i,child in enumerate(obj.get('blocks',[]) or []):
            result[next_child]=(root,f'$.blocks[{i}]',child)
            next_child+=1
    return result


def raw_at(block_json,path):
    """Only '$' or a direct JSON blocks[n] path is a valid raw reference."""
    root=json.loads(block_json) if isinstance(block_json,str) else block_json
    if path=='$':return root
    if isinstance(path,str) and path.startswith('$.blocks[') and path.endswith(']'):
        part=path[9:-1]
        if part.isdecimal() and str(int(part))==part:
            blocks=root.get('blocks',[])
            index=int(part)
            if isinstance(blocks,list) and index<len(blocks):return blocks[index]
    return None


def initial_md(raw,kind,element):
    """Render a single original element; never merge sibling OCR elements."""
    if not isinstance(raw,str) or not isinstance(kind,str):raise ValueError('OCR 文本类型无效')
    if not raw:return ''
    if kind=='title':
        level=element.get('level',1)
        level=level if isinstance(level,int) and 1<=level<=6 else 1
        return '#'*level+' '+raw
    if kind in ('image_body','image'):
        # Raw paths may contain spaces or closing brackets: angle brackets
        # keep the value stable, backslashes must not change its meaning.
        return '![](<'+raw.replace('>','%3E')+'>)'
    if kind=='interline_equation':
        return '$$\n'+raw+'\n$$'
    if kind=='inline_equation':
        return '$'+raw+'$'
    if kind in ('table_caption','table_body','chart_caption','chart_body',
                'image_caption','image_body_caption'):
        # Each typed child owns its own Markdown syntax newline. WP08 never
        # injects a separator between children: without this LF, adjacent
        # caption text and a <table> would concatenate on one source line and
        # prevent the V1 Markdown renderer from recognizing block HTML.
        return raw if raw.endswith('\n') else raw+'\n'
    if kind in ('table_footnote','chart_footnote'):
        # A single leading LF belongs to THIS child. It terminates the
        # preceding block-HTML parser before the human-readable footnote.
        return raw if raw.startswith('\n') else '\n'+raw
    # Table captions, original HTML, footnotes and paragraphs are distinct
    # logical rows. No synthetic heading/content merge or extra separators.
    return raw
