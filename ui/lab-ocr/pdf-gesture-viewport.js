/** Client-viewport ↔ fixed overlay coordinates.
 *
 * Safari pinch zoom / visualViewport panning can shift and scale fixed
 * overlays relative to getBoundingClientRect() of a PDF label. SVG drawing
 * commands use the SVG's own user coordinate system, not client coordinates.
 *
 * This is geometry only. No PDF or OCR module dependencies.
 */
export function clientToOverlayPoint(element,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))
    throw Error('屏幕坐标必须是有限数值');
  const rect=element.getBoundingClientRect();
  const width=element.clientWidth,height=element.clientHeight;
  if(!(rect.width>0&&rect.height>0&&width>0&&height>0))
    throw Error('拖动浮层还没有有效尺寸');
  return {x:(x-rect.left)*width/rect.width,
    y:(y-rect.top)*height/rect.height};
}

/** Position an overlay at a desired *client* viewport point.
 * Apply a measured client-space delta to the current fixed CSS position;
 * fixed CSS 0,0 is not necessarily client 0,0 on zoomed mobile Safari.
 * The overlay is attached directly to document.body: an overlay's own CSS
 * transform can SCALE its rectangle but does NOT scale movement of its CSS
 * left/top (with top-left transform origin). Do not infer translation scale
 * from offsetWidth / getBoundingClientRect().width.
 */
export function positionFixedOverlayAt(element,x,y){
  if(!Number.isFinite(x)||!Number.isFinite(y))
    throw Error('浮层落点必须是有限数值');
  let left=Number.parseFloat(element.style.left),top=Number.parseFloat(element.style.top);
  if(!Number.isFinite(left)){left=0;element.style.left='0px';}
  if(!Number.isFinite(top)){top=0;element.style.top='0px';}
  const rect=element.getBoundingClientRect();
  if(!(rect.width>0&&rect.height>0))
    throw Error('浮层没有有效尺寸');
  element.style.left=(left+x-rect.left)+'px';
  element.style.top=(top+y-rect.top)+'px';
}
