/** V2 wiring ONLY to the actual V1 lab-ocr multi-lane PDF component.
 * All labels, lanes, PDF overlay DOM, iPad touch and drag are directly owned
 * by mountLabOcrPdf()/layoutPbsLabels from copied V1 files.
 */
import {mountLabOcrPdf} from './lab-ocr/pdf-viewer.js';
import {projectV2PDFEvidence} from './v2-pdf-evidence-adapter.js';
import {focusLogical} from './v2-pane-focus.js';
import './v2-pdf-viewer.css';

const PDF_URL='/labs/lab-ocr-v2/api/mineru-base/pdf?';
const $=selector=>document.querySelector(selector);
function notify(text,kind='info'){
  document.dispatchEvent(new CustomEvent('v2-pdf-status',{detail:{text,kind}}));
}
export function mountV2PDF(host){
  const toolbar=host.closest('.ocr-detached-pdf-pane')?.querySelector('.ocr-detached-pdf-tools');
  if(!toolbar)throw Error('Frame PDF toolbar missing');
  let native=null,projection=null,workspace='',disposed=false,generation=0;
  let ready=false,selectedId=null,lastPdfPage=1,pendingMeasure=null;
  const source=()=>$('#workspace #editor')?.v2SourcePort;
  const clear=()=>{
    ++generation;
    pendingMeasure?.(false);pendingMeasure=null;
    const old=native;native=null;projection=null;workspace='';ready=false;selectedId=null;
    old?.dispose();
    toolbar.replaceChildren();
    host.replaceChildren();
  };
  // iPad Safari: V1 PDF.js must not compute page-width with a hidden,
  // 0px Dockview pane. Defer load, do not fork or modify the V1 zoom engine.
  const measurable=()=>new Promise(resolve=>{
    const scroller=host.querySelector('.lab-ocr-pdf-scroller');
    if(!scroller){resolve(false);return;}
    if(scroller.clientWidth>=80&&scroller.clientHeight>=50){resolve(true);return;}
    let observer;
    const finish=ok=>{
      observer?.disconnect();
      if(pendingMeasure===finish)pendingMeasure=null;
      resolve(ok);
    };
    pendingMeasure=finish;
    observer=new ResizeObserver(()=>{
      if(scroller.clientWidth>=80&&scroller.clientHeight>=50)finish(true);
    });
    observer.observe(scroller);
  });
  const focusId=(id,reveal=true)=>{
    const row=projection?.byId.get(Number(id));
    if(!row||!native)return false;
    selectedId=row.logicalId;
    return native.focusBlock({id:String(id),page:row.physicalPageIndex+1,reveal});
  };
  const load=async (path,evidence)=>{
    if(disposed||!path)return false;
    if(native&&workspace===path)return ready;
    clear();
    const stamp=generation;
    const data=projectV2PDFEvidence(evidence);
    const viewer=mountLabOcrPdf({
      surface:host,toolbar,onStatus:notify,pdfUrlPrefix:PDF_URL,
    });
    native=viewer;projection=data;workspace=path;
    // On Frame toolbar zoom changes PDF.js can replace a cached page without
    // firing pagerendered for that exact page. Request the EXISTING V1
    // repaintOverlayPage() public API; do not recreate PBS DOM or lane math.
    toolbar.querySelector('.lab-ocr-pdf-scale')?.addEventListener('change',()=>{
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(!disposed&&generation===stamp) viewer.repaintOverlayPage(lastPdfPage);
      }));
    });
    viewer.setOverlays({
      level:'block',allowSpan:false,blockGroups:['para_blocks'],
      loadPage:(page,level)=>data.page(page,level),
      onPageChange:page=>{lastPdfPage=page;},
      onBlockSelect:({blockId})=>{
        const id=Number(blockId);
        selectedId=id;
        const row=source()?.getIntervals().find(item=>item.logicalId===id);
        if(row)focusLogical(row,'pdf');
      },
      onBlockDragIntent:async()=>{throw Error(
        'V2 结构关系尚未开放持久化事务；本次只展示 V1 拖动预演，不修改逻辑表');},
    });
    if(!await measurable()||disposed||stamp!==generation)return false;
    const url=PDF_URL+new URLSearchParams({workspace:path});
    const result=await viewer.loadPdf(url);
    if(disposed||stamp!==generation)return false;
    ready=Boolean(result);
    notify('V1 原版动态多轨 PBS · '+evidence.pageCount+' 页 · '+
      evidence.mappedCount+' 个逻辑框','ok');
    return ready;
  };
  const onFocus=event=>{
    if(event.detail?.origin==='pdf')return;
    const id=event.detail?.logicalId;
    if(Number.isSafeInteger(id))focusId(id,true);
  };
  const onSession=event=>{if(event.detail?.kind==='clear')clear();};
  document.addEventListener('v2-sync-focus',onFocus);
  document.addEventListener('v2-cm-session',onSession);
  const state=()=>({
    loaded:ready,workspace,pageCount:projection?.map.pageCount||0,
    mappedCount:projection?.map.mappedCount||0,
    selectedId,
    fitPending:!!native&&!ready,
    scrollerWidth:host.querySelector('.lab-ocr-pdf-scroller')?.clientWidth||0,
    currentPage:lastPdfPage,
    renderingOwner:'V1 lab-ocr mountLabOcrPdf',
    scale:(host.querySelector('.page[data-page-number="1"]')?.clientWidth||0)/
      (projection?.map.pageSizes[0]?.[0]||1)||null,
  });
  const port=Object.freeze({
    load,clear,getState:state,
    getCovers:()=>projection?.map.covers||[],
    getV1Preview:()=>native,
    focusId,
  });
  host.v2PDFPort=port;
  return {
    layout(){native?.relayout();},
    dispose(){disposed=true;
      document.removeEventListener('v2-sync-focus',onFocus);
      document.removeEventListener('v2-cm-session',onSession);
      clear();delete host.v2PDFPort;
    },
  };
}
