/** Lab OCR PDF view: no CMD, PBS, MinerU or SQLite coupling.
 * Public loader: loadPdf(authorized URL). The view owns PDF.js lifetime.
 */
import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist/build/pdf.mjs';
import {EventBus,PDFViewer} from 'pdfjs-dist/web/pdf_viewer.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import './pdf-viewer.css';
GlobalWorkerOptions.workerSrc=workerUrl;

const actions=[
  ['previous','上一页','‹'],['next','下一页','›'],
  ['zoom-out','缩小','−'],['fit-width','适宽','适宽'],
  ['fit-page','整页','整页'],['zoom-in','放大','+'],
  ['rotate','顺时针旋转 90°','旋转'],['download','下载原 PDF','下载'],
];

export function mountLabOcrPdf({surface,toolbar,onStatus=()=>{}}){
  if(!surface||!toolbar||surface.querySelector('.lab-ocr-pdf-root'))
    throw Error('PDF 窗口不存在或已经挂载');
  const controls=document.createElement('div');controls.className='lab-ocr-pdf-controls';
  controls.setAttribute('role','toolbar');controls.setAttribute('aria-label','PDF 常用菜单');
  const pageInput=document.createElement('input');pageInput.type='number';pageInput.min='1';
  pageInput.value='1';pageInput.className='lab-ocr-pdf-page';pageInput.setAttribute('aria-label','PDF 页码');
  const count=document.createElement('span');count.className='lab-ocr-pdf-count';count.textContent='/ —';
  const zoom=document.createElement('span');zoom.className='lab-ocr-pdf-zoom';zoom.textContent='—';
  for(const [action,title,label] of actions){
    const button=document.createElement('button');button.type='button';button.dataset.action=action;
    button.title=title;button.setAttribute('aria-label',title);button.textContent=label;button.disabled=true;
    controls.append(button);
    if(action==='next'){
      const pageLabel=document.createElement('label');pageLabel.textContent='页';
      pageLabel.append(pageInput,count);controls.append(pageLabel);
    }
    if(action==='fit-page')controls.append(zoom);
  }
  toolbar.replaceChildren(controls);
  surface.dataset.pdfTheme='dark';surface.classList.add('lab-ocr-pdf-surface');
  const root=document.createElement('div');root.className='lab-ocr-pdf-root';
  const scroller=document.createElement('div');scroller.className='lab-ocr-pdf-scroller pdfViewerContainer';
  scroller.tabIndex=0;scroller.setAttribute('aria-label','PDF 连续页面');
  const pages=document.createElement('div');pages.className='pdfViewer';scroller.append(pages);
  const placeholder=document.createElement('div');placeholder.className='lab-ocr-pdf-placeholder';
  placeholder.textContent='请在全局设置中选择包含 pdf/ 的书籍资料目录';
  root.append(scroller,placeholder);surface.replaceChildren(root);
  const buttons=new Map([...controls.querySelectorAll('button')].map(button=>[button.dataset.action,button]));
  const bus=new EventBus();
  const viewer=new PDFViewer({container:scroller,viewer:pages,eventBus:bus,
    maxCanvasPixels:/(iPad|iPhone|iPod)/i.test(navigator.userAgent)?1_500_000:6_000_000,
    textLayerMode:1,annotationMode:0});
  let disposed=false,ready=false,source=null,loading=null,task=null,pdf=null,revision=0;
  let resolvePaint=null;
  const emit=(message,kind='info')=>{if(!disposed)onStatus('PDF · '+message,kind);};
  const readyButtons=()=>{
    for(const button of buttons.values())button.disabled=!ready;
    pageInput.disabled=!ready;
    if(ready){
      buttons.get('previous').disabled=viewer.currentPageNumber<=1;
      buttons.get('next').disabled=viewer.currentPageNumber>=pdf.numPages;
    }
  };
  const updatePage=()=>{
    pageInput.value=String(viewer.currentPageNumber||1);
    if(pdf)count.textContent='/ '+pdf.numPages;
    readyButtons();
  };
  const updateZoom=()=>{if(ready&&viewer.currentScale>0)zoom.textContent=Math.round(viewer.currentScale*100)+'%';};
  bus.on('pagesinit',()=>{viewer.currentScaleValue='page-width';viewer.update();updatePage();});
  bus.on('pagechanging',updatePage);
  bus.on('scalechanging',()=>requestAnimationFrame(updateZoom));
  bus.on('pagerendered',event=>{
    if(event.pageNumber!==1||!resolvePaint)return;
    const complete=resolvePaint;resolvePaint=null;complete(!event.error);
  });
  controls.addEventListener('click',event=>{
    const action=event.target.closest('button')?.dataset.action;
    if(!ready||!action)return;
    switch(action){
      case 'previous':viewer.currentPageNumber=Math.max(1,viewer.currentPageNumber-1);break;
      case 'next':viewer.currentPageNumber=Math.min(pdf.numPages,viewer.currentPageNumber+1);break;
      case 'zoom-out':viewer.currentScale=Math.max(.1,viewer.currentScale/1.2);break;
      case 'zoom-in':viewer.currentScale=Math.min(5,viewer.currentScale*1.2);break;
      case 'fit-width':viewer.currentScaleValue='page-width';break;
      case 'fit-page':viewer.currentScaleValue='page-fit';break;
      case 'rotate':viewer.pagesRotation=(viewer.pagesRotation+90)%360;break;
      case 'download':{
        const a=document.createElement('a');a.href=source;a.download='ocr-original.pdf';
        document.body.append(a);a.click();a.remove();break;
      }
    }
    updatePage();updateZoom();
  });
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
    pdf=null;ready=false;
    viewer.setDocument(null);
    pageInput.value='1';count.textContent='/ —';zoom.textContent='—';readyButtons();
  };
  async function loadPdf(url){
    if(disposed)throw Error('PDF Viewer 已销毁');
    if(url!==null&&(typeof url!=='string'||!url.startsWith('/labs/lab-ocr/api/ocr/pdf?')))
      throw Error('PDF 必须使用 Lab OCR 已授权读取地址');
    if(url===source&&loading)return loading;
    const token=++revision;
    source=url;ready=false;readyButtons();
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
        updatePage();updateZoom();
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
  pageInput.disabled=true;
  return Object.freeze({loadPdf,dispose(){
    if(disposed)return;
    disposed=true;revision++;
    const oldTask=task;task=null;
    if(resolvePaint){const finish=resolvePaint;resolvePaint=null;finish(false);}
    void oldTask?.destroy().catch(()=>{});
    viewer.setDocument(null);root.remove();controls.remove();
  }});
}
