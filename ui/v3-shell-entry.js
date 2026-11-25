/** WP00-SHELL: V3 entry wiring V1 byte-identical EnumCheckboxFilter into AG Grid.
 * Keeps ui/frame/* untouched and introduces zero SQL/CM6/PDF mutation in WP00.
 */
import './ag-enum-filter-shared.css';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';

export const V3_SHELL_COLUMNS=Object.freeze([
  {
    field:'pbs',
    headerName:'PBS',
    pinned:'left',
    width:110,
    minWidth:72,
    sortable:false,
    suppressHeaderMenuButton:true,
  },
  {
    field:'block_type',
    headerName:'Type',
    width:120,
    minWidth:78,
    sortable:false,
    filter:EnumCheckboxFilter,
    suppressHeaderMenuButton:true,
    suppressHeaderFilterButton:false,
  },
  {
    field:'md_block',
    headerName:'MD Block',
    flex:1,
    minWidth:180,
    sortable:false,
    suppressHeaderMenuButton:true,
  },
]);

function wireGrid(host){
  const port=host?.v3GridPort;
  if(!port||host.dataset.v3ShellWired==='1')return;
  host.dataset.v3ShellWired='1';
  port.setColumns(V3_SHELL_COLUMNS.map(col=>({...col})));
}

let activeWorkspace='';

async function loadExistingV3Workspace(workspace){
  if(!workspace||workspace===activeWorkspace)return;
  activeWorkspace=workspace;
  const sourcePort=document.querySelector('#workspace #editor')?.v3SourcePort;
  if(!sourcePort)return;
  try{
    const q=new URLSearchParams({workspace}).toString();
    const stateRes=await fetch(`/labs/lab-ocr-v3/api/mineru-base/state?${q}`,{
      credentials:'same-origin',
      cache:'no-store',
    });
    if(!stateRes.ok)return;
    const stateData=await stateRes.json();
    if(!stateData?.exists)return;
    const mdRes=await fetch(`/labs/lab-ocr-v3/api/mineru-base/markdown?${q}`,{
      credentials:'same-origin',
      cache:'no-store',
    });
    if(!mdRes.ok)return;
    const snapshot=await mdRes.json();
    if(activeWorkspace===workspace){
      await sourcePort.loadSnapshot(snapshot,{workspace});
      const pdfPort=document.querySelector('.ocr-preview-pdf-host')?.v3PDFPort;
      if(pdfPort)void pdfPort.loadWorkspace(workspace);
    }
  }catch{
    // 静默忽略未授权或隔离测试环境下的网络探针失败
  }
}

function scanAndWire(){
  const host=document.querySelector('#workspace .ocr-outline-grid');
  if(host?.v3GridPort)wireGrid(host);
}

document.addEventListener('v3-grid-ready',event=>wireGrid(event.detail?.host));
document.addEventListener('v3-workspace-verified',event=>{
  const path=event.detail?.path;
  if(path)void loadExistingV3Workspace(path);
});
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',scanAndWire,{once:true});
}else{
  queueMicrotask(scanAndWire);
}
