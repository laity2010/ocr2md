import {appPath} from './http-path.js';
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
// CMD join annotations change logical grouping, never the sealed OCR pages or
// their bbox geometry. Avoid invalidating every PDF control for this edit.
const withoutJoinMarks=source=>source.replace(
  /^[ \t]*(?:>[ \t]*)*<!-- ocr2md:block-join:v1 prev="p\d+b\d+" target="p\d+b\d+" -->\r?\n/gm,'');
// Moving source Blocks or annotating joins does not change physical PDF
// geometry: only replacement of the sealed OCR evidence changes that map.
const geometryKey=source=>source.match(/<!-- minerujson:source:v1:([a-f0-9]{64})/)?.[1]
  ??withoutJoinMarks(source);

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
  constructor(host,getMarkdown,getLayout,onBlockJoin=()=>Promise.reject(Error('CMD 尚未准备好')),
    onBlockMove=()=>Promise.reject(Error('CMD 尚未准备好')),onCoverageChange=()=>{}){
    this.host=host;
    this.getMarkdown=getMarkdown;
    this.getLayout=getLayout;
    this.onBlockJoin=onBlockJoin;
    this.onBlockMove=onBlockMove;
    this.onCoverageChange=onCoverageChange;
    this.host.classList.add('ocr-pdf-pane');
    this.host.dataset.pdfTheme='dark';
    this.host.innerHTML=`<div class="ocr-pdf-tools" aria-label="PDF 缩放导航">
      <button class="ocr-pdf-minus" type="button" title="缩小">−</button>
      <button class="ocr-pdf-fit" type="button" title="按宽度缩放">适宽</button>
      <button class="ocr-pdf-plus" type="button" title="放大">+</button>
      <span class="ocr-pdf-zoom" aria-live="polite">—</span>
      <label class="ocr-pdf-cover-toggle" title="显示并操作 PDF 文本块：可勾选接续、长按拖动；关闭后隐藏文本块操作标签"><input type="checkbox" aria-label="PDF 文本块" checked />文本块</label>
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
    this.coverToggle=this.toolbar.querySelector('.ocr-pdf-cover-toggle input');
    this.coverToggle.addEventListener('change',()=>this.onCoverageChange(this.coverToggle.checked));
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
    this.zoomAnchorToken=0;this.zoomRestoreTimer=0;this.zoomRestoreBehavior=null;
    this.comparison=null;this.comparisonNodes=[];this.comparisonDrawId=0;
    this.blockCoverageRows=[];this.blockCoverageNodes=new Map();
    this.blockDrag=null;this.suppressBlockClickUntil=0;this.suppressBlockClickCtrl=null;
    this.blockDragScrollTimer=0;this.blockDragScrollBehavior=null;
    this.onBlockDragMove=e=>{
      if(this.blockDrag?.pointerId===e.pointerId)
        this.updateBlockDrag(this.blockDrag,e.clientX,e.clientY);
    };
    this.onBlockDragUp=e=>this.finishBlockDrag(e);
    this.onBlockDragCancel=e=>this.finishBlockDrag(e,true);
    this.lastLayoutWidth=0;this.lastLayoutHeight=0;this.overlayTimer=null;
    this.active=false;this.overlayDrawId=0;this.pageViewportCache=new Map();
    this.revealPending=false;this.revealUntil=0;
    this.geometryRevision=0;
    this.lastGeometrySource=geometryKey(this.getMarkdown());
    this.ready=false;this.loading=this.open();
    this.unsubscribe=viewStore.subscribe((next,prev)=>{
      if(next.documentRevision!==prev.documentRevision){
        const source=this.getMarkdown();
        const canonical=geometryKey(source);
        const onlyJoinMarks=canonical===this.lastGeometrySource;
        this.lastGeometrySource=canonical;
        this.anchors=sourceBlocks(source);
        // A join/unjoin is one CM6 annotation line. Its text changes source
        // line offsets but not the original PDF geometry, PDF.js page tree,
        // single focus, A/B comparison, or any other checkbox. The subsequent
        // CMD inventory diff updates only changed labels on its own page.
        if(!onlyJoinMarks){
          this.clearComparison();
          void this.refreshGeometry();
        }
      }
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
  whenReady(){return this.loading.then(()=>this.ready);}
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
  setCoverageChecked(enabled){this.coverToggle.checked=Boolean(enabled);}
  refreshAnchors(){
    this.anchors=sourceBlocks(this.getMarkdown());
    this.scheduleOverlay();
  }
  async refreshGeometry(){
    const revision=++this.geometryRevision;
    try{
      const result=await this.getLayout();
      if(this.disposed||revision!==this.geometryRevision)return;
      if(this.pdf&&result.pages.length!==this.pdf.numPages)
        throw Error('PDF 页数与 CMD 原始页面数不一致');
      this.map=result.pages;
      this.paintBlockCoverage();
      this.scheduleOverlay();
    }catch(error){
      if(this.disposed||revision!==this.geometryRevision)return;
      this.map=[];this.clearHighlight();
      this.setStatus('CMD 版面数据失效：'+error.message);
    }
  }
  async open(){
    try{
      const [geometry,loading]=await Promise.all([
        this.getLayout(),
        // V6 evidence is a small (~1.4 MB) PDF. Fetch it once, streaming,
        // rather than paying a remote round trip for every 64 KB PDF.js range.
        // Large-document adaptive range loading can be added with file-size
        // metadata once this fixed-document viewer supports large files.
        Promise.resolve(getDocument({url:appPath('/api/pdf'),disableRange:true,
          disableStream:false,stopAtErrors:true})),
      ]);
      this.map=geometry.pages;
      this.task=loading;
      const pdf=await loading.promise;
      if(this.disposed){await pdf.destroy();return;}
      if(this.map.length!==pdf.numPages)throw Error('PDF 页数与 CMD 原始页数不一致');
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
      // Loading the PDF metadata is not enough: the viewer is usable only
      // after PDF.js has painted its first page in the hidden warm-up pane.
      const firstPagePaint=new Promise(resolve=>{this.finishWarmup=resolve;});
      bus.on('pagerendered',e=>{
        if(e.error){
          this.setStatus('PDF 页面渲染错误');
          if(e.pageNumber===1)this.finishWarmup?.(false);
          return;
        }
        if(e.pageNumber===1)this.finishWarmup?.(true);
        this.paintBlockCoverage();
        this.scheduleOverlay();
      });
      this.viewer.setDocument(pdf);
      const painted=await firstPagePaint;
      this.finishWarmup=null;
      if(this.disposed)return;
      if(!painted)throw Error('PDF 首页渲染失败');
      this.ready=true;
      this.paintBlockCoverage();
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
  captureZoomAnchor(){
    const viewport=this.scroller.getBoundingClientRect();
    const x=viewport.left+viewport.width/2,y=viewport.top+viewport.height/2;
    let best=null,distance=Infinity;
    // Anchor to an actual visible PDF page, not its changing scrollTop.
    for(const page of this.pages.querySelectorAll('.page[data-page-number]')){
      const rect=page.getBoundingClientRect();
      if(!rect.width||!rect.height)continue;
      const dx=Math.max(rect.left-x,0,x-rect.right);
      const dy=Math.max(rect.top-y,0,y-rect.bottom);
      const d=dx*dx+dy*dy;
      if(d<distance){
        distance=d;best={pageNumber:page.dataset.pageNumber,
          x:clamp((x-rect.left)/rect.width,0,1),
          y:clamp((y-rect.top)/rect.height,0,1),screenX:x,screenY:y};
      }
    }
    return best;
  }
  restoreZoomAnchor(anchor){
    if(!anchor||this.disposed)return;
    const page=[...this.pages.querySelectorAll('.page[data-page-number]')]
      .find(node=>node.dataset.pageNumber===anchor.pageNumber);
    if(!page)return;
    const rect=page.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    this.scroller.scrollLeft+=rect.left+anchor.x*rect.width-anchor.screenX;
    this.scroller.scrollTop+=rect.top+anchor.y*rect.height-anchor.screenY;
  }
  preserveZoomLocation(update){
    const anchor=this.captureZoomAnchor();
    const token=++this.zoomAnchorToken;
    clearTimeout(this.zoomRestoreTimer);
    if(this.zoomRestoreBehavior===null)
      this.zoomRestoreBehavior=this.scroller.style.scrollBehavior;
    this.scroller.style.scrollBehavior='auto';
    // An earlier click-navigation highlight must not pull us back to its
    // old block after the user explicitly changes PDF magnification.
    this.revealPending=false;
    update();
    const restore=()=>{if(!this.disposed&&token===this.zoomAnchorToken)
      this.restoreZoomAnchor(anchor);};
    restore();
    requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
    this.zoomRestoreTimer=setTimeout(()=>{
      if(this.disposed||token!==this.zoomAnchorToken)return;
      restore();
      this.scroller.style.scrollBehavior=this.zoomRestoreBehavior??'';
      this.zoomRestoreBehavior=null;this.zoomRestoreTimer=0;
    },140);
  }
  setZoom(mode){
    if(!this.ready)return;
    this.zoomMode=mode;
    this.preserveZoomLocation(()=>{
      this.viewer.currentScaleValue=mode;this.viewer.update();
    });
    this.updateZoom();this.scheduleOverlay();
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
      this.setZoom('page-width');
    }
    this.scheduleOverlay();
  }
  scheduleOverlay(){
    clearTimeout(this.overlayTimer);
    this.overlayTimer=setTimeout(()=>this.drawOverlay(),140);
  }
  onClick(event){
    if(!this.ready||!(event.target instanceof Element)||event.target.closest('.ocr-pdf-block-ctrl'))return;
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
    this.clearComparison();
    const anchor=this.anchors.find(a=>a.pageIndex===n-1&&a.blockIndex===chosen.blockIndex);
    if(anchor){
      this.selected={pageIndex:n-1,blockIndex:chosen.blockIndex};this.drawOverlay();
      publishFocus({sourceLine:anchor.sourceLine+2,origin:'pdf',
        elementId:`mineru:${n-1}:${chosen.blockIndex}:0`});
    }
  }
  /** Independent, very light coverage over the original CMD Block bbox.
   * Unlike focus/pair overlays these are page-local percentage boxes and
   * never navigate, recenter, mutate CM6, or intercept PDF clicks.
   */
  setBlockCoverage(rows){
    const next=Array.isArray(rows)?rows.filter(row=>row.anchorCount===1&&
      row.geometry&&Number.isInteger(row.pageIndex)&&Number.isInteger(row.blockIndex))
      .map(({id,pageIndex,blockIndex,sourceLine,joinPrev,joinable,logicalId})=>
        ({id,pageIndex,blockIndex,sourceLine,joinPrev,joinable,logicalId})):[];
    const prior=this.blockCoverageRows;
    this.blockCoverageRows=next;
    // Editing one CMD join annotates only the target Block. The geometry and
    // immutable OCR identities do not change: do not repaint 224 checkboxes,
    // reset their checked values, or relayout other pages on every click.
    const sameGeometry=prior.length===next.length&&prior.every((old,i)=>
      old.id===next[i].id&&old.pageIndex===next[i].pageIndex&&
      old.blockIndex===next[i].blockIndex);
    if(!sameGeometry){this.paintBlockCoverage();return;}
    const pages=new Set();
    for(let i=0;i<next.length;i++){
      const old=prior[i],row=next[i];
      if(old.joinPrev===row.joinPrev&&old.joinable===row.joinable&&
        old.logicalId===row.logicalId)continue;
      if(this.updateBlockChip(this.blockCoverageNodes.get(row.id),row))
        pages.add(row.pageIndex);
    }
    for(const pageIndex of pages)this.avoidBlockChipCollisions(pageIndex);
  }
  /** Patch existing controls only when their values actually changed.
   * Do not replace the DOM node, and never toggle other checkboxes. */
  updateBlockChip(node,row){
    if(!node)return false;
    const input=node.querySelector('input');
    const badge=node.querySelector('.ocr-pdf-block-ctrl span');
    const chip=node.querySelector('.ocr-pdf-block-ctrl');
    if(!input||!badge||!chip)return false;
    let changed=false;
    const logical=row.logicalId||row.id;
    if(badge.textContent!==logical){badge.textContent=logical;changed=true;}
    const title=`原始 ${row.id} · 逻辑 ${logical}`;
    if(badge.title!==title)badge.title=title;
    const checked=!row.joinPrev;
    if(input.checked!==checked){input.checked=checked;changed=true;}
    const disabled=!row.joinable;
    if(input.disabled!==disabled){input.disabled=disabled;changed=true;}
    const help=row.joinable?`取消勾选：并入原文上一 Block（可跨页）；重新勾选：恢复独立。原始 ${row.id}`:
      `没有有效前驱 Block，必须独立（${row.id}）`;
    if(input.title!==help)input.title=help;
    node.classList.toggle('ocr-pdf-block-is-joined',Boolean(row.joinPrev));
    // Badge width can change when page-local numbering passes 9/10/100.
    // Recompute this chip only; neighbor top offsets are corrected on the
    // same PDF page by avoidBlockChipCollisions(pageIndex).
    if(changed){
      const page=node.parentElement;
      if(page?.classList.contains('page')){
        const region=this.map[row.pageIndex];
        const block=region?.regions?.find(b=>b.blockIndex===row.blockIndex);
        const side=node.dataset.gutter;
        if(block){
          const [x0,,x1]=block.bbox;
          const margin=side==='left'?x0:region.pageSize[0]-x1;
          const gutterPixels=page.clientWidth*margin/region.pageSize[0];
          const nominalWidth=20+logical.length*5.5;
          const scale=Math.min(1,Math.max(.2,(gutterPixels-3)/nominalWidth));
          const target=`scale(${scale.toFixed(3)})`;
          if(chip.style.transform!==target)chip.style.transform=target;
        }
      }
    }
    return changed;
  }
  /** Long-press the ID (not its checkbox) then point to another ID on this
   * PDF page. The arrow is a temporary pointer-only visualization; the only
   * data mutation is the CMD move transaction after a valid pointer release.
   */
  armBlockDrag(event,ctrl,id){
    if(event.button!==0||this.blockDrag||event.target.closest('input'))return;
    const item={id,ctrl,pointerId:event.pointerId,x:event.clientX,y:event.clientY,
      startX:event.clientX,startY:event.clientY,active:false,target:null,timer:null,svg:null};
    this.blockDrag=item;
    // Capture *document-wide* movement while held. On iPad the pointer may
    // cross between two PDF columns (or out of the source label's DOM tree).
    // It must still be received on the other side of the page.
    document.addEventListener('pointermove',this.onBlockDragMove,true);
    document.addEventListener('pointerup',this.onBlockDragUp,true);
    document.addEventListener('pointercancel',this.onBlockDragCancel,true);
    try{ctrl.setPointerCapture(event.pointerId);}catch{/* Pointer capture optional. */}
    item.timer=setTimeout(()=>{
      if(this.blockDrag!==item)return;
      item.active=true;ctrl.classList.add('ocr-pdf-block-drag-source');
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.classList.add('ocr-pdf-block-drag-arrow');
      svg.innerHTML='<path class="ocr-pdf-block-drag-path" fill="none" />'+
        '<path class="ocr-pdf-block-drag-tip" />';
      document.body.append(svg);item.svg=svg;
      this.setStatus(`拖动 ${id} 箭头到本页另一块标签，松手调整 CMD 顺序`);
      this.updateBlockDrag(item,item.x,item.y);
      this.autoScrollBlockDrag(item);
    },370);
  }
  /** Scroll only within the original PDF page while a long-held pointer
   * approaches the visible pane edge. This enables a page-top Block to be
   * dropped after a page-bottom Block without changing any labels or source
   * ordering until release. Never scroll across the page boundary.
   */
  autoScrollBlockDrag(item){
    // The viewer's usual smooth CSS scrolling must not queue dozens of
    // competing scroll animations while a finger is held at the pane edge.
    this.blockDragScrollBehavior=this.scroller.style.scrollBehavior;
    this.scroller.style.scrollBehavior='auto';
    const tick=()=>{
      if(this.blockDrag!==item||!item.active){this.stopBlockDragScroll();return;}
      const pane=this.scroller.getBoundingClientRect();
      const page=item.ctrl.closest('.page')?.getBoundingClientRect();
      if(page&&item.x>=pane.left&&item.x<=pane.right&&
        item.y>=pane.top&&item.y<=pane.bottom){
        const edge=48,speed=17;
        const bottom=Math.max(0,Math.min(1,(item.y-(pane.bottom-edge))/edge));
        const top=Math.max(0,Math.min(1,((pane.top+edge)-item.y)/edge));
        // Clamp to the original PDF page, not the neighboring PDF pages.
        const delta=bottom?Math.min(speed*bottom,Math.max(0,page.bottom-pane.bottom)):
          top?-Math.min(speed*top,Math.max(0,pane.top-page.top)):0;
        if(delta){
          this.scroller.scrollTop+=delta;
          this.updateBlockDrag(item,item.x,item.y);
        }
      }
    };
    // WebKit may throttle requestAnimationFrame while PDF.js paints pages;
    // a bounded interval keeps scroll motion alive during that heavy paint.
    if(!this.blockDragScrollTimer)this.blockDragScrollTimer=setInterval(tick,32);
  }
  stopBlockDragScroll(){
    if(this.blockDragScrollTimer)clearInterval(this.blockDragScrollTimer);
    this.blockDragScrollTimer=0;
    if(this.blockDragScrollBehavior!==null){
      this.scroller.style.scrollBehavior=this.blockDragScrollBehavior;
      this.blockDragScrollBehavior=null;
    }
  }
  blockDropTarget(item,x,y){
    const viewport=this.scroller.getBoundingClientRect();
    if(x<viewport.left||x>viewport.right||y<viewport.top||y>viewport.bottom)
      return null; // Never drop on an off-pane or hidden page control.
    const pageId=item.ctrl.closest('.ocr-pdf-block-cover')?.dataset.pdfPage;
    const direct=document.elementFromPoint(x,y)?.closest?.('.ocr-pdf-block-ctrl')
      ?.closest('.ocr-pdf-block-cover');
    if(direct?.dataset.pdfPage===pageId&&direct.dataset.blockId!==item.id)
      return direct;
    // Tiny 9px OCR labels are hard to hit by finger. Accept release within a
    // generous ~24 CSS pixel neighborhood of the nearest same-page tag.
    // Leave the visible chip small, outside the original PDF text rectangle.
    let result=null,nearest=25;
    for(const [id,node] of this.blockCoverageNodes){
      if(id===item.id||node.dataset.pdfPage!==pageId)continue;
      const chip=node.querySelector('.ocr-pdf-block-ctrl');
      if(!chip?.isConnected)continue;
      const rect=chip.getBoundingClientRect();
      if(rect.right<viewport.left||rect.left>viewport.right||
        rect.bottom<viewport.top||rect.top>viewport.bottom)continue;
      const dx=Math.max(rect.left-x,0,x-rect.right);
      const dy=Math.max(rect.top-y,0,y-rect.bottom);
      const d=Math.hypot(dx,dy);
      if(d<nearest){result=node;nearest=d;}
    }
    return result;
  }
  clearBlockDragListeners(){
    document.removeEventListener('pointermove',this.onBlockDragMove,true);
    document.removeEventListener('pointerup',this.onBlockDragUp,true);
    document.removeEventListener('pointercancel',this.onBlockDragCancel,true);
  }
  blockDropMove(startId,pointedId){
    // Drag origin is a POSITION, not the piece to move: pointing from b0
    // to b8 means take the logical b8 and insert it before b0. Do not
    // depend on OCR block indices, mutable labels, or PDF coordinates.
    const start=this.blockCoverageRows.find(row=>row.id===startId);
    const pointed=this.blockCoverageRows.find(row=>row.id===pointedId);
    if(!start||!pointed||start.pageIndex!==pointed.pageIndex||
      !Number.isInteger(start.sourceLine)||!Number.isInteger(pointed.sourceLine)||
      start.id===pointed.id)throw Error('文本块插入目标无效，请重新检查');
    // An unchecked original Block can share the same displayed logical ID.
    // Always pull its checked root and attached descendants as ONE item.
    const root=this.blockCoverageRows.find(row=>row.pageIndex===pointed.pageIndex&&
      row.logicalId===pointed.logicalId&&!row.joinPrev);
    if(!root)throw Error('该逻辑文本块跨页接续，不能在本页单独移动');
    if(root.id===startId||(start.logicalId&&start.logicalId===pointed.logicalId))
      return null; // A logical block cannot be dragged onto itself.
    return {sourceId:root.id,targetId:startId,placement:'before'};
  }
  updateBlockDrag(item,x,y){
    if(this.blockDrag!==item)return;
    item.x=x;item.y=y;
    if(!item.active){
      if(Math.hypot(x-item.startX,y-item.startY)>11){
        clearTimeout(item.timer);this.blockDrag=null;
        this.stopBlockDragScroll();
        this.clearBlockDragListeners();
        try{if(item.ctrl.hasPointerCapture(item.pointerId))
          item.ctrl.releasePointerCapture(item.pointerId);}catch{}
        // A short accidental swipe over a label is neither a drop nor
        // a checkbox command; suppress only this label's synthetic click.
        this.suppressBlockClickCtrl=item.ctrl;
        this.suppressBlockClickUntil=performance.now()+600;
      }
      return;
    }
    // A stationary long press is not a move, even if adjacent chips happen
    // to fall within the enlarged finger-friendly drop neighborhood.
    const target=Math.hypot(x-item.startX,y-item.startY)>=12
      ?this.blockDropTarget(item,x,y):null;
    if(item.target!==target){
      item.target?.classList.remove('ocr-pdf-block-drop-target');
      item.target=target;target?.classList.add('ocr-pdf-block-drop-target');
      const pointedLabel=target?.querySelector('.ocr-pdf-block-ctrl span')?.textContent;
      const startLabel=item.ctrl.querySelector('span')?.textContent||item.id;
      this.setStatus(target
        ?`指向 ${pointedLabel} · 松手将它移到起点 ${startLabel} 前面`
        :`从 ${startLabel} 指向本页要搬来的文本块`);
    }
    const box=item.ctrl.getBoundingClientRect();
    const sx=(box.left+box.right)/2,sy=(box.top+box.bottom)/2;
    const tip=target?.querySelector('.ocr-pdf-block-ctrl')?.getBoundingClientRect();
    const ex=tip?(tip.left+tip.right)/2:x,ey=tip?(tip.top+tip.bottom)/2:y;
    const svg=item.svg;
    svg.setAttribute('viewBox',`0 0 ${window.innerWidth} ${window.innerHeight}`);
    const bend=(sx+ex)/2;
    svg.querySelector('.ocr-pdf-block-drag-path').setAttribute('d',
      `M ${sx} ${sy} Q ${bend} ${Math.min(sy,ey)-30} ${ex} ${ey}`);
    const angle=Math.atan2(ey-(Math.min(sy,ey)-30),ex-bend);
    const size=11;
    const x1=ex-size*Math.cos(angle-.55),y1=ey-size*Math.sin(angle-.55);
    const x2=ex-size*Math.cos(angle+.55),y2=ey-size*Math.sin(angle+.55);
    svg.querySelector('.ocr-pdf-block-drag-tip').setAttribute('d',
      `M ${ex} ${ey} L ${x1} ${y1} L ${x2} ${y2} Z`);
  }
  finishBlockDrag(event,cancel=false){
    const item=this.blockDrag;
    if(!item||item.pointerId!==event.pointerId)return;
    const active=item.active;
    if(active)this.updateBlockDrag(item,event.clientX,event.clientY);
    const target=active&&!cancel?item.target?.dataset.blockId:null;
    clearTimeout(item.timer);
    this.stopBlockDragScroll();
    this.clearBlockDragListeners();
    item.ctrl.classList.remove('ocr-pdf-block-drag-source');
    item.target?.classList.remove('ocr-pdf-block-drop-target');
    item.svg?.remove();this.blockDrag=null;
    try{if(item.ctrl.hasPointerCapture(event.pointerId))item.ctrl.releasePointerCapture(event.pointerId);}
    catch{/* iOS may release capture on pointercancel. */}
    if(!active)return;
    event.preventDefault();
    this.suppressBlockClickCtrl=item.ctrl;
    this.suppressBlockClickUntil=performance.now()+600;
    if(cancel){this.setStatus('已取消块排序');return;}
    if(!target){this.setStatus('未选择同页目标块，顺序不变');return;}
    let move;
    try{move=this.blockDropMove(item.id,target);}catch(error){
      this.setStatus('排序失败：'+error.message);return;
    }
    if(!move){this.setStatus('同一逻辑块，顺序不变');return;}
    this.setStatus(`正在将指向块 ${move.sourceId} 移到起点块 ${item.id} 前面…`);
    void this.onBlockMove(move.sourceId,move.targetId,move.placement).then(result=>{
      if(!result?.changed){this.setStatus('该块已紧邻目标，顺序不变');return;}
      const shift=result.shift;
      const interval=shift?.crossedIds?.length||0;
      this.setStatus(shift?.allIndependent
        ?`已移动 · 跨越 ${interval} 块，区间编号整体 ${shift.delta>0?'+1':'−1'} · 可撤销`
        :`已移动 · 跨越 ${interval} 个原始块，保留原有接续关系 · 可撤销`);
    }).catch(error=>this.setStatus('排序失败：'+error.message));
  }
  paintBlockCoverage(){
    if(this.disposed)return;
    const wanted=new Set(this.blockCoverageRows.map(row=>row.id));
    for(const [id,node] of this.blockCoverageNodes){
      if(!wanted.has(id)){node.remove();this.blockCoverageNodes.delete(id);}
    }
    if(!this.viewer||!this.map.length)return;
    for(const row of this.blockCoverageRows){
      const page=this.viewer.getPageView(row.pageIndex);
      const region=this.map[row.pageIndex];
      const block=region?.regions.find(b=>b.blockIndex===row.blockIndex);
      if(!page?.div||!block)continue;
      let rect;
      try{rect=pdfOverlayRect({...block,pageSize:region.pageSize},
        {width:region.pageSize[0],height:region.pageSize[1]});}
      catch{continue;} // Invalid geometry is never painted as covered.
      let node=this.blockCoverageNodes.get(row.id);
      if(!node){
        node=document.createElement('div');node.className='ocr-pdf-block-cover';
        node.dataset.blockId=row.id;
        node.dataset.pdfPage=String(row.pageIndex+1);
        node.dataset.blockIndex=String(row.blockIndex);
        node.title='CMD 已标定文本块';
        const ctrl=document.createElement('label');ctrl.className='ocr-pdf-block-ctrl';
        const input=document.createElement('input');input.type='checkbox';
        input.setAttribute('aria-label',`文本块 ${row.id} 独立`);
        const badge=document.createElement('span');badge.textContent=row.id;
        ctrl.append(input,badge);node.append(ctrl);
        ctrl.addEventListener('pointerdown',e=>this.armBlockDrag(e,ctrl,row.id));
        // Move/up/cancel are tracked at document capture scope while dragging.
        // Do not cancel merely because the original label loses capture.
        ctrl.addEventListener('contextmenu',e=>e.preventDefault());
        ctrl.addEventListener('click',e=>{
          if(this.suppressBlockClickCtrl===ctrl&&performance.now()<this.suppressBlockClickUntil)
            e.preventDefault();
        },true);
        for(const type of ['pointerdown','mousedown','touchstart','click','dblclick'])
          ctrl.addEventListener(type,e=>e.stopPropagation());
        input.addEventListener('change',async()=>{
          if(this.suppressBlockClickCtrl===ctrl&&performance.now()<this.suppressBlockClickUntil){
            input.checked=!input.checked;return;
          }
          const previous=!input.checked;
          input.disabled=true;
          try{await this.onBlockJoin(row.id,previous);}
          catch(error){input.checked=!input.checked;this.setStatus('接续操作失败：'+error.message);}
          finally{input.disabled=false;}
        });
        this.blockCoverageNodes.set(row.id,node);
      }
      this.updateBlockChip(node,row);
      // Keep the interactive chip OUTSIDE the OCR text rectangle. Choose
      // the outer paper gutter, never the inter-column gap: left-column
      // blocks go to the left; right-column blocks go to the right.
      // A full-width block defaults to the wider outer side margin.
      const [x0,,x1]=block.bbox;
      const pageWidth=region.pageSize[0];
      const leftSide=(x0+x1)/2<=pageWidth/2;
      const fullWidth=(x1-x0)/pageWidth>.65;
      const side=fullWidth?(x0>=pageWidth-x1?'left':'right'):(leftSide?'left':'right');
      if(node.dataset.gutter!==side)node.dataset.gutter=side;
      const chipGutter=node.querySelector('.ocr-pdf-block-ctrl');
      if(chipGutter?.dataset.gutter!==side)chipGutter.dataset.gutter=side;
      const styles={left:rect.left+'%',top:rect.top+'%',
        width:rect.width+'%',height:rect.height+'%'};
      for(const [property,value] of Object.entries(styles))
        if(node.style[property]!==value)node.style[property]=value;
      if(node.parentElement!==page.div)page.div.append(node);
      // The chart/table is ONE original CMD Block. Its caption and notes can
      // sit outside the parent's body bbox: paint their genuine OCR rectangles
      // as inert fragments, without adding fake Block IDs or checkboxes.
      // Relative positions follow the parent on PDF.js zoom/reflow.
      const parts=block.subRegions||[];
      const existing=[...node.querySelectorAll(':scope > .ocr-pdf-block-fragment')];
      existing.slice(parts.length).forEach(extra=>extra.remove());
      parts.forEach((part,i)=>{
        let fragment=existing[i];
        if(!fragment){
          fragment=document.createElement('div');
          fragment.className='ocr-pdf-block-fragment';
          node.append(fragment);
        }
        const kind=part.role==='note'?'注释':'标题';
        const label=`${row.id} · ${kind}（原始 OCR 子区域）`;
        if(fragment.title!==label)fragment.title=label;
        if(fragment.dataset.partType!==part.type)fragment.dataset.partType=part.type;
        if(fragment.dataset.partRole!==part.role)fragment.dataset.partRole=part.role;
        const [sx0,sy0,sx1,sy1]=part.bbox,[bx0,by0,bx1,by1]=block.bbox;
        const sw=bx1-bx0,sh=by1-by0;
        const placement={left:`${(sx0-bx0)/sw*100}%`,
          top:`${(sy0-by0)/sh*100}%`,
          width:`${(sx1-sx0)/sw*100}%`,
          height:`${(sy1-sy0)/sh*100}%`};
        for(const [property,value] of Object.entries(placement))
          if(fragment.style[property]!==value)fragment.style[property]=value;
      });
      // Keep checkbox and full Block ID on ONE line without entering OCR
      // text, including at the default narrow iPad PDF zoom. The available
      // outer page gutter controls only the chip's *visual scale*; it does
      // not alter the original PDF/Block geometry or click semantics.
      const chip=node.querySelector('.ocr-pdf-block-ctrl');
      if(chip){
        const pagePixels=page.div.clientWidth;
        const gutterPixels=pagePixels*(side==='left'?rect.left:
          100-rect.left-rect.width)/100;
        const nominalWidth=20+(row.logicalId||row.id).length*5.5; // 12px box + 2px gap + 4px padding + borders
        const scale=Math.min(1,Math.max(.2,(gutterPixels-3)/nominalWidth));
        const target=`scale(${scale.toFixed(3)})`;
        if(chip.style.transform!==target)chip.style.transform=target;
        // preserve existing collision offset until same-page layout diff.
      }
    }
    this.avoidBlockChipCollisions();
  }
  /** Move only the *labels* within their own outer paper gutter, never the
   * source bboxes, focus rectangles, or page geometry. Nearby OCR image and
   * text blocks often start at the same Y coordinate; simply going inline
   * would cause their chips to collide. Stable page/side reading order gives
   * each label a nonoverlapping row with at least 2px of separation.
   */
  avoidBlockChipCollisions(pageIndex=null){
    const groups=new Map();
    for(const [id,node] of this.blockCoverageNodes){
      if(pageIndex!==null&&Number(node.dataset.pdfPage)!==pageIndex+1)continue;
      const page=node.parentElement;
      const chip=node.querySelector('.ocr-pdf-block-ctrl');
      if(!page||!chip||!page.classList.contains('page'))continue;
      const key=`${node.dataset.pdfPage}:${node.dataset.gutter}`;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({id,node,chip,page,anchor:node.offsetTop,
        height:chip.getBoundingClientRect().height});
    }
    for(const items of groups.values()){
      items.sort((a,b)=>a.anchor-b.anchor||a.id.localeCompare(b.id,undefined,{numeric:true}));
      let nextTop=2;
      const pageHeight=items[0].page.clientHeight;
      for(const item of items){
        const upper=Math.max(2,pageHeight-item.height-2);
        const top=Math.min(upper,Math.max(item.anchor,nextTop));
        const target=`${(top-item.anchor).toFixed(2)}px`;
        if(item.chip.style.top!==target)item.chip.style.top=target;
        nextTop=top+item.height+2;
      }
    }
  }
  /** WP4: two independently drawn, labelled original CMD bboxes. Layout
   * keeps semantic IDs; PDF remains the sole owner of canvas geometry.
   * Across pages both DOM overlays exist, but only one page fits the viewport.
   */
  async compareBlocks(from,to,{reveal='from'}={}){
    const points=[from,to];
    if(!points.every(point=>Number.isInteger(point?.pageIndex)&&Number.isInteger(point?.blockIndex)&&
      this.map[point.pageIndex]?.regions?.some(region=>region.blockIndex===point.blockIndex)))
      return false;
    this.comparison={points:points.map(point=>({pageIndex:point.pageIndex,blockIndex:point.blockIndex})),
      token:++this.comparisonDrawId};
    // Only the comparison's own labelled overlays represent this selection;
    // the former single-block box would imply three selected regions.
    this.selected=null;this.overlay?.remove();this.overlay=null;
    const target=points[reveal==='to'?1:0];
    if(this.ready){
      const page=this.viewer.getPageView(target.pageIndex);
      const rect=page?.div?.getBoundingClientRect(),clip=this.visibleClip();
      if(!rect||!clip||rect.bottom<clip.top||rect.top>clip.bottom)
        this.viewer.scrollPageIntoView({pageNumber:target.pageIndex+1});
    }
    await this.drawPairOverlays();
    if(this.active&&this.comparisonNodes.length===2)this.ensureVisible(this.comparisonNodes[reveal==='to'?1:0]);
    return true;
  }
  /** Optional overview for a same-page pair: fit the span of both original
   * rectangles into the currently available PDF pane without hiding either.
   * For cross-page pairs use the A/B focus controls instead.
   */
  async overviewComparison(){
    if(!this.ready||!this.comparison)return false;
    const [a,b]=this.comparison.points;
    if(a.pageIndex!==b.pageIndex)return false;
    const page=this.map[a.pageIndex];
    const first=page?.regions.find(r=>r.blockIndex===a.blockIndex);
    const second=page?.regions.find(r=>r.blockIndex===b.blockIndex);
    if(!first||!second)return false;
    const y0=Math.min(first.bbox[1],second.bbox[1]),y1=Math.max(first.bbox[3],second.bbox[3]);
    const current=this.viewer.currentScale;
    const view=this.viewer.getPageView(a.pageIndex);
    const unscaledHeight=view?.div?.getBoundingClientRect().height/current;
    if(!Number.isFinite(unscaledHeight)||unscaledHeight<=0)return false;
    const span=(y1-y0)/page.pageSize[1]*unscaledHeight;
    if(span<=0)return false;
    const scale=Math.max(.15,Math.min(current,(this.scroller.clientHeight-52)/span));
    if(!Number.isFinite(scale))return false;
    if(scale<current-.005)this.setZoom(String(scale));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await this.drawPairOverlays();
    const [overlayA,overlayB]=this.comparisonNodes;
    if(overlayA&&overlayB){
      const boxA=overlayA.getBoundingClientRect(),boxB=overlayB.getBoundingClientRect();
      const clip=this.visibleClip();
      if(clip){
        const mid=(Math.min(boxA.top,boxB.top)+Math.max(boxA.bottom,boxB.bottom))/2;
        this.scroller.scrollTop+=mid-(clip.top+clip.bottom)/2;
      }
    }
    this.scheduleOverlay();
    return true;
  }
  clearComparison(){
    ++this.comparisonDrawId;
    this.comparison=null;
    for(const node of this.comparisonNodes)node.remove();
    this.comparisonNodes=[];
  }
  async drawPairOverlays(){
    const comparison=this.comparison,token=this.comparisonDrawId;
    if(!comparison||!this.ready)return;
    try{
      const coords=await Promise.all(comparison.points.map(async point=>{
        const page=this.viewer.getPageView(point.pageIndex);
        const region=this.map[point.pageIndex];
        const block=region?.regions.find(r=>r.blockIndex===point.blockIndex);
        if(!page?.div||!block)throw Error('PDF 候选文本块不可定位');
        let viewportPromise=this.pageViewportCache.get(point.pageIndex);
        if(!viewportPromise){
          viewportPromise=this.pdf.getPage(point.pageIndex+1).then(pdfPage=>pdfPage.getViewport({scale:1}));
          this.pageViewportCache.set(point.pageIndex,viewportPromise);
          viewportPromise.catch(()=>this.pageViewportCache.delete(point.pageIndex));
        }
        const viewport=await viewportPromise;
        return {point,page,rect:pdfOverlayRect({...block,pageSize:region.pageSize},viewport)};
      }));
      if(this.disposed||!this.comparison||token!==this.comparisonDrawId)return;
      const scroll=this.scroller.getBoundingClientRect();
      coords.forEach(({point,page,rect},i)=>{
        const overlay=this.comparisonNodes[i]||document.createElement('div');
        overlay.className=`ocr-pdf-pair-overlay ocr-pdf-pair-${i===0?'from':'to'}`;
        overlay.dataset.role=i===0?'from':'to';
        overlay.dataset.pdfPage=String(point.pageIndex+1);
        overlay.dataset.blockIndex=String(point.blockIndex);
        overlay.dataset.label=i===0?'A':'B';
        overlay.setAttribute('aria-label',`${i===0?'A 来源':'B 接续'}文本块 PDF 区域`);
        const paper=page.div.getBoundingClientRect();
        overlay.style.left=(paper.left-scroll.left+this.scroller.scrollLeft+paper.width*rect.left/100)+'px';
        overlay.style.top=(paper.top-scroll.top+this.scroller.scrollTop+paper.height*rect.top/100)+'px';
        overlay.style.width=paper.width*rect.width/100+'px';
        overlay.style.height=paper.height*rect.height/100+'px';
        overlay.title=`${i===0?'A 来源':'B 接续'} · 第 ${point.pageIndex+1} 页 Block ${point.blockIndex}`;
        if(!overlay.isConnected)this.scroller.append(overlay);
        this.comparisonNodes[i]=overlay;
      });
    }catch(error){
      if(token===this.comparisonDrawId)this.setStatus('双框定位失败：'+error.message);
    }
  }
  clearHighlight(){
    ++this.overlayDrawId;
    this.selected=null;
    this.clearComparison();
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
  /** Read-only PDF location for orphaned CMD block anchors. AG only sends
   * semantic page/block IDs; bbox remains PDF-owned and never gets edited. */
  async focusBlock(pageIndex,blockIndex){
    if(!Number.isInteger(pageIndex)||!Number.isInteger(blockIndex))return false;
    if(!this.ready)return false;
    const block=this.map[pageIndex]?.regions?.find(r=>r.blockIndex===blockIndex);
    if(!block)return false;
    if(this.comparison&&!this.comparison.points.some(p=>p.pageIndex===pageIndex&&p.blockIndex===blockIndex))
      this.clearComparison();
    this.selected={pageIndex,blockIndex};
    this.revealPending=true;this.revealUntil=performance.now()+1800;
    const page=this.viewer.getPageView(pageIndex);
    const rect=page?.div?.getBoundingClientRect();const clip=this.visibleClip();
    if(!rect||!clip||rect.bottom<=clip.top||rect.top>=clip.bottom)
      this.viewer.scrollPageIntoView({pageNumber:pageIndex+1});
    await this.drawOverlay();return true;
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
    if(this.comparison){
      if(this.comparison.points.some(p=>p.pageIndex===source.pageIndex&&p.blockIndex===source.blockIndex)){
        await this.compareBlocks(...this.comparison.points,{reveal:this.comparison.points[0].blockIndex===source.blockIndex&&this.comparison.points[0].pageIndex===source.pageIndex?'from':'to'});
        return;
      }
      this.clearComparison();
    }
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
    const margin=18; // subpixel rounding + iPad visual-viewport safety margin
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
    if(this.comparison){++this.overlayDrawId;await this.drawPairOverlays();return;}
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
    this.disposed=true;this.finishWarmup?.(false);
    clearTimeout(this.zoomRestoreTimer);
    if(this.zoomRestoreBehavior!==null){
      this.scroller.style.scrollBehavior=this.zoomRestoreBehavior;
      this.zoomRestoreBehavior=null;
    }
    this.stopBlockDragScroll();
    this.clearBlockDragListeners();
    if(this.blockDrag){
      clearTimeout(this.blockDrag.timer);
      this.blockDrag.svg?.remove();
      this.blockDrag.target?.classList.remove('ocr-pdf-block-drop-target');
      this.blockDrag.ctrl.classList.remove('ocr-pdf-block-drag-source');
      this.blockDrag=null;
    }
    this.unsubscribe?.();this.resizeObserver.disconnect();
    clearTimeout(this.overlayTimer);
    this.clearComparison();
    this.setBlockCoverage([]);
    this.viewer?.setDocument(null);
    void this.task?.destroy();
  }
}
