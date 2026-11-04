/** Place all parent and child labels together inside a PDF page gutter.
 * Each input is read-only geometry in CSS page pixels:
 * {id, from, to, height, preferred?}. A label can move anywhere within its
 * original bbox's Y range; when infeasible, take the nearest free slot.
 * No persistent UI state and no change to OCR geometry or native block IDs.
 */
export function layoutPDFGutterLabels(items,pageHeight,{gap=2}={}){
  const bottom=Math.max(0,pageHeight-2);
  const within=(v,lo,hi)=>Math.min(Math.max(v,lo),hi);
  const prepared=items.map(item=>{
    const h=Math.max(1,item.height);
    const center=(item.from+item.to)/2;
    const lo=within(Math.min(item.from,item.to-h),2,Math.max(2,bottom-h));
    const hi=within(Math.max(item.from,item.to-h),lo,Math.max(lo,bottom-h));
    return {...item,h,lo,hi,preferred:within(item.preferred??center-h/2,lo,hi),
      flexibility:Math.max(0,hi-lo)};
  });
  // A reviewed parent with a virtual s0 body shares the EXACT physical
  // OCR rectangle with that child. The s0 chip is normally slightly shorter,
  // so sorting solely by flexibility puts s0 first and displaces the parent
  // label far below its tiny original bbox (sometimes under the next block).
  // Reserve the original position for that parent; all its child chips must
  // avoid it. Other ordinary tight caption labels retain their old priority.
  const protectedParents=new Set(items.filter(item=>/^p\d+b\d+$/.test(item.id)&&
    items.some(child=>child.id===item.id+'s0'&&
      Math.abs(child.from-item.from)<2&&Math.abs(child.to-item.to)<2))
    .map(item=>item.id));
  const ordering=[...prepared].sort((a,b)=>
    Number(!protectedParents.has(a.id))-Number(!protectedParents.has(b.id))||
    a.flexibility-b.flexibility||a.from-b.from||
    a.id.localeCompare(b.id,undefined,{numeric:true}));
  const placed=[];
  for(const item of ordering){
    const upper=Math.max(2,bottom-item.h);
    const probes=[item.preferred,item.lo,item.hi,2,upper];
    for(const other of placed){
      probes.push(other.top+other.h+gap,other.top-item.h-gap);
    }
    let best=null;
    for(const p of probes){
      const top=within(p,2,upper);
      // Exclude collisions INCLUDING a visual 2px gap, from either side.
      if(placed.some(o=>top<o.top+o.h+gap&&top+item.h+gap>o.top))continue;
      const out=top<item.lo?item.lo-top:top>item.hi?top-item.hi:0;
      const score=out*50+Math.abs(top-item.preferred);
      if(!best||score<best.score)best={top,score};
    }
    // Extreme dense pages can exceed physical gutter capacity. Keep each
    // node visible within the page and place it as close as possible; never
    // silently drop or merge a real child ID.
    const top=best?.top??within(item.preferred,2,upper);
    placed.push({...item,top});
  }
  return placed.sort((a,b)=>a.from-b.from||a.id.localeCompare(b.id,undefined,{numeric:true}))
    .map(({id,top,from,to,h})=>({id,top,height:h,from,to}));
}
