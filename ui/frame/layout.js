/** Minimal first-class Frame API: Dockview shell, no CMD/SQL/Media reads or writes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState} from '@codemirror/state';
import {EditorView,lineNumbers} from '@codemirror/view';
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import 'dockview/dist/styles/dockview.css';
import '../workspace.css';
import '../outline-grid.css';
import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import '../ag-enum-filter-shared.css';
import '../settings-module.css';
import '../pdf-preview.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const agTheme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

function mountEmptySource(host){
  const editor=new EditorView({state:EditorState.create({doc:'',extensions:[
    EditorState.readOnly.of(true),EditorView.editable.of(false),lineNumbers(),EditorView.lineWrapping,
  ]}),parent:host});
  return {dispose:()=>editor.destroy(),layout:()=>editor.requestMeasure()};
}
const emptyColumns=[
  {field:'pbs',headerName:'PBS',width:115},
  {field:'usable',headerName:'可用',width:72},
  {field:'type',headerName:'类型',width:95},
  {field:'content',headerName:'文本块',flex:1},
];
const originalColumns=[
  {field:'source_line',headerName:'MDLine',pinned:'left',width:100},
  {field:'sentence_index',headerName:'句序',width:72},
  {field:'raw',headerName:'raw',minWidth:240,flex:1,tooltipField:'raw',cellStyle:{whiteSpace:'pre'}},
  {field:'type',headerName:'type',width:135,filter: EnumCheckboxFilter,suppressHeaderMenuButton:true,suppressHeaderFilterButton: false},
  {field:'level',headerName:'level',width:75,filter: EnumCheckboxFilter,suppressHeaderMenuButton:true,suppressHeaderFilterButton: false},
  {field:'review_state',headerName:'状态',width:125},
  {field:'adopted_engine',headerName:'采用引擎',width:135},
  {field:'from_utf16',headerName:'起点',width:85},
  {field:'to_utf16',headerName:'终点',width:85},
  {field:'source_line_hash',headerName:'行哈希',width:165},
  {field:'source_document_hash',headerName:'文档哈希',width:165},
  {field:'candidates_json',headerName:'候选方案',width:220},
];
const translatedColumns=[
  originalColumns[0],originalColumns[1],originalColumns[2],originalColumns[3],originalColumns[4],
  {field:'translatable',headerName:'可翻译',width:100,valueFormatter:({value})=>value?'是':'否',filter: EnumCheckboxFilter,filterValueGetter:({data})=>data?.translatable?'是':'否',suppressHeaderMenuButton:true,suppressHeaderFilterButton: false},
  {field:'protected',headerName:'不翻译元素',minWidth:240,flex:1,valueFormatter:({value})=>(value??[]).map(p=>p.kind+': '+JSON.stringify(p.text)).join(' · '),tooltipValueGetter:({value})=>JSON.stringify(value)},
  {field:'policy',headerName:'识别版本',width:110},
  {field:'source_line_hash',headerName:'行哈希',width:165},
  {field:'source_document_hash',headerName:'文档哈希',width:165},
  {field:'sentence_sha256',headerName:'分句哈希',width:165},
];
function mountEmptyGrid(host,picker){
  const grid=createGrid(host,{theme:agTheme,headerHeight:33,rowHeight:35,
    suppressNoRowsOverlay:true,overlayNoRowsTemplate:' ',
    defaultColDef:{editable:false,resizable:true,sortable:false,suppressMovable:true},
    getRowId:({data})=>data.source_line+':'+data.sentence_index,
    columnDefs:emptyColumns,rowData:[]});
  let active='empty';
  const filters=new Map();
  function showRows(mode,rows){
    const next=rows===null?'empty':mode;
    if(active!==next){
      if(next==='empty')filters.clear();else if(active!=='empty')filters.set(active,grid.getFilterModel());
      grid.setFilterModel(null);
      grid.setGridOption('columnDefs',next==='original'?originalColumns:next==='translation'?translatedColumns:emptyColumns);
      active=next;grid.setGridOption('rowData',rows??[]);
      if(filters.has(next))grid.setFilterModel(filters.get(next));
    }else grid.setGridOption('rowData',rows??[]);
    picker.options[0].textContent=next==='original'?'原句表（只读）':next==='translation'?'译句表':'空白框架';
  }
  return {dispose(){grid.destroy();},layout:()=>{},setOriginalRows:rows=>showRows('original',rows),setTranslationRows:rows=>showRows('translation',rows)};
}
function blankPane(name,onSplit,onModuleChange,onOriginalGrid){
  const element=document.createElement('div');
  let owned=null;
  if(name==='outline'){
    element.className='ocr-outline-pane';
    // The AG-owned module strip belongs to the left pane, not the global status.
    const bar=document.createElement('div');bar.className='ocr-ag-toolbar';
    bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','AG 表工具栏');
    const label=document.createElement('span');label.className='ocr-ag-toolbar-label';label.textContent='AG 表';
    const picker=document.createElement('select');picker.className='ocr-ag-module-select';
    picker.setAttribute('aria-label','选择模块');
    picker.add(new Option('空白框架','frame'));
    picker.add(new Option('全局设置','settings'));
    // Frame is intentionally a blank shell: AG does not navigate modules.
    // The single settings.json remains in the independent source navigation.
    picker.value='frame';picker.disabled=true;
    picker.title='空白框架 AG 模块切换不可用';
    bar.append(label,picker);element.append(bar);
    const grid=document.createElement('div');grid.className='ocr-outline-grid';
    element.append(grid);
    owned=()=>mountEmptyGrid(grid,picker);
  }else if(name==='source'){
    element.className='ocr-source-pane ocr-source-file-source';
    const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
    const select=document.createElement('select');select.className='ocr-source-file-select';
    select.setAttribute('aria-label','源码文件导航');
    const placeholder=new Option('选择源码文件…','');placeholder.disabled=true;
    select.add(placeholder);
    const group=document.createElement('optgroup');group.label='全局设置';
    group.append(new Option('settings.json','settings'));
    select.append(group);
    select.value='';
    select.addEventListener('change',()=>{if(['settings','sql-init','original','translation-init','translation'].includes(select.value))onModuleChange?.(select.value);});
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    actions.setAttribute('role','group');actions.setAttribute('aria-label','源码撤销与重做');
    const undo=document.createElement('button');undo.type='button';undo.id='undo';
    undo.textContent='↶';undo.setAttribute('aria-label','撤销');undo.title='没有绑定文档';undo.disabled=true;
    const redo=document.createElement('button');redo.type='button';redo.id='redo';
    redo.textContent='↷';redo.setAttribute('aria-label','重做');redo.title='没有绑定文档';redo.disabled=true;
    actions.append(undo,redo);
    bar.append(select,actions);element.append(bar);
    const body=document.createElement('div');body.className='ocr-cm-source frame-editor';
    body.id='editor';
    element.append(body);owned=()=>mountEmptySource(body);
  }else if(name==='preview'){
    element.className='ocr-preview-pane';element.dataset.previewMode='md';
    const bar=document.createElement('div');bar.className='ocr-preview-switchbar';
    const mode=document.createElement('select');mode.className='ocr-preview-mode';
    mode.setAttribute('aria-label','预览类型');mode.innerHTML='<option value="md">Markdown 预览</option><option value="pdf" disabled>PDF 原文</option>';
    const split=document.createElement('label');split.className='ocr-preview-split-toggle';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=true;
    checkbox.setAttribute('aria-label','切分 Markdown PDF 预览');
    checkbox.addEventListener('change',()=>onSplit?.(checkbox.checked));
    split.append(checkbox,document.createTextNode('切分'));
    bar.append(mode,split);element.append(bar);
    const area=document.createElement('div');area.className='ocr-preview-md-scroll ocr-markdown';
    element.append(area);
    element.setAttribute('aria-label','Markdown 预览（空白）');
  }else if(name==='pdf'){
    element.className='ocr-detached-pdf-pane';
    const bar=document.createElement('div');bar.className='ocr-detached-pdf-toolbar';
    const title=document.createElement('span');title.className='ocr-detached-pdf-title';title.textContent='PDF 原文';
    const actions=document.createElement('div');actions.className='ocr-detached-pdf-tools';
    actions.innerHTML='<div class="ocr-pdf-tools"><button type="button" disabled>−</button><button type="button" disabled>适宽</button><button type="button" disabled>+</button><span class="ocr-pdf-zoom">—</span><button type="button" disabled>提取文本</button><label>页 <input type="number" disabled value="1" class="ocr-pdf-page" aria-label="PDF 页码"/></label><span class="ocr-pdf-count">/ —</span></div>';
    bar.append(title,actions);element.append(bar);
    const host=document.createElement('div');host.className='ocr-detached-pdf-host';
    const surface=document.createElement('div');surface.className='ocr-preview-pdf-host';
    host.append(surface);element.append(host);
  }else throw Error('Unknown Frame pane '+name);
  return {element,init(){if(owned)this.resource=owned();if(name==='outline')onOriginalGrid(this.resource);},layout(){this.resource?.layout();},
    dispose(){this.resource?.dispose();}};
}

function addPanel(dockview,id,component,title,position){
  const panel=dockview.addPanel({id,component,title,...(position?{position}:{})});
  panel.group.header.hidden=true;panel.group.relayout();return panel;
}
/** Public F01: exactly Main's default three groups + detached PDF split. */
export function createFrameWorkspace(container,{onStatus=()=>{},onModuleChange=()=>{}}={}){
  let split=false,originalGrid=null;
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,setSplit,onModuleChange,grid=>{originalGrid=grid;})});
  const left=addPanel(dockview,'outline','outline','章节大纲 · AG');
  const source=addPanel(dockview,'source','source','Markdown 源码',{referencePanel:left,direction:'right'});
  addPanel(dockview,'preview','preview','Markdown 预览',{referencePanel:source,direction:'below'});
  function setSplit(enabled){
    if(Boolean(enabled)===split)return;
    if(enabled){addPanel(dockview,'pdf','pdf','PDF 原文',{referencePanel:'preview',direction:'right'});split=true;}
    else{const panel=dockview.getPanel('pdf');if(panel)dockview.removePanel(panel);split=false;}
    const checkbox=container.querySelector('.ocr-preview-split-toggle input');
    if(checkbox)checkbox.checked=split;
    onStatus(split?'四窗布局已启用':'三窗布局已启用');
  }
  setSplit(true);
  return Object.freeze({setSplit,setOriginalRows(rows){originalGrid?.setOriginalRows(rows);},setTranslationRows(rows){originalGrid?.setTranslationRows(rows);},activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},
    dispose(){dockview.dispose();},get split(){return split;}});
}
