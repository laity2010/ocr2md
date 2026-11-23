"""V2 logical source: every original para element, with NO Markdown synthesis.

The immutable mineru_base keeps all original JSON. A para root is its own s0
logical row. Its immediate typed MinerU parts become s1..sN child rows with
stable logical IDs. Both are real rows in the existing logical_block table.
"""
from __future__ import annotations
from dataclasses import dataclass
import json

@dataclass(frozen=True)
class LogicalRow:
    logical_id: int
    base_blockid: int
    parent_id: int | None
    logical_order: int
    markdown_text: str
    block_type: str = ''
    p: int | None = None
    b: int | None = None
    s: int | None = None

def raw_element_text(element: dict) -> str:
    """Only this original element's own span values, preserving source order.

    Content, HTML and image_path are OCR fields. No Markdown prefixes, image
    links, equation fences or concatenation of distinct child element types.
    A line boundary is represented as LF, not an invented separating space.
    """
    if not isinstance(element, dict):
        raise ValueError('原始 MinerU 元素不是对象')
    result=[]
    for line in element.get('lines', []) or []:
        if not isinstance(line, dict):raise ValueError('原始 MinerU line 不是对象')
        spans=line.get('spans', []) or []
        if not isinstance(spans,list):raise ValueError('原始 MinerU spans 不是数组')
        parts=[]
        for span in spans:
            if not isinstance(span,dict):raise ValueError('原始 MinerU span 不是对象')
            for key in ('content','html','image_path'):
                value=span.get(key)
                if isinstance(value,str) and value:
                    parts.append(value)
                    break
        result.append(''.join(parts))
    return '\n'.join(result)

def initial_rows(base_rows) -> list[LogicalRow]:
    """Para-only roots plus immediate typed parts, deterministic IDs/order.

    Root logical IDs equal original BlockIDs. New children use IDs above ALL
    existing base IDs so no later root can collide with an earlier child.
    """
    records=list(base_rows);last=0
    for record in records:
        bid=record['blockid']
        if type(bid) is not int or bid<=last:
            raise ValueError('基础块 BlockID 必须为严格递增的正整数')
        last=bid
    next_child_id=last+1
    result=[]
    for record in records:
        if record['block_group']!='para_blocks':continue
        block=json.loads(record['block_json'])
        if not isinstance(block,dict):raise ValueError('基础块 JSON 必须是对象')
        bid=record['blockid'];typ=block.get('type','')
        if not isinstance(typ,str):raise ValueError('原始块类型无效')
        if 'block_type' in record.keys() and record['block_type']!=typ:
            raise ValueError('基础块类型与原始 JSON 不一致')
        result.append(LogicalRow(bid,bid,None,len(result)+1,raw_element_text(block),typ))
        subblocks=block.get('blocks',[]) or []
        if not isinstance(subblocks,list):raise ValueError('基础块子元素不是数组')
        for child in subblocks:
            if not isinstance(child,dict) or not isinstance(child.get('type'),str):
                raise ValueError('原始子元素缺少类型')
            if child.get('blocks'):
                raise ValueError('原始元素包含第三级块，禁止隐式合并或制造孙块')
            result.append(LogicalRow(next_child_id,bid,bid,len(result)+1,
                                     raw_element_text(child),child['type']))
            next_child_id+=1
    return result

def validate_initial(rows: list[LogicalRow], base_ids: set[int]) -> None:
    """All para roots exist once; children stay directly below their root."""
    roots=[r for r in rows if r.parent_id is None]
    if len(roots)!=len(base_ids):raise ValueError('逻辑父块数量与 para 基础块数量不相等')
    if {r.base_blockid for r in roots}!=base_ids:
        raise ValueError('逻辑父块来源覆盖不完整或重复')
    if any(r.logical_id!=r.base_blockid for r in roots):
        raise ValueError('初始父块 logical_id 必须与基础 BlockID 一致')
    if len({r.logical_id for r in rows})!=len(rows):
        raise ValueError('初始逻辑 ID 重复')
    if [r.logical_order for r in rows]!=list(range(1,len(rows)+1)):
        raise ValueError('逻辑块顺序不连续')
    root_ids={r.logical_id for r in roots}
    if any(r.parent_id not in root_ids or r.base_blockid!=r.parent_id
           for r in rows if r.parent_id is not None):
        raise ValueError('初始逻辑子块必须属于同一个基础父块，禁止孙块')
    if any(not isinstance(r.markdown_text,str) or not isinstance(r.block_type,str)
           for r in rows):raise ValueError('初始逻辑文本与类型必须明确')
