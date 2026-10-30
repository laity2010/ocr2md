/** AG-owned read-only review of offline spelling findings. No CM6 or worker access. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus} from './view-store.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {SPELL_TAG,readSpellcheckMarks,planSpellcheckMarks} from './spellcheck-marks.js';
import './spellcheck-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});
export function createSpellcheckModule(host,getChapter,getMarkdown,getCMD,onStatus=()=>{}){
  host.classList.add('ocr-spellcheck-pane');
  const note=document.createElement('div');note.className='ocr-spellcheck-info';
  note.textContent='英文离线词典 · 功能→一次性标定，生成 CMD 注释 · 只读标定可跨次打开/保存重载 · 点击行号多窗定位。';
  const state=document.createElement('div');state.className='ocr-spellcheck-state';
  state.setAttribute('role','status');state.textContent='首次进入扫描候选；标定后直接读取 CMD 注释';
  const gridHost=document.createElement('div');gridHost.className='ocr-spellcheck-grid';
  host.append(note,state,gridHost);
  let active=false,rows=[],query=null,disposed=false,truncated=false,loading=false,problem=null,mode='candidate',stale=0;
  const navigate=row=>{if(row?.line)publishFocus({sourceLine:row.line,origin:'spellcheck',intent:'click'});};
  const lineCell=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-spellcheck-jump';
    button.textContent=String(p.data.line);button.setAttribute('aria-label','定位拼写错误第'+p.data.line+'行');
    for(const e of ['pointerdown','mousedown','touchstart'])button.addEventListener(e,ev=>ev.stopPropagation());
    button.addEventListener('click',ev=>{ev.stopPropagation();navigate(p.data);});return button;
  };
  const columns=[
    {field:'word',headerName:'疑似错词',width:165,minWidth:115,pinned:'left',lockPinned:true,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'line',headerName:'源码行',width:100,minWidth:86,cellRenderer:lineCell},
    {field:'suggestion',headerName:'建议',width:180,minWidth:120,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'markState',headerName:'CMD',width:94,minWidth:80,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'context',headerName:'原文片段',minWidth:190,flex:1,tooltipField:'context'},
  ].map(column=>({sortable:false,resizable:true,suppressMovable:true,...column}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowId:p=>String(p.data.from),rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:event=>navigate(event.data)});
  const virtual=createVirtualAGQuery(grid,'spellcheck');
  function currentRows(){
    if(query?.operationScope?.mode!=='chapter')return rows;
    const chapter=getChapter(query.operationScope.chapterId);
    return chapter?rows.filter(row=>row.from>=chapter.from&&row.from<chapter.to):[];
  }
  function refresh(){
    if(disposed)return;
    const scoped=currentRows();
    const keys=query?.operationScope?.mode==='chapter'?new Set(scoped.map(r=>r.from)):null;
    if(query)virtual.setVirtualQuery({...query,keys});
    state.textContent=problem?'拼写检查失败：'+problem:loading?'正在离线扫描…':
      `${mode==='marked'?'CMD 已标定':'扫描候选'} ${scoped.length} 处${stale?' · '+stale+' 处标定失效需人工检查':''}`+
      `${truncated?' · 已达到 800 项上限，结果不完整':''}`;
    if(active&&!problem&&!loading)onStatus('拼写检查 '+scoped.length+' 项'+(mode==='marked'?' · CMD 已标定':' · 待标定')+(truncated?' · 结果已截断':''));
  }
  return Object.freeze({
    setResults(next,{isTruncated=false,pending=false,error=null}={}){
      if(disposed)return;
      rows=Array.isArray(next)?next.map(x=>({...x,markState:x.marked?'已标定':'待标定'})):[];
      mode='candidate';stale=0;truncated=isTruncated;loading=pending;problem=error;
      grid.setGridOption('rowData',rows);refresh();
    },
    readMarked(){
      if(disposed)return {rows:[],recordCount:0,stale:0};
      const result=readSpellcheckMarks(getMarkdown(),getCMD().readAnnotations({tag:SPELL_TAG}));
      if(result.recordCount){
        rows=result.rows.map(x=>({...x,markState:'已标定'}));
        mode='marked';stale=result.stale;truncated=false;loading=false;problem=null;
        grid.setGridOption('rowData',rows);refresh();
      }
      return result;
    },
    markAll(){
      if(disposed||loading||problem)throw Error('拼写检查尚未完成');
      const source=getMarkdown(),cmd=getCMD();
      const pending=currentRows().filter(row=>!row.marked);
      const ops=planSpellcheckMarks(source,pending,cmd.readAnnotations({tag:SPELL_TAG}));
      if(!ops.length)return {changed:0,skipped:pending.length};
      const scope=query?.operationScope??{mode:'all'};
      cmd.editAnnotations(ops,{expectedSource:source,agScope:scope});
      this.readMarked();
      return {changed:ops.length,skipped:pending.length-ops.length};
    },
    setVirtualQuery(intent){query=intent;refresh();},
    count(chapter){
      if(chapter==='all')return rows.length;
      const bounds=getChapter(chapter);
      return bounds?rows.filter(r=>r.from>=bounds.from&&r.from<bounds.to).length:0;
    },
    setActive(next){active=Boolean(next);host.hidden=!active;if(active)refresh();},
    dispose(){disposed=true;grid.destroy();},
  });
}
