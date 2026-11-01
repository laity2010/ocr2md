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
    lines.push({text:item.str.trim(),x,y,
      right:x+width,top:y-height,bottom:y});
  }
  // Keep PDF.js stream order inside an original Block. In this PDF, the
  // enlarged drop-cap M begins a paragraph before "uch", but its tall
  // bounding box has a lower midpoint. Sorting item *centers* moves M into
  // the third line and corrupts the extracted text (p1b9).
  let joined='';
  for(let index=0;index<lines.length;index++){
    const now=lines[index],prior=lines[index-1];
    const overlaps=prior&&Math.min(prior.bottom,now.bottom)>
      Math.max(prior.top,now.top);
    // A split drop cap can touch the following word without a text-space.
    // Examples: oversized "M" + "uch" on page 2. Other items retain a
    // readable space, including separate PDF stream lines.
    const contiguous=overlaps&&Math.abs(now.x-prior.right)<1.5;
    joined+=(index&&!contiguous?' ':'')+now.text;
  }
  return joined.replace(/\s+/g,' ').trim();
}
