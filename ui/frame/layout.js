/** Minimal first-class Frame API: Dockview shell, no CMD/SQL/Media reads or writes. */
import {createDockview,themeAbyss} from 'dockview';
import {EditorState} from '@codemirror/state';
import {EditorView,lineNumbers} from '@codemirror/view';
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import 'dockview/dist/styles/dockview.css';
import '../workspace.css';
import '../outline-grid.css';
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
function mountEmptyGrid(host){
  const columnDefs=[
    {field:'pbs',headerName:'PBS',width:115},
    {field:'usable',headerName:'可用',width:72},
    {field:'type',headerName:'类型',width:95},
    {field:'content',headerName:'文本块',flex:1},
  ];
  const grid=createGrid(host,{theme:agTheme,headerHeight:33,rowHeight:35,
    suppressNoRowsOverlay:true,overlayNoRowsTemplate:' ',
    defaultColDef:{resizable:true,sortable:false,suppressMovable:true},
    columnDefs,rowData:[]});
  return {dispose(){grid.destroy();},layout:()=>{}};
}
function blankPane(name,onSplit,onModuleChange){
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
    const ownModule='frame';picker.value=ownModule;
    picker.addEventListener('change',()=>{
      const next=picker.value;
      picker.value=ownModule; // Each pane retains its own correct module on return.
      onModuleChange?.(next);
    });
    bar.append(label,picker);element.append(bar);
    const grid=document.createElement('div');grid.className='ocr-outline-grid';
    element.append(grid);
    owned=()=>mountEmptyGrid(grid);
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
    select.addEventListener('change',()=>{if(select.value==='settings')onModuleChange?.('settings');});
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
  return {element,init(){if(owned)this.resource=owned();},layout(){this.resource?.layout();},
    dispose(){this.resource?.dispose();}};
}

function addPanel(dockview,id,component,title,position){
  const panel=dockview.addPanel({id,component,title,...(position?{position}:{})});
  panel.group.header.hidden=true;panel.group.relayout();return panel;
}
/** Public F01: exactly Main's default three groups + detached PDF split. */
export function createFrameWorkspace(container,{onStatus=()=>{},onModuleChange=()=>{}}={}){
  let split=false;
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,setSplit,onModuleChange)});
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
  return Object.freeze({setSplit,activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},
    dispose(){dockview.dispose();},get split(){return split;}});
}
