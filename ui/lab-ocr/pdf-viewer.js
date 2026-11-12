/** Lab OCR PDF view: no CMD, MinerU or SQLite coupling.
 * Consumes opaque caller-provided block IDs, PBS display labels and geometry.
 * Public loader: loadPdf(authorized URL). The view owns PDF.js lifetime.
 */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import {layoutPbsLabels} from './pbs-label-layout.js';
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
  let onBlockSelect=null,selectedBlockId=null,focusRequest=null;
  const overlayCache=new Map(),overlayPending=new Set();
  const clearOverlayNodes=()=>{
    for(const node of pages.querySelectorAll('.lab-ocr-pdf-overlay-layer,.lab-ocr-pdf-pbs-layer'))node.remove();
  };
  const blockIdOf=item=>item?.blockId==null?null:String(item.blockId);
  const matchesSelected=ids=>selectedBlockId!==null&&ids.has(selectedBlockId);
  const updateSelectedNodes=()=>{
    for(const node of pages.querySelectorAll('.lab-ocr-pdf-overlay-box[data-block-ids],.lab-ocr-pdf-pbs-tag[data-block-ids]')){
      node.dataset.selected=String(selectedBlockId!==null&&node.dataset.blockIds.split(' ').includes(selectedBlockId));
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
    const pageView=viewer.getPageView(page-1);
    const host=pageView?.div;
    if(!host)return;
    host.querySelector('.lab-ocr-pdf-overlay-layer')?.remove();
    host.querySelector('.lab-ocr-pdf-pbs-layer')?.remove();
    const size=data?.pageSize;
    if(!Array.isArray(size)||size.length!==2||!size.every(n=>Number.isFinite(n)&&n>0))return;
    if(data.page!==page||data.level!==overlayLevel||!Array.isArray(data.boxes))return;
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
        if(id)seenIds.set(id,duplicate);
        seenRectangles.set(rectKey,duplicate);
        continue;
      }
      const entry={left,top,right,bottom,area,group,item,
        blockIds:new Set(blockId?[blockId]:[]),element:null};
      visibleRects.push(entry);
      if(id)seenIds.set(id,entry);
      seenRectangles.set(rectKey,entry);
      const box=document.createElement('div');box.className='lab-ocr-pdf-overlay-box';
      box.dataset.id=id;
      box.style.left=(left/size[0]*100)+'%';box.style.top=(top/size[1]*100)+'%';
      box.style.width=((right-left)/size[0]*100)+'%';
      box.style.height=((bottom-top)/size[1]*100)+'%';
      entry.element=box;layer.append(box);
    }
    for(const entry of visibleRects){
      entry.element.dataset.blockIds=[...entry.blockIds].join(' ');
      entry.element.dataset.selected=String(matchesSelected(entry.blockIds));
    }
    host.append(layer);
    if(overlayLevel==='block'){
      // PBS tags live OUTSIDE the page paper in independent fixed-pixel rails.
      // SVG leaders use the same page pixel coordinate frame as PDF.js.
      const tagLayer=document.createElement('div');
      tagLayer.className='lab-ocr-pdf-pbs-layer';tagLayer.dataset.page=String(page);
      const width=viewport.width,height=viewport.height;
      const labelInputs=visibleRects.filter(x=>x.item?.pbs&&blockIdOf(x.item)).map(x=>({
        pbs:String(x.item.pbs),blockId:blockIdOf(x.item),group:x.group,
        parentBlockId:x.item.parentBlockId,
        blockIds:x.blockIds,
        bbox:[x.left/size[0]*width,x.top/size[1]*height,
          x.right/size[0]*width,x.bottom/size[1]*height],
      }));
      const placements=layoutPbsLabels(labelInputs,width,height);
      const ns='http://www.w3.org/2000/svg';
      const leaders=document.createElementNS(ns,'svg');
      leaders.setAttribute('viewBox',`0 0 ${width} ${height}`);
      leaders.setAttribute('preserveAspectRatio','none');
      leaders.classList.add('lab-ocr-pdf-pbs-leaders');
      for(const placement of placements){
        const startX=placement.side==='left'?0:width;
        const bendX=placement.side==='left'?Math.min(12,placement.anchorX):Math.max(width-12,placement.anchorX);
        const fromY=placement.top+11.5;
        const leader=document.createElementNS(ns,'polyline');
        leader.setAttribute('points',`${startX},${fromY} ${bendX},${fromY} ${placement.anchorX},${placement.anchorY}`);
        leaders.append(leader);
      }
      tagLayer.append(leaders);
      for(const placement of placements){
        const members=placement.items;
        const head=members[0];
        const button=document.createElement('button');button.type='button';
        button.className='lab-ocr-pdf-pbs-tag';
        button.dataset.side=placement.side;
        button.dataset.child=String(head.parentBlockId!==null&&head.parentBlockId!==undefined);
        button.dataset.blockId=head.blockId;
        const ids=new Set(members.flatMap(member=>[...member.blockIds]));
        button.dataset.blockIds=[...ids].join(' ');
        button.dataset.selected=String(matchesSelected(ids));
        button.style.top=placement.top+'px';
        button.textContent=members.length===1?head.pbs:`${head.pbs} +${members.length-1}`;
        button.title=members.length===1?`${head.pbs} · Block ID ${head.blockId} · ${head.group}`:
          `${members.length} 个 PBS 标签，点击展开`;
        button.setAttribute('aria-label',members.length===1?`定位 ${head.pbs}`:
          `展开 ${members.length} 个 PBS 标签`);
        button.addEventListener('click',()=>{
          if(members.length===1){
            activateBlock({blockId:head.blockId,pbs:head.pbs,page,blockGroup:head.group},true);
            return;
          }
          const active=tagLayer.querySelector('.lab-ocr-pdf-pbs-picker');
          if(active){const same=active.dataset.owner===head.blockId;active.remove();if(same)return;}
          const picker=document.createElement('div');picker.className='lab-ocr-pdf-pbs-picker';
          picker.dataset.owner=head.blockId;picker.dataset.side=placement.side;
          const popupHeight=Math.min(194,Math.max(60,height-8));
          picker.style.maxHeight=popupHeight+'px';
          picker.style.top=Math.max(4,Math.min(placement.top,height-popupHeight-4))+'px';
          for(const member of members){
            const option=document.createElement('button');option.type='button';
            option.textContent=member.pbs;
            option.title=`${member.pbs} · Block ID ${member.blockId} · ${member.group}`;
            option.addEventListener('click',()=>{activateBlock({blockId:member.blockId,
              pbs:member.pbs,page,blockGroup:member.group},true);
              picker.remove();});
            picker.append(option);
          }
          picker.addEventListener('keydown',event=>{if(event.key==='Escape'){picker.remove();button.focus();}});
          tagLayer.append(picker);
          picker.querySelector('button')?.focus();
        });
        tagLayer.append(button);
      }
      host.append(tagLayer);
    }
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
    // The same public method accepts a {blockGroups} patch from AG without
    // resetting a user's Block/Span dropdown or the cached page geometry.
    const nextLevel=Object.hasOwn(config,'level')?config.level:overlayLevel;
    if(Object.hasOwn(config,'onBlockSelect')){
      if(config.onBlockSelect!==null&&typeof config.onBlockSelect!=='function')
        throw Error('PDF Block 选择回调必须是函数或 null');
      onBlockSelect=config.onBlockSelect;
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
    focusRequest=null;selectedBlockId=null;
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
  return Object.freeze({loadPdf,setOverlays,focusBlock,relayout,dispose(){
    if(disposed)return;
    disposed=true;revision++;overlayRevision++;overlayCache.clear();resizeObserver.disconnect();
    pageObserver.disconnect();
    const oldTask=task;task=null;
    if(resolvePaint){const finish=resolvePaint;resolvePaint=null;finish(false);}
    void oldTask?.destroy().catch(()=>{});
    viewer.setDocument(null);root.remove();controls.remove();
  }});
}
