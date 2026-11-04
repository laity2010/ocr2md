/** Geometry-only PDF drag hit testing. All coordinates are CSS client pixels
 * from PointerEvent.clientX/Y and Element.getBoundingClientRect(). Original
 * PDF bbox, DOM position and zoom scale are never mutated by a drop. */
const intersects=(a,b)=>a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
const distance=(rect,x,y)=>Math.hypot(Math.max(rect.left-x,0,x-rect.right),
  Math.max(rect.top-y,0,y-rect.bottom));
export const pdfDropGuideZone=(x,rect,child=false,childAndAfter=false)=>{
  if(child)return 'child';
  if(childAndAfter)return x<rect.left+rect.width/2?'child':'after';
  const third=rect.width/3;
  return x<rect.left+third?'before':x>=rect.right-third?'after':'child';
};
export const pdfArrowLocalPoint=(x,y,rect)=>({x:x-rect.left,y:y-rect.top});
/** A hit must be inside the visible PDF clip, near a REAL rendered chip,
 * and unambiguous. A scaled 5px tag must not steal a neighboring 17px label.
 */
export function pickPDFDropTarget(candidates,{x,y,sourceId,pageId,clip,pointerType='mouse'}){
  if(!clip||x<clip.left||x>clip.right||y<clip.top||y>clip.bottom)return null;
  const margin=pointerType==='touch'?22:15;
  const ranked=candidates.filter(c=>(pageId==null||c.pageId===pageId)&&
    c.rootId!==sourceId&&
    c.rect.width>0&&c.rect.height>0&&intersects(c.rect,clip))
    .map(c=>({...c,distance:distance(c.rect,x,y)}))
    .filter(c=>c.distance<=margin)
    .sort((a,b)=>a.distance-b.distance||
      Math.hypot(x-(a.rect.left+a.rect.right)/2,y-(a.rect.top+a.rect.bottom)/2)-
      Math.hypot(x-(b.rect.left+b.rect.right)/2,y-(b.rect.top+b.rect.bottom)/2));
  if(!ranked.length)return null;
  // Near-equal distances between labels in a crowded margin are not a
  // trustworthy landing. Ask for a more deliberate pointer position.
  if(ranked.length>1&&ranked[1].distance-ranked[0].distance<3&&
    !(ranked[0].distance===0&&ranked[1].distance>0))return null;
  const hit=ranked[0],cy=(hit.rect.top+hit.rect.bottom)/2;
  const placement=hit.kind==='child'?'child':y<cy-9?'before':y>cy+9?'after':'child';
  return {id:hit.id,rootId:hit.rootId,kind:hit.kind,placement,
    node:hit.node,rect:hit.rect};
}

/** The PDF *coverage rectangle*, not its outboard label, owns a drag hit.
 * The deepest actual rectangle wins. A child and parent with the SAME bbox
 * are physically indistinguishable: keep the parent as target so the two
 * parent landing actions remain reachable. Two overlapping unrelated boxes
 * with indistinguishable area are ambiguous and must not silently select one.
 */
export function pickPDFCoverDropTarget(candidates,{x,y,sourceId,pageId,clip}){
  if(!clip||x<clip.left||x>clip.right||y<clip.top||y>clip.bottom)return null;
  const inside=rect=>Number.isFinite(rect?.left)&&Number.isFinite(rect?.right)&&
    Number.isFinite(rect?.top)&&Number.isFinite(rect?.bottom)&&
    rect.right>rect.left&&rect.bottom>rect.top&&
    x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
  const contained=(a,b)=>a.left>=b.left-1&&a.right<=b.right+1&&
    a.top>=b.top-1&&a.bottom<=b.bottom+1;
  const area=rect=>(rect.right-rect.left)*(rect.bottom-rect.top);
  const matched=candidates.filter(c=>c.rootId!==sourceId&&
    (pageId==null||c.pageId===pageId)&&c.node&&
    intersects(c.rect,clip)&&inside(c.rect))
    .sort((a,b)=>area(a.rect)-area(b.rect));
  if(!matched.length)return null;
  const first=matched[0],second=matched[1];
  if(second){
    const firstArea=area(first.rect),secondArea=area(second.rect);
    const sameSize=Math.abs(firstArea-secondArea)<Math.max(3,firstArea*.015);
    const nested=contained(first.rect,second.rect);
    // A virtual body overlay can have the exact same physical bbox as its
    // parent. Prefer the parent there; otherwise the parent is unreachable.
    if(sameSize&&nested&&first.rootId===second.rootId&&first.kind!==second.kind){
      const chosen=first.kind==='parent'?first:second;
      return {...chosen,placement:'child'};
    }
    if(sameSize&&!nested)return null;
    if(sameSize&&first.rootId!==second.rootId)return null;
  }
  return {...first,placement:'child'};
}

/** Narrow temporary handoff from a captured PDF bbox to its outboard action
 * rail. Walking there should not drop the captured target mid-gesture. The
 * entire PDF page is NOT a sticky region: elsewhere the hover clears.
 */
export function pdfDropGuideCorridor(x,y,cover,rail,margin=21){
  if(!cover||!rail)return false;
  const center=r=>({x:(r.left+r.right)/2,y:(r.top+r.bottom)/2});
  const a=center(cover),b=center(rail),dx=b.x-a.x,dy=b.y-a.y;
  const denom=dx*dx+dy*dy;
  if(denom<1)return Math.hypot(x-a.x,y-a.y)<=margin;
  const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/denom));
  return Math.hypot(x-(a.x+t*dx),y-(a.y+t*dy))<=margin;
}
