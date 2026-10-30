/** AG view of CMD-backed suspicious OCR word-splits. No source or CM6 access. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './illegal-break-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#d8a657',backgroundColor:'#2f383e',
 foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
 borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
 selectedRowBackgroundColor:'rgba(216,166,87,.18)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createIllegalBreakModule(host,getChapter,onStatus=()=>{}){
  host.classList.add('ocr-illegal-break-pane');
  const guide=document.createElement('div');guide.className='ocr-illegal-break-guide';
  guide.textContent='检测疑似 OCR 断词和相邻文本块句子断行 · 自动 CMD 标定，不修改换行 · 点击行号定位，需人工复核';
  const state=document.createElement('div');state.className='ocr-illegal-break-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-illegal-break-grid';
  host.append(guide,state,gridHost);
  let rows=[],scope=null,active=false,disposed=false,loading=false,error=null,stale=0,truncated=false;
  const navigate=row=>{if(row?.line)publishFocus({sourceLine:row.line,origin:'illegal-break',intent:'click'});};
  const jump=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-illegal-break-jump';
    button.textContent=String(p.data.line);button.setAttribute('aria-label',`定位疑似非法断行第 ${p.data.line} 行`);
    for(const name of ['pointerdown','mousedown','touchstart'])button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',e=>{e.stopPropagation();navigate(p.data);});return button;
  };
  const columns=[
    {field:'line',headerName:'源码行',width:96,minWidth:90,pinned:'left',lockPinned:true,cellRenderer:jump},
    {field:'joined',headerName:'疑似续接',width:155,minWidth:120,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'reason',headerName:'识别依据',width:180,minWidth:140,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'context',headerName:'断行前后',minWidth:250,flex:1,tooltipField:'context'},
    {field:'markState',headerName:'CMD',width:92,minWidth:78},
  ].map(column=>({sortable:false,resizable:true,suppressMovable:true,...column}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowId:p=>String(p.data.from),rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:p=>navigate(p.data)});
  const virtual=createVirtualAGQuery(grid,'illegal-break');
  function scopedRows(){
    if(scope?.operationScope?.mode!=='chapter')return rows;
    const chapter=getChapter(scope.operationScope.chapterId);
    return chapter?rows.filter(r=>r.from>=chapter.from&&r.from<chapter.to):[];
  }
  function refresh(){
    if(disposed)return;
    const visible=scopedRows();
    if(scope)virtual.setVirtualQuery({...scope,keys:scope.operationScope?.mode==='chapter'
      ?new Set(visible.map(r=>r.from)):null});
    state.textContent=error?'扫描失败：'+error:loading?'正在离线检查断词…':
      `CMD 已标定 ${visible.length} 处 · 请人工核实${stale?' · '+stale+' 项标定已失效':''}${truncated?' · 仅列前 400 项':''}`;
    if(active&&!loading&&!error)onStatus(`疑似非法断行 ${visible.length} 项 · CMD 已标定`);
  }
  return Object.freeze({
    setPending(){loading=true;error=null;rows=[];grid.setGridOption('rowData',[]);refresh();},
    setError(reason){loading=false;error=String(reason);refresh();},
    setMarkedRows(result){
      rows=(result?.rows||[]).map(r=>({...r,markState:'已标定'}));
      loading=false;error=null;stale=result?.stale||0;truncated=Boolean(result?.truncated);
      grid.setGridOption('rowData',rows);refresh();
    },
    getOperationScope(){return scope?.operationScope??{mode:'all'};},
    setVirtualQuery(intent){scope=intent;refresh();},
    count(chapter){if(chapter==='all')return rows.length;
      const bounds=getChapter(chapter);
      return bounds?rows.filter(r=>r.from>=bounds.from&&r.from<bounds.to).length:0;
    },
    setActive(value){active=Boolean(value);host.hidden=!active;if(active)refresh();},
    dispose(){disposed=true;grid.destroy();},
  });
}
