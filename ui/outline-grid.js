/** V6 mainline chapter outline: a pure AG projection of CM6 marker metadata.
 * Stable MinerU IDs route clicks through the shared Zustand focus contract.
 * Chapter file names are derived projections, not an editable AG data copy.
 */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {buildOutline,headingAtLine} from './outline-index.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {markerForHeading,putMarker} from './chapter-markers.js';
import {chapterAssignments} from './chapter-files.js';
import './outline-grid.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const theme=themeQuartz.withParams({
  accentColor:'#569d79',backgroundColor:'#2f383e',foregroundColor:'#d3c6aa',
  headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',
  fontSize:16,spacing:3,
});
const fields=['title','level','pdfPage','independent','chapterFile'];
const labels=['标题','层级','PDF页码','独立成章','章节文件'];
const valueOf=(row,field)=>{
  if(field==='level')return 'H'+row.level;
  if(field==='independent')return row.independent?'是':'否';
  if(field==='chapterFile')return row.chapterFile||'未导出';
  return row[field]==null?'—':String(row[field]);
};
function titleCell(params){
  if(!params.data)return '';
  const span=document.createElement('span');
  span.className='ocr-outline-title ocr-outline-h'+params.data.level;
  span.textContent=params.data.title;span.title=params.data.title;
  span.dataset.headingSourceLine=String(params.data.sourceLine);
  return span;
}

export function createOutlineGrid(element,getMarkdown,getCMD) {
  let rows=[],api,activeId=null,timer=null,disposed=false,focusUntil=0;
  let indexedRevision=-1,pendingFocusFrame=0;
  let startText='000';
  let exportedDoc=null,exportedNames=new Set(),exportedMapping=null;
  const isExportCurrent=()=>Boolean(exportedDoc)&&Boolean(getCMD())&&
    getCMD().matchesSnapshot(exportedDoc)&&Boolean(exportedMapping)&&
    rows.every(row=>exportedMapping.get(row.id)===row.chapterFile);
  element.classList.add('ocr-outline-pane');
  const host=document.createElement('div');
  host.className='ocr-outline-grid';
  element.append(host);

  function ensureFullyVisible(node){
    if(node?.rowIndex==null)return;
    // Let AG Grid perform its native virtualized-row navigation first.
    // "auto" leaves a visible row where it is (unlike "middle").
    api.ensureIndexVisible(node.rowIndex,'auto');
    const viewport=host.querySelector('.ag-grid-viewport');
    const body=host.querySelector('.ag-body-vertical-scroll-viewport');
    if(!viewport||!body||!Number.isFinite(node.rowTop)||!node.rowHeight)return;
    const bodyRect=body.getBoundingClientRect();
    const hBar=host.querySelector('.ag-body-horizontal-scroll');
    const barRect=hBar?.getBoundingClientRect();
    const visibleBottom=barRect?.height>0
      ? Math.min(bodyRect.bottom,barRect.top):bodyRect.bottom;
    // AG Grid's native auto check treats the area under the horizontal
    // scrollbar as visible. Correct only the remaining covered pixels.
    const rowTop=bodyRect.top+node.rowTop-viewport.scrollTop;
    const rowBottom=rowTop+node.rowHeight;
    if(rowTop<bodyRect.top-1)viewport.scrollTop+=rowTop-bodyRect.top;
    else if(rowBottom>visibleBottom+1)viewport.scrollTop+=rowBottom-visibleBottom;
  }
  function choose(row,ensureVisible=true){
    if(!row||!api)return;
    if(activeId && activeId!==row.id)api.getRowNode(activeId)?.setSelected(false);
    activeId=row.id;
    const node=api.getRowNode(row.id);
    node?.setSelected(true);
    if(ensureVisible)ensureFullyVisible(node);
  }
  function chooseLine(line,ensureVisible=true) {
    choose(headingAtLine(rows,line)||rows[0],ensureVisible);
  }
  function refresh(){
    if(disposed||!api)return;
    clearTimeout(timer);timer=null;
    const previous=new Map(rows.map(row=>[row.id,row]));
    const cmd=getCMD();
    rows=buildOutline(getMarkdown());
    indexedRevision=viewStore.getState().documentRevision;
    for(const row of rows) {
      const marker=cmd?markerForHeading(cmd,row):null;
      row.independent=marker?.independent??true;
      row.markerHtmlKind=marker?.htmlKind||null;
    }
    chapterAssignments(rows,startText);
    api.setGridOption('rowData',rows);
    const changed=rows.filter(row=>{
      const old=previous.get(row.id);
      return old&&(old.level!==row.level||old.markerHtmlKind!==row.markerHtmlKind||
        old.independent!==row.independent||old.chapterFile!==row.chapterFile);
    });
    if(changed.length){
      const nodes=changed.map(row=>api.getRowNode(row.id)).filter(Boolean);
      if(nodes.length)api.refreshCells({rowNodes:nodes,columns:['title','independent','chapterFile'],force:true});
      if(changed.some(row=>(previous.get(row.id).level===1)!==(row.level===1)))
        api.resetRowHeights();
    }
    api.onFilterChanged();
    // Even rows whose planned filename did not change must lose their old
    // download link as soon as the CM6 document differs from the export.
    api.refreshCells({columns:['chapterFile'],force:true});
    const state=viewStore.getState();
    if(state.focusTarget?.revision===state.documentRevision)
      chooseLine(state.focusTarget.sourceLine);
    else if(state.scrollTarget?.revision===state.documentRevision)
      chooseLine(state.scrollTarget.sourceLine);
    // A CM6 text edit invalidates older location revisions, not the user's
    // selected chapter. Never fall back to the initial CM6 caret (offset 0)
    // while that chapter still exists in this rebuilt outline.
    else if(activeId && api.getRowNode(activeId))
      choose(rows.find(row=>row.id===activeId),false);
    else if(cmd)chooseLine(cmd.lineAtOffset(state.sourceOffset),false);
    if(state.outlineCount!==rows.length)viewStore.setState({outlineCount:rows.length});
    
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(refresh,160);}
  // AG Grid may reuse an existing cell renderer after replacing rowData. The
  // renderer's captured params.data is only an identity hint, not a live row.
  // On every user interaction resolve the ID against the current CM6 revision.
  function liveRow(id){
    if(indexedRevision!==viewStore.getState().documentRevision)refresh();
    return rows.find(row=>row.id===id)||null;
  }
  function stopPendingFocus(){
    if(pendingFocusFrame)cancelAnimationFrame(pendingFocusFrame);
    pendingFocusFrame=0;
  }
  function focusLatestCheckbox(id){
    // Several edits can happen in one browser task. Let AG selection update
    // immediately but send just the last navigation to V6's scroll synchronizer.
    stopPendingFocus();
    pendingFocusFrame=requestAnimationFrame(()=>{
      pendingFocusFrame=0;
      const row=liveRow(id);
      if(row)publishFocus({sourceLine:row.sourceLine,sourceEnd:row.sourceEnd,
        origin:'outline',elementId:id});
    });
  }

  const columns=fields.map((field,i)=>{
    const def={field,headerName:labels[i],filter:EnumCheckboxFilter,
      filterValueGetter:p=>p.data?valueOf(p.data,field):'',
      sortable:false,resizable:true,suppressMovable:true,
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false};
    if(field==='title')
      Object.assign(def,{width:235,minWidth:185,pinned:'left',
        lockPinned:true,lockPosition:'left',cellRenderer:titleCell,
        wrapText:false,autoHeight:false});
    if(field==='level')
      Object.assign(def,{width:88,minWidth:78,valueFormatter:p=>'H'+p.value});
    if(field==='pdfPage')
      Object.assign(def,{width:112,minWidth:100,valueFormatter:p=>p.value??'—'});
    if(field==='independent')
      Object.assign(def,{width:122,minWidth:112,cellRenderer:p=>{
        if(!p.data)return '';
        const input=document.createElement('input');
        input.type='checkbox';input.className='ocr-outline-checkbox';
        input.checked=p.data.independent;
        const first=rows[0]?.id===p.data.id;
        input.disabled=first;
        input.title=first?'首项必须独立成章':'写入当前 V6 Markdown 的 CM6 HTML 标定';
        input.setAttribute('aria-label',p.data.title+' 独立章节');
        const hit=document.createElement('label');
        hit.className='ocr-chapter-checkbox-hit';
        hit.append(input);
        // Full-cell touch target; do not let AG treat the checkbox tap as a
        // second row-click navigation event.
        hit.addEventListener('click',e=>e.stopPropagation());
        input.addEventListener('click',e=>e.stopPropagation());
        input.addEventListener('change',e=>{
          e.stopPropagation();
          const id=p.data.id;
          const checked=input.checked;
          try{
            const current=liveRow(id);
            if(!current)throw Error('章节已变化，请重新选择标题');
            // CM6 is the only editable source of truth. Do not write through
            // p.data: its sourceLine may belong to an older AG renderer.
            putMarker(getCMD(),current,checked);
            // Reindex synchronously before the next tap. Debounced redraws
            // are fine for typing, but cannot guard consecutive checkbox edits.
            refresh();
            const updated=liveRow(id);
            if(!updated)throw Error('标定后找不到章节标题');
            choose(updated);
            focusLatestCheckbox(id);
          }catch(error){
            input.checked=liveRow(id)?.independent??!checked;
            document.dispatchEvent(new CustomEvent('ocr2md:chapter-error',{detail:error.message}));
          }
        });
        return hit;
      }});
    if(field==='chapterFile')
      Object.assign(def,{width:195,minWidth:150,cellRenderer:p=>{
        if(!p.data?.chapterFile)return '';
        const name=p.data.chapterFile;
        if(!isExportCurrent()||!exportedNames.has(name)){
          const span=document.createElement('span');
          span.className='ocr-chapter-pending';
          span.textContent=name;
          span.title='章节归属已计算，尚未导出当前版本';
          return span;
        }
        const link=document.createElement('a');
        link.className='ocr-chapter-link';
        link.href='/api/chapters/'+encodeURIComponent(name);
        link.target='_blank';link.rel='noopener noreferrer';
        link.download=name;link.textContent=name;
        link.title='已导出，点击查看当前章节 Markdown';
        link.addEventListener('click',e=>e.stopPropagation());
        return link;
      }});
    return def;
  });
  api=createGrid(host,{
    theme,columnDefs:columns,rowData:rows,headerHeight:40,rowHeight:34,
    getRowHeight:p=>p.data?.level===1?48:40,
    getRowId:p=>p.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,headerCheckbox:false,
      enableClickSelection:false},
    suppressCellFocus:true,animateRows:false,
    defaultColDef:{resizable:true},enableFilterHandlers:false,
    onRowClicked:p=>{
      const row=p.data && liveRow(p.data.id);
      if(!row)return;
      stopPendingFocus();
      choose(row);
      publishFocus({sourceLine:row.sourceLine,sourceEnd:row.sourceEnd,
        origin:'outline',elementId:row.id});
    },
  });
  const unsub=viewStore.subscribe((next,prev)=>{
    if(next.documentRevision!==prev.documentRevision)schedule();
    if(next.focusTarget!==prev.focusTarget && next.focusTarget){
      focusUntil=performance.now()+1100;
      chooseLine(next.focusTarget.sourceLine);
    }else if(next.scrollTarget!==prev.scrollTarget&&next.scrollTarget&&
      performance.now()>=focusUntil)chooseLine(next.scrollTarget.sourceLine);
    else if(next.sourceOffset!==prev.sourceOffset&&getCMD()&&!next.focusTarget)
      chooseLine(getCMD().lineAtOffset(next.sourceOffset));
  });
  return {
    api,get rows(){return rows;},get filters(){return api?.getFilterModel()||{};},
    get startNumber(){return Number(startText);},
    get startText(){return startText;},
    setStartNumber(value){
      const next=typeof value==='number'?String(value).padStart(3,'0'):value;
      if(typeof next!=='string'||!/^\d{1,5}$/.test(next)||Number(next)>99999)
        throw Error('Invalid chapter number');
      if(startText===next)return;
      startText=next;
      // Same number at a different width is a new file naming projection.
      chapterAssignments(rows,startText);
      api.refreshCells({columns:['chapterFile'],force:true});
      api.onFilterChanged();
    },
    setExported(doc,names){
      exportedDoc=doc;
      exportedNames=new Set(names);
      exportedMapping=new Map(rows.map(row=>[row.id,row.chapterFile]));
      api.refreshCells({columns:['chapterFile'],force:true});
    },
    refresh,schedule,
    dispose(){
      disposed=true;clearTimeout(timer);stopPendingFocus();unsub();api?.destroy();
      element.replaceChildren();
    },
  };
}
