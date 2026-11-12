/** Pure page-side PBS label placement. No PDF.js, SQL, AG or DOM dependency.
 * Crowded rails collapse consecutive labels into clickable disclosure stacks.
 */
export function layoutPbsLabels(items,pageWidth,pageHeight,{height=23,gap=3,inset=4}={}){
  if(!(pageWidth>0&&pageHeight>0))return [];
  const sides={left:[],right:[]};
  for(const item of items){
    if(!item?.pbs||!Array.isArray(item?.bbox)||item.bbox.length!==4)continue;
    const [x1,y1,x2,y2]=item.bbox;
    if(![x1,y1,x2,y2].every(Number.isFinite)||x2<=x1||y2<=y1)continue;
    const midX=(x1+x2)/2;
    const side=midX<=pageWidth/2?'left':'right';
    sides[side].push({...item,side,anchorY:Math.max(inset,Math.min(pageHeight-inset,(y1+y2)/2)),
      anchorX:side==='left'?Math.max(0,Math.min(pageWidth,x1)):Math.max(0,Math.min(pageWidth,x2))});
  }
  const result=[];
  for(const side of ['left','right']){
    const ordered=sides[side].sort((a,b)=>a.anchorY-b.anchorY||String(a.blockId).localeCompare(String(b.blockId)));
    if(!ordered.length)continue;
    const cap=Math.max(1,Math.floor((pageHeight-2*inset+gap)/(height+gap)));
    const groups=[];
    // Preserve all Block identities even when a tiny page cannot show every
    // tag as its own 23px chip. A group expands into its member list on click.
    for(let i=0;i<Math.min(cap,ordered.length);i++){
      const start=Math.floor(i*ordered.length/Math.min(cap,ordered.length));
      const end=Math.floor((i+1)*ordered.length/Math.min(cap,ordered.length));
      const members=ordered.slice(start,end);
      const anchor=members.reduce((sum,item)=>sum+item.anchorY,0)/members.length;
      groups.push({side,items:members,anchorY:anchor,
        anchorX:members[0].anchorX,desired:Math.max(inset,Math.min(pageHeight-height-inset,anchor-height/2))});
    }
    let cursor=inset;
    for(const group of groups){group.top=Math.max(cursor,group.desired);cursor=group.top+height+gap;}
    if(cursor-gap>pageHeight-inset){
      groups.at(-1).top=pageHeight-height-inset;
      for(let i=groups.length-2;i>=0;i--)
        groups[i].top=Math.min(groups[i].top,groups[i+1].top-height-gap);
    }
    result.push(...groups);
  }
  return result;
}
