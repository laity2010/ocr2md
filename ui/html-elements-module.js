/** Independent read-only AG projection of CMD's syntax-aware HTML query.
 * No duplicated HTML parser, DOM inspection, or direct CM6/AG coupling.
 */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {groupHtmlElements} from './html-element-groups.js';
import {planNormalizeTables} from './html-table-normalize.js';
import './html-elements-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function createHtmlElementsModule(host,getMarkdown,getCMD,onStatus=()=>{}){
  host.classList.add('ocr-html-elements-pane');
  const gridHost=document.createElement('div');
  gridHost.className='ocr-html-elements-grid';host.append(gridHost);
  let active=false,disposed=false,rows=[],lastRevision=-1,query=null,queued=false;
  function navigate(row,edge='open'){
    if(!row)return;
    const line=edge==='close'?row.closeLine:(row.openLine??row.closeLine);
    if(line)publishFocus({sourceLine:line,origin:'html',intent:'click'});
  }
  function locationCell(edge){
    return p=>{
      const row=p.data;
      if(!row)return '';
      const line=edge==='open'?row.openLine:row.closeLine;
      if(!line)return row.kind==='单行'&&edge==='close'?'—':'缺失';
      const button=document.createElement('button');button.type='button';
      button.className='ocr-html-jump';button.textContent=String(line);
      button.title='定位 HTML '+(edge==='open'?'开始':'结束')+'标签，联动源码、预览和 PDF';
      button.setAttribute('aria-label',row.tag+(edge==='open'?'开始':'结束')+'第'+line+'行定位');
      for(const type of ['pointerdown','mousedown','touchstart'])
        button.addEventListener(type,event=>event.stopPropagation());
      button.addEventListener('click',event=>{event.stopPropagation();navigate(row,edge);});
      return button;
    };
  }
  const columns=[
    {field:'tag',headerName:'标签名',width:138,minWidth:106,pinned:'left',lockPinned:true,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'kind',headerName:'类型',width:102,minWidth:90,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'openLine',headerName:'开始行',width:95,minWidth:86,
      cellRenderer:locationCell('open')},
    {field:'closeLine',headerName:'结束行',width:95,minWidth:86,
      cellRenderer:locationCell('close')},
    {colId:'source',headerName:'开合源码',minWidth:205,flex:1.8,
      valueGetter:p=>p.data?[p.data.openRaw,p.data.closeRaw].filter(Boolean)
        .join(' … ').replace(/\s+/g,' ').slice(0,180):'',
      tooltipValueGetter:p=>p.data?[p.data.openRaw,p.data.closeRaw].filter(Boolean)
        .join('  …  '):''},
  ].map(column=>({resizable:true,sortable:false,suppressMovable:true,...column}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowClass:p=>p.data?.status!=='完整'?'ocr-html-incomplete':'',
    getRowId:p=>String(p.data.from)+':'+String(p.data.to),
    rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:event=>navigate(event.data)});
  const virtual=createVirtualAGQuery(grid,'html');
  const chapterRows=()=>{
    if(query?.operationScope?.mode!=='chapter')return rows;
    const chapter=getCMD()?.getChapter(query.operationScope.chapterId);
    return chapter?rows.filter(row=>row.from>=chapter.from&&row.from<chapter.to):[];
  };
  function refresh(){
    if(disposed)return;
    const revision=viewStore.getState().documentRevision;
    if(lastRevision!==revision){
      try{
        rows=groupHtmlElements(getCMD()?.readHtmlElements()||[]);
        lastRevision=revision;
        grid.setGridOption('rowData',rows);
      }catch(error){onStatus('HTML 元素扫描失败：'+error.message,'error');return;}
    }
    if(query){
      const chapter=chapterRows();
      virtual.setVirtualQuery({...query,keys:query.operationScope?.mode==='chapter'
        ?new Set(chapter.map(row=>row.from)):null});
    }
    if(active)onStatus('HTML 元素 '+chapterRows().length+' 项 · 扫描定位 / 功能菜单批量规范');
  }
  function normalizeTables(){
    if(disposed||!active)return;
    try{
      refresh();
      const source=getMarkdown();
      const cmd=getCMD();
      const scope=query?.operationScope??{mode:'all'};
      const index=cmd.getIndex();
      const plan=planNormalizeTables(source,rows,{bodyEnd:index.bodyEnd,scope,
        chapter:scope.mode==='chapter'?cmd.getChapter(scope.chapterId):null});
      if(!plan.operations.length){
        onStatus('没有可规范的 HTML 表格'+(plan.skipped?' · 跳过 '+plan.skipped+' 项':'')+' · 源码未改动');
        return;
      }
      // One guarded CMD transaction, including all-chapter permission; no
      // background save, private EditorView, or shadow document.
      cmd.editAnnotations(plan.operations,{expectedSource:source,agScope:scope});
      lastRevision=-1;refresh();
      onStatus('✓ 已补齐 '+plan.converted+' 组表格三段式占位标签'+
        (plan.skipped?' · 跳过 '+plan.skipped+' 组待核对':'')+' · 一次撤销 · 请全局保存');
    }catch(error){onStatus('表格规范化失败：'+error.message,'error');}
  }
  const unsubscribe=viewStore.subscribe((next,prev)=>{
    if(next.documentRevision!==prev.documentRevision && active && !queued){
      queued=true;queueMicrotask(()=>{queued=false;refresh();});
    }
    if(!active||next.focusTarget===prev.focusTarget||!next.focusTarget||
       next.focusTarget.origin==='html'||next.focusTarget.revision!==next.documentRevision)return;
    const line=next.focusTarget.sourceLine;
    const row=chapterRows().find(item=>item.openLine===line||item.closeLine===line);
    if(row){
      const node=grid.getRowNode(row.from+':'+row.to);
      if(node){node.setSelected(true,true);if(node.rowIndex!=null)grid.ensureIndexVisible(node.rowIndex,'auto');}
    }
  });
  return Object.freeze({
    refresh,
    normalizeTables,
    count:chapter=>{
      if(lastRevision!==viewStore.getState().documentRevision)refresh();
      if(chapter==='all')return rows.length;
      const scope=getCMD()?.getChapter(chapter);
      return scope?rows.filter(x=>x.from>=scope.from&&x.from<scope.to).length:0;
    },
    setVirtualQuery(intent){query=intent;if(active)refresh();},
    setActive(next){active=Boolean(next);host.hidden=!active;if(active)refresh();},
    dispose(){disposed=true;unsubscribe();grid.destroy();},
  });
}
