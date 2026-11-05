/** AG view of CMD-backed suspicious OCR word-splits. No source or CM6 access. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {projectIllegalBreakPair} from './illegal-break-pair.js';
import './illegal-break-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#d8a657',backgroundColor:'#2f383e',
 foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
 borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
 selectedRowBackgroundColor:'rgba(216,166,87,.18)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createIllegalBreakModule(host,getChapter,onStatus=()=>{}){
  host.classList.add('ocr-illegal-break-pane');
  const guide=document.createElement('div');guide.className='ocr-illegal-break-guide';
  guide.textContent='每行标明前块 A → 后块 B；点击即定位源码并在预览高亮两块；块内疑点为 A=B · 不自动合并';
  const state=document.createElement('div');state.className='ocr-illegal-break-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-illegal-break-grid';
  host.append(guide,state,gridHost);
  let rows=[],markedRows=[],reviewRows=[],scope=null,active=false,disposed=false,loading=false,error=null,stale=0,truncated=false;
  const rebuild=()=>{
    const occupied=new Set(markedRows.map(row=>row.from));
    rows=[...markedRows,...reviewRows.filter(row=>!occupied.has(row.from))]
      .map(row=>({...row,...projectIllegalBreakPair(row)}))
      .sort((a,b)=>a.from-b.from);
    grid.setGridOption('rowData',rows);
  };
  const navigate=row=>{
    if(!row?.line)return;
    // One transient focus event drives CM6, Markdown and PDF together. AG
    // never owns a source copy or guesses physical OCR coordinates.
    publishFocus({sourceLine:row.afterLine||row.line,origin:'illegal-break',
      intent:'click',beforeBlockId:row.beforeBlockId,afterBlockId:row.afterBlockId});
  };
  const jump=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-illegal-break-jump';
    button.textContent=String(p.data.line);button.setAttribute('aria-label',`定位疑似非法断行第 ${p.data.line} 行`);
    for(const name of ['pointerdown','mousedown','touchstart'])button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',e=>{e.stopPropagation();navigate(p.data);});return button;
  };
  const columns=[
    {field:'line',headerName:'源码行',width:96,minWidth:90,pinned:'left',lockPinned:true,cellRenderer:jump},
    {field:'markState',headerName:'复核状态',width:95,minWidth:85},
    {field:'beforeBlockId',headerName:'前块 A',width:130,minWidth:105,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'afterBlockId',headerName:'后块 B',width:130,minWidth:105,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'pairKind',headerName:'关系',width:80,minWidth:68,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'blockId',headerName:'当前块',width:132,minWidth:110,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'pdfPage',headerName:'原PDF页',width:99,minWidth:85,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'previousBlockId',headerName:'上一块',width:132,minWidth:110,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'nextBlockId',headerName:'下一子块',width:132,minWidth:112,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'scopeLabel',headerName:'检查范围',width:108,minWidth:96,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'joined',headerName:'疑似续接',width:155,minWidth:120,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'reason',headerName:'识别依据',width:180,minWidth:140,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'context',headerName:'断行前后',minWidth:250,flex:1,tooltipField:'context'},
  ].map(column=>({sortable:false,resizable:true,suppressMovable:true,...column}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    suppressColumnVirtualisation:true,
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
    const marked=visible.filter(r=>r.markState==='已标定').length;
    const review=visible.filter(r=>r.reviewOnly).length;
    state.textContent=error?'扫描失败：'+error:loading?'正在离线检查断行…':
      `子块断行 ${visible.length} 项 · 已标定 ${marked} · 待复核 ${review}`+
      `${stale?' · '+stale+' 项历史标定已失效':''}${truncated?' · 仅列前 400 项':''}`;
    if(active){
      if(error)onStatus('非法断行扫描失败：'+error);
      else if(loading)onStatus('正在按 CMD 文本块／子块检查非法断行…');
      else onStatus(`疑似非法断行 ${visible.length} 项 · 已标定 ${marked} · 待复核 ${review}`);
    }
  }
  return Object.freeze({
    setPending(){loading=true;error=null;rows=[];markedRows=[];reviewRows=[];
      grid.setGridOption('rowData',[]);refresh();},
    setError(reason){loading=false;error=String(reason);refresh();},
    setMarkedRows(result){
      markedRows=(result?.rows||[]).map(r=>({...r,markState:'已标定'}));
      loading=false;error=null;stale=result?.stale||0;
      truncated=Boolean(result?.truncated);rebuild();refresh();
    },
    setReviewCandidates(candidates){
      reviewRows=(candidates||[]).filter(r=>r.reviewOnly).map(r=>({...r,
        markState:'待复核'}));
      rebuild();refresh();
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
