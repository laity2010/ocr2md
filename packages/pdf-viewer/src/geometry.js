/** Pure OCR geometry from Main ui/pdf-preview.js:pdfOverlayRect.
 * OCR coordinates use top-left in already-rotated source page space.
 * Reject inconsistent dimensions rather than drawing misleading highlights.
 */
export function pdfOverlayRect(region,viewport){
  const [w,h]=region?.pageSize||[],[x0,y0,x1,y1]=region?.bbox||[];
  if(![w,h,x0,y0,x1,y1,viewport?.width,viewport?.height].every(Number.isFinite)||
    w<=0||h<=0||x0<0||y0<0||x1<=x0||y1<=y0||x1>w||y1>h)
    throw Error('PDF OCR 元素坐标无效');
  if(Math.abs(viewport.width/viewport.height/(w/h)-1)>.02)
    throw Error('PDF/OCR 页面尺寸或旋转不一致，已停止高亮');
  return {left:x0/w*100,top:y0/h*100,width:(x1-x0)/w*100,height:(y1-y0)/h*100};
}

export function validateOverlays(overlays){
  if(!Array.isArray(overlays)||overlays.length>100000)throw TypeError('Block 覆盖框必须是有限数组');
  const seen=new Set();
  return overlays.map(block=>{
    const id=block?.blockId;
    if(!(typeof id==='string'&&id.length>0&&id.length<=256 || Number.isSafeInteger(id)&&id>=0))
      throw TypeError('BlockID 必须是非空字符串或非负整数');
    if(seen.has(id))throw Error('BlockID 重复：'+id);
    seen.add(id);
    if(block?.parentId!=null && !(typeof block.parentId==='string'&&block.parentId.length>0 || Number.isSafeInteger(block.parentId)&&block.parentId>=0))
      throw TypeError('ParentID 无效');
    if(!Number.isInteger(block.pageIndex)||block.pageIndex<0)
      throw TypeError('PDF 页码无效');
    // Validate a source rectangle even before the PDF is loaded.
    pdfOverlayRect(block,{width:block.pageSize?.[0],height:block.pageSize?.[1]});
    const label=block.label??block.pbs??'';
    if(typeof label!=='string'||label.length>128)throw TypeError('PBS 标签无效');
    const type=block.type??'text',status=block.status??'normal';
    if(typeof type!=='string'||typeof status!=='string'||type.length>100||status.length>100)
      throw TypeError('覆盖框类型或状态无效');
    return Object.freeze({blockId:id,parentId:block.parentId??null,label,
      pageIndex:block.pageIndex,bbox:[...block.bbox],pageSize:[...block.pageSize],
      type,status});
  });
}
