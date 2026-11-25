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

function scanAndWire(){
  const host=document.querySelector('#workspace .ocr-outline-grid');
  if(host?.v3GridPort)wireGrid(host);
}

document.addEventListener('v3-grid-ready',event=>wireGrid(event.detail?.host));
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',scanAndWire,{once:true});
}else{
  queueMicrotask(scanAndWire);
}
