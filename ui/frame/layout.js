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

function mountEmptySource(host,readSource=()=>'',subscribe=()=>()=>{}){
  const editor=new EditorView({state:EditorState.create({doc:readSource(),extensions:[
    EditorState.readOnly.of(true),EditorView.editable.of(false),lineNumbers(),EditorView.lineWrapping,
  ]}),parent:host});
  const unsubscribe=subscribe(()=>{const next=readSource();const old=editor.state.doc.toString();
    if(next!==old)editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:next}});});
  return {dispose(){unsubscribe();editor.destroy();},layout:()=>editor.requestMeasure()};
}
function mountEmptyGrid(host,isSettings,registry){
  const columnDefs=isSettings?[
    {field:'primaryCategory',headerName:'一级分类',width:145},
    {field:'secondaryCategory',headerName:'二级分类',width:150},
    {field:'keyName',headerName:'键名',width:160},
    {field:'keyComment',headerName:'键注释',flex:1},
  ]:[
    {field:'pbs',headerName:'PBS',width:115},
    {field:'usable',headerName:'可用',width:72},
    {field:'type',headerName:'类型',width:95},
    {field:'content',headerName:'文本块',flex:1},
  ];
  const grid=createGrid(host,{theme:agTheme,headerHeight:33,rowHeight:35,
    suppressNoRowsOverlay:true,overlayNoRowsTemplate:' ',
    onRowClicked:event=>{if(isSettings&&event.data?.key)registry?.select(event.data.key);},
    defaultColDef:{resizable:true,sortable:false,suppressMovable:true},
    columnDefs,rowData:isSettings?registry?.list()||[]:[]});
  const unsubscribe=isSettings&&registry?registry.subscribe(()=>grid.setGridOption('rowData',registry.list())):()=>{};
  return {dispose(){unsubscribe();grid.destroy();},layout:()=>{}};
}
function blankPane(name,isSettings,onSplit,onModuleChange,registry){
  const element=document.createElement('div');
  let owned=null;
  if(name==='outline'){
    element.className=isSettings?'ocr-settings-pane ocr-settings-ag-pane':'ocr-outline-pane';
    // The AG-owned module strip belongs to the left pane, not the global status.
    const bar=document.createElement('div');bar.className='ocr-ag-toolbar';
    bar.setAttribute('role','toolbar');bar.setAttribute('aria-label','AG 表工具栏');
    const label=document.createElement('span');label.className='ocr-ag-toolbar-label';label.textContent='AG 表';
    const picker=document.createElement('select');picker.className='ocr-ag-module-select';
    picker.setAttribute('aria-label','选择模块');
    picker.add(new Option('空白框架','frame'));
    picker.add(new Option('全局设置','settings'));
    const ownModule=isSettings?'settings':'frame';picker.value=ownModule;
    picker.addEventListener('change',()=>{
      const next=picker.value;
      picker.value=ownModule; // Each pane retains its own correct module on return.
      onModuleChange?.(next);
    });
    bar.append(label,picker);element.append(bar);
    const grid=document.createElement('div');grid.className='ocr-outline-grid';
    element.append(grid);
    owned=()=>mountEmptyGrid(grid,isSettings,registry);
  }else if(name==='source'){
    element.className=isSettings?'ocr-settings-pane ocr-settings-source ocr-cm-source':'ocr-source-pane ocr-source-file-source';
    const bar=document.createElement('div');bar.className='ocr-source-file-toolbar';
    const select=document.createElement('select');select.className='ocr-source-file-select';
    select.setAttribute('aria-label','源码文件导航');select.disabled=true;
    select.add(new Option(isSettings?'settings.json（运行时）':'未选择文档','none'));
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    actions.setAttribute('role','group');actions.setAttribute('aria-label','源码撤销与重做');
    const undo=document.createElement('button');undo.type='button';undo.id=isSettings?'settings-undo':'undo';
    undo.textContent='↶';undo.setAttribute('aria-label','撤销');undo.title='没有绑定文档';undo.disabled=true;
    const redo=document.createElement('button');redo.type='button';redo.id=isSettings?'settings-redo':'redo';
    redo.textContent='↷';redo.setAttribute('aria-label','重做');redo.title='没有绑定文档';redo.disabled=true;
    actions.append(undo,redo);
    bar.append(select,actions);element.append(bar);
    const body=document.createElement('div');body.className='ocr-cm-source frame-editor';
    if(!isSettings)body.id='editor';
    element.append(body);owned=()=>mountEmptySource(body,
      isSettings&&registry?()=>JSON.stringify(registry.snapshot(),null,2):()=>'',
      isSettings&&registry?fn=>registry.subscribe(fn):()=>()=>{});
  }else if(name==='preview'&&!isSettings){
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
  }else if(name==='pdf'&&!isSettings){
    element.className='ocr-detached-pdf-pane';
    const bar=document.createElement('div');bar.className='ocr-detached-pdf-toolbar';
    const title=document.createElement('span');title.className='ocr-detached-pdf-title';title.textContent='PDF 原文';
    const actions=document.createElement('div');actions.className='ocr-detached-pdf-tools';
    actions.innerHTML='<div class="ocr-pdf-tools"><button type="button" disabled>−</button><button type="button" disabled>适宽</button><button type="button" disabled>+</button><span class="ocr-pdf-zoom">—</span><button type="button" disabled>提取文本</button><label>页 <input type="number" disabled value="1" class="ocr-pdf-page" aria-label="PDF 页码"/></label><span class="ocr-pdf-count">/ —</span></div>';
    bar.append(title,actions);element.append(bar);
    const host=document.createElement('div');host.className='ocr-detached-pdf-host';
    const surface=document.createElement('div');surface.className='ocr-preview-pdf-host';
    host.append(surface);element.append(host);
  }else{
    element.className='ocr-settings-pane';
    if(isSettings&&name==='settings-preview'&&registry){
      const control=document.createElement('div');control.className='ocr-settings-control';
      element.append(control);owned=()=>mountSettingsControls(control,registry);
    }
  }
  return {element,init(){if(owned)this.resource=owned();},layout(){this.resource?.layout();},
    dispose(){this.resource?.dispose();}};
}

function mountSettingsControls(host,registry){
  let currentKey=null;
  function render(){
    const row=registry.list().find(x=>x.key===registry.selected);
    if(!row){host.replaceChildren();currentKey=null;return;}
    // Keep the same physical slider during pointer drags. Recreating its DOM
    // node on every input event would swallow the remainder of the gesture.
    if(currentKey===row.key){
      const range=host.querySelector('#frame-setting-size');
      if(range)range.value=String(row.value);
      const output=host.querySelector('output');
      if(output)output.textContent=row.value+' px';
      const number=host.querySelector('#frame-setting-size-number');
      if(number)number.value=String(row.value);
      return;
    }
    currentKey=row.key;host.replaceChildren();
    const breadcrumb=document.createElement('div');breadcrumb.className='ocr-settings-breadcrumb';
    breadcrumb.textContent=row.primaryCategory+' / '+row.secondaryCategory;
    const title=document.createElement('label');title.textContent=row.keyName;
    const description=document.createElement('p');description.className='ocr-settings-description';
    description.textContent=row.keyComment;
    host.append(breadcrumb,title,description);
    if(row.readonly){
      const input=document.createElement('input');input.id='frame-setting-family';input.type='text';
      input.value=String(row.value);input.readOnly=true;input.disabled=true;
      input.setAttribute('aria-label','字体（只读）');host.append(input);
    }else{
      const group=document.createElement('div');group.className='ocr-settings-slider-row';
      const range=document.createElement('input');range.id='frame-setting-size';range.type='range';
      range.min=String(row.min);range.max=String(row.max);range.step=String(row.step);
      range.value=String(row.value);range.setAttribute('aria-label','全局字号');
      const output=document.createElement('output');output.htmlFor=range.id;
      output.textContent=row.value+' px';
      range.addEventListener('input',()=>registry.set(row.key,Number(range.value)));
      group.append(range,output);host.append(group);
      const number=document.createElement('input');number.type='number';
      number.id='frame-setting-size-number';number.min=range.min;number.max=range.max;
      number.step=range.step;number.value=range.value;number.setAttribute('aria-label','全局字号数值');
      number.addEventListener('change',()=>{
        try{registry.set(row.key,Number(number.value));}
        catch{number.value=String(registry.get(row.key));}
      });host.append(number);
    }
  }
  const unsubscribe=registry.subscribe(render);render();
  return {dispose:unsubscribe,layout:()=>{}};
}

function addPanel(dockview,id,component,title,position){
  const panel=dockview.addPanel({id,component,title,...(position?{position}:{})});
  panel.group.header.hidden=true;panel.group.relayout();return panel;
}
/** Public F01: exactly Main's default three groups + detached PDF split. */
export function createFrameWorkspace(container,{onStatus=()=>{},onModuleChange=()=>{}}={}){
  let split=false;
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,false,setSplit,onModuleChange)});
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
  return Object.freeze({setSplit,dispose(){dockview.dispose();},get split(){return split;}});
}
/** Public F02: Settings Dockview with optional registered, bounded settings facade. */
export function createEmptySettings(container,{onModuleChange=()=>{},settingsRegistry=null}={}){
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,true,null,onModuleChange,settingsRegistry)});
  const left=addPanel(dockview,'settings-outline','outline','设置 · AG');
  const center=addPanel(dockview,'settings-source','source','settings.json',{referencePanel:left,direction:'right'});
  addPanel(dockview,'settings-preview','settings-preview','设置控件',{referencePanel:center,direction:'below'});
  return Object.freeze({activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);},dispose(){dockview.dispose();}});
}
