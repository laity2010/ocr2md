/** PDF-only pointer handles: no CM6 access, OCR parsing or persistence.
 * Every completed gesture emits an explicit semantic (PBS ID, bbox, source)
 * request; a host callback owns the transaction. Browser-agnostic. */
export function createPDFBBoxGesture(pageDiv,current,{readSource,commit,status,canReport=()=>true}={}){
  if(!(pageDiv instanceof HTMLElement)||!current?.id||!Array.isArray(current.bbox)||
    !Array.isArray(current.pageSize)||typeof readSource!=='function'||typeof commit!=='function')
    throw TypeError('PDF bbox gesture needs page DOM and semantic callbacks');
  let dragging=null,disposed=false;
  const node=document.createElement('div');node.className='ocr-pdf-bbox-editor';
  node.dataset.pbsId=current.id;
  node.setAttribute('aria-label',`PDF 覆盖框人工修正 ${current.id}`);
  node.title=`橙色虚线＝当前选中的 ${current.id} 可编辑覆盖框；拖动角点修改坐标，不代表 OCR 缺失`;
  const paint=bbox=>{
    const [w,h]=current.pageSize,[x0,y0,x1,y1]=bbox;
    node.style.left=x0/w*100+'%';node.style.top=y0/h*100+'%';
    node.style.width=(x1-x0)/w*100+'%';node.style.height=(y1-y0)/h*100+'%';
  };
  paint(current.bbox);
  const modes=[['move','移动'],['nw','左上'],['ne','右上'],['sw','左下'],['se','右下']];
  for(const [mode,label] of modes){
    const ctrl=document.createElement('button');ctrl.type='button';
    ctrl.className=`ocr-pdf-bbox-handle ocr-pdf-bbox-${mode}`;
    ctrl.setAttribute('aria-label',`${label} ${current.id} PDF 框`);
    ctrl.title=`${label} ${current.id} PDF 框`;ctrl.textContent=mode==='move'?'⠿':'';
    ctrl.addEventListener('click',event=>{event.stopPropagation();event.preventDefault();});
    ctrl.addEventListener('pointerdown',event=>{
      if(disposed||dragging||event.pointerType==='mouse'&&event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      const rect=pageDiv.getBoundingClientRect();
      if(rect.width<=0||rect.height<=0)return;
      dragging={pointerId:event.pointerId,id:current.id,mode,
        startX:event.clientX,startY:event.clientY,
        source:readSource(),box:[...current.bbox],draft:[...current.bbox],
        pageWidth:rect.width,pageHeight:rect.height,pageSize:current.pageSize};
      try{ctrl.setPointerCapture(event.pointerId);}catch{}
    });
    const move=event=>{
      const drag=dragging;
      if(!drag||drag.pointerId!==event.pointerId||drag.id!==current.id)return;
      event.preventDefault();event.stopPropagation();
      const [w,h]=drag.pageSize;
      const dx=(event.clientX-drag.startX)/drag.pageWidth*w;
      const dy=(event.clientY-drag.startY)/drag.pageHeight*h;
      const [x0,y0,x1,y1]=drag.box;const min=0.5;
      let next;
      if(mode==='move'){
        const X=Math.max(-x0,Math.min(w-x1,dx));
        const Y=Math.max(-y0,Math.min(h-y1,dy));
        next=[x0+X,y0+Y,x1+X,y1+Y];
      }else{
        const left=mode.includes('w')?Math.min(x1-min,Math.max(0,x0+dx)):x0;
        const right=mode.includes('e')?Math.max(x0+min,Math.min(w,x1+dx)):x1;
        const top=mode.includes('n')?Math.min(y1-min,Math.max(0,y0+dy)):y0;
        const bottom=mode.includes('s')?Math.max(y0+min,Math.min(h,y1+dy)):y1;
        next=[left,top,right,bottom];
      }
      drag.draft=next;paint(next);
    };
    ctrl.addEventListener('pointermove',move);
    const end=event=>{
      const drag=dragging;
      if(!drag||drag.pointerId!==event.pointerId||drag.id!==current.id)return;
      const canceled=event.type==='pointercancel';
      if(!canceled)move(event);
      dragging=null;
      try{if(ctrl.hasPointerCapture(event.pointerId))ctrl.releasePointerCapture(event.pointerId);}catch{}
      event.preventDefault();event.stopPropagation();
      if(canceled||drag.box.every((n,i)=>Math.abs(n-drag.draft[i])<.0001)){
        paint(drag.box);return;
      }
      void Promise.resolve().then(()=>commit(drag.id,drag.draft,drag.source)).then(result=>{
        if(!disposed&&canReport())status?.(result?.changed?
          `${drag.id} PDF 覆盖框已修正 · CMD 未保存，可 Undo`:'框坐标无变化');
      }).catch(error=>{
        if(!disposed){paint(drag.box);if(canReport())status?.('覆盖框修正失败：'+error.message);}
      });
    };
    ctrl.addEventListener('pointerup',end);ctrl.addEventListener('pointercancel',end);
    node.append(ctrl);
  }
  pageDiv.append(node);
  return Object.freeze({node,get dragging(){return Boolean(dragging);},
    dispose(){disposed=true;dragging=null;node.remove();}});
}
