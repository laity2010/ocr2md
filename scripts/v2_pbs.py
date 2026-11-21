"""V2 fixed two-level PBS coordinates. Logical IDs and original PDF geometry never change.

p,b,s are persisted integers; assigning on first import/migration is NOT a
general renumbering function. Later edits must update only the impacted row(s).
"""
from __future__ import annotations


def initial_pbs(rows, base_pages):
    """Map existing logical root/child rows to p,b,s once, preserving their order.

    Input rows have logical_id, parent_id, base_blockid, logical_order.
    Initial para blocks (all roots) become p{physical_page}b{page_sequence}s0.
    A legacy one-level child is s1/s2 under its root. Grandchildren are rejected.
    """
    ordered=sorted(rows,key=lambda r:(r['logical_order'],r['logical_id']))
    ids={r['logical_id']:r for r in ordered}
    if len(ids)!=len(ordered):raise ValueError('重复逻辑 ID')
    root_counter={};output={};members={}
    for row in ordered:
        if row['parent_id'] is not None:continue
        lid=row['logical_id'];original=base_pages.get(row['base_blockid'])
        if not isinstance(original,int) or original<0:raise ValueError('PBS 来源缺少有效原始页码')
        seq=root_counter.get(original,0);root_counter[original]=seq+1
        output[lid]=(original,seq,0)
    for row in ordered:
        parent=row['parent_id'];lid=row['logical_id']
        if parent is None:continue
        if parent not in ids or ids[parent]['parent_id'] is not None:
            raise ValueError('PBS 只允许父块与子块，禁止孙块或不存在的父块')
        if lid==parent:raise ValueError('PBS 不允许自身作为父块')
        base=output[parent];k=(base[0],base[1])
        num=members.get(k,0)+1;members[k]=num
        output[lid]=(base[0],base[1],num)
    if len(output)!=len(ordered) or len(set(output.values()))!=len(output):
        raise ValueError('PBS 分配出现遗漏或重复')
    return output


def validate_pbs(rows):
    """Validate stored coordinates without renumbering or demanding no holes."""
    ids=set();coords=set();groups={}
    for row in rows:
        lid=row['logical_id'];pbs=(row['p'],row['b'],row['s'])
        if any(type(v) is not int or v<0 for v in pbs):
            raise ValueError('PBS 坐标必须为非负整数')
        if lid in ids or pbs in coords:raise ValueError('逻辑 ID/PBS 重复')
        ids.add(lid);coords.add(pbs)
        g=groups.setdefault(pbs[:2],{})
        g[pbs[2]]=lid
    for g,children in groups.items():
        if 0 not in children:raise ValueError('PBS 父块分组缺少 s0')
    return groups
