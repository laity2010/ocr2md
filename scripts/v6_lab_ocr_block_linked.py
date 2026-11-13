"""Pure cross-page para Block move planner.

Physical page and source atom never move; only logical parent, sibling rank
and PBS are changed. The delta snapshots include all changed identities and
are reversible without duplicating the source JSON.
"""
from __future__ import annotations
from v6_lab_ocr_store import OCRImportError, REVIEW_BLOCK_GROUP

def plan_linked_move(rows,source_id,target_id,placement):
    if len(rows)>10000:raise OCRImportError('跨页关系上限 10000 个 Block')
    nodes={r['block_id']:dict(r) for r in rows}
    if len(nodes)!=len(rows) or source_id not in nodes or target_id not in nodes or source_id==target_id:
        raise OCRImportError('Block 源/目标不存在或重复')
    if placement not in ('child','before','after'):raise OCRImportError('落点无效')
    source=nodes[source_id];target=nodes[target_id]
    cross=source['global_page']!=target['global_page']
    if cross and (source['global_page']!=target['global_page']+1 or placement!='child' or
                  source['parent_block_id'] is not None):
        raise OCRImportError('跨页仅允许后一页顶层块归入前一页父块；之前／之后仍须同页')
    from collections import defaultdict
    siblings=defaultdict(list)
    def key(parent,page):
        return ('root',page) if parent is None else ('child',parent)
    for r in nodes.values():
        if r['block_group']!=REVIEW_BLOCK_GROUP:raise OCRImportError('跨页仅允许 para')
        parent=r['parent_block_id']
        if parent is not None and parent not in nodes:
            raise OCRImportError('已有 Block 父关系缺失')
        siblings[key(parent,r['global_page'])].append(r['block_id'])
    for members in siblings.values():
        members.sort(key=lambda i:(nodes[i]['sibling_order'],i))
    for r in nodes.values():
        visited=set();cursor=r['block_id']
        while cursor is not None:
            if cursor in visited:raise OCRImportError('块关系存在循环')
            visited.add(cursor);cursor=nodes[cursor]['parent_block_id']
    source_parent=source['parent_block_id']
    target_root=(target_id if target['parent_block_id'] is None
                 else target['parent_block_id'])
    if cross and nodes[target_root]['global_page']!=target['global_page']:
        raise OCRImportError('跨页不能越过相邻的逻辑父页')
    if placement=='child':
        if source_parent is not None:raise OCRImportError('只能归入顶层块')
        if source_id==target_root or nodes[target_root]['parent_block_id'] is not None:
            raise OCRImportError('不能归入自身子孙或产生第三层关系')
        members=siblings[key(None,source['global_page'])]
        members.remove(source_id)
        descendants=[]
        def visit(i):
            for child in siblings.get(('child',i),()):
                if cross and nodes[child]['global_page']!=source['global_page']:
                    raise OCRImportError('跨页归入不能再串接第三个物理页')
                descendants.append(child)
                visit(child)
        visit(source_id)
        for i in [source_id,*descendants]:
            nodes[i]['parent_block_id']=target_root
        for i in [source_id,*descendants]:
            siblings.pop(('child',i),None)
        siblings[('child',target_root)].extend([source_id,*descendants])
    else:
        if cross or source_parent!=target['parent_block_id']:
            raise OCRImportError('之前／之后只允许同页同级')
        members=siblings[key(source_parent,source['global_page'])]
        members.remove(source_id)
        members.insert(members.index(target_id)+(placement=='after'),source_id)
    physical_pages={source['global_page'],target['global_page']}
    for page in physical_pages:
        for root_index,root_id in enumerate(siblings.get(('root',page),())):
            root=nodes[root_id]
            root['sibling_order']=root_index
            root['pbs']=f'p{page+1}b{root_index}'
            for index,child_id in enumerate(siblings.get(('child',root_id),())):
                child=nodes[child_id]
                child['parent_block_id']=root_id
                child['sibling_order']=index
                child['pbs']=f"{root['pbs']}s{index}"
    for node in nodes.values():
        parent=node['parent_block_id']
        if parent is None:continue
        p=nodes.get(parent)
        if (p is None or p['parent_block_id'] is not None or
                not node['pbs'].startswith(p['pbs']+'s') or
                node['pbs'].count('s')!=1):
            raise OCRImportError('跨页关系包含无效第三层 Block')
    before=[];after=[];changes=[]
    for original in rows:
        changed=nodes[original['block_id']]
        keys=('parent_block_id','sibling_order','pbs')
        if any(original[k]!=changed[k] for k in keys):
            before.append([original['block_id'],original['parent_block_id'],
                           original['sibling_order'],original['pbs']])
            after.append([changed['block_id'],changed['parent_block_id'],
                          changed['sibling_order'],changed['pbs']])
            changes.append({k:changed[k] for k in ('block_id',*keys)})
            physical_pages.add(original['global_page'])
    before.sort();after.sort()
    return {'changed':bool(changes),'changedRows':changes,
            'sourceBlockId':source_id,'targetBlockId':target_id,
            'placement':placement,'page':source['global_page']+1,
            'pages':[p+1 for p in sorted(physical_pages)],
            'scope':'delta','before':before,'after':after}
