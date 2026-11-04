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
