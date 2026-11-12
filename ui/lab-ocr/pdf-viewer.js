/** Lab OCR PDF view: no CMD, PBS, MinerU or SQLite coupling.
 * Public loader: loadPdf(authorized URL). The view owns PDF.js lifetime.
 */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
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
  // New public API: setOverlays({level:'off'|'block'|'span',loadPage(page,level)}).
  // The caller owns SQL/JSON and returns only page geometry; PDF.js never
  // sees PBS, table schemas, raw MinerU records, or filesystem paths.
  let overlayLevel='off',loadOverlayPage=null,overlayRevision=0,blockTypes=null;
  const overlayCache=new Map(),overlayPending=new Set();
  const clearOverlayNodes=()=>{
    for(const node of pages.querySelectorAll('.lab-ocr-pdf-overlay-layer'))node.remove();
  };
  function paintPageBoxes(page,data){
    if(disposed||!pdf||overlayLevel==='off'||page>pdf.numPages)return;
    const pageView=viewer.getPageView(page-1);
    const host=pageView?.div;
    if(!host)return;
    host.querySelector('.lab-ocr-pdf-overlay-layer')?.remove();
    const size=data?.pageSize;
    if(!Array.isArray(size)||size.length!==2||!size.every(n=>Number.isFinite(n)&&n>0))return;
    if(data.page!==page||data.level!==overlayLevel||!Array.isArray(data.boxes))return;
    // Refuse to draw misleading boxes when MinerU's coordinate system and
    // this PDF page have incompatible aspect ratios.
    const viewport=pageView.viewport;
    if(viewport?.width&&viewport?.height){
      const ratio=size[0]/size[1],actual=viewport.width/viewport.height;
      if(Math.abs(ratio-actual)>actual*.04)return;
    }
    const layer=document.createElement('div');
    layer.className='lab-ocr-pdf-overlay-layer';
    layer.dataset.level=overlayLevel;layer.dataset.page=String(page);
    const clamp=(value,max)=>Math.max(0,Math.min(value,max));
    const seenIds=new Set(),seenRectangles=new Set();
    for(const item of data.boxes){
      // The AG Block Type filter applies to Block AND Span geometries.
      // Missing type metadata never bypasses an active selection.
      if(blockTypes!==null&&!blockTypes.has(String(item?.blockType??'')))continue;
      const rect=item?.bbox;
      if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite))continue;
      const [x1,y1,x2,y2]=rect;
      const left=clamp(x1,size[0]),top=clamp(y1,size[1]);
      const right=clamp(x2,size[0]),bottom=clamp(y2,size[1]);
      if(right<=left||bottom<=top)continue;
      const id=item.id==null?'':String(item.id);
      const rectKey=[left,top,right,bottom].map(n=>n.toFixed(4)).join(':');
      // A multi-selection is a set UNION, not a new overlay per type.
      // Identical rectangles from nested/duplicate blocks are painted once.
      if((id&&seenIds.has(id))||seenRectangles.has(rectKey))continue;
      if(id)seenIds.add(id);
      seenRectangles.add(rectKey);
      const box=document.createElement('div');box.className='lab-ocr-pdf-overlay-box';
      box.dataset.id=id;
      box.style.left=(left/size[0]*100)+'%';box.style.top=(top/size[1]*100)+'%';
      box.style.width=((right-left)/size[0]*100)+'%';
      box.style.height=((bottom-top)/size[1]*100)+'%';
      layer.append(box);
    }
    host.append(layer);
  }
  function requestOverlayPage(page){
    if(disposed||!pdf||!ready||overlayLevel==='off'||!loadOverlayPage)return;
    if(!Number.isInteger(page)||page<1||page>pdf.numPages)return;
    const key=overlayLevel+':'+page;
    if(overlayCache.has(key)){
      paintPageBoxes(page,overlayCache.get(key));return;
    }
    if(overlayPending.has(key))return;
    overlayPending.add(key);
    const stamp=overlayRevision,level=overlayLevel,loader=loadOverlayPage;
    Promise.resolve().then(()=>loader(page,level)).then(result=>{
      if(disposed||stamp!==overlayRevision||level!==overlayLevel)return;
      if(result?.level!==level||result?.page!==page||!Array.isArray(result.boxes))
        throw Error('覆盖框返回结构或页码不匹配');
      overlayCache.set(key,result);
      paintPageBoxes(page,result);
    }).catch(error=>{
      if(!disposed&&stamp===overlayRevision)emit('覆盖框读取失败：'+error.message,'error');
    }).finally(()=>overlayPending.delete(key));
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
    // The same public method accepts a {blockTypes} patch from AG without
    // resetting a user's Block/Span dropdown or the cached page geometry.
    const nextLevel=Object.hasOwn(config,'level')?config.level:overlayLevel;
    const nextLoader=Object.hasOwn(config,'loadPage')?config.loadPage:loadOverlayPage;
    if(!['off','block','span'].includes(nextLevel))throw Error('覆盖框粒度无效');
    if(nextLevel!=='off'&&typeof nextLoader!=='function')
      throw Error('Block/Span 覆盖框必须提供按页读取回调');
    if(nextLoader!==null&&typeof nextLoader!=='function')throw Error('覆盖框回调无效');
    const nextTypes=Object.hasOwn(config,'blockTypes')?config.blockTypes:
      (blockTypes===null?null:[...blockTypes]);
    if(nextTypes!==null&&(!Array.isArray(nextTypes)||
      !nextTypes.every(type=>typeof type==='string')))
      throw Error('Block Type 过滤必须是字符串数组或 null');
    const normalized=nextTypes===null?null:new Set(nextTypes);
    const oldTypes=blockTypes===null?null:[...blockTypes].sort();
    const newTypes=normalized===null?null:[...normalized].sort();
    const typesChanged=JSON.stringify(oldTypes)!==JSON.stringify(newTypes);
    const loaderChanged=nextLoader!==loadOverlayPage;
    const levelChanged=nextLevel!==overlayLevel;
    loadOverlayPage=nextLoader;
    overlaySelect.disabled=nextLoader===null;
    blockTypes=normalized;
    if(levelChanged){chooseOverlayLevel(nextLevel);return true;}
    if(loaderChanged){
      overlayRevision++;overlayCache.clear();overlayPending.clear();
      clearOverlayNodes();showOverlayPages();
    }else if(typesChanged){
      // Paint from immutable cached geometry. No SQL query, PDF re-fetch,
      // overlay append, zoom reset or page change for an AG checkbox click.
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
    viewer.currentScaleValue=value==='page-width'?'page-width':String(Number(value)/100);
  });
  // Moving between split and single-pane layouts changes available width.
  // Preserve the chosen zoom mode instead of reloading the PDF.
  let lastWidth=0;
  const relayout=()=>{
    if(disposed||!ready)return;
    if(zoomSelect.value==='page-width')viewer.currentScaleValue='page-width';
    else viewer.update();
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
  return Object.freeze({loadPdf,setOverlays,relayout,dispose(){
    if(disposed)return;
    disposed=true;revision++;overlayRevision++;overlayCache.clear();resizeObserver.disconnect();
    pageObserver.disconnect();
    const oldTask=task;task=null;
    if(resolvePaint){const finish=resolvePaint;resolvePaint=null;finish(false);}
    void oldTask?.destroy().catch(()=>{});
    viewer.setDocument(null);root.remove();controls.remove();
  }});
}
