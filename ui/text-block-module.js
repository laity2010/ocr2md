/** AG text-block inventory: read-only CMD projection, no editing or merges. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus,viewStore} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './text-block-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#e9ab52',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
  selectedRowBackgroundColor:'rgba(225,161,66,.15)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createTextBlockModule(host,getChapter,onStatus=()=>{},onLocateMissing=()=>{}){
  host.classList.add('ocr-text-block-pane');
  const guide=document.createElement('div');guide.className='ocr-text-block-guide';
  guide.textContent='只读核对 · 原始 CMD 封存 JSON 中的每个 MinerU Block（包括缺失的源码锚点）· 点击行同步源码、Markdown、PDF 橙框 · 暂不合并文本块';
  const state=document.createElement('div');state.className='ocr-text-block-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-text-block-grid';host.append(guide,state,gridHost);
  let rows=[],report=null,scope=null,active=false,disposed=false,error='',selectedId=null,previewMapped=null;
  const navigate=row=>{
    if(!row)return;selectedId=row.id;
    if(row.sourceLine){publishFocus({sourceLine:row.sourceLine+2,origin:'text-block',intent:'click',elementId:row.id});}
    else onLocateMissing({pageIndex:row.pageIndex,blockIndex:row.blockIndex});
  };
  const jump=p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-text-block-jump';
    button.textContent=p.data.sourceLine??'PDF';button.title=p.data.sourceLine?'定位源码及 PDF':'源码锚点缺失，仅定位 PDF';
    for(const e of ['pointerdown','mousedown','touchstart'])button.addEventListener(e,x=>x.stopPropagation());
    button.addEventListener('click',e=>{e.stopPropagation();navigate(p.data);});return button;
  };
  const columns=[
    {field:'sourceLine',headerName:'源码行',width:82,minWidth:75,pinned:'left',lockPinned:true,cellRenderer:jump},
    {field:'id',headerName:'Block',width:105,minWidth:88},
    {field:'pdfPage',headerName:'PDF 页',width:86,minWidth:76},
    {field:'type',headerName:'原始类型',width:134,minWidth:100,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'text',headerName:'原始文本摘要',flex:1,minWidth:240,tooltipField:'text'},
    {field:'bboxText',headerName:'bbox',width:180,minWidth:140},
    {field:'anchorStatus',headerName:'源码映射',width:122,minWidth:108,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellClass:p=>p.value==='已匹配'?'ocr-block-match':'ocr-block-gap'},
    {field:'previewLabel',headerName:'MD 定位',width:106,minWidth:92,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'geometryLabel',headerName:'PDF 坐标',width:104,minWidth:91,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
  ].map(x=>({sortable:false,resizable:true,suppressMovable:true,...x}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowId:p=>p.data.id,rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:p=>navigate(p.data)});
  const virtual=createVirtualAGQuery(grid,'text-block');
  const unsubscribe=viewStore.subscribe((next,previous)=>{
    if(!active||disposed||next.focusTarget===previous.focusTarget)return;
    const focus=next.focusTarget;if(!focus)return;
    const id=focus.elementId?.startsWith('mineru:')?
      `p${focus.elementId.split(':')[1]}b${focus.elementId.split(':')[2]}`:
      rows.filter(r=>r.sourceLine&&r.sourceLine<=focus.sourceLine).at(-1)?.id;
    if(!id||id===selectedId)return;
    const node=grid.getRowNode(id);
    if(node?.rowIndex===null){grid.setFilterModel(null);grid.onFilterChanged();}
    if(node&&node.rowIndex!==null){node.setSelected(true,true,'api');grid.ensureNodeVisible(node,'middle');selectedId=id;}
  });
  const scoped=()=>{
    if(scope?.operationScope?.mode!=='chapter')return rows;
    const bounds=getChapter(scope.operationScope.chapterId);
    return bounds?rows.filter(r=>r.from!==null&&r.from>=bounds.from&&r.from<bounds.to):[];
  };
  const refresh=()=>{
    const list=scoped();
    if(scope)virtual.setVirtualQuery({...scope,keys:scope.operationScope?.mode==='chapter'?new Set(list.map(r=>r.from)):null});
    state.textContent=error?'文本块检查失败：'+error:!report?'正在读取 CMD 内嵌的原始 JSON…':
      `原始 ${report.blocks} 块 / ${report.pages} 页 · 源码已匹配 ${report.matched} · 缺失 ${report.missing} · 重复 ${report.duplicates} · PDF bbox ${report.withGeometry} · 无效 ${report.withoutGeometry}`+
      ` · 可见正文 ${report.readable} · 空块/仅元数据 ${report.metadataOnly}`+
      (previewMapped?` · 当前 MD 定位 ${list.filter(x=>x.expectsPreview&&previewMapped.has(x.id)).length}/${list.filter(x=>x.expectsPreview).length}`:' · MD 定位检查中')+
      ` · 未知锚点 ${report.unknown}`+
      (scope?.operationScope?.mode==='chapter'?` · 当前章节 ${list.length} 块（缺失块仍计入全文）`:'');
    if(active&&report)onStatus(`CMD 文本块 ${report.matched}/${report.blocks} · 缺失 ${report.missing}`);
  };
  return Object.freeze({
    setLoading(){error='';report=null;state.textContent='读取 CMD 无损封存数据中…';},
    setError(e){error=String(e);refresh();},
    setInventory(result){report=result.summary;previewMapped=null;rows=result.rows.map(row=>({...row,
      geometryLabel:row.geometry?'可定位':'无效',
      previewLabel:row.expectsPreview?'待检查':'无需渲染'}));selectedId=null;
      grid.setGridOption('rowData',rows);error='';refresh();},
    getBlocks(){return rows.map(({id,sourceLine,expectsPreview})=>({id,sourceLine,expectsPreview}));},
    setPreviewCoverage(ids){
      previewMapped=new Set(ids);
      for(const row of rows)row.previewLabel=!row.expectsPreview?'无需渲染':previewMapped.has(row.id)?'可定位':'未映射';
      grid.refreshCells({force:true});refresh();
    },
    setVirtualQuery(intent){scope=intent;refresh();},
    count(chapter){if(chapter==='all')return rows.length;const c=getChapter(chapter);
      return c?rows.filter(r=>r.from!==null&&r.from>=c.from&&r.from<c.to).length:0;},
    setActive(value){active=Boolean(value);host.hidden=!active;if(active)refresh();},
    dispose(){disposed=true;unsubscribe();grid.destroy();},
  });
}
