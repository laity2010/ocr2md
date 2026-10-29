/** Notes are a fourth AG projection; only CMD owns annotations and Save. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {DEFAULT_NOTE_TEMPLATE,NOTE_TEMPLATE_KEY,validateNoteTemplate,
  scanNotePairs,planMarkNotePair} from './note-pair-scan.js';
import './note-pair-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);

const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});
function loadTemplate(){
  try{return validateNoteTemplate(JSON.parse(localStorage.getItem(NOTE_TEMPLATE_KEY)));}catch{
    return {...DEFAULT_NOTE_TEMPLATE};
  }
}
function locationCell(which){
  const ref=which==='reference';
  return params=>{
    if(!params.data)return '';
    const line=params.data[ref?'referenceLine':'bodyLine'];
    if(!line)return '—';
    const button=document.createElement('button');
    button.type='button';
    button.className='ocr-note-jump';
    button.textContent=String(line);
    button.title=ref?'定位注释引用的源码和原始 PDF':'定位注释正文的源码和原始 PDF';
    button.setAttribute('aria-label',(ref?'引用':'正文')+'第'+line+'行定位');
    for(const name of ['pointerdown','mousedown','touchstart'])
      button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',event=>{
      event.stopPropagation();
      publishFocus({sourceLine:line,origin:'note',intent:'click'});
    });
    return button;
  };
}
export function createNotePairModule(host,getMarkdown,getCMD,onStatus=()=>{}){
  host.classList.add('ocr-note-pane');
  const gridHost=document.createElement('div');
  gridHost.className='ocr-note-grid';host.append(gridHost);
  let grid,active=false,disposed=false,queued=false,lastSource=null,rows=[];
  let template=loadTemplate();
  let scope={mode:'all'},lastQuery=null;
  function currentRows(){
    if(scope.mode!=='chapter')return rows;
    const chapter=getCMD()?.getChapter(scope.chapterId);
    return chapter?rows.filter(row=>row.from>=chapter.from&&row.from<chapter.to):[];
  }
  function report(){
    if(!active)return;
    const scoped=currentRows();
    onStatus('注释对 '+scoped.length+' 项 · 已配对 '+
      scoped.filter(x=>x.status==='已配对').length+' · 已标定 '+
      scoped.filter(x=>x.marked).length+' · 待处理 '+
      scoped.filter(x=>x.status!=='已配对').length);
  }
  function followFocus(target,state){
    if(!active||!target||target.origin==='note'||
       target.revision!==state.documentRevision)return;
    const row=rows.find(x=>target.sourceLine===x.referenceLine||
      target.sourceLine===x.bodyLine);
    if(!row)return;
    const node=grid.getRowNode(row.id);
    if(!node)return;
    node.setSelected(true,true);
    if(node.rowIndex!=null)grid.ensureIndexVisible(node.rowIndex,'auto');
  }
  function mark(row){
    if(disposed||!row||row.marked||row.status!=='已配对')return;
    try{
      const source=getMarkdown();
      const ops=planMarkNotePair(source,row);
      if(!ops.length)return;
      getCMD().editAnnotations(ops,{expectedSource:source,agScope:scope});
      refresh();
      onStatus('注释 '+row.number+' 已在 CMD 标定引用和正文 · 请全局保存');
    }catch(error){onStatus('注释标定失败：'+error.message);}
  }
  const columns=[
    {field:'number',headerName:'注释号',width:88,minWidth:80,pinned:'left',lockPinned:true,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'status',headerName:'配对状态',width:105,minWidth:100,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {colId:'referenceLine',headerName:'引用行',width:85,minWidth:78,
      cellRenderer:locationCell('reference')},
    {field:'reference',headerName:'引用原文',minWidth:130,flex:.7,
      tooltipField:'reference'},
    {colId:'bodyLine',headerName:'正文行',width:85,minWidth:78,
      cellRenderer:locationCell('body')},
    {field:'content',headerName:'注释正文',minWidth:215,flex:1.6,
      tooltipField:'content'},
    {colId:'mark',headerName:'CMD 标定',width:92,minWidth:88,
      cellRenderer:p=>{
        if(!p.data)return '';
        const button=document.createElement('button');
        button.className='ocr-note-mark';button.type='button';
        button.textContent=p.data.marked?'已标定':'标定';
        button.disabled=p.data.marked||p.data.status!=='已配对';
        button.title=button.disabled?'只能标定明确的一对一注释':'写入引用和正文的 CMD 注释标记（不自动保存）';
        for(const name of ['pointerdown','mousedown','touchstart'])
          button.addEventListener(name,e=>e.stopPropagation());
        button.addEventListener('click',event=>{event.stopPropagation();mark(p.node.data);});
        return button;
      }},
  ].map(c=>({resizable:true,sortable:false,suppressMovable:true,...c}));
  grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:54,
    getRowId:p=>p.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:e=>{
      const line=e.data.referenceLine??e.data.bodyLine;
      if(line)publishFocus({sourceLine:line,origin:'note',intent:'click'});
    }});
  const virtualQuery=createVirtualAGQuery(grid,'note');
  function refresh(){
    if(disposed)return;
    const source=getMarkdown();
    if(source!==lastSource){
      try{
        rows=scanNotePairs(source,template);
        grid.setGridOption('rowData',rows);
        lastSource=source;
      }catch(error){
        onStatus('注释扫描失败：'+error.message);return;
      }
    }
    if(lastQuery){
      const {enabled=false,chapterLabel=()=>''}=lastQuery;
      virtualQuery.setVirtualQuery({enabled,chapterLabel,
        keys:scope.mode==='chapter'?new Set(currentRows().map(x=>x.from)):null});
    }
    report();
  }
  const templateDialog=document.createElement('dialog');
  templateDialog.className='ocr-note-template-dialog';
  templateDialog.setAttribute('aria-label','注释对正则配对模板');
  const header=document.createElement('h2');header.textContent='注释引用 ↔ 注释正文 · 正则模板';
  const explanation=document.createElement('p');
  explanation.textContent='使用 JavaScript 正则表达式（gm），两边必须有命名捕获组 (?<id>...)。正文可用 (?<content>...) 获取内容。模板仅保存在当前浏览器；应用只更新 AG 识别结果，不改写 CMB。';
  const refLabel=document.createElement('label');refLabel.textContent='注释引用正则';
  const refField=document.createElement('textarea');refField.id='note-reference-regex';refField.rows=3;
  const bodyLabel=document.createElement('label');bodyLabel.textContent='注释正文正则';
  const bodyField=document.createElement('textarea');bodyField.id='note-body-regex';bodyField.rows=3;
  const feedback=document.createElement('div');feedback.className='ocr-note-template-feedback';
  feedback.setAttribute('role','status');
  const actions=document.createElement('div');actions.className='ocr-note-template-actions';
  const reset=document.createElement('button');reset.type='button';reset.textContent='恢复默认';
  const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';
  const apply=document.createElement('button');apply.type='button';apply.className='primary';
  apply.textContent='应用模板';
  actions.append(reset,cancel,apply);
  templateDialog.append(header,explanation,refLabel,refField,bodyLabel,bodyField,feedback,actions);
  document.body.append(templateDialog);
  reset.addEventListener('click',()=>{
    refField.value=DEFAULT_NOTE_TEMPLATE.reference;
    bodyField.value=DEFAULT_NOTE_TEMPLATE.body;feedback.textContent='';
  });
  cancel.addEventListener('click',()=>templateDialog.close());
  apply.addEventListener('click',()=>{
    try{
      const next=validateNoteTemplate({reference:refField.value,body:bodyField.value});
      const matches=scanNotePairs(getMarkdown(),next);
      template=next;lastSource=null;
      localStorage.setItem(NOTE_TEMPLATE_KEY,JSON.stringify(next));
      refresh();templateDialog.close();
      onStatus('✓ 已应用注释正则模板 · 发现 '+matches.length+' 项');
    }catch(error){feedback.textContent=error.message;}
  });
  const unsubscribe=viewStore.subscribe((next,prev)=>{
    if(next.documentRevision!==prev.documentRevision){
      if(!queued){queued=true;queueMicrotask(()=>{queued=false;if(active)refresh();});}
    }
    if(next.focusTarget!==prev.focusTarget)followFocus(next.focusTarget,next);
  });
  return Object.freeze({
    api:grid,
    refresh,
    openTemplates(){
      refField.value=template.reference;bodyField.value=template.body;
      feedback.textContent='';
      templateDialog.showModal();
    },
    count:chapter=>{
      if(lastSource!==getMarkdown())refresh();
      if(chapter==='all')return rows.length;
      const c=getCMD()?.getChapter(chapter);
      return c?rows.filter(row=>row.from>=c.from&&row.from<c.to).length:0;
    },
    setVirtualQuery(intent){
      lastQuery=intent;
      scope=intent?.operationScope?.mode==='chapter'
        ?{mode:'chapter',chapterId:intent.operationScope.chapterId}:{mode:'all'};
      refresh();
    },
    setActive(next){
      active=Boolean(next);host.hidden=!active;
      if(active){refresh();followFocus(viewStore.getState().focusTarget,viewStore.getState());}
    },
    dispose(){disposed=true;unsubscribe();grid.destroy();templateDialog.remove();}
  });
}
