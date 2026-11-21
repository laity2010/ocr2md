"""Read-only V2 logical-to-physical PDF projection. No synthetic geometry.

V1 PCB/PBS labels are visual, current and mutable. The source identity
(logical_id, base_blockid) is permanent; PDF bbox remains original MinerU.
"""
from __future__ import annotations
import base64, json, math, sqlite3
from pathlib import Path

class PDFProjectionError(ValueError):pass

def valid_bbox(box,size):
    if not isinstance(box,list) or len(box)!=4 or not isinstance(size,list) or len(size)!=2:return False
    if any(not isinstance(v,(float,int)) or isinstance(v,bool) or not math.isfinite(v) for v in [*box,*size]):return False
    x0,y0,x1,y1=box;w,h=size
    return w>0 and h>0 and 0<=x0<x1<=w and 0<=y0<y1<=h

def project_pdf(db:sqlite3.Connection):
    archive=db.execute('SELECT block_json,original_bytes FROM mineru_base WHERE blockid=0').fetchone()
    if not archive:raise PDFProjectionError('缺少原始 MinerU 来源归档')
    meta=json.loads(archive[0]);sources=meta.get('sources') or []
    # A PDF and a MinerU source must be one-to-one; do not merge unrelated
    # source pages into fictional PDF coordinates.
    if len(sources)!=1:raise PDFProjectionError('多分卷 MinerUJSON 尚未绑定对应 PDF，不允许猜测页面映射')
    src=sources[0]
    entries=json.loads(archive[1]);
    match=[item for item in entries if item.get('path')==src['path'] and item.get('sha256')==src['sha256']]
    if len(match)!=1:raise PDFProjectionError('MinerU 原始字节档案与来源摘要不一致')
    raw=base64.b64decode(match[0]['contentBase64']);
    import hashlib
    if hashlib.sha256(raw).hexdigest()!=src['sha256']:
        raise PDFProjectionError('MinerU 来源 SHA 不匹配')
    doc=json.loads(raw)
    info=doc.get('pdf_info')
    if not isinstance(info,list) or not info:raise PDFProjectionError('MinerUJSON 缺少 PDF 页面证据')
    page_sizes=[]
    for i,page in enumerate(info):
        size=page.get('page_size')
        if not isinstance(size,list) or len(size)!=2 or any(not isinstance(n,(int,float)) or not math.isfinite(n) or n<=0 for n in size):
            raise PDFProjectionError(f'第 {i+1} 页缺少有效原始页面尺寸')
        if page.get('page_idx',i)!=i:
            raise PDFProjectionError('MinerU 页序不是连续原始 PDF 页序，不能假定坐标对应')
        page_sizes.append(size)
    base={r['blockid']:r for r in db.execute('SELECT blockid,page_index,block_group,page_block_index,bbox_json FROM mineru_base WHERE blockid>0')}
    logical=[dict(r) for r in db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,markdown_text,block_type FROM logical_block ORDER BY logical_order,logical_id')]
    ids={row['logical_id']:row for row in logical}
    if len(ids)!=len(logical):raise PDFProjectionError('重复逻辑 ID')
    # Validate ancestor chain before constructing mutable visual PBS IDs.
    def root_id(row):
        seen=set();current=row
        while current['parent_id'] is not None:
            if current['logical_id'] in seen:raise PDFProjectionError('逻辑父子关系存在循环')
            seen.add(current['logical_id'])
            parent=ids.get(current['parent_id'])
            if parent is None:raise PDFProjectionError('逻辑父块不存在')
            current=parent
        return current['logical_id']
    roots={row['logical_id']:root_id(row) for row in logical}
    by_root={}
    for row in logical:by_root.setdefault(roots[row['logical_id']],[]).append(row['logical_id'])
    # Current b order follows logical_order of roots ON EACH ROOT'S physical
    # home page; never depend on renumbered original OCR index.
    counters={};pbs={};children={}
    for row in logical:
        if row['parent_id'] is not None:continue
        origin=base.get(row['base_blockid']);page=origin['page_index'] if origin else None
        if not isinstance(page,int) or page<0 or page>=len(page_sizes):
            raise PDFProjectionError('逻辑根块无法追溯原始 PDF 页面')
        n=counters.get(page,0);counters[page]=n+1
        pbs[row['logical_id']]=f'p{page}b{n}'
    for row in logical:
        if row['parent_id'] is None:continue
        parent=row['parent_id']
        if parent not in pbs:
            # Preorder is not guaranteed, but parent always exists. Assign
            # in stable logical_order after its ancestor resolves.
            pass
    def child_pbs(row):
        lid=row['logical_id']
        if lid in pbs:return pbs[lid]
        parent=ids[row['parent_id']]
        prefix=child_pbs(parent)
        count=children.get(parent['logical_id'],0)+1
        children[parent['logical_id']]=count
        pbs[lid]=prefix+f's{count}'
        return pbs[lid]
    for row in logical:child_pbs(row)
    covers=[];unmapped=[]
    for row in logical:
        lid=row['logical_id'];original=base.get(row['base_blockid'])
        if not original or original['block_group']!='para_blocks':
            unmapped.append(lid);continue
        page=original['page_index']
        if not isinstance(page,int) or not 0<=page<len(page_sizes):
            unmapped.append(lid);continue
        try:bbox=json.loads(original['bbox_json'])
        except (TypeError,ValueError):bbox=None
        if not valid_bbox(bbox,page_sizes[page]):
            unmapped.append(lid);continue
        covers.append({'logicalId':lid,'baseBlockId':row['base_blockid'],
            'parentId':row['parent_id'],'rootLogicalId':roots[lid],
            'logicalOrder':row['logical_order'],'pbs':pbs[lid],
            'physicalPageIndex':page,'physicalBlockIndex':original['page_block_index'],
            'pageSize':page_sizes[page],'bbox':bbox,'empty':not bool(row['markdown_text'])})
    return {'schema':'v2-pdf-projection/v1','sourcePath':src['path'],
        'pageCount':len(page_sizes),'pageSizes':page_sizes,
        'logicalCount':len(logical),'mappedCount':len(covers),
        'unmappedLogicalIds':unmapped,'covers':covers,
        'pbs':{str(row['logical_id']):pbs[row['logical_id']] for row in logical}}
