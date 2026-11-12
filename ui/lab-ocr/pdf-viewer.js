/** Lab OCR PDF view: no CMD, MinerU or SQLite coupling.
 * Consumes opaque caller-provided block IDs, PBS display labels and geometry.
 * Public loader: loadPdf(authorized URL). The view owns PDF.js lifetime.
 */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import {layoutPbsLabels} from './pbs-label-layout.js';
import {indexBlockParents,blockHighlight} from './pbs-family.js';
import {pickBlockDropTarget,blockDropZone} from './pdf-block-drop.js';
import './pdf-viewer.css';
GlobalWorkerOptions.workerSrc=workerUrl;

const zoomLevels=Object.freeze([25,50,75,100,125,150,200,300,400]);

export function mountLabOcrPdf({surface,toolbar,onStatus=()=>{}}){
  if(!surface||!toolbar||surface.querySelector('.lab-ocr-pdf-root'))
    throw Error('PDF 窗口不存在或已经挂载');
  const controls=document.createElement('div');controls.className='lab-ocr-pdf-controls';
  controls.setAttribute('role','toolbar');controls.setAttribute('aria-label','PDF 页码与缩放');
  const pageLabel=document.createElement('label');pageLabel.className='lab-ocr-pdf-page-label';
  pageLabel.textContent='页';
  const pageInput=document.createElement('input');pageInput.type='number';pageInput.min='1';
  pageInput.value='1';pageInput.className='lab-ocr-pdf-page';pageInput.setAttribute('aria-label','PDF 当前页');
  const count=document.createElement('span');count.className='lab-ocr-pdf-count';count.textContent='/ —';
  pageLabel.append(pageInput,count);
  const zoomSelect=document.createElement('select');zoomSelect.className='lab-ocr-pdf-scale';
  zoomSelect.setAttribute('aria-label','PDF 缩放');
  zoomSelect.add(new Option('适宽','page-width'));
  for(const level of zoomLevels)zoomSelect.add(new Option(level+'%',String(level)));
  zoomSelect.value='page-width';
  const overlayLabel=document.createElement('label');
  overlayLabel.className='lab-ocr-pdf-overlay-control';
  overlayLabel.textContent='覆盖框';
  const overlaySelect=document.createElement('select');
  overlaySelect.className='lab-ocr-pdf-overlay-level';
  overlaySelect.setAttribute('aria-label','PDF 覆盖框粒度');
  overlaySelect.append(new Option('关闭','off'),new Option('Block','block'),new Option('Span','span'));
  overlaySelect.value='off';overlaySelect.disabled=true;
  overlayLabel.append(overlaySelect);
  controls.append(pageLabel,zoomSelect,overlayLabel);
  toolbar.replaceChildren(controls);
  surface.dataset.pdfTheme='dark';surface.classList.add('lab-ocr-pdf-surface');
  const root=document.createElement('div');root.className='lab-ocr-pdf-root';
  const scroller=document.createElement('div');scroller.className='lab-ocr-pdf-scroller pdfViewerContainer';
  scroller.tabIndex=0;scroller.setAttribute('aria-label','PDF 连续页面');
  const pages=document.createElement('div');pages.className='pdfViewer';scroller.append(pages);
  const placeholder=document.createElement('div');placeholder.className='lab-ocr-pdf-placeholder';
  placeholder.textContent='请在全局设置中选择包含 pdf/ 的书籍资料目录';
  root.append(scroller,placeholder);surface.replaceChildren(root);
  const bus=new EventBus();
  const viewer=new PDFViewer({container:scroller,viewer:pages,eventBus:bus,
    maxCanvasPixels:/(iPad|iPhone|iPod)/i.test(navigator.userAgent)?1_500_000:6_000_000,
    textLayerMode:1,annotationMode:0});
  let disposed=false,ready=false,source=null,loading=null,task=null,pdf=null,revision=0;
  let resolvePaint=null;
  // Public setOverlays({level,loadPage,blockGroups,onBlockSelect}) + focusBlock.
  // The caller owns SQL/JSON; the viewer sees only geometry, public display
  // labels and stable IDs, never a database schema, raw source or disk path.
  let overlayLevel='off',loadOverlayPage=null,overlayRevision=0,blockGroups=null;
  let onBlockSelect=null,onBlockDragIntent=null,selectedBlockId=null,focusRequest=null;
  const overlayCache=new Map(),overlayPending=new Map(),overlayEpoch=new Map(),
    blockParents=new Map();
  const dropCandidatesByPage=new Map();
  let blockDrag=null,dragSuppressId=null,dragSuppressUntil=0;
  const railDepthByPage=new Map(),pbsLabelObservers=new Map();
  const pbsRelayoutByPage=new Map();
  // WebKit sometimes skips ResizeObserver notifications for max-content
  // buttons when a late stylesheet changes font metrics. A single CSS-change
  // observer also handles global font settings without polling or rereading SQL.
  let styleRefitPending=false;
  const refitAllPbsLabels=()=>{
    if(!disposed)for(const relayout of pbsRelayoutByPage.values())relayout();
  };
  const scheduleStyleRefit=()=>{
    if(disposed||!pbsRelayoutByPage.size)return;
    // WebKit may defer requestAnimationFrame while the PDF is off-screen.
    // Force a synchronous layout read right after CSS mutation so tags don't
    // temporarily occupy old rails, then correct again in the next frame.
    refitAllPbsLabels();
    if(styleRefitPending)return;
    styleRefitPending=true;
    requestAnimationFrame(()=>{
      styleRefitPending=false;
      refitAllPbsLabels();
    });
  };
  const cssObserver=new MutationObserver(scheduleStyleRefit);
  cssObserver.observe(document.head,{childList:true,subtree:true,attributes:true,
    attributeFilter:['style','class','media']});
  cssObserver.observe(document.documentElement,{attributes:true,attributeFilter:['style','class']});
  const labelGap=7; // actual button widths come from browser layout, not a fixed 78px chip
  function updateRailSpace(){
    let left=0,right=0;
    if(overlayLevel==='block')for(const depth of railDepthByPage.values()){
      left=Math.max(left,depth.left);right=Math.max(right,depth.right);
    }
    const requiredLeft=Math.max(88,3+left);
    const requiredRight=Math.max(88,3+right);
    const nextLeft=requiredLeft+'px',nextRight=requiredRight+'px';
    if(pages.style.paddingLeft!==nextLeft||pages.style.paddingRight!==nextRight){
      // Update scrollable paper gutters; never silently clip outer labels.
      const oldPaper=viewer.getPageView(Math.max(0,viewer.currentPageNumber-1))?.div;
      const oldX=oldPaper?.getBoundingClientRect().left;
      pages.style.paddingLeft=nextLeft;pages.style.paddingRight=nextRight;
      if(oldX!==undefined){
        const delta=oldPaper.getBoundingClientRect().left-oldX;
        if(Number.isFinite(delta))scroller.scrollLeft+=delta;
      }
    }
  }
  const resetRailSpace=()=>{railDepthByPage.clear();updateRailSpace();};
  const clearOverlayNodes=()=>{
    cancelBlockDrag(true);
    for(const observer of pbsLabelObservers.values())observer.disconnect();
    pbsLabelObservers.clear();pbsRelayoutByPage.clear();
    dropCandidatesByPage.clear();
    for(const node of pages.querySelectorAll('.lab-ocr-pdf-overlay-layer,.lab-ocr-pdf-pbs-layer'))node.remove();
    resetRailSpace();
  };
  const blockIdOf=item=>item?.blockId==null?null:String(item.blockId);
  const announceDrag=(message,kind='info')=>{if(!disposed)onStatus('Block 手势 · '+message,kind);};
  function cancelBlockDrag(silent=false){
    const drag=blockDrag;
    if(!drag)return;
    blockDrag=null;
    clearTimeout(drag.timer);clearInterval(drag.scrollTimer);
    document.removeEventListener('pointermove',drag.onMove,true);
    document.removeEventListener('pointerup',drag.onUp,true);
    document.removeEventListener('pointercancel',drag.onCancel,true);
    drag.sourceButton.classList.remove('lab-ocr-pdf-drag-source');
    drag.target?.element?.classList.remove('lab-ocr-pdf-drop-target');
    drag.guide?.remove();drag.arrow?.remove();
    if(drag.active){dragSuppressId=drag.source.blockId;dragSuppressUntil=performance.now()+650;}
    try{if(drag.sourceButton.hasPointerCapture(drag.pointerId))
      drag.sourceButton.releasePointerCapture(drag.pointerId);}catch{}
    if(!silent)announceDrag('取消拖动，结构未修改');
  }
  function armBlockDrag(event,button,source){
    if(!onBlockDragIntent||overlayLevel!=='block'||blockDrag||event.button!==0)return;
    const drag={source,sourceButton:button,pointerId:event.pointerId,
      pointerType:event.pointerType,startX:event.clientX,startY:event.clientY,
      x:event.clientX,y:event.clientY,active:false,target:null,placement:null,
      arrow:null,guide:null,timer:null,scrollTimer:null};
    blockDrag=drag;
    const moved=()=>Math.hypot(drag.x-drag.startX,drag.y-drag.startY);
    const viewRect=()=>scroller.getBoundingClientRect();
    const guideAt=(target)=>{
      if(!drag.guide||drag.guide.dataset.blockId!==target.blockId){
        drag.guide?.remove();
        const guide=document.createElement('div');
        guide.className='lab-ocr-pdf-drop-guide';guide.dataset.blockId=target.blockId;
        for(const placement of target.slots){
          const item=document.createElement('span');
          item.dataset.placement=placement;
          item.textContent=({before:'之前',child:'作为子块',after:'之后'})[placement];
          guide.append(item);
        }
        document.body.append(guide);drag.guide=guide;
      }
      const box=target.button.getBoundingClientRect();
      const clip=viewRect();
      const width=drag.guide.offsetWidth,height=drag.guide.offsetHeight;
      drag.guide.style.left=Math.max(clip.left+3,Math.min(box.left+(box.width-width)/2,
        clip.right-width-3))+'px';
      drag.guide.style.top=(box.bottom+height+8<=clip.bottom?box.bottom+4:
        Math.max(clip.top+3,box.top-height-4))+'px';
    };
    const update=(x,y)=>{
      if(blockDrag!==drag)return;
      drag.x=x;drag.y=y;
      if(!drag.active){
        if(moved()>11)cancelBlockDrag(true); // Normal scroll or incidental swipe.
        return;
      }
      const clip=viewRect();
      const candidates=[...dropCandidatesByPage.values()].flat()
        .filter(c=>c.button.isConnected&&c.element?.isConnected)
        .map(c=>({...c,badgeRect:c.button.getBoundingClientRect(),
          coverRect:c.element.getBoundingClientRect()}));
      const sticky=drag.target&&drag.guide&&(()=>{
        const r=drag.guide.getBoundingClientRect();
        return x>=r.left-5&&x<=r.right+5&&y>=r.top-5&&y<=r.bottom+5;
      })();
      const hit=moved()>=12?(sticky?drag.target:
        pickBlockDropTarget(candidates,{x,y,source,clip})):null;
      if(drag.target?.blockId!==hit?.blockId){
        drag.target?.element?.classList.remove('lab-ocr-pdf-drop-target');
        drag.guide?.remove();drag.guide=null;
      }
      drag.target=hit||null;
      drag.placement=null;
      if(hit){
        hit.element.classList.add('lab-ocr-pdf-drop-target');
        guideAt(hit);
        const rect=drag.guide.getBoundingClientRect();
        const onGuide=x>=rect.left-5&&x<=rect.right+5&&y>=rect.top-5&&y<=rect.bottom+5;
        if(onGuide)drag.placement=blockDropZone(x,rect,hit.slots);
        else if(hit.slots.length===1)drag.placement=hit.slots[0];
        else{
          const cover=hit.coverRect,ratio=(y-cover.top)/Math.max(1,cover.height);
          drag.placement=hit.slots[Math.max(0,Math.min(hit.slots.length-1,
            Math.floor(ratio*hit.slots.length)))];
        }
        drag.guide.dataset.placement=drag.placement;
        for(const node of drag.guide.children)
          node.classList.toggle('active',node.dataset.placement===drag.placement);
      }
      announceDrag(hit?`${source.pbs} → ${hit.pbs} · ${({before:'之前',child:'作为子块',after:'之后'})[drag.placement]} · 松手应用`:
        '箭头拖向目标覆盖框，选择落点（未命中不修改）');
      const start=button.getBoundingClientRect(),head=drag.guide?.getBoundingClientRect();
      const sx=(start.left+start.right)/2,sy=(start.top+start.bottom)/2;
      const slot=head&&hit?hit.slots.indexOf(drag.placement):-1;
      const ex=head&&slot>=0?head.left+(slot+.5)*head.width/hit.slots.length:x;
      const ey=head?(head.top+head.bottom)/2:y;
      const bend=(sx+ex)/2;
      drag.arrow.querySelector('path').setAttribute('d',
        `M ${sx} ${sy} Q ${bend} ${Math.min(sy,ey)-26} ${ex} ${ey}`);
      drag.arrow.querySelector('circle').setAttribute('cx',String(ex));
      drag.arrow.querySelector('circle').setAttribute('cy',String(ey));
    };
    const scroll=()=>{
      if(!drag.active||blockDrag!==drag||moved()<12)return;
      const rect=viewRect();
      if(drag.x<rect.left||drag.x>rect.right||
         drag.y<rect.top||drag.y>rect.bottom)return;
      const edge=46,rate=19;
      const towardBottom=Math.max(0,Math.min(1,(drag.y-(rect.bottom-edge))/edge));
      const towardTop=Math.max(0,Math.min(1,((rect.top+edge)-drag.y)/edge));
      const delta=towardBottom?rate*towardBottom:towardTop?-rate*towardTop:0;
      if(delta){const prior=scroller.scrollTop;scroller.scrollTop+=delta;
        if(prior!==scroller.scrollTop)update(drag.x,drag.y);}
    };
    drag.onMove=e=>{if(e.pointerId===drag.pointerId)update(e.clientX,e.clientY);};
    drag.onUp=e=>{
      if(e.pointerId!==drag.pointerId)return;
      const active=drag.active,target=drag.target,placement=drag.placement;
      cancelBlockDrag(true);
      if(!active)return;
      e.preventDefault();e.stopPropagation();
      if(!target||!placement){announceDrag('未命中有效落点，结构不变');return;}
      announceDrag(`申请 ${source.pbs} → ${target.pbs} · ${placement} …`);
      Promise.resolve().then(()=>onBlockDragIntent?.({
        sourceBlockId:Number(source.blockId),
        targetBlockId:Number(target.blockId),placement,page:source.page
      })).catch(error=>announceDrag('写入失败：'+error.message,'error'));
    };
    drag.onCancel=e=>{if(e.pointerId===drag.pointerId)cancelBlockDrag();};
    document.addEventListener('pointermove',drag.onMove,true);
    document.addEventListener('pointerup',drag.onUp,true);
    document.addEventListener('pointercancel',drag.onCancel,true);
    try{button.setPointerCapture(event.pointerId);}catch{}
    drag.timer=setTimeout(()=>{
      if(blockDrag!==drag)return;
      drag.active=true;button.classList.add('lab-ocr-pdf-drag-source');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.classList.add('lab-ocr-pdf-drag-arrow');
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('r','5');svg.append(path,circle);document.body.append(svg);
      drag.arrow=svg;
      drag.scrollTimer=setInterval(scroll,32);
      announceDrag(`已抓住 ${source.pbs} · 指向覆盖框选择「之前／作为子块／之后」`);
      update(drag.x,drag.y);
    },370);
  }
  // Geometry dedup must NOT dedup distinct logical PBS labels. A parent and
  // its s1 (or two siblings) can have identical MinerU bboxes. Reuse one
  // coverage rectangle, but retain one clickable tag per distinct PBS.
  // Same-PBS aliases from overlapping processing groups share a single tag.
  function includePbsLabel(entry,item,bbox){
    if(overlayLevel!=='block')return;
    const blockId=blockIdOf(item),pbs=item?.pbs==null?'':String(item.pbs);
    if(!blockId||!pbs)return;
    const existing=entry.labels.find(label=>label.pbs===pbs);
    if(existing){existing.blockIds.add(blockId);return;}
    entry.labels.push({pbs,blockId,group:String(item.blockGroup??''),
      parentBlockId:item.parentBlockId,bbox,blockIds:new Set([blockId])});
  }
  const highlightKind=ids=>blockHighlight(ids,selectedBlockId,blockParents);
  const updateSelectedNodes=()=>{
    for(const node of pages.querySelectorAll('.lab-ocr-pdf-overlay-box[data-block-ids],.lab-ocr-pdf-pbs-tag[data-block-ids]')){
      const state=highlightKind(node.dataset.blockIds.split(' '));
      node.dataset.selected=String(state==='direct');
      node.dataset.familySelected=String(state==='family');
    }
  };
  function activateBlock(meta,notify){
    if(!meta?.blockId)return;
    selectedBlockId=String(meta.blockId);
    focusRequest=null;
    updateSelectedNodes();
    if(notify)onBlockSelect?.({...meta,blockId:selectedBlockId});
  }
  function paintPageBoxes(page,data){
    if(disposed||!pdf||overlayLevel==='off'||page>pdf.numPages)return;
    if(blockDrag?.source.page===page)cancelBlockDrag(true);
    dropCandidatesByPage.delete(page);
    const pageView=viewer.getPageView(page-1);
    const host=pageView?.div;
    if(!host)return;
    host.querySelector('.lab-ocr-pdf-overlay-layer')?.remove();
    pbsLabelObservers.get(page)?.disconnect();pbsLabelObservers.delete(page);
    pbsRelayoutByPage.delete(page);
    host.querySelector('.lab-ocr-pdf-pbs-layer')?.remove();
    if(overlayLevel!=='block'){railDepthByPage.delete(page);updateRailSpace();}
    const size=data?.pageSize;
    if(!Array.isArray(size)||size.length!==2||!size.every(n=>Number.isFinite(n)&&n>0))return;
    if(data.page!==page||data.level!==overlayLevel||!Array.isArray(data.boxes))return;
    // Read-only identity map includes every source Block, even invisible
    // block groups and deduplicated aliases; PBS text is never a key.
    indexBlockParents(blockParents,data.boxes);
    // Refuse misleading labels when MinerU and PDF have incompatible axes.
    const viewport=pageView.viewport;
    if(viewport?.width&&viewport?.height){
      const ratio=size[0]/size[1],actual=viewport.width/viewport.height;
      if(Math.abs(ratio-actual)>actual*.04)return;
    }
    const layer=document.createElement('div');
    layer.className='lab-ocr-pdf-overlay-layer';
    layer.dataset.level=overlayLevel;layer.dataset.page=String(page);
    const clamp=(value,max)=>Math.max(0,Math.min(value,max));
    const seenIds=new Map(),seenRectangles=new Map(),visibleRects=[];
    // Display a single representative for near-identical geometries across
    // groups, but retain every alias Block ID for AG→PDF reverse navigation.
    const priority={para_blocks:0,discarded_blocks:1,preproc_blocks:2};
    const boxes=data.boxes.filter(item=>blockGroups===null||
      blockGroups.has(String(item?.blockGroup??''))).map((item,index)=>({item,index}));
    boxes.sort((a,b)=>(priority[a.item?.blockGroup]??3)-(priority[b.item?.blockGroup]??3)||a.index-b.index);
    for(const {item} of boxes){
      const rect=item?.bbox;
      if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite))continue;
      const [x1,y1,x2,y2]=rect;
      const left=clamp(x1,size[0]),top=clamp(y1,size[1]);
      const right=clamp(x2,size[0]),bottom=clamp(y2,size[1]);
      if(right<=left||bottom<=top)continue;
      const id=item.id==null?'':String(item.id);
      const rectKey=[left,top,right,bottom].map(n=>n.toFixed(4)).join(':');
      const group=String(item?.blockGroup??'');
      const area=(right-left)*(bottom-top);
      let duplicate=(id&&seenIds.get(id))||seenRectangles.get(rectKey);
      if(!duplicate)duplicate=visibleRects.find(prior=>{
        if(prior.group===group)return false;
        const ix=Math.max(0,Math.min(right,prior.right)-Math.max(left,prior.left));
        const iy=Math.max(0,Math.min(bottom,prior.bottom)-Math.max(top,prior.top));
        const intersection=ix*iy;
        return area+prior.area-intersection>0&&
          intersection/(area+prior.area-intersection)>=0.94;
      });
      const blockId=blockIdOf(item);
      if(duplicate){
        if(blockId)duplicate.blockIds.add(blockId);
        includePbsLabel(duplicate,item,[left,top,right,bottom]);
        if(id)seenIds.set(id,duplicate);
        seenRectangles.set(rectKey,duplicate);
        continue;
      }
      const entry={left,top,right,bottom,area,group,item,
        blockIds:new Set(blockId?[blockId]:[]),labels:[],element:null};
      includePbsLabel(entry,item,[left,top,right,bottom]);
      visibleRects.push(entry);
      if(id)seenIds.set(id,entry);
      seenRectangles.set(rectKey,entry);
      const box=document.createElement('div');box.className='lab-ocr-pdf-overlay-box';
      box.dataset.id=id;
      box.dataset.child=String(item?.parentBlockId!==null&&item?.parentBlockId!==undefined);
      box.style.left=(left/size[0]*100)+'%';box.style.top=(top/size[1]*100)+'%';
      box.style.width=((right-left)/size[0]*100)+'%';
      box.style.height=((bottom-top)/size[1]*100)+'%';
      entry.element=box;layer.append(box);
    }
    for(const entry of visibleRects){
      entry.element.dataset.blockIds=[...entry.blockIds].join(' ');
      const highlight=highlightKind(entry.blockIds);
      entry.element.dataset.selected=String(highlight==='direct');
      entry.element.dataset.familySelected=String(highlight==='family');
    }
    host.append(layer);
    if(overlayLevel==='block'){
      // PBS tags live OUTSIDE the page paper in independent fixed-pixel rails.
      // SVG leaders use the same page pixel coordinate frame as PDF.js.
      const tagLayer=document.createElement('div');
      tagLayer.className='lab-ocr-pdf-pbs-layer';tagLayer.dataset.page=String(page);
      const width=viewport.width,height=viewport.height;
      const labelInputs=visibleRects.flatMap(entry=>entry.labels.map(label=>({
        pbs:label.pbs,blockId:label.blockId,group:label.group,
        parentBlockId:label.parentBlockId,blockIds:label.blockIds,
        bbox:[label.bbox[0]/size[0]*width,label.bbox[1]/size[1]*height,
          label.bbox[2]/size[0]*width,label.bbox[3]/size[1]*height],
      })));
      const placements=layoutPbsLabels(labelInputs,width,height);
      const ns='http://www.w3.org/2000/svg';
      const leaders=document.createElementNS(ns,'svg');
      leaders.setAttribute('viewBox',`0 0 ${width} ${height}`);
      leaders.setAttribute('preserveAspectRatio','none');
      leaders.classList.add('lab-ocr-pdf-pbs-leaders');
      const badges=[],dropCandidates=[];
      for(const placement of placements){
        const button=document.createElement('button');button.type='button';
        button.className='lab-ocr-pdf-pbs-tag';
        button.dataset.side=placement.side;
        button.dataset.lane=String(placement.lane);
        button.dataset.child=String(placement.parentBlockId!==null&&placement.parentBlockId!==undefined);
        button.dataset.blockId=placement.blockId;
        button.dataset.blockIds=[...placement.blockIds].join(' ');
        const highlight=highlightKind(placement.blockIds);
        button.dataset.selected=String(highlight==='direct');
        button.dataset.familySelected=String(highlight==='family');
        button.style.top=placement.top+'px';
        button.textContent=placement.pbs;
        button.title=`${placement.pbs} · Block ID ${placement.blockId} · ${placement.group}`;
        button.setAttribute('aria-label',`定位 ${placement.pbs}`);
        button.addEventListener('click',()=>{
          if(dragSuppressId===placement.blockId&&performance.now()<dragSuppressUntil)return;
          activateBlock({blockId:placement.blockId,
            pbs:placement.pbs,page,blockGroup:placement.group},true);
        });
        const source={blockId:placement.blockId,pbs:placement.pbs,page,
          parentBlockId:placement.parentBlockId==null?null:String(placement.parentBlockId)};
        const entry=visibleRects.find(record=>record.blockIds.has(placement.blockId));
        if(entry?.element){
          dropCandidates.push({...source,button,element:entry.element});
          button.addEventListener('pointerdown',event=>armBlockDrag(event,button,source));
        }
        badges.push({placement,button});
        tagLayer.append(button);
      }
      host.append(tagLayer);
      dropCandidatesByPage.set(page,dropCandidates);
      // Place by ACTUAL browser rectangles rather than assumed glyph widths.
      // The next tag moves outward only if its displayed vertical interval
      // would intersect a prior tag. This also handles late font loading,
      // different PBS lengths and dynamic iPad text metrics.
      const positionBadges=()=>{
        if(!tagLayer.isConnected)return;
        const placed={left:[],right:[]},depth={left:0,right:0};
        leaders.replaceChildren();
        for(const {placement,button} of badges){
          const side=placement.side;
          // Offsets and inline positions are in the same layout-pixel frame;
          // getBoundingClientRect() can have a different transform scale on
          // WebKit PDF.js page re-render and must not be mixed with offsetTop.
          const widthPx=button.offsetWidth,heightPx=button.offsetHeight;
          const top=button.offsetTop;
          let near=labelGap;
          const vertical=placed[side].filter(p=>top<p.top+p.height+3&&top+heightPx+3>p.top)
            .sort((x,y)=>x.near-y.near);
          for(const existing of vertical){
            if(near<existing.far+labelGap&&near+widthPx+labelGap>existing.near)
              near=existing.far+labelGap;
          }
          const far=near+widthPx;
          if(side==='left')button.style.left=-far+'px';
          else button.style.right=-far+'px';
          placed[side].push({near,far,top,height:heightPx});
          depth[side]=Math.max(depth[side],far);
          const startX=side==='left'?-near:width+near;
          const edgeX=side==='left'?-2:width+2;
          const fromY=top+heightPx/2;
          const leader=document.createElementNS(ns,'polyline');
          leader.dataset.child=String(placement.parentBlockId!==null&&placement.parentBlockId!==undefined);
          leader.setAttribute('points',`${startX},${fromY} ${edgeX},${fromY} ${edgeX},${placement.anchorY} ${placement.anchorX},${placement.anchorY}`);
          leaders.append(leader);
        }
        railDepthByPage.set(page,depth);
        updateRailSpace();
      };
      tagLayer.prepend(leaders);
      positionBadges();
      // Fonts and user display settings can resize text *after* initial
      // placement. Refit every badge on size changes instead of leaving two
      // PBS labels at stale, potentially intersecting x-positions.
      const labelObserver=new ResizeObserver(()=>positionBadges());
      for(const {button} of badges)labelObserver.observe(button);
      pbsLabelObservers.set(page,labelObserver);
      pbsRelayoutByPage.set(page,positionBadges);
    }
    updateSelectedNodes();
    if(focusRequest?.page===page){
      const found=visibleRects.find(entry=>entry.blockIds.has(focusRequest.id));
      if(found){
        focusRequest=null;
        const target=found.element;
        queueMicrotask(()=>{if(target.isConnected)target.scrollIntoView({block:'center',inline:'nearest'});});
      }
    }
  }
  function requestOverlayPage(page){
    if(disposed||!pdf||!ready||overlayLevel==='off'||!loadOverlayPage)return;
    if(!Number.isInteger(page)||page<1||page>pdf.numPages)return;
    const key=overlayLevel+':'+page;
    if(overlayCache.has(key)){
      paintPageBoxes(page,overlayCache.get(key));return;
    }
    if(overlayPending.has(key))return;
    const ticket={};
    overlayPending.set(key,ticket);
    const epoch=overlayEpoch.get(key)||0;
    const stamp=overlayRevision,level=overlayLevel,loader=loadOverlayPage;
    Promise.resolve().then(()=>loader(page,level)).then(result=>{
      if(disposed||stamp!==overlayRevision||level!==overlayLevel||
         (overlayEpoch.get(key)||0)!==epoch)return;
      if(result?.level!==level||result?.page!==page||!Array.isArray(result.boxes))
        throw Error('覆盖框返回结构或页码不匹配');
      overlayCache.set(key,result);
      paintPageBoxes(page,result);
    }).catch(error=>{
      if(!disposed&&stamp===overlayRevision)emit('覆盖框读取失败：'+error.message,'error');
    }).finally(()=>{if(overlayPending.get(key)===ticket)overlayPending.delete(key);});
  }
  function showOverlayPages(){
    if(!ready||!pdf||overlayLevel==='off')return;
    const current=viewer.currentPageNumber;
    for(const page of [current,current-1,current+1])requestOverlayPage(page);
  }
  // Include ALL visible pages at low zoom, where the viewport can show more
  // than current +/- one. The observer does no SQL work, only asks the
  // injected, page-scoped loader when a page approaches the viewport.
  const pageObserver=new IntersectionObserver(entries=>{
    for(const entry of entries){
      if(entry.isIntersecting)requestOverlayPage(Number(entry.target.dataset.pageNumber));
    }
  },{root:scroller,rootMargin:'150px 0px'});
  function observePages(){
    pageObserver.disconnect();
    if(!pdf)return;
    for(let i=0;i<pdf.numPages;i++){
      const node=viewer.getPageView(i)?.div;
      if(node)pageObserver.observe(node);
    }
  }
  function chooseOverlayLevel(level){
    if(!['off','block','span'].includes(level))throw Error('覆盖框粒度无效');
    overlayLevel=level;overlaySelect.value=level;overlayRevision++;
    overlayCache.clear();overlayPending.clear();clearOverlayNodes();
    showOverlayPages();
  }
  overlaySelect.addEventListener('change',()=>chooseOverlayLevel(overlaySelect.value));
  function setOverlays(config={}){
    if(disposed)throw Error('PDF Viewer 已销毁');
    // The same public method accepts a {blockGroups} patch from AG without
    // resetting a user's Block/Span dropdown or the cached page geometry.
    const nextLevel=Object.hasOwn(config,'level')?config.level:overlayLevel;
    if(Object.hasOwn(config,'onBlockSelect')){
      if(config.onBlockSelect!==null&&typeof config.onBlockSelect!=='function')
        throw Error('PDF Block 选择回调必须是函数或 null');
      onBlockSelect=config.onBlockSelect;
    }
    if(Object.hasOwn(config,'onBlockDragIntent')){
      if(config.onBlockDragIntent!==null&&typeof config.onBlockDragIntent!=='function')
        throw Error('PDF Block 拖动回调必须是函数或 null');
      onBlockDragIntent=config.onBlockDragIntent;
    }
    const nextLoader=Object.hasOwn(config,'loadPage')?config.loadPage:loadOverlayPage;
    if(!['off','block','span'].includes(nextLevel))throw Error('覆盖框粒度无效');
    if(nextLevel!=='off'&&typeof nextLoader!=='function')
      throw Error('Block/Span 覆盖框必须提供按页读取回调');
    if(nextLoader!==null&&typeof nextLoader!=='function')throw Error('覆盖框回调无效');
    const nextGroups=Object.hasOwn(config,'blockGroups')?config.blockGroups:
      (blockGroups===null?null:[...blockGroups]);
    if(nextGroups!==null&&(!Array.isArray(nextGroups)||
      !nextGroups.every(type=>typeof type==='string')))
      throw Error('块组筛选必须是字符串数组或 null');
    const normalized=nextGroups===null?null:new Set(nextGroups);
    const oldGroups=blockGroups===null?null:[...blockGroups].sort();
    const newGroups=normalized===null?null:[...normalized].sort();
    const groupsChanged=JSON.stringify(oldGroups)!==JSON.stringify(newGroups);
    const loaderChanged=nextLoader!==loadOverlayPage;
    const levelChanged=nextLevel!==overlayLevel;
    loadOverlayPage=nextLoader;
    overlaySelect.disabled=nextLoader===null;
    blockGroups=normalized;
    if(levelChanged){chooseOverlayLevel(nextLevel);return true;}
    if(loaderChanged){
      blockParents.clear();selectedBlockId=null;
      overlayRevision++;overlayCache.clear();overlayPending.clear();
      clearOverlayNodes();showOverlayPages();
    }else if(groupsChanged){
      // Paint from immutable cached geometry. No SQL query, PDF re-fetch,
      // overlay append, zoom reset or page change for an AG group checkbox click.
      for(const [key,data] of overlayCache){
        if(key.startsWith(overlayLevel+':'))paintPageBoxes(data.page,data);
      }
      // Existing pages were just repainted; only request pages not cached.
      if(ready&&pdf&&overlayLevel!=='off'){
        const current=viewer.currentPageNumber;
        for(const page of [current,current-1,current+1]){
          if(!overlayCache.has(overlayLevel+':'+page))requestOverlayPage(page);
        }
      }
    }
    return true;
  }
  function focusBlock({id,page}){
    if(disposed)throw Error('PDF Viewer 已销毁');
    if((typeof id!=='string'&&typeof id!=='number')||!String(id)||
        !Number.isInteger(page)||page<1||page>200)throw Error('Block 定位身份或页码无效');
    selectedBlockId=String(id);
    focusRequest={id:selectedBlockId,page};
    if(overlayLevel!=='block'&&loadOverlayPage)chooseOverlayLevel('block');
    updateSelectedNodes();
    if(!ready||!pdf||page>pdf.numPages)return false;
    viewer.currentPageNumber=page;
    requestOverlayPage(page);
    return true;
  }
  function invalidateOverlayPage(page,changedRows=[]){
    if(!Number.isInteger(page)||page<1||page>200)throw Error('失效 PDF 页码无效');
    for(const row of changedRows){
      if(row?.block_id!=null)blockParents.set(String(row.block_id),
        row.parent_block_id==null?null:String(row.parent_block_id));
    }
    for(const level of ['block','span']){
      const key=level+':'+page;
      overlayCache.delete(key);
      overlayEpoch.set(key,(overlayEpoch.get(key)||0)+1);
      overlayPending.delete(key); // Stale in-flight response cannot overwrite new PBS.
    }
    if(ready&&pdf&&overlayLevel!=='off')requestOverlayPage(page);
    return true;
  }
  const emit=(message,kind='info')=>{if(!disposed)onStatus('PDF · '+message,kind);};
  const readyControls=()=>{pageInput.disabled=!ready;zoomSelect.disabled=!ready;};
  const updatePage=()=>{
    pageInput.value=String(viewer.currentPageNumber||1);
    if(pdf)count.textContent='/ '+pdf.numPages;
    readyControls();
  };
  bus.on('pagesinit',()=>{
    viewer.currentScaleValue='page-width';viewer.update();updatePage();observePages();showOverlayPages();
  });
  bus.on('pagechanging',()=>{updatePage();showOverlayPages();});
  bus.on('pagerendered',event=>{
    // PDF.js may replace a page's content during zoom/re-render. Reattach
    // its cached overlay once, without a database query or a PDF reload.
    const cached=overlayCache.get(overlayLevel+':'+event.pageNumber);
    if(cached)paintPageBoxes(event.pageNumber,cached);
    if(event.pageNumber!==1||!resolvePaint)return;
    const complete=resolvePaint;resolvePaint=null;complete(!event.error);
  });
  zoomSelect.addEventListener('change',()=>{
    if(!ready)return;
    const value=zoomSelect.value;
    if(value==='page-width')relayout();
    else viewer.currentScaleValue=String(Number(value)/100);
  });
  // Moving between split and single-pane layouts changes available width.
  // Preserve the chosen zoom mode instead of reloading the PDF.
  let lastWidth=0;
  const relayout=()=>{
    if(disposed||!ready)return;
    if(zoomSelect.value==='page-width'){
      // PDF.js page-width fits paper edge-to-edge; leave 85px for each tag
      // rail outside the paper rather than covering text or clipping tags.
      viewer.currentScaleValue='page-width';
      const full=viewer.currentScale;
      const ratio=Math.max(.15,(scroller.clientWidth-184)/Math.max(1,scroller.clientWidth));
      viewer.currentScaleValue=String(Number((full*ratio).toFixed(5)));
    }else viewer.update();
  };
  const resizeObserver=new ResizeObserver(()=>{
    const width=scroller.clientWidth;
    if(width&&width!==lastWidth){lastWidth=width;relayout();}
  });
  resizeObserver.observe(scroller);
  pageInput.addEventListener('change',()=>{
    if(!ready)return;
    const next=Number(pageInput.value);
    if(Number.isInteger(next)&&next>=1&&next<=pdf.numPages)
      viewer.currentPageNumber=next;
    updatePage();
  });
  const destroyDocument=async()=>{
    if(resolvePaint){const done=resolvePaint;resolvePaint=null;done(false);}
    const oldTask=task;task=null;
    if(oldTask)await oldTask.destroy();
    pdf=null;ready=false;overlayRevision++;overlayCache.clear();overlayPending.clear();
    focusRequest=null;selectedBlockId=null;blockParents.clear();
    pageObserver.disconnect();
    clearOverlayNodes();viewer.setDocument(null);
    pageInput.value='1';count.textContent='/ —';zoomSelect.value='page-width';readyControls();
  };
  async function loadPdf(url){
    if(disposed)throw Error('PDF Viewer 已销毁');
    if(url!==null&&(typeof url!=='string'||!url.startsWith('/labs/lab-ocr/api/ocr/pdf?')))
      throw Error('PDF 必须使用 Lab OCR 已授权读取地址');
    if(url===source&&loading)return loading;
    const token=++revision;
    source=url;ready=false;readyControls();
    loading=(async()=>{
      await destroyDocument();
      if(disposed||token!==revision)return false;
      if(!url){placeholder.hidden=false;return false;}
      placeholder.textContent='正在预热 PDF 首页…';placeholder.hidden=false;
      emit('开始加载书籍 PDF');
      try{
        // Main's proven warm-up: one streaming request, PDF.js Viewer and
        // text layer, usable only after the *first painted page*.
        const active=getDocument({url,disableRange:true,disableStream:false,stopAtErrors:true});
        task=active;
        const document=await active.promise;
        if(disposed||token!==revision)return false;
        pdf=document;
        const firstPaint=new Promise(resolve=>{resolvePaint=resolve;});
        viewer.setDocument(document);
        const painted=await firstPaint;
        if(disposed||token!==revision)return false;
        if(!painted)throw Error('PDF 首页绘制失败');
        ready=true;placeholder.hidden=true;
        updatePage();relayout();showOverlayPages();
        emit(`已就绪 · ${document.numPages} 页，首页已绘制`,'ok');
        return true;
      }catch(error){
        if(disposed||token!==revision)return false;
        placeholder.textContent='PDF 加载失败：'+error.message;
        placeholder.hidden=false;
        emit('加载失败：'+error.message,'error');
        throw error;
      }
    })();
    return loading;
  }
  readyControls();
  return Object.freeze({loadPdf,setOverlays,focusBlock,invalidateOverlayPage,relayout,dispose(){
    if(disposed)return;
    disposed=true;revision++;overlayRevision++;overlayCache.clear();resizeObserver.disconnect();
    cssObserver.disconnect();clearOverlayNodes();
    pageObserver.disconnect();
    const oldTask=task;task=null;
    if(resolvePaint){const finish=resolvePaint;resolvePaint=null;finish(false);}
    void oldTask?.destroy().catch(()=>{});
    viewer.setDocument(null);root.remove();controls.remove();
  }});
}
