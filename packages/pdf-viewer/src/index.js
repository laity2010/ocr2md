/** Public @ocr2md/pdf-viewer API. No Main CMD, viewStore, SQL, AG or private ports. */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import './viewer.css';
import {pdfOverlayRect,validateOverlays} from './geometry.js';

GlobalWorkerOptions.workerSrc=workerUrl;
export {pdfOverlayRect,validateOverlays};
export const PDF_VIEWER_VERSION='0.1.0-dev.0';

const clamp=(n,min,max)=>Math.min(Math.max(n,min),max);
const rejectDisposed=()=>{throw Error('PDF 组件已销毁');};
const pageId=id=>(typeof id==='number'?'n:':'s:')+String(id);

/** Create a self-owning UI instance. All project-specific operations are callbacks. */
export function createPdfViewer(host,{onBlockClick=()=>{},onPageChange=()=>{},onStatusChange=()=>{}}={}){
  if(!(host instanceof HTMLElement))throw TypeError('PDF 容器必须是 HTML 元素');
  if(host.hasAttribute('data-ocr-pdf-owned'))throw Error('PDF 容器已有 Viewer 实例');
  if([onBlockClick,onPageChange,onStatusChange].some(fn=>typeof fn!=='function'))
    throw TypeError('PDF 事件监听器必须是函数');
  host.dataset.ocrPdfOwned='1';
  host.innerHTML=`<div class="opdf-root" aria-label="公共 PDF 查看器">
    <div class="opdf-toolbar" role="toolbar" aria-label="PDF 导航与缩放">
      <button type="button" data-action="zoom-out" aria-label="缩小 PDF">−</button>
      <button type="button" data-action="fit" aria-label="适宽 PDF">适宽</button>
      <button type="button" data-action="zoom-in" aria-label="放大 PDF">+</button>
      <span class="opdf-scale" aria-label="缩放比例">—</span>
      <label class="opdf-page-label">页 <input type="number" class="opdf-page" min="1" step="1" value="1" aria-label="PDF 页码"/></label>
      <span class="opdf-count">/ —</span>
      <label class="opdf-toggle"><input type="checkbox" class="opdf-overlays-toggle" checked/> PBS</label>
      <span class="opdf-status" aria-live="polite"></span>
    </div>
    <div class="opdf-scroller pdfViewerContainer" tabindex="0" aria-label="PDF 连续页面">
      <div class="pdfViewer"></div>
    </div></div>`;
  const root=host.firstElementChild;
  const toolbar=root.querySelector('.opdf-toolbar');
  const scroller=root.querySelector('.opdf-scroller');
  const pages=root.querySelector('.pdfViewer');
  const pageInput=root.querySelector('.opdf-page');
  const scaleNode=root.querySelector('.opdf-scale');
  const pageCount=root.querySelector('.opdf-count');
  const checkbox=root.querySelector('.opdf-overlays-toggle');
  const status=root.querySelector('.opdf-status');
  let disposed=false,task=null,pdf=null,viewer=null,bus=null;
  let loadPromise=null,selectedId=null,visible=true,zoom='page-width';
  let revision=0;
  let blocks=new Map(),nodes=new Map();
  let overlaysByPage=new Map();
  const statusReport=(message,level='info')=>{
    status.textContent=message;
    onStatusChange({status:level,message});
  };
  const updateScale=()=>{
    if(viewer&&Number.isFinite(viewer.currentScale))
      scaleNode.textContent=Math.round(viewer.currentScale*100)+'%';
  };
  function paintPage(pageIndex){
    if(disposed||!viewer)return;
    const page=viewer.getPageView(pageIndex);
    if(!page?.div||!page.viewport)return;
    const parent=page.div;
    const candidates=overlaysByPage.get(pageIndex)||[];
    const desired=new Set();
    for(const block of candidates){
      const key=pageId(block.blockId);
      const normalized=pdfOverlayRect(block,page.viewport);
      desired.add(key);
      let element=nodes.get(key);
      if(!element){
        element=document.createElement('div');
        element.className='opdf-block';
        element.dataset.blockId=String(block.blockId);
        const label=document.createElement('button');
        label.type='button';label.className='opdf-chip';
        label.addEventListener('click',event=>{
          event.stopPropagation();
          if(disposed)return;
          selectedId=block.blockId;paintSelection();
          const latest=blocks.get(block.blockId);
          onBlockClick({blockId:latest.blockId,parentId:latest.parentId,label:latest.label,
            pageIndex:latest.pageIndex});
        });
        element.append(label);
        nodes.set(key,element);
      }
      element.style.left=normalized.left+'%';
      element.style.top=normalized.top+'%';
      element.style.width=normalized.width+'%';
      element.style.height=normalized.height+'%';
      element.dataset.kind=block.parentId==null?'parent':'child';
      element.dataset.status=block.status;
      element.dataset.type=block.type;
      element.querySelector('.opdf-chip').textContent=block.label||('#'+block.blockId);
      element.querySelector('.opdf-chip').title='BlockID '+block.blockId+' · ParentID '+(block.parentId??'NULL');
      if(element.parentElement!==parent)parent.append(element);
    }
    for(const [key,node] of nodes){
      if(node.parentElement===parent&&!desired.has(key)){node.remove();nodes.delete(key);}
    }
    paintSelection();
  }
  function paintSelection(){
    for(const [key,node] of nodes)node.classList.toggle('opdf-selected',
      selectedId!==null && key===pageId(selectedId));
  }
  function paintAll(){
    if(!viewer)return;
    for(let i=0;i<pdf?.numPages;i++)paintPage(i);
  }
  const onPageChangeEvent=event=>{
    if(disposed)return;
    pageInput.value=String(event.pageNumber);
    onPageChange({pageIndex:event.pageNumber-1});
  };
  const onPageRendered=event=>{
    if(disposed)return;
    if(event.error)statusReport('PDF 页面渲染失败','error');
    else paintPage(event.pageNumber-1);
  };
  function zoomTo(value){
    if(disposed||!viewer)return;
    zoom=value;
    viewer.currentScaleValue=value;
    viewer.update();
    updateScale();
    // CSS percent overlays naturally follow page dimensions during reflow.
  }
  const onToolbar=event=>{
    const action=event.target.closest('button[data-action]')?.dataset.action;
    if(!action||!viewer)return;
    if(action==='fit')zoomTo('page-width');
    else zoomTo(String(clamp(viewer.currentScale*(action==='zoom-in'?1.2:1/1.2),0.35,4)));
  };
  const onPageInput=()=>{
    if(!viewer||!pdf)return;
    const number=Number(pageInput.value);
    if(Number.isSafeInteger(number)&&number>=1&&number<=pdf.numPages)
      viewer.scrollPageIntoView({pageNumber:number});
    else pageInput.value=String(viewer.currentPageNumber);
  };
  const onCheck=()=>{
    visible=checkbox.checked;
    root.classList.toggle('opdf-overlays-hidden',!visible);
  };
  toolbar.addEventListener('click',onToolbar);
  pageInput.addEventListener('change',onPageInput);
  checkbox.addEventListener('change',onCheck);
  const resizeObserver=new ResizeObserver(()=>{
    if(disposed||!viewer)return;
    if(zoom==='page-width')viewer.currentScaleValue='page-width';
    viewer.update();updateScale();
    paintAll();
  });
  resizeObserver.observe(scroller);
  // Main's viewer guards against PDF.js replacing .page nodes during a zoom
  // without emitting a pagerendered event for the DOM replacement itself.
  let repairScheduled=false;
  const repairObserver=new MutationObserver(mutations=>{
    if(disposed||!viewer||repairScheduled)return;
    const pageChanged=mutations.some(m=>[...m.addedNodes,...m.removedNodes].some(n=>
      n.nodeType===1&&(n.matches?.('.page')||n.querySelector?.('.page'))));
    if(!pageChanged&&!([...nodes.values()].some(node=>!pages.contains(node))))return;
    repairScheduled=true;
    requestAnimationFrame(()=>{repairScheduled=false;if(!disposed)paintAll()});
  });
  repairObserver.observe(pages,{childList:true,subtree:true});

  async function open(source){
    if(disposed)return rejectDisposed();
    if(pdf||task||loadPromise)throw Error('已有 PDF；重新加载请先销毁并创建新 Viewer');
    if(!(typeof source==='string'&&source.trim() || source instanceof Uint8Array))
      throw TypeError('open 仅接受 PDF URL 或 Uint8Array');
    const current=++revision;
    statusReport('正在加载 PDF…');
    task=getDocument({...(typeof source==='string'?{url:source}:{data:source}),
      disableRange:true,disableStream:false,stopAtErrors:true});
    loadPromise=(async()=>{
      try{
        const loaded=await task.promise;
        if(disposed||current!==revision){await loaded.destroy();throw Error('PDF 组件已销毁');}
        pdf=loaded;
        for(const block of blocks.values()){
          if(block.pageIndex>=pdf.numPages)throw RangeError('覆盖框页码超出 PDF 页数');
        }
        bus=new EventBus();
        viewer=new PDFViewer({container:scroller,viewer:pages,eventBus:bus,
          maxCanvasPixels:/(iPad|iPhone|iPod)/i.test(navigator.userAgent)?1_500_000:6_000_000,
          textLayerMode:1,annotationMode:0});
        bus.on('pagesinit',()=>{if(disposed)return;
          viewer.currentScaleValue=zoom;viewer.update();updateScale();paintAll();});
        bus.on('pagechanging',onPageChangeEvent);
        bus.on('pagerendered',onPageRendered);
        pageCount.textContent='/ '+loaded.numPages;
        const firstPaint=new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('PDF 首页绘制超时')),25000);
          bus.on('pagerendered',event=>{
            if(event.pageNumber===1){clearTimeout(timer);
              if(event.error)reject(Error('PDF 首页渲染失败'));
              else resolve();}
          });
        });
        viewer.setDocument(loaded);
        await firstPaint;
        if(disposed)throw Error('PDF 组件已销毁');
        paintAll();statusReport('PDF 已就绪 · '+loaded.numPages+' 页','ok');
        return {pages:loaded.numPages};
      }catch(error){
        if(!disposed)statusReport('PDF 加载失败：'+error.message,'error');
        throw error;
      }
    })();
    return loadPromise;
  }
  function setBlockOverlays(next){
    if(disposed)return rejectDisposed();
    const valid=validateOverlays(next);
    if(pdf&&valid.some(block=>block.pageIndex>=pdf.numPages))
      throw RangeError('覆盖框页码超出 PDF 页数');
    // Validate against the actual rendered PDF before replacing the overlay
    // map. A page rotated relative to MinerU must fail atomically.
    if(viewer)for(const block of valid){
      const viewport=viewer.getPageView(block.pageIndex)?.viewport;
      if(viewport)pdfOverlayRect(block,viewport);
    }
    const byPage=new Map();
    for(const block of valid){
      const page=byPage.get(block.pageIndex)||[];
      page.push(block);byPage.set(block.pageIndex,page);
    }
    const priorPages=overlaysByPage;
    blocks=new Map(valid.map(block=>[block.blockId,block]));
    overlaysByPage=byPage;
    if(selectedId!==null&&!blocks.has(selectedId))selectedId=null;
    if(pdf&&viewer){
      // Redraw only changed page overlays; PDF document and text layer stay intact.
      const changed=new Set([...priorPages.keys(),...byPage.keys()]);
      for(const index of changed){
        const old=priorPages.get(index)||[],now=byPage.get(index)||[];
        if(JSON.stringify(old)!==JSON.stringify(now))paintPage(index);
      }
    }
    return {count:blocks.size};
  }
  async function focusBlock(blockId){
    if(disposed)return rejectDisposed();
    const block=blocks.get(blockId);
    if(!block)throw RangeError('未找到 BlockID：'+blockId);
    if(loadPromise)await loadPromise;
    if(!viewer)throw Error('请先打开 PDF');
    selectedId=block.blockId;
    const pageNumber=block.pageIndex+1;
    viewer.scrollPageIntoView({pageNumber});
    paintPage(block.pageIndex);
    const node=nodes.get(pageId(blockId));
    if(!node)throw Error('PDF 页面尚未提供有效覆盖框');
    // Move inside the PDF scroller, not the host app's outer document.
    const scrollRect=scroller.getBoundingClientRect();
    const rect=node.getBoundingClientRect();
    scroller.scrollTop+=rect.top-scrollRect.top-scrollRect.height*.35;
    paintSelection();
    return {blockId,pageIndex:block.pageIndex};
  }
  function dispose(){
    if(disposed)return;
    disposed=true;++revision;
    resizeObserver.disconnect();repairObserver.disconnect();
    toolbar.removeEventListener('click',onToolbar);
    pageInput.removeEventListener('change',onPageInput);
    checkbox.removeEventListener('change',onCheck);
    bus?.off('pagechanging',onPageChangeEvent);
    bus?.off('pagerendered',onPageRendered);
    viewer?.setDocument(null);
    void task?.destroy();
    nodes.clear();blocks.clear();overlaysByPage.clear();
    host.replaceChildren();delete host.dataset.ocrPdfOwned;
  }
  return Object.freeze({open,setBlockOverlays,focusBlock,dispose});
}
