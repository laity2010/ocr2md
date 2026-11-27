/** Local display ratio, no settings or SQL writes. */
export function clampRatio(ratio){return Math.max(.2,Math.min(.8,ratio));}
export function dividerRatio(x,left,width){return width>0?clampRatio((x-left)/width):.5;}
export function mountComparisonDivider(host,onResize){
  const el=document.createElement('div');
  el.className='translation-comparison-divider';el.hidden=true;el.tabIndex=0;
  el.setAttribute('role','separator');el.setAttribute('aria-label','调整原句窗与待译句窗宽度');
  el.setAttribute('aria-orientation','vertical');el.setAttribute('aria-valuemin','20');el.setAttribute('aria-valuemax','80');
  let ratio=.5,pointer=null;
  function apply(next){ratio=clampRatio(next);host.style.setProperty('--translation-left',String(ratio)+'fr');host.style.setProperty('--translation-right',String(1-ratio)+'fr');el.setAttribute('aria-valuenow',String(Math.round(ratio*100)));onResize?.();}
  function start(e){if(e.button!==0||pointer!==null)return;pointer=e.pointerId;el.setPointerCapture(pointer);e.preventDefault();}
  function move(e){if(pointer!==e.pointerId)return;const box=host.getBoundingClientRect();apply(dividerRatio(e.clientX,box.left,box.width));}
  function stop(e){if(pointer===e.pointerId)pointer=null;}
  function key(e){
    const value=e.key==='ArrowLeft'?ratio-.05:e.key==='ArrowRight'?ratio+.05:e.key==='Home'?.2:e.key==='End'?.8:null;
    if(value===null)return;apply(value);e.preventDefault();
  }
  el.addEventListener('pointerdown',start);el.addEventListener('pointermove',move);
  for(const event of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(event,stop);
  el.addEventListener('keydown',key);
  el.setAttribute('aria-valuenow','50');
  return Object.freeze({element:el,dispose(){el.removeEventListener('pointerdown',start);el.removeEventListener('pointermove',move);for(const event of ['pointerup','pointercancel','lostpointercapture'])el.removeEventListener(event,stop);el.removeEventListener('keydown',key);el.remove();}});
}
