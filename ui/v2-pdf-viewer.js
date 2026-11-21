/** Strict thin V2 adapter for the REAL V1 PdfPreview.
 *
 * Never implement tags, SVG, collision layout, cover hit-testing, drag
 * mechanics or focus rendering here. The public V1 PdfPreview owns them all.
 */
import {getDocument} from 'pdfjs-dist/build/pdf.mjs';
import {PdfPreview} from './pdf-preview.js';
import {projectV2PDFEvidence} from './v2-pdf-evidence-adapter.js';
import './v2-pdf-viewer.css';
const API='/labs/lab-ocr-v2/api/mineru-base/';
const $=selector=>document.querySelector(selector);
function notify(text,kind='info'){
  document.dispatchEvent(new CustomEvent('v2-pdf-status',{detail:{text,kind}}));
}
export function mountV2PDF(host){
  const tools=host.closest('.ocr-detached-pdf-pane')?.querySelector('.ocr-detached-pdf-tools');
  if(!tools)throw Error('Frame PDF native tools host missing');
  let instance=null,projection=null,workspace='',disposed=false,token=0;
  const source=()=>$('#workspace #editor')?.v2SourcePort;
  const clear=()=>{
    ++token;
    const old=instance;
    instance=null;projection=null;workspace='';
    old?.dispose();
    tools.replaceChildren();
    host.replaceChildren();
  };
  const load=async(path,evidence)=>{
    if(disposed||!path)return false;
    if(instance&&workspace===path)return true;
    clear();
    const id=token;
    const converted=projectV2PDFEvidence(evidence);
    const response=await fetch(API+'pdf?'+new URLSearchParams({workspace:path}),
      {cache:'no-store',credentials:'same-origin'});
    if(!response.ok){
      const err=await response.json().catch(()=>null);
      throw Error(err?.error||'PDF origin read denied: HTTP '+response.status);
    }
    const pdfData=new Uint8Array(await response.arrayBuffer());
    if(disposed||id!==token)return false;
    const docSource=()=>source()?.getMarkdown()||'';
    const structureNotYetWritable=()=>Promise.reject(Error(
      'V2 WP04 仅复用 V1 PDF 手势；逻辑表结构编辑尚未提供安全事务，未作修改'));
    const textInsertNotYetWritable=()=>Promise.reject(Error(
      'V2 WP04 PDF 原文提取尚未绑定正式 CM6 插入 API，未作修改'));
    const reader=new PdfPreview(
      host,docSource,()=>converted.layout,
      structureNotYetWritable,structureNotYetWritable,
      textInsertNotYetWritable,structureNotYetWritable,
      structureNotYetWritable,structureNotYetWritable,structureNotYetWritable,
      ()=>{},
      (message,kind)=>notify(message,kind),
      {
        immutableGeometry:true,readOnly:true,
        // Same authorized V2 raw PDF bytes; V1 never fetches Main /api/pdf.
        createPDFTask:()=>getDocument({data:pdfData,stopAtErrors:true}),
        // Current CM6 offsets, not fake CMD tags. PDF renderer is unchanged.
        getLabelSources:()=>converted.getLabelSources(source()),
      },
    );
    instance=reader;projection=converted;workspace=path;
    reader.moveToolbarTo(tools);
    reader.setActive(true);
    reader.setBlockCoverage(converted.coverage);
    const ready=await reader.whenReady();
    if(disposed||id!==token)return false;
    if(!ready){
      const details=reader.statusNode?.textContent||'PDF preview could not render';
      clear();throw Error(details);
    }
    reader.refreshBlockLabelLayout();
    notify('V1 PDF/PBS 原组件已加载 · '+evidence.pageCount+' 页 · '+
      evidence.mappedCount+' 个原框','ok');
    return true;
  };
  const onSession=event=>{if(event.detail?.kind==='clear')clear();};
  document.addEventListener('v2-cm-session',onSession);
  const port=Object.freeze({
    load,clear,
    getState:()=>({
      loaded:!!instance?.ready,workspace,pageCount:instance?.pdf?.numPages||0,
      mappedCount:projection?.map.mappedCount||0,
      painted:(instance?.blockCoverageNodes?.size||0)>0,
      selectedId:projection?.logicalIdForPBS(instance?.selected?.logicalId)||null,
      scale:instance?.viewer?.currentScale??null,
      fitPending:Boolean(instance?.externalFitPending),
      scrollerWidth:instance?.scroller?.clientWidth||0,
      renderingOwner:'V1 PdfPreview',
    }),
    getCovers:()=>projection?.map.covers||[],
    getViewer:()=>instance?.viewer,
    getV1Preview:()=>instance,
    focusId:logicalId=>{
      const pbs=projection?.pbsForLogicalId(logicalId);
      const row=pbs&&projection.getLabelSources(source()).get(pbs);
      if(!row||!instance)return false;
      void instance.focusLine(row.contentLine??row.sourceLine,true);
      return true;
    },
  });
  host.v2PDFPort=port;
  return {
    layout(){instance?.onResize();instance?.refreshBlockLabelLayout();},
    dispose(){disposed=true;document.removeEventListener('v2-cm-session',onSession);
      clear();delete host.v2PDFPort;},
  };
}
