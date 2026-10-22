/** Read-only V6 PDF.js Viewer. PDF is evidence; CM6 owns all editable text.
 * Inspired by V4's official Viewer + normalized MinerU bbox overlay, with
 * transport/position events adapted to the V6 single-document architecture.
 */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import {viewStore,publishFocus} from './view-store.js';
import './pdf-preview.css';
import {blockAnchor} from './mineru-anchors.js';
GlobalWorkerOptions.workerSrc=workerUrl;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/** Pure geometry: OCR bbox is top-left, in the *already rotated* page space.
 * A mismatch is reported instead of drawing a dishonest highlight. */
export function pdfOverlayRect(region,viewport){
  const [w,h]=region?.pageSize||[],[x0,y0,x1,y1]=region?.bbox||[];
  if(![w,h,x0,y0,x1,y1,viewport?.width,viewport?.height].every(Number.isFinite)||
     w<=0||h<=0||x0<0||y0<0||x1<=x0||y1<=y0||x1>w||y1>h)
    throw Error('PDF OCR 元素坐标无效');
  if(Math.abs(viewport.width/viewport.height/(w/h)-1)>.02)
    throw Error('PDF/OCR 页面尺寸或旋转不一致，已停止高亮');
  return {left:x0/w*100,top:y0/h*100,width:(x1-x0)/w*100,height:(y1-y0)/h*100};
}

export function sourceBlocks(text){
  const anchors=[];
  for(const [index,line] of text.split('\n').entries()){
    const anchor=blockAnchor(line);
    if(anchor)anchors.push({...anchor,sourceLine:index+1});
  }
  return anchors;
}
function sourceAnchor(anchors,line){
  let lo=0,hi=anchors.length-1,best=null;
  while(lo<=hi){const mid=(lo+hi)>>1;
    if(anchors[mid].sourceLine<=line){best=anchors[mid];lo=mid+1;}
    else hi=mid-1;
  }
  return best;
}

export class PdfPreview {
  constructor(host,getMarkdown){
    this.host=host;
    this.getMarkdown=getMarkdown;
    this.host.classList.add('ocr-pdf-pane');
    this.host.dataset.pdfTheme='dark';
    this.host.innerHTML=`<div class="ocr-pdf-tools" aria-label="PDF 缩放导航">
      <button class="ocr-pdf-minus" type="button" title="缩小">−</button>
      <button class="ocr-pdf-fit" type="button" title="按宽度缩放">适宽</button>
      <button class="ocr-pdf-plus" type="button" title="放大">+</button>
      <span class="ocr-pdf-zoom" aria-live="polite">—</span>
      <label>页 <input class="ocr-pdf-page" type="number" min="1" step="1" value="1" aria-label="PDF 页码" /></label>
      <span class="ocr-pdf-count">/ —</span>
      <span class="ocr-pdf-status" aria-live="polite">加载中</span></div>
      <div class="ocr-pdf-scroller pdfViewerContainer" tabindex="0" aria-label="PDF 连续页面">
        <div class="pdfViewer"></div>
      </div>`;
    this.toolbar=this.host.querySelector('.ocr-pdf-tools');
    this.scroller=this.host.querySelector('.ocr-pdf-scroller');
    this.pages=this.host.querySelector('.pdfViewer');
    this.statusNode=this.host.querySelector('.ocr-pdf-status');
    this.pageInput=this.host.querySelector('.ocr-pdf-page');
    this.zoomNode=this.host.querySelector('.ocr-pdf-zoom');
    this.toolbar.querySelector('.ocr-pdf-minus').addEventListener('click',()=>this.zoomStep(-1));
    this.toolbar.querySelector('.ocr-pdf-plus').addEventListener('click',()=>this.zoomStep(1));
    this.toolbar.querySelector('.ocr-pdf-fit').addEventListener('click',()=>this.setZoom('page-width'));
    this.pageInput.addEventListener('change',()=>{
      const n=Number(this.pageInput.value);
      if(Number.isInteger(n)&&n>=1&&n<=this.pdf?.numPages){
        this.explicitUserUntil=performance.now()+1000;
        this.viewer.scrollPageIntoView({pageNumber:n});
        this.sendPdfNavigation(n);
      }else this.pageInput.value=String(this.viewer?.currentPageNumber||1);
    });
    const userInput=()=>{
      this.explicitUserUntil=performance.now()+1250;
      this.revealPending=false;
    };
    for(const type of ['wheel','touchstart','pointerdown','keydown'])
      this.scroller.addEventListener(type,userInput,{passive:true});
    this.scroller.addEventListener('scroll',()=>this.onScroll(),{passive:true});
    this.pages.addEventListener('click',e=>this.onClick(e));
    this.map=[];this.anchors=[];
    this.disposed=false;this.explicitUserUntil=0;
    this.zoomMode='page-width';this.selected=null;this.pendingFocus=null;
    this.lastLayoutWidth=0;this.lastLayoutHeight=0;this.overlayTimer=null;
    this.active=false;this.overlayDrawId=0;this.pageViewportCache=new Map();
    this.revealPending=false;this.revealUntil=0;
    this.ready=false;this.loading=this.open();
    this.unsubscribe=viewStore.subscribe((next,prev)=>{
      if(next.documentRevision!==prev.documentRevision)
        this.anchors=sourceBlocks(this.getMarkdown());
      // PDF pages and Markdown lines have unrelated visual geometry. React
      // ONLY to an explicit click-navigation event, never a scrollTarget,
      // editor cursor movement by keyboard, or an Undo/Redo side effect.
      if(next.focusTarget!==prev.focusTarget && next.focusTarget){
        const target=next.focusTarget;
        if(target.origin!=='pdf' &&
           (target.intent==='click' ||
            ((target.origin==='outline'||target.origin==='preview') &&
             target.intent!=='command')))
          void this.focusLine(target.sourceLine,true);
      }
    });
    this.anchors=sourceBlocks(this.getMarkdown());
    this.resizeObserver=new ResizeObserver(()=>this.onResize());
    this.resizeObserver.observe(this.scroller);
  }
  // The owning preview pane places the active viewer's toolbar immediately
  // to the right of the shared MD/PDF dropdown.
  moveToolbarTo(container){container.append(this.toolbar);}
  setActive(active){
    this.active=Boolean(active);
    // Merely opening the PDF preview never performs source-line navigation.
    // If an explicit click arrived while PDF was hidden, reveal its anchor.
    if(this.active&&this.revealPending)this.scheduleOverlay();
  }
  revealCurrentLocation(){
    // Mode switching is presentation-only. A pending click may have been
    // received while hidden; the selection is already in PDF coordinates.
    if(this.revealPending)this.scheduleOverlay();
  }
  setStatus(s){this.statusNode.textContent=s;}
  refreshAnchors(){
    this.anchors=sourceBlocks(this.getMarkdown());
    this.scheduleOverlay();
  }
  async open(){
    try{
      const [meta,loading]=await Promise.all([
        fetch('/api/pdf-map',{cache:'no-store'}),
        Promise.resolve(getDocument({url:'/api/pdf',rangeChunkSize:65536,disableAutoFetch:true,
          disableStream:true,stopAtErrors:true})),
      ]);
      if(!meta.ok)throw Error(`PDF 映射 HTTP ${meta.status}`);
      this.map=(await meta.json()).pages;
      this.task=loading;
      const pdf=await loading.promise;
      if(this.disposed){await pdf.destroy();return;}
      if(this.map.length!==pdf.numPages)throw Error('PDF 页数与 OCR 页数不一致');
      this.pdf=pdf;
      this.toolbar.querySelector('.ocr-pdf-count').textContent=`/ ${pdf.numPages}`;
      const bus=new EventBus();
      this.viewer=new PDFViewer({container:this.scroller,viewer:this.pages,eventBus:bus,
        maxCanvasPixels:/(iPad|iPhone|iPod)/i.test(navigator.userAgent)?1_500_000:6_000_000,
        textLayerMode:1,annotationMode:0});
      bus.on('pagesinit',()=>{
        this.viewer.currentScaleValue=this.zoomMode;
        this.viewer.update();
        this.updateZoom();
      });
      bus.on('pagechanging',e=>{
        this.pageInput.value=String(e.pageNumber);
        this.toolbar.querySelector('.ocr-pdf-count').textContent=`/ ${pdf.numPages}`;
      });
      bus.on('pagerendered',e=>{
        if(e.error){this.setStatus('PDF 页面渲染错误');return;}
        this.scheduleOverlay();
      });
      this.viewer.setDocument(pdf);
      this.ready=true;
      this.setStatus('就绪');
      if(this.pendingFocus){
        const request=this.pendingFocus;this.pendingFocus=null;
        await this.focusLine(request.line,request.explicit);
      }
    }catch(err){this.ready=false;this.setStatus('PDF 失败：'+err.message);}
  }
  updateZoom(){
    if(this.viewer)this.zoomNode.textContent=`${Math.round(this.viewer.currentScale*100)}%`;
  }
  setZoom(mode){
    if(!this.ready)return;
    this.zoomMode=mode;
    this.viewer.currentScaleValue=mode;
    this.viewer.update();this.updateZoom();this.scheduleOverlay();
  }
  zoomStep(direction){
    if(!this.ready)return;
    const stops=[50,67,75,90,100,110,125,150,175,200,250,300];
    const current=this.viewer.currentScale*100;
    const next=direction>0?stops.find(n=>n>current+.5):[...stops].reverse().find(n=>n<current-.5);
    this.setZoom(String((next??(direction>0?300:50))/100));
  }
  onResize(){
    if(this.disposed)return;
    const width=this.scroller.clientWidth,height=this.scroller.clientHeight;
    if(!width||!height||(width===this.lastLayoutWidth&&height===this.lastLayoutHeight))return;
    const widthChanged=width!==this.lastLayoutWidth;
    this.lastLayoutWidth=width;this.lastLayoutHeight=height;
    // PDF.js reflows its page tree on update; do not update for each new
    // canvas or scroll paint. Only a real Dockview width change needs scaling.
    if(this.ready&&widthChanged&&this.zoomMode==='page-width'){
      this.viewer.currentScaleValue='page-width';this.viewer.update();this.updateZoom();
    }
    this.scheduleOverlay();
  }
  scheduleOverlay(){
    clearTimeout(this.overlayTimer);
    this.overlayTimer=setTimeout(()=>this.drawOverlay(),140);
  }
  onClick(event){
    if(!this.ready||!(event.target instanceof Element))return;
    const page=event.target.closest('.page');
    const canvas=page?.querySelector('canvas');
    const n=Number(page?.dataset.pageNumber);
    if(!canvas||!n)return;
    const r=canvas.getBoundingClientRect();
    if(!r.width||!r.height)return;
    const x=(event.clientX-r.left)/r.width;
    const y=(event.clientY-r.top)/r.height;
    if(x<0||x>1||y<0||y>1)return;
    const source=this.map[n-1];
    if(!source)return;
    let chosen=null,score=Infinity;
    for(const block of source.regions){
      const [x0,y0,x1,y1]=block.bbox;
      const dx=Math.max(x0/source.pageSize[0]-x,0,x-x1/source.pageSize[0]);
      const dy=Math.max(y0/source.pageSize[1]-y,0,y-y1/source.pageSize[1]);
      const distance=dx*dx+dy*dy;
      if(distance<score){score=distance;chosen=block;}
    }
    if(!chosen)return;
    const anchor=this.anchors.find(a=>a.pageIndex===n-1&&a.blockIndex===chosen.blockIndex);
    if(anchor){
      this.selected={pageIndex:n-1,blockIndex:chosen.blockIndex};this.drawOverlay();
      publishFocus({sourceLine:anchor.sourceLine+2,origin:'pdf',
        elementId:`mineru:${n-1}:${chosen.blockIndex}:0`});
    }
  }
  clearHighlight(){
    ++this.overlayDrawId;
    this.selected=null;
    this.overlay?.remove();this.overlay=null;
  }
  sendPdfNavigation(pageNumber){
    const anchor=this.anchors.find(a=>a.pageIndex===pageNumber-1);
    if(anchor){
      void this.focusLine(anchor.sourceLine+2,true);
      publishFocus({sourceLine:anchor.sourceLine+2,origin:'pdf'});
    }
  }
  onScroll(){
    if(this.disposed||!this.ready)return;
    // PDF reading scrolls are independent and never generate MD navigation.
    // Only settle an explicit click's pending highlight, not old selections.
    if(this.active&&this.revealPending&&performance.now()>this.explicitUserUntil)
      this.scheduleOverlay();
  }
  async focusLine(line,explicit){
    if(!Number.isInteger(line)||line<1)return;
    if(explicit){
      this.revealPending=true;
      this.revealUntil=performance.now()+1700;
    }
    if(!this.ready){this.pendingFocus={line,explicit};return;}
    const source=sourceAnchor(this.anchors,line);
    if(!source)return;
    // Never skip another block merely because it lies on the same PDF page.
    if(!explicit&&this.selected?.pageIndex===source.pageIndex&&
      this.selected?.blockIndex===source.blockIndex)return;
    const block=this.map[source.pageIndex]?.regions?.find(r=>r.blockIndex===source.blockIndex);
    if(!block)return;
    const samePage=this.selected?.pageIndex===source.pageIndex;
    this.selected={pageIndex:source.pageIndex,blockIndex:source.blockIndex};
    // PDF.js page navigation resets the scroll position. Never invoke it for
    // another OCR block on the same page; the overlay will scroll only if the
    // target falls outside the physical viewport (including iPad screen crop).
    if(!samePage && this.viewer.currentPageNumber!==source.pageIndex+1){
      const pageRect=this.viewer.getPageView(source.pageIndex)?.div?.getBoundingClientRect();
      const clip=this.visibleClip();
      if(!pageRect||!clip||pageRect.bottom<=clip.top||pageRect.top>=clip.bottom)
        this.viewer.scrollPageIntoView({pageNumber:source.pageIndex+1});
    }
    clearTimeout(this.overlayTimer);
    void this.drawOverlay();
  }
  visibleClip(){
    const port=this.scroller.getBoundingClientRect();
    const vv=window.visualViewport;
    const top=Math.max(port.top,0,vv?.offsetTop??0);
    const bottom=Math.min(port.bottom,window.innerHeight,
      (vv?.offsetTop??0)+(vv?.height??window.innerHeight));
    const left=Math.max(port.left,0,vv?.offsetLeft??0);
    const right=Math.min(port.right,window.innerWidth,
      (vv?.offsetLeft??0)+(vv?.width??window.innerWidth));
    return bottom-top>=20&&right-left>=20?{top,bottom,left,right}:null;
  }
  ensureVisible(overlay){
    if(!this.active)return;
    const clip=this.visibleClip(),target=overlay.getBoundingClientRect();
    if(!clip||!target.height||!target.width)return;
    // No page jump, no recenter and no scroll for a block already in view.
    // For a nearby off-screen block, move the minimum distance necessary.
    const margin=12;
    const shift=(a,b,start,end)=>{
      const innerStart=start+margin,innerEnd=end-margin;
      if(a>=innerStart&&b<=innerEnd)return 0;
      if(b-a>innerEnd-innerStart)return (a+b-start-end)/2;
      if(a<innerStart)return a-innerStart;
      return b-innerEnd;
    };
    const dy=shift(target.top,target.bottom,clip.top,clip.bottom);
    const dx=shift(target.left,target.right,clip.left,clip.right);
    if(Math.abs(dx)>2||Math.abs(dy)>2){
      const old=this.scroller.style.scrollBehavior;
      this.scroller.style.scrollBehavior='auto';
      this.scroller.scrollLeft+=dx;
      this.scroller.scrollTop+=dy;
      requestAnimationFrame(()=>{if(!this.disposed)this.scroller.style.scrollBehavior=old;});
    }
  }
  async drawOverlay(){
    const drawId=++this.overlayDrawId;
    const selection=this.selected;
    if(!selection||!this.ready){this.overlay?.remove();this.overlay=null;return;}
    const page=this.viewer.getPageView(selection.pageIndex);
    if(!page?.div)return;
    const region=this.map[selection.pageIndex];
    const block=region.regions.find(x=>x.blockIndex===selection.blockIndex);
    if(!block)return;
    try{
      let viewportPromise=this.pageViewportCache.get(selection.pageIndex);
      if(!viewportPromise){
        viewportPromise=this.pdf.getPage(selection.pageIndex+1)
          .then(pdfPage=>pdfPage.getViewport({scale:1}));
        this.pageViewportCache.set(selection.pageIndex,viewportPromise);
        viewportPromise.catch(()=>this.pageViewportCache.delete(selection.pageIndex));
      }
      const viewport=await viewportPromise;
      if(this.disposed||this.selected!==selection||this.overlayDrawId!==drawId)return;
      const rect=pdfOverlayRect({...block,pageSize:region.pageSize},viewport);
      // Reuse the same overlay DOM node across adjacent selections, avoiding
      // highlight flashes while PDF.js reflows or loads a distant page.
      const overlay=this.overlay||document.createElement('div');
      overlay.className='ocr-pdf-region-overlay';
      overlay.dataset.pdfPage=String(selection.pageIndex+1);
      overlay.dataset.blockIndex=String(selection.blockIndex);
      const paper=page.div.getBoundingClientRect();
      const scroll=this.scroller.getBoundingClientRect();
      overlay.style.left=(paper.left-scroll.left+this.scroller.scrollLeft+
        paper.width*rect.left/100)+'px';
      overlay.style.top=(paper.top-scroll.top+this.scroller.scrollTop+
        paper.height*rect.top/100)+'px';
      overlay.style.width=(paper.width*rect.width/100)+'px';
      overlay.style.height=(paper.height*rect.height/100)+'px';
      overlay.title='OCR 对应文本区域（待人工复核）';
      if(!overlay.isConnected)this.scroller.append(overlay);
      this.overlay=overlay;
      if(this.revealPending && this.active){
        this.ensureVisible(overlay);
        // PDF.js can correct late page layout; retain a short reveal window,
        // but any user-initiated PDF scrolling ends automatic reveal.
        if(performance.now()>this.revealUntil)this.revealPending=false;
      }
    }catch(error){
      if(this.overlayDrawId===drawId){this.overlay?.remove();this.overlay=null;this.setStatus(error.message);}
    }
  }
  dispose(){
    this.disposed=true;this.unsubscribe?.();this.resizeObserver.disconnect();
    clearTimeout(this.overlayTimer);
    this.viewer?.setDocument(null);
    void this.task?.destroy();
  }
}
