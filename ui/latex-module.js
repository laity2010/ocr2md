/** LaTeX review plugin. Reads live CMD text, owns its AG view and uses the
 * existing focusTarget bus for navigation. Never writes document text. */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import katex from 'katex';
import {findLatex} from './latex-scan.js';
import {REVIEW_CHOICES,findReviewMarkers,planReviewAnnotations,planNormalizeReviewedInline} from './latex-review-markers.js';
import {viewStore,publishFocus} from './view-store.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './latex-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function checkLatex(item){
  // Rendering and human review are orthogonal: incomplete MinerU fragments
  // can parse successfully, while an unreviewed fragment may fail KaTeX.
  if(item.issue&&!item.detection)
    return {...item,status:'错误',renderStatus:'未检测',error:item.issue,html:''};
  if(!item.content.trim())
    return {...item,status:'错误',renderStatus:'未检测',error:'空公式',html:''};
  try{
    const html=katex.renderToString(item.content,{displayMode:item.kind==='独立',
      throwOnError:true,trust:false,maxExpand:1000,strict:'warn'});
    if(item.detection)return {...item,status:'待复核',renderStatus:'成功',error:item.issue,html};
    return {...item,status:'通过',renderStatus:'成功',error:'',html};
  }catch(e){
    const message=String(e.message||e).slice(0,300);
    // A guessed fragment may have incomplete boundaries. Report the parse
    // failure but never assert that the original document has bad TeX.
    if(item.detection)return {...item,status:'待复核',renderStatus:'失败',
      error:`KaTeX：${message}；可能是公式边界不完整`,html:''};
    return {...item,status:'错误',renderStatus:'失败',error:message,html:''};
  }
}

export function createLatexModule(host,getMarkdown,getCMD,onStatus){
  host.classList.add('ocr-latex-pane');
  const gridHost=document.createElement('div');gridHost.className='ocr-latex-grid';
  host.append(gridHost);
  let grid,disposed=false,active=false,queued=false,rows=[],lastScannedSource=null,nextRowKey=0;
  function report(){
    if(!active)return;
    onStatus(`LaTeX ${rows.length} 项 · 渲染成功 ${rows.filter(row=>row.renderStatus==='成功').length} / 失败 ${rows.filter(row=>row.renderStatus==='失败').length} / 未检测 ${rows.filter(row=>row.renderStatus==='未检测').length} · 待复核 ${rows.filter(row=>row.status==='待复核').length} / latex ${rows.filter(row=>row.status==='latex').length} / 忽略 ${rows.filter(row=>row.status==='忽略').length}`);
  }
  function markReview(item,review){
    if(disposed||!REVIEW_CHOICES.includes(review)||review===item.status)return;
    try{
      const original=getMarkdown();
      const operations=planReviewAnnotations(original,item,review,
        crypto.randomUUID().replaceAll('-','').slice(0,16));
      if(!operations.length)return;
      getCMD().editAnnotations(operations,{expectedSource:original});
      // CM6 publishes documentRevision and owns all undo/save semantics.
      refresh();
    }catch(error){
      onStatus(`LaTeX 标定失败：${error.message}`);
      grid.refreshCells({force:true,columns:['status']});
    }
  }
  // AG Grid's function cellRenderer returns a DOM node but has no refresh()
  // contract. On every review status change AG destroys the native <select>
  // (even during a WebKit picker change), losing focus and flickering. Keep
  // the same control mounted and update only its value/metadata.
  class ReviewSelectRenderer {
    init(params){
      this.params=params;
      const dropdown=document.createElement('select');
      dropdown.className='ocr-latex-review-select';
      for(const choice of REVIEW_CHOICES){
        const option=document.createElement('option');
        option.value=choice;option.textContent=choice;
        dropdown.append(option);
      }
      for(const event of ['pointerdown','mousedown','click','touchstart'])
        dropdown.addEventListener(event,evt=>evt.stopPropagation());
      dropdown.addEventListener('change',()=>{
        // Review may shift CMD offsets. Resolve live row through AG each time.
        const row=this.params.node?.data;
        if(row)markReview(row,dropdown.value);
      });
      this.dropdown=dropdown;
      this.refresh(params);
    }
    getGui(){return this.dropdown;}
    refresh(params){
      this.params=params;
      if(!params.data)return false;
      const dropdown=this.dropdown;
      dropdown.setAttribute('aria-label',`第 ${params.data.line} 行公式审阅`);
      dropdown.value=params.data.status;
      dropdown.dataset.review=params.data.status;
      dropdown.disabled=!getCMD()?.editAnnotations;
      return true; // preserve the real DOM select, even when review changes
    }
  }
  const formulaPreview=params=>{
    const item=params.data;
    if(!item)return '';
    const result=document.createElement('div');
    result.className='ocr-latex-preview';
    if(item.html){result.innerHTML=item.html;result.title='KaTeX 渲染';}
    else {result.textContent=item.content||'无有效公式';result.classList.add('ocr-latex-preview-error');}
    return result;
  };
  const columns=[
    {field:'line',headerName:'源码行',width:87,minWidth:76,pinned:'left',lockPinned:true},
    {field:'status',headerName:'审阅',width:106,minWidth:98,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellRenderer:ReviewSelectRenderer},
    {field:'renderStatus',headerName:'渲染',width:89,minWidth:83,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellRenderer:p=>{
        if(!p.data)return '';
        const el=document.createElement('span');el.className='ocr-latex-render-status';
        el.dataset.render=p.value==='成功'?'success':p.value==='失败'?'failure':'unavailable';
        el.textContent=p.value;
        el.title=p.value==='失败'?(p.data.error||'KaTeX 无法渲染'):
          p.value==='成功'?'KaTeX 能解析渲染；不代表 OCR 内容已确认':'未执行渲染';
        return el;
      }},
    {colId:'preview',headerName:'预览',minWidth:205,flex:1.15,
      cellRenderer:formulaPreview},
    {field:'content',headerName:'源码',minWidth:155,flex:1,
      cellRenderer:p=>{
        const el=document.createElement('span');el.className='ocr-latex-source';
        el.textContent=p.value;el.title=p.value;return el;
      }},
    {field:'syntax',headerName:'类型',width:91,minWidth:87,
      valueFormatter:p=>p.data?.detection?'未定界':p.value||'明确',
      filter:EnumCheckboxFilter,
      filterValueGetter:p=>p.data?.detection?'未定界':'有定界',
      suppressHeaderMenuButton:true},
    {field:'error',headerName:'错误信息',minWidth:130,flex:0.9,
      cellRenderer:p=>{
        const el=document.createElement('span');el.className='ocr-latex-error';
        el.textContent=p.value||'—';el.title=p.value||'';return el;
      }},
  ].map(c=>({resizable:true,sortable:false,suppressMovable:true,...c}));
  grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:103,
    getRowId:p=>p.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:e=>publishFocus({sourceLine:e.data.line,
      sourceEnd:e.data.line+Math.max(1,e.data.content.split('\n').length),
      origin:'latex',intent:'click'})});
  function refresh(){
    if(disposed)return;
    const source=getMarkdown();
    if(source===lastScannedSource){report();return;}
    const previous=rows;
    const next=findLatex(source).map(item=>{
      const row=checkLatex(item);
      row.raw=source.slice(row.from,row.to);
      return row;
    });
    findReviewMarkers(source,next,getCMD()?.readAnnotations()??[]);
    // Review markers insert/change characters in the ONE CM6 Markdown source.
    // This shifts all later LaTeX positions, but their formula content and
    // KaTeX rendering are UNCHANGED. Never updateData() every downstream row:
    // that destroys all its function-rendered KaTeX previews and causes the
    // visible cascade of refreshes. Only update changed formula cells.
    if(lastScannedSource!==null&&next.length===previous.length){
      let statusChanged=false;
      const cellChanges=[];
      for(let i=0;i<next.length;i++){
        const fresh=next[i],old=previous[i];
        fresh.id=old.id;
        if(fresh.status!==old.status)statusChanged=true;
        const columns=[];
        if(fresh.line!==old.line)columns.push('line');
        if(fresh.status!==old.status)columns.push('status');
        if(fresh.renderStatus!==old.renderStatus)columns.push('renderStatus');
        if(fresh.html!==old.html || (!fresh.html&&fresh.content!==old.content))
          columns.push('preview');
        if(fresh.content!==old.content)columns.push('content');
        if(fresh.syntax!==old.syntax||fresh.detection!==old.detection)columns.push('syntax');
        if(fresh.error!==old.error)columns.push('error');
        // Only scanner offsets and review metadata changed on other rows.
        // Even the reviewed row can have identical KaTeX HTML; updateData()
        // would remount its costly preview cell for no visual change.
        Object.assign(old,fresh);
        next[i]=old;
        const node=grid.getRowNode(old.id);
        if(node&&columns.length)cellChanges.push({node,columns});
      }
      for(const {node,columns} of cellChanges)
        grid.refreshCells({rowNodes:[node],columns,force:true});
      // A review-value checkbox filter may need its membership recomputed;
      // unchanged rows themselves must remain mounted.
      // isAnyFilterPresent() includes the WCP *external chapter* filter.
      // Refiring it during CMD annotation insertion evaluates stale source
      // offsets and transiently removes all later formulas (42 -> 1 -> 42).
      // Only an explicitly selected AG column-value filter should be applied
      // here; the WCP chapter projector owns its own deferred re-index.
      if(statusChanged&&Object.keys(grid.getFilterModel()||{}).length>0)
        grid.onFilterChanged();
    }else{
      for(const row of next)row.id=`latex-row-${++nextRowKey}`;
      grid.setGridOption('rowData',next);
    }
    rows=next;
    lastScannedSource=source;
    report();
  }
  function chooseSourceLine(line,end=line+1){
    if(!active||disposed||!Number.isInteger(line)||line<1)return;
    // Preview clicks can identify an enclosing paragraph rather than the
    // formula itself. Prefer a formula containing the clicked source line;
    // otherwise accept a formula within the preview's explicit source range.
    const inside=rows.find(row=>row.line<=line&&
      line<=row.line+row.raw.split('\n').length-1);
    const match=inside||(end>line+1?rows.find(row=>row.line>=line&&row.line<end):null);
    if(!match)return;
    const node=grid.getRowNode(match.id);
    if(!node)return;
    node.setSelected(true,true);
    if(node.rowIndex!==null&&node.rowIndex!==undefined)
      grid.ensureIndexVisible(node.rowIndex,'auto');
  }
  function followFocus(target,state){
    if(!active||!target||target.origin==='latex'||
       target.revision!==state.documentRevision)return;
    // A source edit can shift every formula's line number. Always route a
    // focus event against the current CMD-backed scan, not an old AG row.
    if(lastScannedSource!==getMarkdown())refresh();
    chooseSourceLine(target.sourceLine,target.sourceEnd);
  }
  function schedule(){
    if(queued||disposed)return;queued=true;
    queueMicrotask(()=>{queued=false;if(active)refresh();});
  }
  const unsubscribe=viewStore.subscribe((current,prior)=>{
    if(current.documentRevision!==prior.documentRevision)schedule();
    if(current.focusTarget!==prior.focusTarget)
      followFocus(current.focusTarget,current);
  });
  return {
    api:grid,
    refresh,
    normalizeReviewed(){
      if(disposed)return;
      const source=getMarkdown();
      const current=findLatex(source).map(item=>({...item,raw:source.slice(item.from,item.to)}));
      findReviewMarkers(source,current,getCMD()?.readAnnotations()??[]);
      const operations=planNormalizeReviewedInline(source,current);
      if(!operations.length){onStatus('已确认的公式均符合单注释格式');return;}
      try{
        getCMD().editAnnotations(operations,{expectedSource:source});
        refresh();
        onStatus(`已规范化 ${operations.filter(op=>op.tag==='ocr2md:latex').length} 条公式 · 请全局保存`);
      }catch(error){onStatus(`规范化失败：${error.message}`);}
    },
    setActive(enabled){
      active=enabled;host.hidden=!enabled;
      if(enabled){
        refresh();
        const state=viewStore.getState();
        followFocus(state.focusTarget,state);
      }
    },
    dispose(){disposed=true;unsubscribe();grid.destroy();},
  };
}
