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
      const xEnd=side==='left'?item.target.left:item.target.right;
      const yStart=top+slot.height/2;
      const yEnd=(item.target.top+item.target.bottom)/2;
      // Each ID gets its OWN direct leader. The former H–V–H routing
      // shared one vertical bus for the entire page and made dense labels
      // impossible to trace visually (notably page 1 at 1.5×).
      leaders.push({id:item.id,side:item.side,kind:item.kind,
        path:`M ${xStart.toFixed(2)} ${yStart.toFixed(2)} L ${xEnd.toFixed(2)} ${yEnd.toFixed(2)}`,
        endpoint:{x:xEnd,y:yEnd}});
    });
  }
  return {slots,leaders,safe};
}

/** Pack every real PBS label into unused space of its OWN PDF page.
 * All original OCR rectangles are exclusion zones, not an artificial
 * page-wide two-rail bounding union. Side strips, the other side, gaps
 * between columns and whitespace below the text can all be used.
 * Full-size labels are attempted first; fallback scale is only considered
 * when the geometry has insufficient space for the requested magnitude.
 * This is view-only geometry: CMD identities, owners and OCR boxes stay put.
 */
export function layoutPDFFreePageLabels(items,{pageWidth,pageHeight,covers=[],gap=9,padding=3}={}){
  if(!items.length)return {slots:[],leaders:[],scale:1};
  const valid=items.filter(i=>i?.target&&Number.isFinite(i.width)&&i.width>0&&
    Number.isFinite(i.height)&&i.height>0&&Number.isFinite(i.anchorY));
  const obstacles=covers.filter(r=>[r.left,r.right,r.top,r.bottom].every(Number.isFinite));
  const widths=[1,.97,.93,.89,.84,.78,.7,.6,.5];
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const intersectsX=(x,w,r)=>x<r.right+gap&&x+w>r.left-gap;
  const pack=(scale,sortMode)=>{
    const placed=[];
    const prepared=valid.map(item=>({...item,w:item.width*scale,h:item.height*scale}));
    prepared.sort((a,b)=>sortMode===0?
      a.anchorY-b.anchorY||b.w-a.w||a.id.localeCompare(b.id,undefined,{numeric:true}):
      sortMode===1?b.w*b.h-a.w*a.h||a.anchorY-b.anchorY:
      a.side.localeCompare(b.side)||a.anchorY-b.anchorY);
    for(const item of prepared){
      const {w,h}=item;
      const limitX=pageWidth-padding-w,limitY=pageHeight-padding-h;
      if(limitX<padding||limitY<padding)return null;
      const xSet=new Set();
      const add=x=>{if(Number.isFinite(x))xSet.add(Math.round(clamp(x,padding,limitX)*10)/10);};
      add(padding);add(limitX);
      add(item.target.left-gap-w);add(item.target.right+gap);
      const interval=Math.max(9,Math.min(23,w*.45));
      for(let x=padding;x<=limitX;x+=interval)add(x);
      for(const r of obstacles){add(r.left-gap-w);add(r.right+gap);}
      for(const r of placed){add(r.left-gap-w);add(r.left+r.width+gap);}
      let best=null;
      const preferredY=clamp(item.anchorY-h/2,padding,limitY);
      const preferredX=item.side==='right'?item.target.right+gap:item.target.left-gap-w;
      for(const x of xSet){
        const occupied=[];
        for(const r of obstacles)if(intersectsX(x,w,r))
          occupied.push([r.top-gap-h,r.bottom+gap]);
        for(const r of placed)if(intersectsX(x,w,{left:r.left,right:r.left+r.width,top:r.top,bottom:r.top+r.height}))
          occupied.push([r.top-gap-h,r.top+r.height+gap]);
        occupied.sort((a,b)=>a[0]-b[0]);
        let current=padding;
        const candidateY=[];
        for(const [start,end] of occupied){
          if(start>=current&&current<=limitY)
            candidateY.push(clamp(preferredY,current,Math.min(start,limitY)));
          current=Math.max(current,end);
          if(current>limitY)break;
        }
        if(current<=limitY)candidateY.push(clamp(preferredY,current,limitY));
        for(const y of candidateY){
          const sideMismatch=item.side==='right'?(x+w/2<pageWidth/2):
            (x+w/2>pageWidth/2);
          const insideTargetX=x+w>item.target.left&&x<item.target.right;
          const score=Math.abs(y-preferredY)*1.65+
            Math.abs(x-preferredX)*.20+(sideMismatch?20:0)+
            (insideTargetX?14:0)+Math.abs(y-(item.anchorY-h/2))*.12;
          if(!best||score<best.score)best={left:x,top:y,score};
        }
      }
      if(!best)return null;
      placed.push({...item,left:best.left,top:best.top,width:w,height:h,scale,side:item.side});
    }
    return placed;
  };
  let slots=null,scale=1;
  for(const size of widths){
    // Different deterministic orders avoid one greedy first-fit placement
    // turning otherwise adequate page whitespace into a false shortage.
    for(let order=0;order<3;order++){
      const attempt=pack(size,order);
      if(attempt){slots=attempt;scale=size;break;}
    }
    if(slots)break;
  }
  if(!slots)return {slots:[],leaders:[],scale:0,unplaced:valid.map(i=>i.id)};
  const leaders=slots.map(item=>{
    // A label can move to the opposite gutter or below its target.
    // Connect the nearest two rectangle boundaries, not the target's
    // originally assigned left/right edge; that would cross OCR content.
    const cx=item.left+item.width/2,cy=item.top+item.height/2;
    const xEnd=clamp(cx,item.target.left,item.target.right);
    const yEnd=clamp(cy,item.target.top,item.target.bottom);
    const xStart=clamp(xEnd,item.left,item.left+item.width);
    const yStart=clamp(yEnd,item.top,item.top+item.height);
    return {id:item.id,side:item.side,kind:item.kind,
      path:`M ${xStart.toFixed(2)} ${yStart.toFixed(2)} L ${xEnd.toFixed(2)} ${yEnd.toFixed(2)}`,
      endpoint:{x:xEnd,y:yEnd}};
  });
  return {slots,leaders,scale};
}
