/** Read-only AG view of the actual persisted sentence rows. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import '../ag-enum-filter-shared.css';
import '../outline-grid.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({
 accentColor:'#569d79',backgroundColor:'#2f383e',foregroundColor:'#d3c6aa',
 headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',borderColor:'#525c62',
 rowHoverColor:'#37464b',oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',
 fontSize:'var(--ocr-frame-font-size,16px)',spacing:3
});
const columns=[
 {field:'source_line',headerName:'MDLine',width:100,pinned:'left',sortable:false},
 {field:'sentence_index',headerName:'句序',width:80,sortable:false},
 {field:'sentence_text',headerName:'句文本',minWidth:240,flex:1},
 {field:'review_state',headerName:'状态',width:150,valueGetter:p=>p.data?.display_state??p.data?.review_state,filter:EnumCheckboxFilter,suppressHeaderFilterButton:false},
 {field:'adopted_engine',headerName:'采用引擎',width:145,valueGetter:p=>p.data?.display_engine??p.data?.adopted_engine,filter:EnumCheckboxFilter,suppressHeaderFilterButton:false},
 {field:'from_utf16',headerName:'起点',width:95},{field:'to_utf16',headerName:'终点',width:95},
 {field:'line_eol',headerName:'行终止符',width:105,valueFormatter:p=>p.value==='\n'?'LF':''},
 {field:'source_line_hash',headerName:'行哈希',width:160},
 {field:'source_document_hash',headerName:'文档哈希',width:160},
 {field:'candidates_json',headerName:'候选方案',width:220}
];
export function createSentenceGrid(host,rows,{onRowFocus=()=>{}}={}){
 let activeLine=null;
 const api=createGrid(host,{theme,columnDefs:columns,rowData:rows,
  defaultColDef:{editable:false,resizable:true,sortable:false},
  getRowId:p=>p.data.source_line+':'+p.data.sentence_index,
  rowClassRules:{'sentence-grid-active':p=>p.data?.source_line===activeLine},
  onRowClicked:e=>{if(e.data)onRowFocus(e.data);},
  suppressMovableColumns:true});
 function focus(line,offset=0,scroll=true){
  const old=activeLine;activeLine=line;
  const redraw=[];let target=null,first=null;
  api.forEachNode(node=>{
   const r=node.data;if(!r)return;
   if(r.source_line===old||r.source_line===line)redraw.push(node);
   if(r.source_line===line&&node.rowIndex!==null){
    first??=node;
    if(r.from_utf16<=offset&&offset<=r.to_utf16)target=node;
   }
  });
  if(old!==line&&redraw.length)api.redrawRows({rowNodes:redraw});
  target??=first;
  if(scroll&&target?.rowIndex!=null)api.ensureIndexVisible(target.rowIndex,'auto');
 }
 return {setRows:rows=>api.setGridOption('rowData',rows),focus,
  activate:()=>host.focus({preventScroll:true}),dispose:()=>api.destroy()};
}
