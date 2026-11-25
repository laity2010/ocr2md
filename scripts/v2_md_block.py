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


def single_line_md(text):
    """Only MD Block is normalized; original MinerU source stays byte exact."""
    if not isinstance(text,str):raise ValueError('OCR 文本类型无效')
    import re
    return re.sub(r'[ \t]*[\r\n]+[ \t]*',' ',text).strip()


def inline_math(text):
    """V1 native delimiters, preserving exact MinerU formula characters."""
    if not text or '\n' in text or '\r' in text:
        return text
    if text.startswith('$') and text.endswith('$') and not text.startswith('$$'):
        return text
    if any(ch == '$' and (i == 0 or text[i-1] != '\\')
           for i, ch in enumerate(text)):
        return text
    return '$' + text + '$'


def inline_span_projection(element):
    """Retain V2 raw-element text order; wrap only typed inline equation spans."""
    lines=[]
    for line in element.get('lines',[]) or []:
        parts=[]
        for span in line.get('spans',[]) or []:
            for key in ('content','html','image_path'):
                value=span.get(key)
                if isinstance(value,str) and value:
                    parts.append(inline_math(value) if key=='content' and span.get('type')=='inline_equation' else value)
                    break
        lines.append(''.join(parts))
    return '\n'.join(lines)


def initial_md(raw,kind,element):
    """A single original OCR element produces exactly one editable MD line."""
    if not isinstance(raw,str) or not isinstance(kind,str):raise ValueError('OCR 文本类型无效')
    # A table recovery override is not the original element's text.
    # Never discard recovered content by reprojecting a different element.
    if kind not in ('image_body','image','chart_body','inline_equation','interline_equation') and raw==raw_element_text(element):
        raw=inline_span_projection(element)
    raw=single_line_md(raw)
    if not raw:return ''
    if kind=='title':
        level=element.get('level',1)
        level=level if isinstance(level,int) and 1<=level<=6 else 1
        return '#'*level+' '+raw
    if kind in ('image_body','image','chart_body'):
        return '![](<'+raw.replace('>','%3E')+'>)'
    if kind=='interline_equation':
        # V1 Markdown renderer recognizes a whole-line $$formula$$ token.
        return '$$'+raw+'$$'
    if kind=='inline_equation':
        return inline_math(raw)
    # Table/html/footnote content uses its own logical line. No leading or
    # trailing LF is embedded; CM6 supplies exactly one LF between rows.
    return raw
