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

function sourceBlocks(text){
  const anchors=[];
  const rx=/^<!-- minerujson:block:v1:(\d+):(\d+) -->$/gm;
  for(const match of text.matchAll(rx)){
    const line=1+text.slice(0,match.index).split('\n').length-1;
    anchors.push({pageIndex:Number(match[1]),blockIndex:Number(match[2]),sourceLine:line});
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
    this.scroller=this.host.querySelector('.ocr-pdf-scroller');
    this.pages=this.host.querySelector('.pdfViewer');
    this.statusNode=this.host.querySelector('.ocr-pdf-status');
    this.pageInput=this.host.querySelector('.ocr-pdf-page');
    this.zoomNode=this.host.querySelector('.ocr-pdf-zoom');
    this.host.querySelector('.ocr-pdf-minus').addEventListener('click',()=>this.zoomStep(-1));
    this.host.querySelector('.ocr-pdf-plus').addEventListener('click',()=>this.zoomStep(1));
    this.host.querySelector('.ocr-pdf-fit').addEventListener('click',()=>this.setZoom('page-width'));
    this.pageInput.addEventListener('change',()=>{
      const n=Number(this.pageInput.value);
      if(Number.isInteger(n)&&n>=1&&n<=this.pdf?.numPages){
        this.explicitUserUntil=performance.now()+1000;
        this.clearHighlight();
        this.viewer.scrollPageIntoView({pageNumber:n});
        this.sendPdfNavigation(n);
      }else this.pageInput.value=String(this.viewer?.currentPageNumber||1);
    });
    const userInput=()=>{this.explicitUserUntil=performance.now()+1250;};
    for(const type of ['wheel','touchstart','pointerdown','keydown'])
      this.scroller.addEventListener(type,userInput,{passive:true});
    this.scroller.addEventListener('scroll',()=>this.onScroll(),{passive:true});
    this.pages.addEventListener('click',e=>this.onClick(e));
    this.map=[];this.anchors=[];this.lastDriver='cm6';
    this.disposed=false;this.explicitUserUntil=0;this.suppressScrollUntil=0;
    this.zoomMode='page-width';this.selected=null;this.pendingFocus=null;
    this.lastLayoutWidth=0;this.lastLayoutHeight=0;this.overlayTimer=null;
    this.ready=false;this.loading=this.open();
    this.unsubscribe=viewStore.subscribe((next,prev)=>{
      if(next.documentRevision!==prev.documentRevision)
        this.anchors=sourceBlocks(this.getMarkdown());
      if(next.focusTarget!==prev.focusTarget && next.focusTarget){
        const target=next.focusTarget;
        if(target.origin!=='pdf')void this.focusLine(target.sourceLine,true);
      }else if(next.scrollTarget!==prev.scrollTarget && next.scrollTarget &&
          next.scrollSyncEnabled && next.scrollTarget.origin!=='pdf'){
        void this.focusLine(next.scrollTarget.sourceLine,false);
      }
    });
    this.anchors=sourceBlocks(this.getMarkdown());
    this.resizeObserver=new ResizeObserver(()=>this.onResize());
    this.resizeObserver.observe(this.scroller);
  }
  setStatus(s){this.statusNode.textContent=s;}
  refreshAnchors(){
    this.anchors=sourceBlocks(this.getMarkdown());
    const focus=viewStore.getState().focusTarget;
    if(focus)void this.focusLine(focus.sourceLine,true);
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
      this.host.querySelector('.ocr-pdf-count').textContent=`/ ${pdf.numPages}`;
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
        this.host.querySelector('.ocr-pdf-count').textContent=`/ ${pdf.numPages}`;
      });
      bus.on('pagerendered',e=>{
        if(e.error){this.setStatus('PDF 页面渲染错误');return;}
        this.scheduleOverlay();
      });
      this.viewer.setDocument(pdf);
      this.ready=true;
      this.setStatus('就绪');
      const focus=viewStore.getState().focusTarget;
      if(focus)await this.focusLine(focus.sourceLine,true);
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
    this.selected=null;
    this.scroller.querySelectorAll('.ocr-pdf-region-overlay').forEach(node=>node.remove());
  }
  sendPdfNavigation(pageNumber){
    const anchor=this.anchors.find(a=>a.pageIndex===pageNumber-1);
    if(anchor)publishFocus({sourceLine:anchor.sourceLine+2,origin:'pdf'});
  }
  onScroll(){
    if(this.disposed||performance.now()>this.explicitUserUntil||
       performance.now()<this.suppressScrollUntil||!this.ready)return;
    clearTimeout(this.userScrollTimer);
    this.userScrollTimer=setTimeout(()=>{
      if(!this.disposed&&this.viewer)this.sendPdfNavigation(this.viewer.currentPageNumber);
    },165);
  }
  async focusLine(line,explicit){
    if(!this.ready){this.pendingFocus={line,explicit};return;}
    const source=sourceAnchor(this.anchors,line);
    if(!source)return;
    if(!explicit&&this.selected?.pageIndex===source.pageIndex)return;
    const block=this.map[source.pageIndex]?.regions?.find(r=>r.blockIndex===source.blockIndex);
    if(!block)return;
    this.selected={pageIndex:source.pageIndex,blockIndex:source.blockIndex};
    if(explicit || this.viewer.currentPageNumber!==source.pageIndex+1){
      this.suppressScrollUntil=performance.now()+900;
      this.viewer.scrollPageIntoView({pageNumber:source.pageIndex+1});
    }
    this.scheduleOverlay();
  }
  async drawOverlay(){
    this.scroller.querySelectorAll('.ocr-pdf-region-overlay').forEach(e=>e.remove());
    const selection=this.selected;
    if(!selection||!this.ready)return;
    const page=this.viewer.getPageView(selection.pageIndex);
    if(!page?.div)return;
    const region=this.map[selection.pageIndex];
    const block=region.regions.find(x=>x.blockIndex===selection.blockIndex);
    if(!block)return;
    try{
      const pdfPage=await this.pdf.getPage(selection.pageIndex+1);
      if(this.disposed||this.selected!==selection)return;
      const viewport=pdfPage.getViewport({scale:1});
      const rect=pdfOverlayRect({...block,pageSize:region.pageSize},viewport);
      const overlay=document.createElement('div');
      overlay.className='ocr-pdf-region-overlay';
      overlay.dataset.pdfPage=String(selection.pageIndex+1);
      overlay.dataset.blockIndex=String(selection.blockIndex);
      // Host overlays at the SCROLL CONTENT level instead of inside a
      // PDF.js page: PDFViewer may replace its page DOM on rerender/zoom.
      // Coordinates are calculated from the rotated visual page rectangle.
      const paper=page.div.getBoundingClientRect();
      const scroll=this.scroller.getBoundingClientRect();
      overlay.style.left=(paper.left-scroll.left+this.scroller.scrollLeft+
        paper.width*rect.left/100)+'px';
      overlay.style.top=(paper.top-scroll.top+this.scroller.scrollTop+
        paper.height*rect.top/100)+'px';
      overlay.style.width=(paper.width*rect.width/100)+'px';
      overlay.style.height=(paper.height*rect.height/100)+'px';
      overlay.title='OCR 对应文本区域（待人工复核）';
      this.scroller.append(overlay);
    }catch(error){this.setStatus(error.message);}
  }
  dispose(){
    this.disposed=true;this.unsubscribe?.();this.resizeObserver.disconnect();
    clearTimeout(this.userScrollTimer);
    clearTimeout(this.overlayTimer);
    this.viewer?.setDocument(null);
    void this.task?.destroy();
  }
}
