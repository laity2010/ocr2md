/** PDF Block drag hit testing. Adapted from Main's coverage-hit semantics.
 * Source/target are stable BlockIDs; PBS strings are presentation only.
 * Coordinates are client-pixel DOMRect values, never OCR bbox mutations.
 */
const inside=(r,x,y)=>r&&r.width>0&&r.height>0&&
  x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;

export function blockDropPlacements(source,target){
  if(!source||!target||String(source.blockId)===String(target.blockId))return [];
  const a=source.parentBlockId==null?null:String(source.parentBlockId);
  const b=target.parentBlockId==null?null:String(target.parentBlockId);
  if(source.page!==target.page)return []; // WP1–WP5: no cross-page writes
  if(a===null)return b===null?['before','child','after']:['child'];
  if(a!==null&&a===b)return ['before','after'];
  return [];
}

export function pickBlockDropTarget(candidates,{x,y,source,clip}){
  if(!inside(clip,x,y))return null;
  const possibles=candidates.filter(target=>
    target.page===source?.page && String(target.blockId)!==String(source.blockId))
    .map(target=>({...target,
      slots:blockDropPlacements(source,target),
      insideBadge:inside(target.badgeRect,x,y),
      insideCover:inside(target.coverRect,x,y),
      area:target.coverRect?.width*target.coverRect?.height||Infinity}))
    .filter(item=>item.slots.length&&(item.insideBadge||item.insideCover))
    .sort((a,b)=>(Number(b.insideBadge)-Number(a.insideBadge))||
      a.area-b.area||
      (a.parentBlockId==null?-1:1)-(b.parentBlockId==null?-1:1)||
      String(a.blockId).localeCompare(String(b.blockId),'en',{numeric:true}));
  const first=possibles[0];
  if(!first)return null;
  // Two distinct unrelated physical bboxes at identical area and placement
  // are ambiguous. Do not silently attach an OCR block to the wrong parent.
  const second=possibles[1];
  if(second&&!first.insideBadge&&!second.insideBadge&&
     Math.abs(second.area-first.area)<Math.max(3,first.area*.015)&&
     first.parentBlockId!==second.parentBlockId&&
     ![first.blockId,second.blockId].includes(first.parentBlockId)&&
     ![first.blockId,second.blockId].includes(second.parentBlockId))return null;
  return first;
}

export function blockDropZone(x,guide,slots){
  if(!slots?.length||!guide?.width)return null;
  const index=Math.max(0,Math.min(slots.length-1,
    Math.floor((x-guide.left)/guide.width*slots.length)));
  return slots[index];
}
