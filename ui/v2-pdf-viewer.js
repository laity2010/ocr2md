/** V2 PDF component: reuse V1's official PDF.js PDFViewer, original bbox
 * projector + edge rail solver + dark PDF CSS. The geometry input is V2's
 * read-only logical->MinerU evidence, never CMD comment tags or fake PDF IDs.
 * No filesystem authority; the existing F02-scoped business endpoint owns it.
 */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import {pdfOverlayRect} from './pdf-preview.js';
import {layoutPDFEdgeRails} from './pdf-gutter-label-layout.js';
import {viewStore,publishFocus} from './view-store.js';
import {focusLogical} from './v2-pane-focus.js';
import './pdf-preview.css';
import './v2-pdf-viewer.css';
GlobalWorkerOptions.workerSrc=workerUrl;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
// PDF.js page-width subtracts its 40px scrollbar/padding allowance.
// Hidden Dockview panes can report 0px at pagesinit: that produces -5% (!)
// and a broken PDF canvas. Defer auto-fit until a real pane is measurable.
const MIN_FIT_WIDTH=80,MIN_FIT_HEIGHT=50;
const API='/labs/lab-ocr-v2/api/mineru-base/';
const $=selector=>document.querySelector(selector);
function notify(text,kind='info'){
  document.dispatchEvent(new CustomEvent('v2-pdf-status',{detail:{text,kind}}));
}
function checkedMap(map){
  if(map?.schema!=='v2-pdf-projection/v1'||!Number.isInteger(map.pageCount)||
    map.pageCount<1||!Array.isArray(map.covers)||!Array.isArray(map.pageSizes))
    throw Error('V2 PDF 映射缺少可信来源');
  return map;
}
export function mountV2PDF(host){
  const toolbar=host.closest('.ocr-detached-pdf-pane')?.querySelector('.ocr-detached-pdf-tools');
  if(!toolbar)throw Error('Frame PDF 原生工具栏不存在');
  host.classList.add('ocr-pdf-pane','ocr-pdf-readonly');host.dataset.pdfTheme='dark';
  toolbar.innerHTML=`<div class="v2-pdf-nav" aria-label="PDF 缩放导航">
    <button class="v2-pdf-minus" title="缩小" type="button">−</button>
    <button class="v2-pdf-fit" title="适宽" type="button">适宽</button>
    <button class="v2-pdf-plus" title="放大" type="button">+</button>
    <span class="v2-pdf-zoom" aria-live="polite">—</span>
    <label>页 <input class="ocr-pdf-page" type="number" min="1" value="1" aria-label="PDF 页码" /></label>
    <span class="v2-pdf-count">/ —</span></div>`;
  host.innerHTML='<div class="ocr-pdf-scroller pdfViewerContainer" tabindex="0" aria-label="PDF 连续页面">'+
    '<div class="pdfViewer"></div></div>';
  const scroller=host.querySelector('.ocr-pdf-scroller'),pages=host.querySelector('.pdfViewer');
  const pageInput=toolbar.querySelector('input'),count=toolbar.querySelector('.v2-pdf-count'),
    zoom=toolbar.querySelector('.v2-pdf-zoom');
  let pdf=null,task=null,viewer=null,model=null,workspace='',token=0,selectedId=null;
  let pdfUserUntil=0,disposed=false,rotationInvalid=new Set(),readyPages=new Set(),
    repaintPending=false,hasPrinted=false;
  let pagesInitialized=false,fitPending=true,lastFitWidth=0,zoomMode='page-width';
  const rowsById=new Map();
  const canPaint=()=>Boolean(pdf&&viewer&&model&&!disposed);
  const source=()=>$('#workspace #editor')?.v2SourcePort;
  const rowsOnPage=page=>model?.covers.filter(item=>item.physicalPageIndex===page)||[];
  const getPageDiv=page=>viewer?.getPageView(page)?.div;
  const findLogical=(id)=>source()?.getIntervals().find(row=>row.logicalId===id);
  const updateZoom=()=>{
    const scale=viewer?.currentScale;
    zoom.textContent=Number.isFinite(scale)&&scale>0?Math.round(scale*100)+'%':'—';
  };
  function fitPageWidth(force=false){
    if(!viewer?.pdfDocument||!pagesInitialized){fitPending=true;return false;}
    const width=scroller.clientWidth,height=scroller.clientHeight;
    if(width<MIN_FIT_WIDTH||height<MIN_FIT_HEIGHT){
      fitPending=true;
      // An already-invalid scale (e.g. from an older pre-fix instance)
      // must never be propagated into PDF.js canvas rendering.
      if(!Number.isFinite(viewer.currentScale)||viewer.currentScale<=0){
        viewer.currentScaleValue=0.75;
        viewer.update();
      }
      updateZoom();return false;
    }
    if(!force&&!fitPending&&lastFitWidth===width&&viewer.currentScale>0){
      updateZoom();return true;
    }
    viewer.currentScaleValue='page-width';
    if(!Number.isFinite(viewer.currentScale)||viewer.currentScale<=0){
      viewer.currentScaleValue=0.75;
      fitPending=true;updateZoom();return false;
    }
    lastFitWidth=width;fitPending=false;
    viewer.update();updateZoom();repaintLater();
    return true;
  }
  function clearVisuals(){
    pages.querySelectorAll('.v2-pdf-cover,.v2-pdf-label-layer').forEach(n=>n.remove());
  }
  function focusHighlight(){
    if(!canPaint())return;
    const row=rowsById.get(selectedId);
    for(const item of pages.querySelectorAll('.v2-pdf-cover')){
      const id=Number(item.dataset.logicalId);
      item.classList.toggle('v2-pdf-selected',id===selectedId);
      item.classList.toggle('v2-pdf-parent-group',Boolean(row&&
        rowsById.get(id)?.rootLogicalId===row.rootLogicalId&&id!==selectedId));
    }
    for(const node of pages.querySelectorAll('.v2-pdf-label'))
      node.classList.toggle('v2-pdf-selected',Number(node.dataset.logicalId)===selectedId);
  }
  function layoutPage(pageIndex){
    if(!canPaint()||!readyPages.has(pageIndex))return;
    const node=getPageDiv(pageIndex);
    if(!node||!pages.contains(node)||node.clientWidth<10||node.clientHeight<10)return;
    // PDF.js can replace a page DOM on zoom; only previous V2 overlays owned
    // by this instance are rebuilt. Source evidence never changes.
    node.querySelectorAll(':scope > .v2-pdf-cover,:scope > .v2-pdf-label-layer').forEach(n=>n.remove());
    const covers=[];const items=[];const pageWidth=node.clientWidth,pageHeight=node.clientHeight;
    for(const item of rowsOnPage(pageIndex)){
      let rect;
      try{rect=pdfOverlayRect({bbox:item.bbox,pageSize:item.pageSize},
        {width:pageWidth,height:pageHeight});}
      catch(error){
        rotationInvalid.add(pageIndex);
        notify('PDF 第 '+(pageIndex+1)+' 页原始 OCR 坐标不匹配，已禁止绘制覆盖框','warning');
        continue;
      }
      rotationInvalid.delete(pageIndex);
      const overlay=document.createElement('div');
      overlay.className='v2-pdf-cover';overlay.dataset.logicalId=String(item.logicalId);
      for(const [name,value] of Object.entries(rect))overlay.style[name]=value+'%';
      overlay.setAttribute('aria-label',item.pbs+' 原始 PDF 覆盖框');
      overlay.title=item.pbs+' · 逻辑 ID '+item.logicalId+' · 原始块 '+item.baseBlockId;
      node.append(overlay);
      const target={left:rect.left/100*pageWidth,top:rect.top/100*pageHeight,
        right:(rect.left+rect.width)/100*pageWidth,
        bottom:(rect.top+rect.height)/100*pageHeight};
      covers.push(target);
      const labelWidth=Math.max(31,Math.min(89,item.pbs.length*8+10));
      items.push({id:String(item.logicalId),side:target.left<pageWidth/2?'left':'right',
        width:labelWidth,height:18,anchorY:(target.top+target.bottom)/2,target,
        row:item});
    }
    const rail=layoutPDFEdgeRails(items,{pageWidth,pageHeight,covers});
    const layer=document.createElement('div');layer.className='v2-pdf-label-layer';
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox',`0 0 ${pageWidth} ${pageHeight}`);
    svg.classList.add('v2-pdf-leaders');
    for(const leader of rail.leaders){
      const path=document.createElementNS('http://www.w3.org/2000/svg','path');
      path.setAttribute('d',leader.path);path.dataset.logicalId=leader.id;
      svg.append(path);
    }
    layer.append(svg);
    for(const label of rail.slots){
      const row=label.row||items.find(item=>item.id===label.id)?.row;
      if(!row)continue;
      const chip=document.createElement('button');chip.type='button';
      chip.className='v2-pdf-label';chip.dataset.logicalId=String(row.logicalId);
      chip.textContent=row.pbs;chip.title=row.pbs+' · 原始 PDF '+(row.physicalPageIndex+1)+' 页';
      chip.style.left=label.left+'px';chip.style.top=label.top+'px';
      chip.style.width=label.width+'px';chip.style.height=label.height+'px';
      if(row.parentId!==null)chip.classList.add('v2-pdf-child');
      if(row.empty)chip.classList.add('v2-pdf-empty');
      chip.addEventListener('click',event=>{event.stopPropagation();selectPDF(row.logicalId,true);});
      layer.append(chip);
    }
    node.append(layer);
    focusHighlight();
    hasPrinted=true;
  }
  function repaint(){
    repaintPending=false;
    if(!canPaint())return;
    for(let page=0;page<model.pageCount;page++)layoutPage(page);
  }
  function repaintLater(){
    if(repaintPending||!canPaint())return;
    repaintPending=true;
    requestAnimationFrame(repaint);
  }
  const observer=new MutationObserver(mutations=>{
    if(!canPaint()||repaintPending)return;
    if(mutations.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>
      n.nodeType===1&&(n.matches?.('.page')||n.querySelector?.('.page')))))repaintLater();
  });
  observer.observe(pages,{subtree:true,childList:true});
  const resize=new ResizeObserver(()=>{
    if(!canPaint()||!host.isConnected)return;
    // V1 onResize performs a NEW page-width calculation when the pane
    // becomes visible / its width changes. PDFViewer.update() alone does
    // NOT recalculate page-width, leaving the initial -5% stuck forever.
    if(zoomMode==='page-width')fitPageWidth();
    else viewer.update();
    repaintLater();
  });resize.observe(scroller);
  async function navigatePDF(id,{reveal=false}={}){
    const row=rowsById.get(id);if(!row)return false;
    selectedId=id;
    focusHighlight();
    if(!canPaint())return false;
    if(reveal){
      // A source/AG/MD programmatic jump is NOT a PDF user gesture.
      // Otherwise pagechanging fires while a prior PDF click is still inside
      // its gesture window and steals the initiating logical selection.
      pdfUserUntil=0;
      const pageNode=getPageDiv(row.physicalPageIndex);
      const pageRect=pageNode?.getBoundingClientRect();
      const clip=scroller.getBoundingClientRect();
      const visible=pageRect&&pageRect.bottom>clip.top+20&&pageRect.top<clip.bottom-20;
      // Match V1 focusBlock: only page-jump when the destination PDF page
      // is outside the visible region. Calling scrollIntoView() on a child
      // cover races PDF.js virtualization and may jump to another page.
      if(!visible)viewer.scrollPageIntoView({pageNumber:row.physicalPageIndex+1});
      pageInput.value=String(row.physicalPageIndex+1);
    }
    return true;
  }
  function selectPDF(id,userClick){
    const row=rowsById.get(id);if(!row)return false;
    selectedId=id;focusHighlight();
    if(userClick){
      const logical=findLogical(id);
      if(logical)focusLogical(logical,'pdf');
      else notify(row.pbs+' 尚无有效源码区间，PDF 位置已保留','warning');
    }
    return true;
  }
  function onPdfClick(event){
    if(event.target.closest('.v2-pdf-label'))return;
    if(window.getSelection()?.toString())return;
    const page=event.target.closest('.page[data-page-number]');
    if(!page||!canPaint())return;
    const no=Number(page.dataset.pageNumber)-1;if(!Number.isInteger(no))return;
    const r=page.getBoundingClientRect();
    const x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
    const hit=rowsOnPage(no).filter(row=>{
      const [a,b,c,d]=row.bbox,[w,h]=row.pageSize;
      return x>=a/w&&x<=c/w&&y>=b/h&&y<=d/h;
    }).sort((a,b)=>{
      const area=item=>(item.bbox[2]-item.bbox[0])*(item.bbox[3]-item.bbox[1]);
      return area(a)-area(b);
    })[0];
    if(hit)selectPDF(hit.logicalId,true);
  }
  pages.addEventListener('click',onPdfClick);
  const markUser=()=>{pdfUserUntil=performance.now()+1200;};
  for(const type of ['wheel','touchstart','pointerdown','keydown'])
    scroller.addEventListener(type,markUser,{capture:true,passive:true});
  function clearDocument(){
    ++token; // abort pending fetch/decoder from a previous authorized book
    model=null;workspace='';selectedId=null;rowsById.clear();
    rotationInvalid.clear();readyPages.clear();hasPrinted=false;
    pagesInitialized=false;fitPending=true;lastFitWidth=0;zoomMode='page-width';
    clearVisuals();
    viewer?.setDocument(null);viewer=null;
    // Worker owns the original bytes; release them before opening another PDF.
    if(task)void Promise.resolve(task.destroy()).catch(()=>{});
    else if(pdf)void Promise.resolve(pdf.destroy()).catch(()=>{});
    task=null;pdf=null;
    count.textContent='/ —';pageInput.value='1';zoom.textContent='—';
  }
  function onFocus(event){
    const {logicalId,origin}=event.detail||{};
    if(!Number.isInteger(logicalId)||!rowsById.has(logicalId))return;
    void navigatePDF(logicalId,{reveal:origin!=='pdf'});
  }
  document.addEventListener('v2-sync-focus',onFocus);
  const onSession=event=>{
    if(event.detail?.kind==='clear')clearDocument();
  };
  document.addEventListener('v2-cm-session',onSession);
  const ready=async(workspacePath,projection)=>{
    if(disposed||!workspacePath)return false;
    const next=checkedMap(projection);
    if(workspace===workspacePath&&pdf)return true;
    const requestId=++token;
    // Reuse the existing V2 business route and Frame signed HTTP cookie.
    // A single user-approved workspace can contain exactly one PDF: never
    // fall back to Main's /api/pdf or another user's document.
    const response=await fetch(API+'pdf?'+new URLSearchParams({workspace:workspacePath}),
      {cache:'no-store',credentials:'same-origin'});
    if(!response.ok){
      const payload=await response.json().catch(()=>null);
      throw Error(payload?.error||'无法读取当前工作目录 PDF：HTTP '+response.status);
    }
    const binary=new Uint8Array(await response.arrayBuffer());
    if(disposed||requestId!==token)return false;
    const loading=getDocument({data:binary,stopAtErrors:true});
    const opened=await loading.promise;
    if(disposed||requestId!==token){await opened.destroy();return false;}
    if(opened.numPages!==next.pageCount){await opened.destroy();
      throw Error('PDF 页数 '+opened.numPages+' 与原始 MinerU 页数 '+next.pageCount+' 不一致，禁止绘制覆盖框');}
    if(pdf)await pdf.destroy();
    task=loading;pdf=opened;model=next;workspace=workspacePath;
    rowsById.clear();for(const row of model.covers)rowsById.set(row.logicalId,row);
    selectedId=null;rotationInvalid.clear();readyPages.clear();hasPrinted=false;
    pagesInitialized=false;fitPending=true;lastFitWidth=0;zoomMode='page-width';
    const bus=new EventBus();
    viewer=new PDFViewer({container:scroller,viewer:pages,eventBus:bus,
      textLayerMode:1,annotationMode:0,
      maxCanvasPixels:/(iPad|iPhone|iPod)/i.test(navigator.userAgent)?1_500_000:6_000_000});
    bus.on('pagesinit',()=>{
      pagesInitialized=true;
      if(!fitPageWidth(true)){
        // Loading a hidden PDF should never create a negative zoom (the
        // screenshot's -5%). Start with a safe positive scale; ResizeObserver
        // re-fits when Dockview supplies a measurable size.
        viewer.currentScaleValue=0.75;
        viewer.update();updateZoom();
      }
      repaintLater();
    });
    bus.on('pagechanging',event=>{
      pageInput.value=String(event.pageNumber);
      if(performance.now()>pdfUserUntil)return;
      const nearest=rowsOnPage(event.pageNumber-1)[0];
      if(!nearest)return;
      const row=findLogical(nearest.logicalId);
      if(!row)return;
      const line=source()?.getLineAtOffset(row.from);
      if(line)publishFocus({sourceLine:line,origin:'pdf',intent:'click',elementId:String(row.logicalId)});
    });
    bus.on('pagerendered',event=>{
      if(event.error){
        const detail=String(event.error?.message||event.error||'未知原因').slice(0,140);
        notify('PDF 页面渲染错误：第 '+event.pageNumber+' 页 · '+detail,'error');
        // If a now-visible pane still has a stale zoom value, trigger a
        // positive fit rather than letting PDF.js retry negative canvas sizes.
        if(zoomMode==='page-width'&&fitPending)fitPageWidth(true);
        return;
      }
      readyPages.add(event.pageNumber-1);
      layoutPage(event.pageNumber-1);
    });
    viewer.setDocument(pdf);
    count.textContent='/ '+pdf.numPages;
    pageInput.max=String(pdf.numPages);pageInput.value='1';
    notify('PDF 原文已加载 · '+pdf.numPages+' 页 · '+model.mappedCount+' 个原始覆盖框','ok');
    return true;
  };
  const setZoom=value=>{
    if(!viewer||!pagesInitialized)return;
    if(value==='page-width'){
      zoomMode='page-width';fitPageWidth(true);return;
    }
    const scale=Number(value);
    if(!Number.isFinite(scale)||scale<=0)return;
    zoomMode='manual';fitPending=false;
    viewer.currentScaleValue=scale;viewer.update();updateZoom();repaintLater();
  };
  toolbar.querySelector('.v2-pdf-fit').addEventListener('click',()=>setZoom('page-width'));
  toolbar.querySelector('.v2-pdf-plus').addEventListener('click',()=>{
    if(viewer)setZoom(String(Math.min(3,viewer.currentScale*1.25)));
  });
  toolbar.querySelector('.v2-pdf-minus').addEventListener('click',()=>{
    if(viewer)setZoom(String(Math.max(.5,viewer.currentScale/1.25)));
  });
  pageInput.addEventListener('change',()=>{
    if(!viewer)return;
    const n=Number(pageInput.value);
    if(Number.isInteger(n)&&n>=1&&n<=pdf.numPages){markUser();viewer.scrollPageIntoView({pageNumber:n});}
    else pageInput.value=String(viewer.currentPageNumber);
  });
  const port=Object.freeze({load:ready,focusId:id=>navigatePDF(id,{reveal:true}),
    getState:()=>({loaded:Boolean(pdf&&model),workspace,pageCount:pdf?.numPages||0,
      mappedCount:model?.mappedCount||0,painted:hasPrinted,selectedId,
      invalidPages:[...rotationInvalid],scale:viewer?.currentScale??null,
      fitPending,scrollerWidth:scroller.clientWidth}),
    getCovers:()=>model?.covers||[],getViewer:()=>viewer,clear:clearDocument});
  host.v2PDFPort=port;
  return {layout(){if(zoomMode==='page-width')fitPageWidth();
      else if(viewer&&scroller.clientWidth)viewer.update();
      repaintLater();},
    dispose(){disposed=true;token++;resize.disconnect();observer.disconnect();
      pages.removeEventListener('click',onPdfClick);
      for(const type of ['wheel','touchstart','pointerdown','keydown'])
        scroller.removeEventListener(type,markUser,true);
      document.removeEventListener('v2-sync-focus',onFocus);
      document.removeEventListener('v2-cm-session',onSession);
      clearDocument();delete host.v2PDFPort;
    }};
}
