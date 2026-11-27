/** Minimal first-class Frame API: Dockview shell, no CMD/SQL/Media reads or writes. */
import {createDockview,themeAbyss} from 'dockview';
import {mountReadingPreview,mountReadingSource} from '../translation/reading.js';
import {placeholder} from '../translation/refill.js';
import {mountPromptEditor} from '../translation/prompt-editor.js';
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import 'dockview/dist/styles/dockview.css';
import '../workspace.css';
import '../outline-grid.css';
import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import '../ag-enum-filter-shared.css';
import '../settings-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const agTheme=themeQuartz.withParams({accentColor:'#569d79',selectedRowBackgroundColor:'rgba(235,163,82,.18)',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

const emptyColumns=[
  {field:'pbs',headerName:'PBS',width:115},
  {field:'usable',headerName:'可用',width:72},
  {field:'type',headerName:'类型',width:95},
  {field:'content',headerName:'文本块',flex:1},
];
const translatedColumns=[
  {field:'source_line',headerName:'MDLine',pinned:'left',width:100},
  {field:'sentence_index',headerName:'句序',width:72},
  {field:'raw',headerName:'raw',minWidth:240,flex:1,tooltipField:'raw',cellStyle:{whiteSpace:'pre'}},
  {field:'type',headerName:'type',width:135,filter: EnumCheckboxFilter,suppressHeaderMenuButton:true,suppressHeaderFilterButton: false},
  {field:'level',headerName:'level',width:75,filter: EnumCheckboxFilter,suppressHeaderMenuButton:true,suppressHeaderFilterButton: false},
  {field:'translatable',headerName:'可翻译',width:100,valueFormatter:({value})=>value?'是':'否',filter: EnumCheckboxFilter,filterValueGetter:({data})=>data?.translatable?'是':'否',suppressHeaderMenuButton:true,suppressHeaderFilterButton: false},
  {field:'protected',headerName:'回填元素',minWidth:240,flex:1,valueFormatter:({value,data})=>(value??[]).map((p,i)=>placeholder(data.raw,i)+' '+p.kind+': '+JSON.stringify(p.text)).join(' · '),tooltipValueGetter:({value})=>JSON.stringify(value)},
  {field:'text',headerName:'text',minWidth:240,flex:1,tooltipField:'text',cellStyle:{whiteSpace:'pre'}},
  {field:'policy',headerName:'识别版本',width:110},
  {field:'source_line_hash',headerName:'行哈希',width:165},
  {field:'source_document_hash',headerName:'文档哈希',width:165},
  {field:'sentence_sha256',headerName:'分句哈希',width:165},
];
function mountEmptyGrid(host,picker,onLocate){
  const grid=createGrid(host,{theme:agTheme,headerHeight:33,rowHeight:35,
    suppressNoRowsOverlay:true,overlayNoRowsTemplate:' ',
    defaultColDef:{editable:false,resizable:true,sortable:false,suppressMovable:true},
    getRowId:({data})=>data.source_line+':'+data.sentence_index,
    columnDefs:emptyColumns,rowData:[],rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},onRowClicked:({data})=>{if(data)onLocate(data.source_line+':'+data.sentence_index,'ag');}});
  let active='empty';
  function showRows(rows){
    const next=rows===null?'empty':'original';
    if(active!==next){
      grid.setFilterModel(null);
      grid.setGridOption('columnDefs',next==='original'?translatedColumns:emptyColumns);
      active=next;
      if(next==='empty'){
        picker.replaceChildren(new Option('空白框架','frame'),new Option('全局设置','settings'));
        picker.value='frame';picker.disabled=true;picker.title='空白框架 AG 模块切换不可用';
      }else{
        picker.replaceChildren(new Option('原句表','original'));
        picker.value='original';picker.disabled=false;picker.title='';
      }
    }
    grid.setGridOption('rowData',rows??[]);
  }
  return {dispose(){grid.destroy();},layout:()=>{},setTranslationRows:showRows,
    locate(row,{scroll=true}={}){
      const node=row&&grid.getRowNode(row.key);
      if(!node||node.rowIndex==null){grid.deselectAll();return;}
      node.setSelected(true,true);
      if(scroll)grid.ensureIndexVisible(node.rowIndex,'middle');
    }};
}
function blankPane(name,onModuleChange,register,onLocate,onStatus){
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
    owned=()=>mountEmptyGrid(grid,picker,onLocate);
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
    select.addEventListener('change',()=>{if(['settings','sql-init','translation'].includes(select.value))onModuleChange?.(select.value);});
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo';
    actions.setAttribute('role','group');actions.setAttribute('aria-label','源码撤销与重做');
    const undo=document.createElement('button');undo.type='button';undo.id='undo';
    undo.textContent='↶';undo.setAttribute('aria-label','撤销');undo.title='没有绑定文档';undo.disabled=true;
    const redo=document.createElement('button');redo.type='button';redo.id='redo';
    redo.textContent='↷';redo.setAttribute('aria-label','重做');redo.title='没有绑定文档';redo.disabled=true;
    actions.append(undo,redo);
    bar.append(select,actions);element.append(bar);
    const body=document.createElement('div');body.id='editor';body.className='ocr-cm-source frame-editor';
    element.append(body);owned=()=>mountReadingSource(body,onLocate);
  }else if(name==='preview'){
    element.className='ocr-preview-pane';element.dataset.previewMode='md';
    const bar=document.createElement('div');bar.className='ocr-preview-switchbar';
    const mode=document.createElement('select');mode.className='ocr-preview-mode';
    mode.setAttribute('aria-label','预览类型');mode.innerHTML='<option value="md">Markdown 预览</option><option value="prompt">翻译 Prompt</option>';
    const actions=document.createElement('div');actions.className='ocr-source-undo-redo translation-prompt-actions';
    actions.setAttribute('role','group');actions.setAttribute('aria-label','Prompt 撤销与重做');actions.hidden=true;
    const undo=document.createElement('button'),redo=document.createElement('button');
    for(const [button,id,label,glyph] of [[undo,'prompt-undo','撤销 Prompt','↶'],[redo,'prompt-redo','重做 Prompt','↷']]){
      button.type='button';button.id=id;button.setAttribute('aria-label',label);button.title=label;button.textContent=glyph;button.disabled=true;actions.append(button);
    }
    bar.append(mode,actions);element.append(bar);
    const area=document.createElement('div');area.className='ocr-preview-md-scroll ocr-markdown';element.append(area);
    const promptHost=document.createElement('div');promptHost.className='translation-prompt-editor frame-editor';promptHost.hidden=true;element.append(promptHost);
    element.setAttribute('aria-label','Markdown 预览与翻译 Prompt');
    owned=()=>{
      const reader=mountReadingPreview(area,onLocate);
      let prompt=null,lastFocus=null;
      const refresh=state=>{
        undo.disabled=!state.undo;redo.disabled=!state.redo;
        if(mode.value==='prompt')onStatus(state.dirty?'● 翻译 Prompt 未保存':'翻译 Prompt · 已保存或默认任务书',state.dirty?'warning':'info');
      };
      function switchMode(){
        const editing=mode.value==='prompt';
        if(editing&&!prompt)prompt=mountPromptEditor(promptHost,{onChange:refresh,onStatus});
        element.dataset.previewMode=mode.value;area.hidden=editing;promptHost.hidden=!editing;actions.hidden=!editing;
        if(editing)prompt.activate();else{reader.locate(lastFocus,{scroll:true});onStatus('Markdown 阅读预览');}
      }
      mode.addEventListener('change',switchMode);
      undo.addEventListener('click',()=>prompt?.undo());redo.addEventListener('click',()=>prompt?.redo());
      return Object.freeze({
        setDocument(...args){reader.setDocument(...args);},
        locate(row,options){lastFocus=row;if(mode.value==='md')reader.locate(row,options);},
        layout(){reader.layout();if(mode.value==='prompt')prompt?.layout();},
        isPromptActive:()=>mode.value==='prompt',
        getPromptText:()=>prompt?.getText()??null,
        savePrompt:()=>prompt?.save(),
        dispose(){reader.dispose();prompt?.dispose();mode.removeEventListener('change',switchMode);}
      });
    };
  }else throw Error('Unknown Frame pane '+name);
  return {element,init(){if(owned)this.resource=owned();if(this.resource)register(name,this.resource);},layout(){this.resource?.layout();},
    dispose(){this.resource?.dispose();}};
}

function addPanel(dockview,id,component,title,position){
  const panel=dockview.addPanel({id,component,title,...(position?{position}:{})});
  panel.group.header.hidden=true;panel.group.relayout();return panel;
}
/** Public F01: three original groups; WP04 replaces PDF with Prompt mode. */
export function createFrameWorkspace(container,{onStatus=()=>{},onModuleChange=()=>{}}={}){
  let originalGrid=null,sourceReader=null,previewReader=null,readingModel=null,readingPath='',focused=null;
  function locate(value,origin){
    if(!readingModel)return;
    const key=typeof value==='string'?value:value?.key;
    const row=readingModel.byKey(key);
    if(!row)return;focused=row;
    originalGrid?.locate(row,{scroll:origin!=='ag'});
    sourceReader?.locate(row,{scroll:origin!=='source'});
    previewReader?.locate(row,{scroll:origin!=='preview'});
  }
  function register(name,port){
    if(name==='outline')originalGrid=port;
    if(name==='source')sourceReader=port;
    if(name==='preview')previewReader=port;
  }
  const dockview=createDockview(container,{theme:themeAbyss,
    createComponent:({name})=>blankPane(name,onModuleChange,register,locate,onStatus)});
  const left=addPanel(dockview,'outline','outline','章节大纲 · AG');
  const source=addPanel(dockview,'source','source','Markdown 源码',{referencePanel:left,direction:'right'});
  addPanel(dockview,'preview','preview','Markdown 预览',{referencePanel:source,direction:'below'});
  function applyReading(model,path=''){
    const keep=model&&readingPath===path&&focused&&readingModel?.text===model.text;
    readingModel=model;readingPath=path;focused=keep?model.byKey(focused.key):null;
    sourceReader?.setDocument(model);
    previewReader?.setDocument(model,sourceReader?.getMarkdown()??'',path);
    originalGrid?.locate(focused,{scroll:false});
    sourceReader?.locate(focused,{scroll:false});
    previewReader?.locate(focused,{scroll:false});
  }
  return Object.freeze({isPromptActive:()=>previewReader?.isPromptActive()??false,
    getPromptText:()=>previewReader?.getPromptText()??null,
    savePrompt:()=>previewReader?.savePrompt(),
    setTranslationRows(rows){originalGrid?.setTranslationRows(rows);},
    setReadingDocument:applyReading,activate(){if(container.clientWidth&&container.clientHeight)
    dockview.layout(container.clientWidth,container.clientHeight);previewReader?.layout();},
    dispose(){dockview.dispose();}});
}
