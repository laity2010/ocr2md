"""WP01 public, pure mapping contract for current V2 two-table data model.

One initial logical unit per FINAL MinerU para_block; never duplicate
preproc or discarded evidence as edited text. No filesystem/DB writes.
The six-column logical_block schema includes the current authoritative block_type;
future splits, joins and cross-page edits need separately audited contracts.
"""
from __future__ import annotations
from dataclasses import dataclass
import json
from urllib.parse import quote


@dataclass(frozen=True)
class LogicalRow:
    logical_id: int
    base_blockid: int
    parent_id: int | None
    logical_order: int
    markdown_text: str
    block_type: str = ''  # current logic; never infer from base after initialization
    p: int | None = None
    b: int | None = None
    s: int | None = None


def lines_text(block: dict) -> str:
    """Keep span ordering; space joins correspond to MinerU line boundaries."""
    lines=[]
    for line in block.get('lines', []) or []:
        spans=line.get('spans',[]) or []
        value=''.join(span['content'] for span in spans
                      if isinstance(span.get('content'),str))
        if value:lines.append(value)
    return ' '.join(lines)


def image_markdown(path: str) -> str:
    # Markdown destinations are not source filesystem paths or a download API.
    # Percent-escape characters that would terminate a Markdown link.
    return '![]('+quote(path,safe="/:?&=%#@+,$;~!*'[]")+')'


def project_block(block: dict) -> str:
    """A conservative readable MD projection; source JSON stays in mineru_base.

    This is NOT a claim of byte-reversible OCR-to-Markdown conversion, V1
    rendering parity, or preservation of invisible OCR layout evidence in MD.
    """
    kind=block.get('type')
    if kind=='title':
        depth=block.get('level')
        if not isinstance(depth,int):depth=1
        return '#' * min(6,max(1,depth))+' '+lines_text(block)
    if kind=='interline_equation':
        raw=lines_text(block)
        return '$$\n'+raw+'\n$$' if raw else ''
    if kind in ('table','chart','image'):
        sections=[]
        for child in block.get('blocks',[]) or []:
            # Native OCR child order; don't sort by category or invent missing text.
            media=[]
            for line in child.get('lines',[]) or []:
                for span in line.get('spans',[]) or []:
                    if kind=='table' and child.get('type')=='table_body' and isinstance(span.get('html'),str):
                        media.append(span['html'])
                    elif isinstance(span.get('image_path'),str):
                        media.append(image_markdown(span['image_path']))
            text=lines_text(child)
            if text:sections.append(text)
            sections.extend(media)
        return '\n\n'.join(sections)
    # Empty OCR blocks stay empty, not a fabricated paragraph or [OCR missing].
    return lines_text(block)


def initial_rows(base_rows) -> list[LogicalRow]:
    """Pure initialization, deterministic for identical MinerU base records.

    Input requires `blockid`, `block_group` and `block_json`; caller must
    supply the base records ordered by their globally assigned blockid.
    """
    result=[]
    seen=set()
    last=0
    for record in base_rows:
        blockid=record['blockid']
        if not isinstance(blockid,int) or blockid<=last:
            raise ValueError('基础块 BlockID 必须为严格递增的正整数')
        last=blockid
        if record['block_group']!='para_blocks':continue
        if blockid in seen:raise ValueError('重复基础块')
        seen.add(blockid)
        block=json.loads(record['block_json'])
        if not isinstance(block,dict):raise ValueError('基础块 JSON 必须为对象')
        kind=record['block_type'] if 'block_type' in record.keys() else block.get('type')
        block_type=kind if isinstance(kind,str) else ''
        result.append(LogicalRow(blockid,blockid,None,len(result)+1,project_block(block),block_type))
    return result


def validate_initial(rows: list[LogicalRow], base_ids: set[int]) -> None:
    """Validate no loss, duplication, impossible order or fabricated ancestry."""
    if len(rows)!=len(base_ids):raise ValueError('逻辑块与正文基础块数量不相等')
    if {r.base_blockid for r in rows}!=base_ids:
        raise ValueError('逻辑块来源覆盖不完整或重复')
    if [r.logical_order for r in rows]!=list(range(1,len(rows)+1)):
        raise ValueError('逻辑块顺序不连续')
    if any(r.logical_id!=r.base_blockid or r.parent_id is not None or
           not isinstance(r.markdown_text,str) or not isinstance(r.block_type,str) for r in rows):
        raise ValueError('初始逻辑状态必须一对一、扁平、文本明确')
