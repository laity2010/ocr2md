"""V3 单轨初始形态编译器：MinerU 基础表 -> owned-LF 逻辑块行集。

遵循 SQL.md 第 2–3 节与 CM.md 第 2 节：
1. 仅从 para_blocks 生成 s0 根与 s1..sN 直系子块，禁止孙块；
2. Raw Block 动态按 (base_blockid, raw_path) 外联投影，不在逻辑表冗余复制；
3. 新书初始化一步纳入同页同几何 preproc_blocks 跨页表格恢复、typed 行内公式 $...$、
   行间公式 $$...$$、标准图片链接 ![](<URL>)、ATX 标题 # 与标准 owned-LF 真实换行。
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
import json
import re
import sqlite3

from .db import V3Error


@dataclass(frozen=True)
class LogicalBlockRow:
    """逻辑块单行强类型内存表示。"""

    logical_id: int
    base_blockid: int
    parent_id: int | None
    logical_order: int
    md_block: str
    block_type: str
    p: int
    b: int
    s: int
    raw_path: str | None = None


def raw_element_text(element: dict) -> str:
    """提取单个原始 MinerU 元素自身的 OCR 文本/HTML/图片路径，保持原始行顺序。"""
    if not isinstance(element, dict):
        raise ValueError('原始 MinerU 元素必须是对象')
    lines_out: list[str] = []
    for line in element.get('lines', []) or []:
        if not isinstance(line, dict):
            raise ValueError('原始 MinerU line 必须是对象')
        spans = line.get('spans', []) or []
        if not isinstance(spans, list):
            raise ValueError('原始 MinerU spans 必须是数组')
        parts: list[str] = []
        for span in spans:
            if not isinstance(span, dict):
                raise ValueError('原始 MinerU span 必须是对象')
            for key in ('content', 'html', 'image_path'):
                value = span.get(key)
                if isinstance(value, str) and value:
                    parts.append(value)
                    break
        lines_out.append(''.join(parts))
    return '\n'.join(lines_out)


def raw_at(block_json: str | dict, raw_path: str | None) -> dict | None:
    """按 '$' 或 '$.blocks[n]' 路径从不可变基础块 JSON 定位原始元素。"""
    if raw_path is None:
        return None
    root = json.loads(block_json) if isinstance(block_json, str) else block_json
    if not isinstance(root, dict):
        return None
    if raw_path == '$':
        return root
    if isinstance(raw_path, str) and raw_path.startswith('$.blocks[') and raw_path.endswith(']'):
        idx_str = raw_path[9:-1]
        if idx_str.isdecimal() and str(int(idx_str)) == idx_str:
            blocks = root.get('blocks', [])
            idx = int(idx_str)
            if isinstance(blocks, list) and 0 <= idx < len(blocks):
                item = blocks[idx]
                return item if isinstance(item, dict) else None
    return None


def _wrap_inline_math(text: str) -> str:
    """为 typed inline_equation span 补齐单层 $...$ 定界，不破坏既有非转义 $。"""
    if not text or '\n' in text or '\r' in text:
        return text
    if text.startswith('$') and text.endswith('$') and not text.startswith('$$'):
        return text
    if any(ch == '$' and (i == 0 or text[i - 1] != '\\') for i, ch in enumerate(text)):
        return text
    return '$' + text + '$'


def _inline_span_projection(element: dict) -> str:
    """保持原始 span 顺序，仅对 type=='inline_equation' 的 content 包裹 $...$。"""
    lines_out: list[str] = []
    for line in element.get('lines', []) or []:
        parts: list[str] = []
        for span in line.get('spans', []) or []:
            for key in ('content', 'html', 'image_path'):
                value = span.get(key)
                if isinstance(value, str) and value:
                    if key == 'content' and span.get('type') == 'inline_equation':
                        parts.append(_wrap_inline_math(value))
                    else:
                        parts.append(value)
                    break
        lines_out.append(''.join(parts))
    return '\n'.join(lines_out)


def _normalize_single_line(text: str) -> str:
    """将单个原始 OCR 元素内部的软折行规整为单行正文（不改动基础表原件）。"""
    return re.sub(r'[ \t]*[\r\n]+[ \t]*', ' ', text).strip()


def compile_initial_md_body(raw_text: str, block_type: str, element: dict) -> str:
    """将单个原始元素编译为初始单行 Markdown 正文（不含块尾 owned-LF）。"""
    if not isinstance(raw_text, str) or not isinstance(block_type, str):
        raise ValueError('OCR 初始文本或块类型无效')
    if (
        block_type not in ('image_body', 'image', 'chart_body', 'inline_equation', 'interline_equation')
        and raw_text == raw_element_text(element)
    ):
        raw_text = _inline_span_projection(element)
    body = _normalize_single_line(raw_text)
    if not body:
        return ''
    if block_type == 'title':
        level = element.get('level', 1)
        level = level if isinstance(level, int) and 1 <= level <= 6 else 1
        return '#' * level + ' ' + body
    if block_type in ('image_body', 'image', 'chart_body'):
        return '![](<' + body.replace('>', '%3E') + '>)'
    if block_type == 'interline_equation':
        return '$$' + body + '$$'
    if block_type == 'inline_equation':
        return _wrap_inline_math(body)
    return body


def _table_match_key(row: sqlite3.Row | dict, obj: dict) -> tuple | None:
    bbox = obj.get('bbox')
    if not isinstance(bbox, list) or len(bbox) != 4 or any(type(n) not in (int, float) for n in bbox):
        return None
    index = obj.get('index')
    if type(index) is not int:
        return None
    return (row['source_path'], row['page_index'], obj.get('type'), index, tuple(bbox))


def _table_child_key(obj: dict) -> tuple | None:
    bbox = obj.get('bbox')
    if not isinstance(bbox, list) or len(bbox) != 4 or any(type(n) not in (int, float) for n in bbox):
        return None
    return (obj.get('type'), obj.get('index'), tuple(bbox))


def compute_table_overrides(base_rows: list[sqlite3.Row | dict]) -> dict[tuple[int, str], tuple[str, str]]:
    """从同源同页同几何 preproc_blocks 无损恢复被跨页合并清空的表格子块。"""
    prelim: dict[tuple, list[dict]] = defaultdict(list)
    para: list[tuple[sqlite3.Row | dict, dict, tuple]] = []
    for row in base_rows:
        if row['block_group'] not in ('preproc_blocks', 'para_blocks'):
            continue
        obj = json.loads(row['block_json'])
        if not isinstance(obj, dict) or obj.get('type') != 'table':
            continue
        key = _table_match_key(row, obj)
        if key is None:
            continue
        if row['block_group'] == 'preproc_blocks':
            prelim[key].append(obj)
        else:
            para.append((row, obj, key))

    matched: list[tuple[sqlite3.Row | dict, dict, dict, dict]] = []
    overrides: dict[tuple[int, str], tuple[str, str]] = {}
    for row, original, key in para:
        candidates = prelim.get(key, [])
        if len(candidates) != 1:
            continue
        source = candidates[0]
        source_children: dict[tuple, list[dict]] = defaultdict(list)
        for part in source.get('blocks', []) or []:
            if isinstance(part, dict):
                ckey = _table_child_key(part)
                if ckey is not None:
                    source_children[ckey].append(part)
        matched.append((row, original, source, source_children))
        for idx, child in enumerate(original.get('blocks', []) or []):
            if not isinstance(child, dict):
                continue
            ckey = _table_child_key(child)
            choices = source_children.get(ckey, []) if ckey is not None else []
            if len(choices) != 1:
                continue
            old_text = raw_element_text(child)
            new_text = raw_element_text(choices[0])
            if old_text != new_text and new_text:
                overrides[(row['blockid'], f'$.blocks[{idx}]')] = (new_text, 'same-page-preproc')

    # 若续页表格在 para_blocks 被标记 lines_deleted=True 且前页多出了完全一致的续页脚注，归位清空前页重复项
    for row, original, source, source_children in matched:
        source_parts = source.get('blocks', []) or []
        prev_bodies = [raw_element_text(c) for c in source_parts if c.get('type') == 'table_body']
        if len(prev_bodies) != 1 or not prev_bodies[0].startswith('<table>'):
            continue
        for next_row, next_original, next_source, _ in matched:
            if (
                next_row['source_path'] != row['source_path']
                or next_row['page_index'] != row['page_index'] + 1
            ):
                continue
            deleted = [
                c for c in (next_original.get('blocks', []) or [])
                if isinstance(c, dict) and c.get('type') == 'table_body' and c.get('lines_deleted') is True
            ]
            next_bodies = [
                raw_element_text(c) for c in (next_source.get('blocks', []) or [])
                if isinstance(c, dict) and c.get('type') == 'table_body'
            ]
            if len(deleted) != 1 or len(next_bodies) != 1 or prev_bodies[0][:100] != next_bodies[0][:100]:
                continue
            next_footnotes = {
                raw_element_text(c) for c in (next_source.get('blocks', []) or [])
                if isinstance(c, dict) and c.get('type') == 'table_footnote'
            }
            for idx, child in enumerate(original.get('blocks', []) or []):
                if not isinstance(child, dict) or child.get('type') != 'table_footnote':
                    continue
                if _table_child_key(child) in source_children:
                    continue
                note = raw_element_text(child)
                if note and note in next_footnotes:
                    overrides[(row['blockid'], f'$.blocks[{idx}]')] = ('', 'next-page-footnote')
    return overrides


def compile_owned_logical_rows(base_rows: list[sqlite3.Row | dict]) -> list[LogicalBlockRow]:
    """从已排序 mineru_base 记录一步生成带真实 owned-LF 结尾的初始逻辑块列表。"""
    records = list(base_rows)
    last_bid = 0
    for rec in records:
        bid = rec['blockid']
        if type(bid) is not int or bid <= last_bid:
            raise ValueError('mineru_base blockid 必须为严格递增的正整数')
        last_bid = bid

    next_child_id = last_bid + 1
    overrides = compute_table_overrides(records)
    page_seq_counter: dict[int, int] = {}
    drafts: list[dict] = []

    for rec in records:
        if rec['block_group'] != 'para_blocks':
            continue
        block = json.loads(rec['block_json'])
        if not isinstance(block, dict):
            raise ValueError('基础块 JSON 必须是对象')
        bid = rec['blockid']
        page_idx = rec['page_index']
        if type(page_idx) is not int or page_idx < 0:
            raise ValueError('PBS 来源缺少有效原始非负页码')
        b_idx = page_seq_counter.get(page_idx, 0)
        page_seq_counter[page_idx] = b_idx + 1

        root_type = block.get('type', '')
        if not isinstance(root_type, str) or rec['block_type'] != root_type:
            raise ValueError('基础块类型与原始 JSON 不一致')
        root_raw = overrides.get((bid, '$'), (raw_element_text(block), ''))[0]
        drafts.append({
            'logical_id': bid,
            'base_blockid': bid,
            'parent_id': None,
            'logical_order': len(drafts) + 1,
            'body': compile_initial_md_body(root_raw, root_type, block),
            'block_type': root_type,
            'p': page_idx,
            'b': b_idx,
            's': 0,
            'raw_path': '$',
        })

        subblocks = block.get('blocks', []) or []
        if not isinstance(subblocks, list):
            raise ValueError('基础块 blocks 字段必须是数组')
        for s_offset, child in enumerate(subblocks, start=1):
            if not isinstance(child, dict) or not isinstance(child.get('type'), str):
                raise ValueError('原始子元素缺少合法类型')
            if child.get('blocks'):
                raise ValueError('原始元素包含第三级块，严格禁止制造孙块')
            c_path = f'$.blocks[{s_offset - 1}]'
            c_type = child['type']
            c_raw = overrides.get((bid, c_path), (raw_element_text(child), ''))[0]
            drafts.append({
                'logical_id': next_child_id,
                'base_blockid': bid,
                'parent_id': bid,
                'logical_order': len(drafts) + 1,
                'body': compile_initial_md_body(c_raw, c_type, child),
                'block_type': c_type,
                'p': page_idx,
                'b': b_idx,
                's': s_offset,
                'raw_path': c_path,
            })
            next_child_id += 1

    # 一步赋予定律化的 owned-LF 尾换行：同组相邻子块 1 个 \n，独立组末 2 个 \n
    result: list[LogicalBlockRow] = []
    for idx, item in enumerate(drafts):
        nxt = drafts[idx + 1] if idx + 1 < len(drafts) else None
        same_group = nxt is not None and (nxt['p'], nxt['b']) == (item['p'], item['b'])
        min_lf = 1 if same_group else 2
        body = item['body']
        if '\r' in body:
            raise ValueError('初始编译正文不允许残留 CR 字符')
        existing_tail = len(body) - len(body.rstrip('\n'))
        md_block = body + '\n' * max(0, min_lf - existing_tail)
        result.append(LogicalBlockRow(
            logical_id=item['logical_id'],
            base_blockid=item['base_blockid'],
            parent_id=item['parent_id'],
            logical_order=item['logical_order'],
            md_block=md_block,
            block_type=item['block_type'],
            p=item['p'],
            b=item['b'],
            s=item['s'],
            raw_path=item['raw_path'],
        ))
    return result


def write_initial_v3_logical(db: sqlite3.Connection) -> int:
    """在同一建库/初始化写事务内写入单轨 owned-LF 初始逻辑表并核验外键完整性。"""
    if db.execute('SELECT count(*) FROM logical_block').fetchone()[0]:
        raise V3Error(409, '逻辑表非空，禁止覆盖已有逻辑状态')
    base_rows = db.execute(
        'SELECT blockid, block_group, block_json, block_type, page_index, source_path '
        'FROM mineru_base WHERE blockid > 0 ORDER BY blockid'
    ).fetchall()
    try:
        rows = compile_owned_logical_rows(base_rows)
    except ValueError as err:
        raise V3Error(422, '初始逻辑块编译失败：' + str(err)) from err
    db.executemany(
        '''
        INSERT INTO logical_block(
          logical_id, base_blockid, parent_id, logical_order,
          md_block, block_type, p, b, s, raw_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''',
        [
            (
                r.logical_id, r.base_blockid, r.parent_id, r.logical_order,
                r.md_block, r.block_type, r.p, r.b, r.s, r.raw_path,
            )
            for r in rows
        ],
    )
    inserted = db.execute('SELECT count(*) FROM logical_block').fetchone()[0]
    if inserted != len(rows):
        raise V3Error(500, '逻辑表初始化写入行数不匹配')
    if list(db.execute('PRAGMA foreign_key_check')):
        raise V3Error(500, '逻辑表初始化外键完整性校验失败')
    return inserted
