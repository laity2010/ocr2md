/** Lab-pdf host of the true public PDF component; no Main CMD/SQL coupling. */
import {createPdfViewer,PDF_VIEWER_VERSION} from '../../packages/pdf-viewer/src/index.js';
import './demo.css';

const basic=Object.freeze([
  {blockId:11,parentId:null,label:'p1b0',pageIndex:0,bbox:[60,73,540,113],pageSize:[595,842],type:'title',status:'normal'},
  {blockId:12,parentId:null,label:'p1b1',pageIndex:0,bbox:[65,147,535,246],pageSize:[595,842],type:'text',status:'normal'},
  {blockId:13,parentId:12,label:'p1b1s0',pageIndex:0,bbox:[70,180,526,224],pageSize:[595,842],type:'text',status:'normal'},
  {blockId:21,parentId:null,label:'p2b0',pageIndex:1,bbox:[64,141,537,212],pageSize:[595,842],type:'text',status:'normal'},
  {blockId:22,parentId:null,label:'p2b1',pageIndex:1,bbox:[65,251,521,361],pageSize:[595,842],type:'image',status:'empty'},
  {blockId:31,parentId:null,label:'p3b0',pageIndex:2,bbox:[68,134,524,175],pageSize:[595,842],type:'title',status:'normal'},
  {blockId:32,parentId:null,label:'p3b1',pageIndex:2,bbox:[65,247,526,389],pageSize:[595,842],type:'table',status:'normal'},
  {blockId:33,parentId:32,label:'p3b1s0',pageIndex:2,bbox:[72,251,232,310],pageSize:[595,842],type:'table_body',status:'normal'},
]);

export function mountPdfDemo(surface,pane,onStatus){
  const info=pane.closest('#workspace').querySelector('.ocr-preview-md-scroll');
  const actions=pane.querySelector('.ocr-detached-pdf-tools');
  if(actions)actions.hidden=true;
  const oldTitle=pane.querySelector('.ocr-detached-pdf-title');
  if(oldTitle)oldTitle.textContent='PDF · @ocr2md/pdf-viewer';
  const inspector=document.createElement('section');
  inspector.className='opdf-lab-info';
  inspector.innerHTML=`<h3>PDF 公共组件 · ${PDF_VIEWER_VERSION}</h3>
    <p>右侧为独立 PDF.js Viewer。示例 PDF 由项目生成，不包含用户文件。</p>
    <p>BlockID 定位稳定，ParentID 表示父子关系，PBS 只是可变标签。</p>
    <div class="opdf-api-buttons">
      <button type="button" data-test="focus-13">定位 BlockID 13</button>
      <button type="button" data-test="focus-32">定位 BlockID 32</button>
      <button type="button" data-test="rename-pbs">修改 PBS 标签</button>
      <button type="button" data-test="reset-pbs">恢复 PBS</button>
    </div>
    <p>事件监视（点击 PDF 标签会发出 blockClick）</p>
    <pre class="opdf-event-log" aria-live="polite">尚未收到事件</pre>`;
  info.replaceChildren(inspector);
  const log=inspector.querySelector('.opdf-event-log');
  let disposed=false;
  let blocks=basic.map(x=>({...x}));
  const record=(message)=>{if(!disposed)log.textContent=message};
  const viewer=createPdfViewer(surface,{
    onBlockClick:({blockId,parentId,label,pageIndex})=>{
      record(`blockClick: BlockID=${blockId} ParentID=${parentId??'NULL'} PBS=${label} Page=${pageIndex+1}`);
      onStatus(`PDF · 已选择 BlockID ${blockId} · ${label}`,'info');
    },
    onPageChange:({pageIndex})=>record(`pageChange: ${pageIndex+1}`),
    onStatusChange:({status,message})=>onStatus('PDF · '+message,status),
  });
  surface.ocrPdfViewer=viewer; // Lab-only direct API test port, never exported by the package.
  viewer.setBlockOverlays(blocks);
  const handler=event=>{
    const choice=event.target.closest('button[data-test]')?.dataset.test;
    if(!choice)return;
    if(choice==='focus-13')void viewer.focusBlock(13).then(()=>record('focusBlock(13) OK')).catch(e=>record(e.message));
    if(choice==='focus-32')void viewer.focusBlock(32).then(()=>record('focusBlock(32) OK')).catch(e=>record(e.message));
    if(choice==='rename-pbs'||choice==='reset-pbs'){
      blocks=blocks.map(block=>block.blockId===13?{...block,label:choice==='rename-pbs'?'p1b9s2':'p1b1s0'}:block);
      viewer.setBlockOverlays(blocks);
      record(`setBlockOverlays: BlockID 13 标签 ${blocks.find(x=>x.blockId===13).label}，ParentID 仍为 12`);
    }
  };
  inspector.addEventListener('click',handler);
  const src=new URL('./fixtures/preview.pdf',import.meta.url).href;
  void viewer.open(src).catch(error=>{if(!disposed)record('open 失败：'+error.message)});
  return {viewer,dispose(){disposed=true;inspector.removeEventListener('click',handler);inspector.remove();viewer.dispose();delete surface.ocrPdfViewer;}};
}
