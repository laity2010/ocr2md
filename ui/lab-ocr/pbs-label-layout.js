/** Pure PBS label geometry: every item remains a separate tag.
 * Prefer the closest rail to the page; if occupied at this Y, move ONLY X
 * outward. Later items reuse an inner rail as soon as its Y is free.
 * No PDF.js, SQL, AG or DOM dependency.
 */
export function layoutPbsLabels(items,pageWidth,pageHeight,{height=23,gap=3,inset=4}={}){
  if(!(pageWidth>0&&pageHeight>0))return [];
  const sides={left:[],right:[]};
  for(const item of items){
    if(!item?.pbs||!Array.isArray(item?.bbox)||item.bbox.length!==4)continue;
    const [x1,y1,x2,y2]=item.bbox;
    if(![x1,y1,x2,y2].every(Number.isFinite)||x2<=x1||y2<=y1)continue;
    const side=(x1+x2)/2<=pageWidth/2?'left':'right';
    sides[side].push({...item,side,
      anchorY:Math.max(0,Math.min(pageHeight,(y1+y2)/2)),
      anchorX:Math.max(0,Math.min(pageWidth,side==='left'?x1:x2))});
  }
  const result=[];
  for(const side of ['left','right']){
    const ordered=sides[side].sort((a,b)=>a.anchorY-b.anchorY||String(a.blockId).localeCompare(String(b.blockId)));
    const occupiedUntil=[];
    for(const item of ordered){
      const top=Math.max(inset,Math.min(pageHeight-height-inset,item.anchorY-height/2));
      // Interval partitioning on vertical projections: the first free lane
      // restores tags to their original X immediately after congestion.
      let lane=occupiedUntil.findIndex(end=>end<=top);
      if(lane<0){lane=occupiedUntil.length;occupiedUntil.push(0);}
      occupiedUntil[lane]=top+height+gap;
      result.push({...item,lane,top});
    }
  }
  return result;
}
