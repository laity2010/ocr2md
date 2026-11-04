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

/** Place PDF labels in TWO fixed edge rails, with no label collisions.
 * Both rails are guaranteed to lie completely outside the horizontal union
 * of all original PDF cover rectangles on that page; labels never sit inside
 * their own or a neighbor's OCR region. Leaders connect labels back to their
 * immutable target boxes. This is a pure, page-local layout calculation.
 *
 * Input: {id,side,anchorY,target:{left,top,right,bottom},width,height};
 * geometry is expressed in PDF page CSS pixels, AFTER PDF.js zoom.
 */
export function layoutPDFEdgeRails(items,{pageWidth,pageHeight,covers=[],gap=2,padding=3}={}){
  if(!Number.isFinite(pageWidth)||!Number.isFinite(pageHeight)||pageWidth<=0||pageHeight<=0)
    return {slots:[],leaders:[],safe:{left:0,right:0}};
  const bounds=covers.length?covers:[{left:pageWidth/2,right:pageWidth/2}];
  const leftLimit=Math.max(0,Math.min(...bounds.map(c=>c.left)));
  const rightLimit=Math.min(pageWidth,Math.max(...bounds.map(c=>c.right)));
  // The rails are part of the physical PDF PAGE, never the PDF pane.
  // An arbitrarily wide surrounding Dockview/scroller MUST NOT become
  // available label space: that caused p6b6s1/p6b8 to escape to the far
  // right of the iPad workspace at 100% page zoom.
  const safe={left:Math.max(0,leftLimit-padding),
    right:Math.max(0,pageWidth-rightLimit-padding)};
  const sideItems={left:[],right:[]};
  for(const item of items){
    if(!item?.target||!Number.isFinite(item.anchorY)||
      !Number.isFinite(item.width)||!Number.isFinite(item.height))continue;
    let side=item.side==='right'?'right':'left';
    // If one gutter is too thin even for a scaled chip, use the other page
    // edge instead. Both choices remain OUTSIDE all PDF source rectangles.
    if(safe[side]<item.width*.35&&safe[side==='left'?'right':'left']>safe[side])
      side=side==='left'?'right':'left';
    sideItems[side].push({...item,side});
  }
  const slots=[];const leaders=[];
  for(const side of ['left','right']){
    const group=sideItems[side].sort((a,b)=>a.anchorY-b.anchorY||
      a.id.localeCompare(b.id,undefined,{numeric:true}));
    if(!group.length)continue;
    const usableWidth=safe[side];
    const widest=Math.max(...group.map(x=>x.width));
    const heightTotal=group.reduce((sum,x)=>sum+x.height,0);
    const vertical=Math.max(.08,(pageHeight-padding*2-gap*(group.length-1))/heightTotal);
    // Never allow the displayed chip to extend into any OCR rectangle.
    const horizontal=widest>0?usableWidth/widest:1;
    const scale=Math.min(1,Math.max(0,horizontal),Math.max(0,vertical));
    const visual=group.map(item=>({...item,scale,
      vw:item.width*scale,vh:item.height*scale,
      desired:Math.max(padding,Math.min(pageHeight-padding-item.height*scale,
        item.anchorY-item.height*scale/2))}));
    if(scale===0)continue; // no safe physical rail in either direction
    const rows=visual.map(item=>item.desired);
    for(let i=1;i<rows.length;i++)
      rows[i]=Math.max(rows[i],rows[i-1]+visual[i-1].vh+gap);
    // Backpropagate page-bottom overflow without allowing any collision.
    rows[rows.length-1]=Math.min(rows.at(-1),pageHeight-padding-visual.at(-1).vh);
    for(let i=rows.length-2;i>=0;i--)
      rows[i]=Math.min(rows[i],rows[i+1]-gap-visual[i].vh);
    if(rows[0]<padding){
      const shift=padding-rows[0];for(let i=0;i<rows.length;i++)rows[i]+=shift;
    }
    visual.forEach((item,i)=>{
      const top=rows[i];
      const left=side==='left'?padding:pageWidth-padding-item.vw;
      const slot={...item,left,top,width:item.vw,height:item.vh};
      slots.push(slot);
      const xStart=side==='left'?left+slot.width:left;
      const xGuide=side==='left'?Math.max(0,leftLimit-padding/2):
        Math.min(pageWidth,rightLimit+padding/2);
      const xEnd=side==='left'?item.target.left:item.target.right;
      const yStart=top+slot.height/2;
      const yEnd=(item.target.top+item.target.bottom)/2;
      leaders.push({id:item.id,side:item.side,kind:item.kind,
        path:`M ${xStart.toFixed(2)} ${yStart.toFixed(2)} H ${xGuide.toFixed(2)} V ${yEnd.toFixed(2)} H ${xEnd.toFixed(2)}`,
        endpoint:{x:xEnd,y:yEnd}});
    });
  }
  return {slots,leaders,safe};
}
