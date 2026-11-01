/** Select a physical PDF OCR region, including separately drawn caption/note
 * rectangles belonging to a single logical MinerU Block. Pure geometry:
 * no fabricated Block identities or edits to sealed OCR evidence.
 */
export function hitPDFRegion(page,point){
  const [width,height]=page?.pageSize||[];
  const [x,y]=point||[];
  if(![width,height,x,y].every(Number.isFinite)||width<=0||height<=0||
    x<0||y<0||x>width||y>height)return null;
  let selected=null;
  let area=Infinity;
  // Child rectangles are real OCR geometry and must win over a containing
  // parent body. A parent selection carries partIndex=null; child uses its
  // actual subRegions array index, avoiding counterfeit CMD anchors.
  for(const block of page.regions||[]){
    // Child first: the `table_body` child may share exactly the parent bbox.
    // Equal-area hits select its native s-index rather than a generic parent.
    const candidates=[...(block.subRegions||[]).map((part,i)=>({bbox:part.bbox,
      partIndex:i,role:part.role||'body',path:part.path})),
      {bbox:block.bbox,partIndex:null,role:'body',path:null}];
    for(const candidate of candidates){
      const [l,t,r,b]=candidate.bbox||[];
      if(![l,t,r,b].every(Number.isFinite)||r<=l||b<=t||
        x<l||x>r||y<t||y>b)continue;
      const current=(r-l)*(b-t);
      if(current<area){area=current;selected={blockIndex:block.blockIndex,
        partIndex:candidate.partIndex,role:candidate.role,bbox:candidate.bbox,
        path:candidate.path};}
    }
  }
  return selected;
}
