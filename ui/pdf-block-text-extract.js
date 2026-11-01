/** Read text from a single OCR Block in a real PDF.js text layer, never OCR.
 * Coordinates are normalized to the original, rotated page geometry. */
export function extractPDFBlockText(items,viewport,pageSize,bbox){
  if(!Array.isArray(items)||!Array.isArray(pageSize)||!Array.isArray(bbox)||
    !viewport||pageSize.length!==2||bbox.length!==4)return '';
  const [pw,ph]=pageSize,[left,top,right,bottom]=bbox;
  if(pw<=0||ph<=0||right<=left||bottom<=top)return '';
  const lines=[];
  for(const item of items){
    if(typeof item?.str!=='string'||!item.str.trim()||!Array.isArray(item.transform))continue;
    const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
    const height=Math.max(1,Math.abs(item.height||item.transform[3]||0));
    const width=Math.max(0,Math.abs(item.width||0));
    const xc=(x+width/2)/viewport.width*pw;
    const yc=(y-height/2)/viewport.height*ph;
    // The OCR rectangle may be slightly imperfect, especially at line edges.
    // A midpoint test avoids pulling text across neighboring PDF columns.
    const tolerance=1.5;
    if(xc<left-tolerance||xc>right+tolerance||yc<top-tolerance||yc>bottom+tolerance)continue;
    lines.push({text:item.str.trim(),x,y});
  }
  // PDF content streams are not guaranteed to be in reading order. Sort by
  // physical line first, then left-to-right within the target Block only.
  lines.sort((a,b)=>Math.abs(a.y-b.y)>3?a.y-b.y:a.x-b.x);
  return lines.map(i=>i.text).join(' ').replace(/\s+/g,' ').trim();
}
