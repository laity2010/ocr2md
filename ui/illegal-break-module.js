/** AG view of CMD-backed suspicious OCR word-splits. No source or CM6 access. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {projectIllegalBreakPair} from './illegal-break-pair.js';
import {keyIllegalBreakReviewRows,REVIEW_DECISIONS} from './cmd-illegal-break-review.js';
import {createStableAGSelectRenderer} from './ag-stable-select-renderer.js';
import {rebaseIllegalBreakRowsInPlace} from './illegal-break-review-annotation-update.js';
import './illegal-break-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#d8a657',backgroundColor:'#2f383e',
 foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
 borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
 selectedRowBackgroundColor:'rgba(216,166,87,.18)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createIllegalBreakModule(host,getChapter,onStatus=()=>{},onReviewChoice=()=>{}){
  host.classList.add('ocr-illegal-break-pane');
  const guide=document.createElement('div');guide.className='ocr-illegal-break-guide';
  guide.textContent='前块 A → 后块 B · 审阅选择断行合并／忽略／待定；仅写 CMD 审阅注释，导出干净 MD 时再处理';
  const state=document.createElement('div');state.className='ocr-illegal-break-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-illegal-break-grid';
  host.append(guide,state,gridHost);
  let rows=[],markedRows=[],reviewRows=[],scope=null,active=false,disposed=false,loading=false,error=null,stale=0,truncated=false;
  let reviewChoices=new Map(),reviewStale=0;
  const rebuild=()=>{
    const occupied=new Set(markedRows.map(row=>row.from));
    rows=keyIllegalBreakReviewRows([...markedRows,...reviewRows.filter(row=>!occupied.has(row.from))])
      .map(row=>({...row,reviewDecision:(row.pairKind==='跨块'?reviewChoices.get(`block:${row.afterBlockId}`):null)||
        reviewChoices.get(row.reviewKey)||'待定'}));
    grid.setGridOption('rowData',rows);
  };
  const navigate=row=>{
    if(!row?.line)return;
    // One transient focus event drives CM6, Markdown and PDF together. AG
    // never owns a source copy or guesses physical OCR coordinates.
    publishFocus({sourceLine:row.afterLine||row.line,origin:'illegal-break',
      intent:'click',beforeBlockId:row.beforeBlockId,afterBlockId:row.afterBlockId});
  };
  const ReviewSelectRenderer=createStableAGSelectRenderer({
    choices:REVIEW_DECISIONS,className:'ocr-illegal-break-review-select',
    ariaLabel:row=>`审阅 ${row.beforeBlockId} → ${row.afterBlockId}`,
    getValue:row=>row.reviewDecision||'待定',
    isDisabled:row=>!row.reviewKey,
    decorate:(select,choice,row)=>{
      select.dataset.reviewKey=row.reviewKey||'';
      select.dataset.reviewDecision=choice;
      select.classList.toggle('is-merge',choice==='断行合并');
      select.classList.toggle('is-ignore',choice==='忽略');
      select.classList.toggle('is-pending',choice==='待定');
    },
    onChange:(row,choice)=>{
      const previous=row.reviewDecision||'待定';
      if(choice===previous)return;
      try{
        const result=onReviewChoice(row,choice);
        // On a successful CMD write its synchronous CM6 update listener
        // synchronizes ALL AG review metadata in place. No setRowData.
        if(result?.changed)onStatus(`✓ 断行审阅：${choice} · CMD 注释已更新 · 请全局保存`);
      }catch(error){
        row.reviewDecision=previous;
        const node=grid.getRowNode(row.reviewKey||String(row.from));
        if(node)grid.refreshCells({rowNodes:[node],columns:['reviewDecision'],force:true});
        onStatus(`断行审阅失败：${error.message}`);
      }
    },
  });
  const jump=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-illegal-break-jump';
    button.textContent=String(p.data.line);button.setAttribute('aria-label',`定位疑似非法断行第 ${p.data.line} 行`);
    for(const name of ['pointerdown','mousedown','touchstart'])button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',e=>{e.stopPropagation();navigate(p.data);});return button;
  };
  const columns=[
    {field:'line',headerName:'源码行',width:96,minWidth:90,pinned:'left',lockPinned:true,cellRenderer:jump},
    {field:'reviewDecision',headerName:'审阅',width:116,minWidth:110,
      cellRenderer:ReviewSelectRenderer,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
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
    getRowId:p=>p.data.reviewKey||String(p.data.from),rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:p=>navigate(p.data)});
  const virtual=createVirtualAGQuery(grid,'illegal-break');
  function scopedRows(){
    if(scope?.operationScope?.mode!=='chapter')return rows;
    const chapter=getChapter(scope.operationScope.chapterId);
    return chapter?rows.filter(r=>r.from>=chapter.from&&r.from<chapter.to):[];
  }
  function refresh({preserveGrid=false}={}){
    if(disposed)return;
    const visible=scopedRows();
    if(!preserveGrid&&scope)virtual.setVirtualQuery({...scope,keys:scope.operationScope?.mode==='chapter'
      ?new Set(visible.map(r=>r.from)):null});
    const marked=visible.filter(r=>r.reviewDecision==='断行合并').length;
    const ignored=visible.filter(r=>r.reviewDecision==='忽略').length;
    const pending=visible.filter(r=>r.reviewDecision==='待定').length;
    state.textContent=error?'扫描失败：'+error:loading?'正在离线检查断行…':
      `断行审阅 ${visible.length} 项 · 断行合并 ${marked} · 忽略 ${ignored} · 待定 ${pending}`+
      `${stale?' · '+stale+' 项旧断行标记待核对':''}`+
      `${reviewStale?' · '+reviewStale+' 项审阅注释失效':''}`+
      `${truncated?' · 仅列前 400 项':''}`;
    if(active){
      if(error)onStatus('非法断行扫描失败：'+error);
      else if(loading)onStatus('正在按 CMD 文本块／子块检查非法断行…');
      else onStatus(`非法断行审阅 ${visible.length} 项 · 合并 ${marked} · 忽略 ${ignored} · 待定 ${pending}`);
    }
  }
  return Object.freeze({
    setPending(){loading=true;error=null;rows=[];markedRows=[];reviewRows=[];
      grid.setGridOption('rowData',[]);refresh();},
    setError(reason){loading=false;error=String(reason);refresh();},
    /** An annotation-only CM6 transaction keeps ALL AG rows and native
     * select DOM mounted (including other rows, filters and vertical scroll).
     * Offset rebasing is necessary because a comment inserts one source line.
     */
    syncReviewAnnotationChange(changes,beforeDoc,afterDoc,choices=[],bad=0){
      if(disposed)return;
      const oldLines=new Map(rows.map(row=>[row,row.line]));
      rebaseIllegalBreakRowsInPlace(rows,changes,beforeDoc,afterDoc);
      rebaseIllegalBreakRowsInPlace(markedRows,changes,beforeDoc,afterDoc);
      rebaseIllegalBreakRowsInPlace(reviewRows,changes,beforeDoc,afterDoc);
      reviewChoices=new Map(choices.map(x=>[x.key,x.decision]));
      reviewStale=bad;
      const reviewNodes=[],lineNodes=[];
      for(const row of rows){
        const next=(row.pairKind==='跨块'?reviewChoices.get(`block:${row.afterBlockId}`):null)||
          reviewChoices.get(row.reviewKey)||'待定';
        if(row.reviewDecision!==next){
          row.reviewDecision=next;
          const node=grid.getRowNode(row.reviewKey||String(row.from));
          if(node)reviewNodes.push(node);
        }
        if(oldLines.get(row)!==row.line){
          const node=grid.getRowNode(row.reviewKey||String(row.from));
          if(node)lineNodes.push(node);
        }
      }
      if(reviewNodes.length)grid.refreshCells({rowNodes:reviewNodes,
        columns:['reviewDecision'],force:true});
      if(lineNodes.length)grid.refreshCells({rowNodes:lineNodes,columns:['line'],force:true});
      // Re-evaluate only an actual human-selected review-value filter.
      // Virtual chapter filters are maintained by their own WCP owner.
      if(reviewNodes.length&&grid.getFilterModel()?.reviewDecision)grid.onFilterChanged();
      refresh({preserveGrid:true});
    },
    setReviewDecisions(choices=[],bad=0){
      reviewChoices=new Map(choices.map(x=>[x.key,x.decision]));
      reviewStale=bad;rebuild();refresh();
    },
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
