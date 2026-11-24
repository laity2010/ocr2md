"""Read-only V2 logical-to-physical PDF projection. No synthetic geometry.

V1 PCB/PBS labels are visual, current and mutable. The source identity
(logical_id, base_blockid) is permanent; PDF bbox remains original MinerU.
"""
from __future__ import annotations
import base64, json, math, sqlite3
from pathlib import Path
from v2_pbs import validate_pbs
from v2_md_block import raw_at

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
    base={r['blockid']:r for r in db.execute(
        'SELECT blockid,page_index,block_group,page_block_index,bbox_json,block_json '
        'FROM mineru_base WHERE blockid>0')}
    # WP09: the stable IDs of original immediate child elements start above
    # ALL base IDs (same deterministic assignment as initial_rows). Use each
    # child's OWN original bbox where provided, never the aggregated table
    # rectangle for a caption/body/footnote. Manually split rows carry a source association,
    # but no raw_path and no physical geometry of their own.
    child_boxes={}
    next_child=max(base,default=0)+1
    for record in base.values():
        if record['block_group']!='para_blocks':continue
        block=json.loads(record['block_json'])
        for child in block.get('blocks',[]) or []:
            child_boxes[next_child]=child.get('bbox')
            next_child+=1
    logical=[dict(r) for r in db.execute(
        'SELECT logical_id,base_blockid,parent_id,logical_order,md_block,block_type,p,b,s,raw_path '
        'FROM logical_block ORDER BY logical_order,logical_id')]
    try:groups=validate_pbs(logical)
    except ValueError as err:raise PDFProjectionError(str(err)) from err
    # PBS coordinates, not logical_order, own the displayed identities.
    # s0 is the logical parent/group anchor; s1+ are its only child level.
    roots={row['logical_id']:groups[(row['p'],row['b'])][0] for row in logical}
    pbs={row['logical_id']:f"p{row['p']}b{row['b']}s{row['s']}" for row in logical}
    covers=[];unmapped=[];formula_blocks=[]
    for row in logical:
        lid=row['logical_id'];original=base.get(row['base_blockid'])
        if 2**48<=lid<2**49 and row['raw_path'] is None:
            unmapped.append(lid);continue
        if not original or original['block_group']!='para_blocks':
            unmapped.append(lid);continue
        page=original['page_index']
        if not isinstance(page,int) or not 0<=page<len(page_sizes):
            unmapped.append(lid);continue
        try:bbox=json.loads(original['bbox_json'])
        except (TypeError,ValueError):bbox=None
        # The exact original element is determined by raw_path, NOT the
        # current PBS or neighboring formula. Artificial IDs have no span.
        element=raw_at(original['block_json'],row['raw_path'])
        if isinstance(element,dict):
            lines=element.get('lines') or []
            if any(isinstance(span,dict) and span.get('type') in ('inline_equation','interline_equation')
                   for line in lines if isinstance(line,dict) for span in (line.get('spans') or [])):
                formula_blocks.append({'block_id':lid,'base_blockid':row['base_blockid'],
                    'block_type':element.get('type',''),'global_page':page,
                    'page_size_json':page_sizes[page],'block_json':element})
        specific=child_boxes.get(lid)
        if valid_bbox(specific,page_sizes[page]):bbox=specific
        if not valid_bbox(bbox,page_sizes[page]):
            unmapped.append(lid);continue
        covers.append({'logicalId':lid,'baseBlockId':row['base_blockid'],
            'parentId':None if row['s']==0 else roots[lid],
            'rootLogicalId':roots[lid],
            'logicalOrder':row['logical_order'],'pbs':pbs[lid],
            'physicalPageIndex':page,'physicalBlockIndex':original['page_block_index'],
            'pageSize':page_sizes[page],'bbox':bbox,'empty':not bool(row['md_block'])})
    return {'schema':'v2-pdf-projection/v1','sourcePath':src['path'],
        'pageCount':len(page_sizes),'pageSizes':page_sizes,
        'logicalCount':len(logical),'mappedCount':len(covers),
        'unmappedLogicalIds':unmapped,'covers':covers,'formulaBlocks':formula_blocks,
        'pbs':{str(row['logical_id']):pbs[row['logical_id']] for row in logical}}
