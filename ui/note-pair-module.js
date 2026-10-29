/** Notes are a fourth AG projection; only CMD owns annotations and Save. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {viewStore,publishFocus} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {DEFAULT_NOTE_TEMPLATE,NOTE_TEMPLATE_KEY,validateNoteTemplate,
  scanNotePairs,planMarkNotePair,planConvertNotePairs} from './note-pair-scan.js';
import './note-pair-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);

const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  oddRowBackgroundColor:'#2d363c',fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});
// Existing browsers may have persisted the original shipped template. Move
// ONLY that exact default forward; do not overwrite user-edited regex rules.
const previousDefaultReference=String.raw`(?:\[\^|<sup\s*>)(?<id>[0-9]{1,3}|[A-Za-z][A-Za-z0-9_-]{0,12})(?:\]|</sup\s*>)`;
function loadTemplate(){
  try{
    const stored=validateNoteTemplate(JSON.parse(localStorage.getItem(NOTE_TEMPLATE_KEY)));
    if(stored.reference===previousDefaultReference &&
       stored.body===DEFAULT_NOTE_TEMPLATE.body){
      const upgraded={...DEFAULT_NOTE_TEMPLATE};
      localStorage.setItem(NOTE_TEMPLATE_KEY,JSON.stringify(upgraded));
      return upgraded;
    }
    return stored;
  }catch{return {...DEFAULT_NOTE_TEMPLATE};}
}
function navigateNoteRow(row){
  if(row?.line)publishFocus({sourceLine:row.line,origin:'note',intent:'click'});
}
function convertedPair(pair){
  return pair?.status==='已配对'&&pair.marked&&
    pair.reference===`[^${pair.number}]`&&
    pair.bodyRaw.startsWith(`[^${pair.number}]: `);
}
function locationCell(){
  return params=>{
    if(!params.data)return '';
    const {line,kind}=params.data;
    if(!line)return '—';
    const button=document.createElement('button');
    button.type='button';
    button.className='ocr-note-jump';
    button.textContent=String(line);
    button.title='定位'+kind+'的源码、Markdown 预览和原始 PDF';
    button.setAttribute('aria-label',kind+'第'+line+'行定位');
    for(const name of ['pointerdown','mousedown','touchstart'])
      button.addEventListener(name,e=>e.stopPropagation());
    button.addEventListener('click',event=>{
      event.stopPropagation();
      navigateNoteRow(params.data);
    });
    return button;
  };
}
// Each logical pair remains a single CMD annotation transaction. Its AG
// presentation has exactly two adjacent, independently navigable source rows.
// Repeated citations retain distinct pairs, even when they share one body.
function pairDisplayRows(pairs){
  return [...pairs].sort((a,b)=>{
    const aNum=Number(a.number),bNum=Number(b.number);
    return aNum-bNum||a.from-b.from;
  }).flatMap(pair=>[
    {id:pair.id+':reference',number:pair.number,kind:'注引',
      line:pair.referenceLine,text:pair.reference||'（未找到注引）',
      from:pair.from,status:pair.status==='已配对'
        ?convertedPair(pair)?'已转换':'待转换':pair.status,
      marked:pair.marked,pair,part:'reference'},
    {id:pair.id+':body',number:pair.number,kind:'注文',
      line:pair.bodyLine,text:pair.content||'（未找到注文）',
      from:pair.from,status:pair.status==='已配对'
        ?convertedPair(pair)?'已转换':'待转换':pair.status,
      marked:pair.marked,pair,part:'body'},
  ]);
}
const noteStatuses=Object.freeze({
  '已配对':'paired','已转换':'converted','待转换':'pending',
  '缺引用':'missing','缺正文':'missing',
  '编号冲突':'conflict','缺有效配对':'conflict',
});
function statusCell(params){
  if(!params.data)return '';
  const span=document.createElement('span');
  span.className='ocr-note-status ocr-note-status-'+
    (noteStatuses[params.value]||'unknown');
  span.textContent=params.value;
  span.title=params.data.marked?'已确认并完成 CMD 标定':params.value;
  return span;
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
    onStatus('注释对 '+scoped.length+' 项 · 已转换 '+
      scoped.filter(convertedPair).length+' · 待转换 '+
      scoped.filter(x=>x.status==='已配对'&&!convertedPair(x)).length+' · 异常 '+
      scoped.filter(x=>x.status!=='已配对').length);
  }
  function followFocus(target,state){
    if(!active||!target||target.origin==='note'||
       target.revision!==state.documentRevision)return;
    const pair=rows.find(x=>target.sourceLine===x.referenceLine||
      target.sourceLine===x.bodyLine);
    if(!pair)return;
    const part=target.sourceLine===pair.referenceLine?'reference':'body';
    const node=grid.getRowNode(pair.id+':'+part);
    if(!node)return;
    node.setSelected(true,true);
    if(node.rowIndex!=null)grid.ensureIndexVisible(node.rowIndex,'auto');
  }
  function mark(row){
    if(disposed||!row||row.status!=='已配对')return;
    try{
      const source=getMarkdown();
      const ops=planMarkNotePair(source,row);
      if(!ops.length)return;
      getCMD().editAnnotations(ops,{expectedSource:source,agScope:scope});
      refresh();
      onStatus('注释 '+row.number+' 已转换为 Obsidian 脚注并完成 CMD 标定 · 请全局保存');
    }catch(error){
      const detail=/virtual chapter boundary|chapter scope/i.test(error.message)
        ?'注引与注文跨章节，请在 AG 勾选「全部」后再转换':error.message;
      onStatus('注释标定失败：'+detail);
    }
  }
  function convertAll(){
    if(disposed)return;
    try{
      refresh();
      const source=getMarkdown();
      const plan=planConvertNotePairs(source,currentRows());
      if(!plan.operations.length){
        onStatus('注释对无待转换项目 · 已转换和异常项保持原样');
        return;
      }
      // A single guarded CMD transaction; no background save or shadow text.
      getCMD().editAnnotations(plan.operations,{expectedSource:source,agScope:scope});
      refresh();
      onStatus('✓ 已批量转换 '+plan.converted+' 对 Obsidian 脚注并标定 CMD · 请全局保存');
    }catch(error){
      const detail=/virtual chapter boundary|chapter scope/i.test(error.message)
        ?'注引与注文跨章节，请在 AG 勾选「全部」后再转换':error.message;
      onStatus('批量转换未执行：'+detail);
    }
  }
  const columns=[
    {field:'number',headerName:'注释号',width:86,minWidth:75,pinned:'left',lockPinned:true,
      valueFormatter:p=>p.data?.part==='reference'?p.value:'',
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'kind',headerName:'元素',width:76,minWidth:68,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'line',headerName:'源码行',width:90,minWidth:82,
      cellRenderer:locationCell()},
    {field:'text',headerName:'原文',minWidth:220,flex:1.8,
      tooltipField:'text',
      cellClass:p=>p.data?.line?'ocr-note-row-text':'ocr-note-row-missing'},
    {field:'status',headerName:'配对/转换状态',width:124,minWidth:118,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,
      cellRenderer:statusCell},
    {colId:'mark',headerName:'CMD 标定',width:92,minWidth:88,
      cellRenderer:p=>{
        if(!p.data||p.data.part!=='reference')return '';
        const button=document.createElement('button');
        button.className='ocr-note-mark';button.type='button';
        const pair=p.data.pair;
        const converted=convertedPair(pair);
        button.textContent=p.data.marked&&converted?'已转换': '转换标定';
        button.disabled=converted||pair.status!=='已配对';
        button.title=button.disabled?'只能处理明确的一对一注释':'一次性转换 Obsidian 脚注并写入 CMD 注释标签（不自动保存）';
        for(const name of ['pointerdown','mousedown','touchstart'])
          button.addEventListener(name,e=>e.stopPropagation());
        button.addEventListener('click',event=>{event.stopPropagation();mark(p.node.data.pair);});
        return button;
      }},
  ].map(c=>({resizable:true,sortable:false,suppressMovable:true,...c}));
  grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:34,
    getRowClass:p=>p.data?.part==='reference'?'ocr-note-pair-first':'ocr-note-pair-second',
    getRowId:p=>p.data.id,
    rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:e=>navigateNoteRow(e.data)});
  const virtualQuery=createVirtualAGQuery(grid,'note');
  function refresh(){
    if(disposed)return;
    const source=getMarkdown();
    if(source!==lastSource){
      try{
        rows=scanNotePairs(source,template);
        grid.setGridOption('rowData',pairDisplayRows(rows));
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
    convertAll,
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
