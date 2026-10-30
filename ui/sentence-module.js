/** AG sentence reviewer: renders detached CMD projections only. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './sentence-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#81b29a',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
  selectedRowBackgroundColor:'rgba(129,178,154,.16)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createSentenceModule(host,getChapter,onStatus=()=>{}){
  host.classList.add('ocr-sentence-pane');
  const guide=document.createElement('div');guide.className='ocr-sentence-guide';
  guide.textContent='句子层 · 保留所有原文块/公式/换行 · CMD 句子锚点 · 点击源码行多窗定位 · 待审阅句子为翻译预备';
  const state=document.createElement('div');state.className='ocr-sentence-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-sentence-grid';
  host.append(guide,state,gridHost);
  let allRows=[],scope=null,active=false,loading=false,error=null,stale=0,disposed=false;
  const lineRenderer=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.className='ocr-sentence-jump';
    button.textContent=p.data.line;button.type='button';
    button.setAttribute('aria-label','定位句子第 '+p.data.line+' 行');
    for(const name of ['pointerdown','mousedown','touchstart'])button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',event=>{event.stopPropagation();publishFocus({sourceLine:p.data.line,origin:'sentence',intent:'click'});});
    return button;
  };
  const columns=[
    {field:'line',headerName:'行号',width:80,minWidth:65,pinned:'left',lockPinned:true,cellRenderer:lineRenderer},
    {field:'id',headerName:'句子 ID',width:115,minWidth:90},
    {field:'text',headerName:'句子正文',flex:1,minWidth:230,tooltipField:'text'},
    {field:'blockLabel',headerName:'文本块',width:166,minWidth:135},
    {field:'status',headerName:'审阅状态',width:110,minWidth:96,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
  ].map(x=>({sortable:false,resizable:true,suppressMovable:true,...x}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowId:p=>p.data.id,rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:p=>p.data&&publishFocus({sourceLine:p.data.line,origin:'sentence',intent:'click'})});
  const virtual=createVirtualAGQuery(grid,'sentence');
  const selected=()=>scope?.operationScope?.mode==='chapter'?
    allRows.filter(row=>{
      const chapter=getChapter(scope.operationScope.chapterId);
      return chapter&&row.from>=chapter.from&&row.to<=chapter.to;
    }):allRows;
  function refresh(){
    if(disposed)return;
    const items=selected();
    if(scope)virtual.setVirtualQuery({...scope,keys:scope.operationScope?.mode==='chapter'
      ?new Set(items.map(row=>row.from)):null});
    state.textContent=error?'分句失败：'+error:loading?'正在识别句子并验证位置…':
      `CMD 已标定 ${items.length} 句 · 跨文本块 ${items.filter(x=>x.crossBlock).length} 句 · 待人工审阅${stale?' · 失效标注 '+stale:''}`;
    if(active&&!loading&&!error)onStatus('分句 '+items.length+' 句 · CMD');
  }
  return Object.freeze({
    setLoading(){loading=true;error=null;state.textContent='正在无损分句…';},
    setError(reason){loading=false;error=String(reason);refresh();},
    setRows(result){
      allRows=(result?.rows||[]).map(x=>({...x,blockLabel:x.blocks?.join(' + ')||'—',
        status:x.status||'待审阅'}));stale=result?.stale||0;loading=false;error=null;
      grid.setGridOption('rowData',allRows);refresh();
    },
    setVirtualQuery(intent){scope=intent;refresh();},
    getOperationScope(){return scope?.operationScope||{mode:'all'};},
    count(chapter){if(chapter==='all')return allRows.length;
      const bound=getChapter(chapter);return bound?allRows.filter(x=>x.from>=bound.from&&x.to<=bound.to).length:0;},
    setActive(next){active=Boolean(next);host.hidden=!active;if(active)refresh();},
    dispose(){disposed=true;grid.destroy();},
  });
}
