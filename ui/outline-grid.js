/**
 * AG Grid Community document-outline projection.
 *
 * All five columns have a native column-value <select> in their headers,
 * defaulting to "all". This uses Community external filtering rather than
 * AG Grid Enterprise's Set Filter. No second Markdown/editor state exists.
 *
 * Independent-chapter checkboxes are explicit *UI drafts*, not MOPJO saves.
 */
import {
  AllCommunityModule,ModuleRegistry,createGrid,themeQuartz,
} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {buildOutline,headingAtLine} from './outline-index.js';
import './outline-grid.css';

ModuleRegistry.registerModules([AllCommunityModule]);

const agTheme=themeQuartz.withParams({
  accentColor:'#569d79',
  backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',
  headerBackgroundColor:'#272f34',
  headerTextColor:'#d3c6aa',
  borderColor:'#525c62',
  rowHoverColor:'#37464b',
  selectedRowBackgroundColor:'rgba(86, 157, 121, 0.2)',
  oddRowBackgroundColor:'#2d363c',
  fontFamily:'"OCR2MD Sarasa", "Sarasa Fixed SC", monospace',
  fontSize:16,
  spacing:3,
});

const fields=['pdfPage','level','title','independent','chapterFile'];
const headerLabels={
  pdfPage:'PDF页码',level:'层级',title:'标题',
  independent:'独立章节',chapterFile:'章节文件',
};
const valueOf=(row,field)=>{
  if(field==='level')return 'H'+row.level;
  if(field==='independent')return row.independent?'是':'否';
  if(field==='chapterFile')return row.chapterFile||'未导出';
  return row[field]===null||row[field]===undefined?'—':String(row[field]);
};

class ValueFilterHeader {
  init(params){
    this.params=params;
    const field=params.column.getColId();
    const wrap=document.createElement('div');
    wrap.className='ocr-outline-header';
    const title=document.createElement('span');
    title.className='ocr-outline-header-title';
    title.textContent=params.displayName;
    title.title=params.displayName;
    const select=document.createElement('select');
    select.className='ocr-outline-filter';
    select.setAttribute('aria-label',params.displayName+' 按列值筛选');
    select.setAttribute('data-outline-filter',field);
    this.select=select;
    this.fill();
    select.addEventListener('click',event=>event.stopPropagation());
    select.addEventListener('pointerdown',event=>event.stopPropagation());
    select.addEventListener('change',()=>{
      params.context.applyFilter(field,select.value);
    });
    wrap.append(title,select);
    this.eGui=wrap;
  }
  fill(){
    const field=this.params.column.getColId();
    const values=this.params.context.getOptions(field);
    const selected=this.params.context.getFilter(field);
    this.select.replaceChildren();
    const all=document.createElement('option');
    all.value='all';all.textContent='all';this.select.append(all);
    for(const value of values){
      const opt=document.createElement('option');
      opt.value=value;opt.textContent=value;
      this.select.append(opt);
    }
    this.select.value=selected==='all'||values.includes(selected)?selected:'all';
  }
  getGui(){return this.eGui;}
  refresh(params){this.params=params;this.fill();return true;}
}

function titleCell(params){
  if(!params.data)return '';
  const span=document.createElement('span');
  span.className='ocr-outline-title ocr-outline-h'+params.data.level;
  span.textContent=params.data.title;
  span.title=params.data.title;
  span.setAttribute('data-heading-source-line',String(params.data.sourceLine));
  return span;
}

export function createOutlineGrid(element,getMarkdown,getEditor) {
  const drafts=new Map();
  const filters=Object.fromEntries(fields.map(key=>[key,'all']));
  let rows=[],api=null,activeId=null,refreshTimer=null,disposed=false;
  let explicitFocusUntil=0;
  element.classList.add('ocr-outline-pane');
  const host=document.createElement('div');
  host.className='ocr-outline-grid';
  element.append(host);
  const note=document.createElement('div');
  note.className='ocr-outline-note';
  note.textContent='章节标记：界面草稿（尚未接入 MOPJO 保存）';
  element.append(note);

  function getOptions(field) {
    const values=new Set(rows.map(row=>valueOf(row,field)));
    return [...values].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true}));
  }
  function chooseRow(row,ensureVisible=true) {
    if(!row||!api||activeId===row.id)return;
    if(activeId) api.getRowNode(activeId)?.setSelected(false);
    activeId=row.id;
    const node=api.getRowNode(row.id);
    node?.setSelected(true);
    // The currently selected row might be filtered out. Respect the user's
    // filter rather than clearing it or forcing a hidden row into view.
    if(ensureVisible && node?.rowIndex!=null)api.ensureIndexVisible(node.rowIndex,'middle');
  }
  function chooseLine(line,ensureVisible=true) {
    const heading=headingAtLine(rows,line)||rows[0];
    if(heading)chooseRow(heading,ensureVisible);
  }
  function refresh(){
    if(disposed || !api)return;
    rows=buildOutline(getMarkdown(),drafts);
    api.setGridOption('rowData',rows);
    api.refreshHeader();
    const state=viewStore.getState();
    const focus=state.focusTarget?.revision===state.documentRevision
      ? state.focusTarget : null;
    if(focus)chooseLine(focus.sourceLine);
    else if(state.scrollTarget?.revision===state.documentRevision)
      chooseLine(state.scrollTarget.sourceLine);
    else if(getEditor())chooseLine(getEditor().state.doc.lineAt(state.sourceOffset).number,false);
    if(rows.length)note.textContent=`大纲 ${rows.length} 项 · 独立章节标记仅为界面草稿（未保存）`;
    else note.textContent='未识别到 Markdown 标题';
  }
  function schedule(){
    clearTimeout(refreshTimer);
    refreshTimer=setTimeout(refresh,180);
  }

  const columns=[
    {field:'pdfPage',headerName:headerLabels.pdfPage,width:78,minWidth:70,
      valueFormatter:params=>params.value??'—'},
    {field:'level',headerName:headerLabels.level,width:58,minWidth:55,
      valueFormatter:params=>'H'+params.value},
    {field:'title',headerName:headerLabels.title,flex:1,minWidth:140,
      cellRenderer:titleCell,wrapText:true,autoHeight:true},
    {field:'independent',headerName:headerLabels.independent,width:91,minWidth:87,
      cellRenderer:params=>{
        if(!params.data)return '';
        const input=document.createElement('input');
        input.type='checkbox';input.className='ocr-outline-checkbox';
        input.checked=params.data.independent;
        const first=rows[0]?.id===params.data.id;
        input.disabled=first;
        input.title=first?'首项必须独立成章（草稿）':'仅修改当前界面草稿，不会保存到文件';
        input.setAttribute('aria-label',params.data.title+' 独立章节（未保存草稿）');
        input.addEventListener('click',event=>event.stopPropagation());
        input.addEventListener('change',event=>{
          event.stopPropagation();
          drafts.set(params.data.id,input.checked);
          params.data.independent=input.checked;
          api.refreshCells({rowNodes:[params.node],columns:['independent'],force:true});
          api.refreshHeader();
          if(filters.independent!=='all')api.onFilterChanged();
        });
        return input;
      }},
    {field:'chapterFile',headerName:headerLabels.chapterFile,width:94,minWidth:86,
      valueFormatter:params=>params.value||'未导出'},
  ].map(def=>({
    ...def,
    headerComponent:ValueFilterHeader,
    sortable:false,resizable:true,suppressMovable:true,suppressHeaderMenuButton:true,
  }));

  const gridOptions={
    theme:agTheme,
    columnDefs:columns,
    rowData:rows,
    headerHeight:50,
    rowHeight:34,
    getRowHeight:params=>params.data?.level===1?48:40,
    getRowId:params=>params.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,headerCheckbox:false,
      enableClickSelection:false},
    suppressCellFocus:true,
    animateRows:false,
    defaultColDef:{resizable:true},
    context:{
      getOptions,
      getFilter:field=>filters[field],
      applyFilter:(field,value)=>{
        filters[field]=value;
        api?.onFilterChanged();
      },
    },
    isExternalFilterPresent:()=>fields.some(field=>filters[field]!=='all'),
    doesExternalFilterPass:node=>fields.every(field=>
      filters[field]==='all'||valueOf(node.data,field)===filters[field]),
    onRowClicked:params=>{
      if(!params.data)return;
      chooseRow(params.data);
      publishFocus({
        sourceLine:params.data.sourceLine,
        sourceEnd:params.data.sourceEnd,
        origin:'outline',
        elementId:params.data.id,
      });
    },
  };
  api=createGrid(host,gridOptions);
  const unsubscribe=viewStore.subscribe((next,prev)=>{
    if(next.documentRevision!==prev.documentRevision)schedule();
    if(next.focusTarget!==prev.focusTarget && next.focusTarget){
      // Explicit element selection wins over the synthetic follower scroll
      // events it causes. Real scrolling resumes ordinary outline tracking.
      explicitFocusUntil=performance.now()+1100;
      chooseLine(next.focusTarget.sourceLine);
    } else if(next.scrollTarget!==prev.scrollTarget && next.scrollTarget &&
              performance.now()>=explicitFocusUntil)
      chooseLine(next.scrollTarget.sourceLine);
    else if(next.sourceOffset!==prev.sourceOffset && getEditor() && !next.focusTarget){
      chooseLine(getEditor().state.doc.lineAt(next.sourceOffset).number);
    }
  });

  return {
    api,
    get rows(){return rows;},
    get filters(){return {...filters};},
    refresh,schedule,
    dispose(){
      disposed=true;
      clearTimeout(refreshTimer);
      unsubscribe();
      api?.destroy();
      element.replaceChildren();
    },
  };
}
