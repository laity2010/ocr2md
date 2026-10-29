/** Independent read-only AG projection of CMD's syntax-aware HTML query.
 * No duplicated HTML parser, DOM inspection, or direct CM6/AG coupling.
 */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './html-elements-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function createHtmlElementsModule(host,getCMD,onStatus=()=>{}){
  host.classList.add('ocr-html-elements-pane');
  const gridHost=document.createElement('div');
  gridHost.className='ocr-html-elements-grid';host.append(gridHost);
  let active=false,disposed=false,rows=[],lastRevision=-1,query=null,queued=false;
  function navigate(row){
    if(!row)return;
    publishFocus({sourceLine:row.line,origin:'html',intent:'click'});
  }
  const columns=[
    {field:'tag',headerName:'标签名',width:138,minWidth:106,pinned:'left',lockPinned:true,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'kind',headerName:'类型',width:102,minWidth:90,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'line',headerName:'源码行',width:95,minWidth:85,
      cellRenderer:p=>{
        if(!p.data)return '';
        const button=document.createElement('button');button.type='button';
        button.className='ocr-html-jump';button.textContent=String(p.value);
        button.title='定位 HTML 所在源码行、Markdown 预览和 PDF';
        for(const type of ['pointerdown','mousedown','touchstart'])
          button.addEventListener(type,event=>event.stopPropagation());
        button.addEventListener('click',event=>{event.stopPropagation();navigate(p.data);});
        return button;
      }},
    {field:'raw',headerName:'源码片段',minWidth:205,flex:1.8,
      valueFormatter:p=>p.value?.replace(/\s+/g,' ').slice(0,150)??'',
      tooltipValueGetter:p=>p.data?.raw||''},
  ].map(column=>({resizable:true,sortable:false,suppressMovable:true,...column}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
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
        rows=getCMD()?.readHtmlElements()||[];
        lastRevision=revision;
        grid.setGridOption('rowData',rows);
      }catch(error){onStatus('HTML 元素扫描失败：'+error.message,'error');return;}
    }
    if(query){
      const chapter=chapterRows();
      virtual.setVirtualQuery({...query,keys:query.operationScope?.mode==='chapter'
        ?new Set(chapter.map(row=>row.from)):null});
    }
    if(active)onStatus('HTML 元素 '+chapterRows().length+' 项（只读）');
  }
  const unsubscribe=viewStore.subscribe((next,prev)=>{
    if(next.documentRevision!==prev.documentRevision && active && !queued){
      queued=true;queueMicrotask(()=>{queued=false;refresh();});
    }
    if(!active||next.focusTarget===prev.focusTarget||!next.focusTarget||
       next.focusTarget.origin==='html'||next.focusTarget.revision!==next.documentRevision)return;
    const line=next.focusTarget.sourceLine;
    const row=chapterRows().find(item=>item.line===line);
    if(row){
      const node=grid.getRowNode(row.from+':'+row.to);
      if(node){node.setSelected(true,true);if(node.rowIndex!=null)grid.ensureIndexVisible(node.rowIndex,'auto');}
    }
  });
  return Object.freeze({
    refresh,
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
