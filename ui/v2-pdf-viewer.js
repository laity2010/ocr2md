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
export function mountV2PDF(host,{toolbar}={}){
  toolbar??=host.closest('.ocr-detached-pdf-pane')?.querySelector('.ocr-detached-pdf-tools');
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
  const updateStructure=rows=>{
    if(!projection||!native||!Array.isArray(rows))return false;
    const byId=new Map(rows.map(r=>[r.logicalId,r]));
    if(byId.size!==rows.length||rows.length!==projection.map.logicalCount)
      throw Error('PDF 与 CM6 逻辑块数量不一致');
    const touched=new Set();
    const nextCovers=projection.map.covers.map(old=>{
      const row=byId.get(old.logicalId);
      if(!row)throw Error('PDF 原始逻辑块身份丢失');
      const pbs=`p${row.p}b${row.b}s${row.s}`;
      const parentId=row.parentId;
      if(old.pbs!==pbs||old.parentId!==parentId)
        touched.add(old.physicalPageIndex+1);
      return {...old,pbs,parentId,rootLogicalId:parentId??old.logicalId,
        logicalOrder:row.logicalOrder};
    });
    projection=projectV2PDFEvidence({...projection.map,covers:nextCovers});
    // V1 keeps its original PDF.js instance. Only re-fetch changed overlay
    // pages from this in-memory projection; geometry never comes from CM6.
    for(const page of touched)native.invalidateOverlayPage(page);
    if(selectedId!==null)focusId(selectedId,false);
    return true;
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
      loadPage:(page,level)=>projection.page(page,level),
      onPageChange:page=>{lastPdfPage=page;},
      onBlockSelect:({blockId})=>{
        const id=Number(blockId);
        selectedId=id;
        const row=source()?.getIntervals().find(item=>item.logicalId===id);
        if(row)focusLogical(row,'pdf');
      },
      onBlockDragIntent:async intent=>{
        const port=source();
        if(!port?.getState().loaded||port.getWorkspace()!==workspace)
          throw Error('CM6 工作目录未就绪');
        const result=port.applyDrag(intent);
        const row=port.getIntervals().find(item=>item.logicalId===intent.sourceBlockId);
        if(row)focusLogical(row,'pdf');
        notify(`Block 手势 · 已调整 ${result.changed.length} 行 · CM6 已更新，等待空闲写入 SQL`,'ok');
        return true;
      },
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
  const onSession=event=>{
    if(event.detail?.kind==='clear')clear();
    if(event.detail?.kind==='structure'&&event.detail.book===workspace)
      updateStructure(source()?.getStructureRows());
  };
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
    focusId,updateStructure,
  });
  host.v2PDFPort=port;
  return {
    layout(){
      native?.relayout();
      // PDF.js may replace WebKit's cached page DOM when the existing
      // V1 viewer is reparented between Frame panes without pagerendered.
      // Re-apply the EXISTING V1 overlay renderer after the new layout,
      // rather than making another PBS/rail implementation or refetching.
      const stamp=generation;
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(!disposed&&stamp===generation&&ready&&native){
          native.relayout();
          native.repaintOverlayPage(lastPdfPage);
        }
      }));
    },
    dispose(){disposed=true;
      document.removeEventListener('v2-sync-focus',onFocus);
      document.removeEventListener('v2-cm-session',onSession);
      clear();delete host.v2PDFPort;
    },
  };
}
