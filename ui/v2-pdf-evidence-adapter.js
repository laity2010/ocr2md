/** V2 current two-table logical projection -> untouched Lab-OCR V1 PDF API.
 * Geometry and IDs only. No PDF DOM, label placement, lane math, CSS or drag.
 */
export function projectV2PDFEvidence(map){
  if(map?.schema!=='v2-pdf-projection/v1'||!Number.isInteger(map.pageCount)||
    map.pageCount<=0||!Array.isArray(map.pageSizes)||map.pageSizes.length!==map.pageCount||
    !Array.isArray(map.covers))throw Error('V2 PDF 来源结构无效');
  const byPage=map.pageSizes.map((pageSize,i)=>({
    level:'block',page:i+1,pageSize,boxes:[],
  }));
  const byId=new Map(),ids=new Set();
  for(const row of map.covers){
    const {logicalId,pbs,physicalPageIndex,bbox}=row;
    if(!Number.isSafeInteger(logicalId)||logicalId<1||
      typeof pbs!=='string'||!/^p\d+b\d+s\d+$/.test(pbs)||
      !Number.isInteger(physicalPageIndex)||physicalPageIndex<0||!byPage[physicalPageIndex]||
      !Array.isArray(bbox)||bbox.length!==4||bbox.some(v=>!Number.isFinite(v))||
      bbox[2]<=bbox[0]||bbox[3]<=bbox[1])
      throw Error('V2 逻辑块缺少有效 PBS、ID 或 PDF 物理坐标');
    if(byId.has(logicalId)||ids.has(pbs))throw Error('逻辑 ID/PBS 重复，拒绝绘制');
    const pageSize=byPage[physicalPageIndex].pageSize;
    if(bbox[0]<0||bbox[1]<0||bbox[2]>pageSize[0]||bbox[3]>pageSize[1])
      throw Error('V2 PDF bbox 超出原始页边界');
    byId.set(logicalId,row);ids.add(pbs);
    // The actual V1 public PDF overlay API handles multiple logical labels
    // that share one physical rectangle, including parent and child PBS.
    byPage[physicalPageIndex].boxes.push({
      id:String(logicalId),blockId:String(logicalId),pbs,
      parentBlockId:row.parentId==null?null:String(row.parentId),
      blockGroup:'para_blocks',blockType:row.blockType||'text',
      bbox,sourceEmpty:row.empty===true,
    });
  }
  if(byId.size!==map.mappedCount)throw Error('V2 PDF 映射数量与来源不一致');
  return Object.freeze({
    map,byId,
    page(page,level='block'){
      if(level!=='block'||!Number.isInteger(page)||page<1||page>byPage.length)
        throw Error('V2 此阶段只支持原始 PDF 的 Block 页面');
      return byPage[page-1];
    },
  });
}

/** WP16: current writable CM6 text decides dashed state, NOT stale pdf-map
 * sourceEmpty. Keep that old cached flag for audit. A table/figure
 * wrapper is solid if any child in its (p,b) group owns readable text.
 * No geometry, SQL field or PBS is changed by this read-only projection.
 */
export function emptyLogicalIds(rows){
  if(!Array.isArray(rows))throw Error('PDF 逻辑正文清单无效');
  const activeGroups=new Set(),seen=new Set();
  for(const row of rows){
    if(!Number.isSafeInteger(row?.logicalId)||row.logicalId<1||seen.has(row.logicalId)||
      !Number.isInteger(row.p)||!Number.isInteger(row.b)||
      !Number.isInteger(row.s)||typeof row.markdownText!=='string')
      throw Error('PDF 空块判断缺少有效 logicalId/PBS/MD');
    seen.add(row.logicalId);
    if(row.s>0&&row.markdownText.trim())activeGroups.add(`${row.p}/${row.b}`);
  }
  return rows.filter(row=>!row.markdownText.trim()&&
    !(row.s===0&&activeGroups.has(`${row.p}/${row.b}`)))
    .map(row=>row.logicalId);
}
