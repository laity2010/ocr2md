/** AG sentence reviewer: renders detached CMD projections only. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus,viewStore} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './sentence-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#81b29a',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
  selectedRowBackgroundColor:'rgba(129,178,154,.16)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createSentenceModule(host,getChapter,onStatus=()=>{},onCoverageChange=()=>{}){
  host.classList.add('ocr-sentence-pane');
  const guide=document.createElement('div');guide.className='ocr-sentence-guide';
  guide.textContent='句子层 · 保留所有原文块/公式/换行 · CMD 句子锚点 · 点击源码行多窗定位 · 待审阅句子为翻译预备';
  const state=document.createElement('div');state.className='ocr-sentence-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-sentence-grid';
  host.append(guide,state,gridHost);
  let allRows=[],scope=null,active=false,loading=false,error=null,stale=0,disposed=false;
  let selectedId=null,coverageEnabled=false,coverageQueued=false,coverageResult=null;
  const emitCoverage=()=>{
    if(coverageQueued||disposed)return;
    coverageQueued=true;
    requestAnimationFrame(()=>{
      coverageQueued=false;
      if(!disposed)onCoverageChange();
    });
  };
  // All filtered AG rows, not just the small viewport-window of virtual DOM
  // rows. AG owns chapter external filtering and its column filter models.
  const coverageRows=()=>{
    if(!active||!coverageEnabled||disposed)return null;
    const rows=[];
    grid.forEachNodeAfterFilterAndSort(node=>{
      if(node.data&&!node.group)rows.push(node.data);
    });
    return rows;
  };
  const findRow=focus=>{
    if(!focus)return null;
    if(focus.elementId&&['preview','sentence'].includes(focus.origin))
      return allRows.find(row=>row.id===focus.elementId)||null;
    if(focus.origin==='cm6'&&Number.isInteger(focus.sourceOffset)){
      // CM6/WebKit can position a caret immediately AFTER the tapped last
      // character. Prefer a following sentence starting at that exact offset,
      // otherwise include the previous sentence's terminal edge.
      const contains=row=>row.fragments?.some(f=>
        focus.sourceOffset>=f.from&&focus.sourceOffset<f.to);
      return allRows.find(contains)||allRows.find(row=>row.fragments?.some(f=>
        focus.sourceOffset===f.to))||null;
    }
    return null;
  };
  const followFocus=focus=>{
    if(!active||disposed||!focus||focus.origin==='sentence')return;
    const row=findRow(focus),id=row?.id??null;
    if(id===selectedId)return;
    selectedId=id;
    if(!row){grid.deselectAll();return;}
    let node=grid.getRowNode(id);
    if(node&&node.rowIndex===null){
      // A previous text/status filter must not hide the clicked sentence.
      grid.setFilterModel(null);
      grid.onFilterChanged();
      node=grid.getRowNode(id);
    }
    if(!node||node.rowIndex===null)return; // Outside current virtual chapter.
    node.setSelected(true,true,'api');
    grid.ensureNodeVisible(node,'middle');
  };
  const unsubscribeFocus=viewStore.subscribe((next,prior)=>{
    if(next.focusTarget!==prior.focusTarget)followFocus(next.focusTarget);
  });
  const selectSentence=row=>{
    if(!row?.line)return;
    selectedId=row.id;
    const node=grid.getRowNode(row.id);
    if(node)node.setSelected(true,true,'api');
    publishFocus({sourceLine:row.line,sourceEnd:row.line+1,
      origin:'sentence',elementId:row.id,intent:'click'});
  };
  const lineRenderer=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.className='ocr-sentence-jump';
    button.textContent=p.data.line;button.type='button';
    button.setAttribute('aria-label','定位句子第 '+p.data.line+' 行');
    for(const name of ['pointerdown','mousedown','touchstart'])button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',event=>{event.stopPropagation();selectSentence(p.data);});
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
    onRowClicked:p=>selectSentence(p.data),
    onFilterChanged:()=>emitCoverage(),onModelUpdated:()=>emitCoverage()});
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
    if(active&&coverageEnabled){
      const visible=coverageRows()?.length||0;
      state.textContent+=coverageResult&&coverageResult.sentenceCount===visible?
        ` · 覆盖 ${coverageResult.coveredCount}/${visible} 句${coverageResult.unmappedCount?` · ${coverageResult.unmappedCount} 句未映射到预览`:''}`:
        ` · 当前筛选 ${visible} 句 · 预览覆盖计算中`;
    }
    if(active&&!loading&&!error)onStatus('分句 '+items.length+' 句 · CMD');
    emitCoverage();
  }
  return Object.freeze({
    setLoading(){loading=true;error=null;state.textContent='正在无损分句…';},
    setError(reason){loading=false;error=String(reason);refresh();},
    setRows(result){
      allRows=(result?.rows||[]).map(x=>({...x,blockLabel:x.blocks?.join(' + ')||'—',
        status:x.status||'待审阅'}));stale=result?.stale||0;loading=false;error=null;
      grid.setGridOption('rowData',allRows);selectedId=null;refresh();
      followFocus(viewStore.getState().focusTarget);
    },
    setVirtualQuery(intent){scope=intent;refresh();},
    setCoverage(enabled){coverageEnabled=Boolean(enabled);coverageResult=null;refresh();},
    setCoverageResult(result){
      coverageResult=result;
      // Only the local review text is updated; do NOT reapply AG filters or
      // re-emit preview coverage, which would create a feedback loop.
      if(!active||!coverageEnabled)return;
      const sentenceCount=coverageRows()?.length||0;
      if(result?.sentenceCount!==sentenceCount)return;
      const base=state.textContent.split(' · 覆盖 ')[0].split(' · 当前筛选 ')[0];
      state.textContent=base+` · 覆盖 ${result.coveredCount}/${sentenceCount} 句`+
        (result.unmappedCount?` · ${result.unmappedCount} 句未映射到预览`:'');
    },
    getCoverageRows:coverageRows,
    getOperationScope(){return scope?.operationScope||{mode:'all'};},
    count(chapter){if(chapter==='all')return allRows.length;
      const bound=getChapter(chapter);return bound?allRows.filter(x=>x.from>=bound.from&&x.to<=bound.to).length:0;},
    setActive(next){active=Boolean(next);host.hidden=!active;if(active){refresh();followFocus(viewStore.getState().focusTarget);}emitCoverage();},
    dispose(){disposed=true;unsubscribeFocus();grid.destroy();onCoverageChange();},
  });
}
