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
  const control=document.createElement('div');control.className='ocr-text-block-control';
  const blocksButton=document.createElement('button');blocksButton.type='button';blocksButton.textContent='原始文本块';
  blocksButton.setAttribute('aria-label','查看原始文本块清单');
  const candidatesButton=document.createElement('button');candidatesButton.type='button';candidatesButton.textContent='接续候选';
  candidatesButton.setAttribute('aria-label','查看跨页跨栏接续候选');
  control.append(blocksButton,candidatesButton);
  const state=document.createElement('div');state.className='ocr-text-block-state';state.setAttribute('role','status');
  const gridHost=document.createElement('div');gridHost.className='ocr-text-block-grid';host.append(guide,control,state,gridHost);
  let rows=[],candidates=[],candidateSummary=null,mode='blocks',report=null,scope=null,active=false,disposed=false,error='',selectedId=null,previewMapped=null;
  const navigate=(row,end='from')=>{
    if(!row)return;
    const id=mode==='candidates'?(end==='to'?row.toId:row.fromId):row.id;
    const target=rows.find(x=>x.id===id);
    if(!target)return;
    selectedId=id;
    if(target.sourceLine){publishFocus({sourceLine:target.sourceLine+2,origin:'text-block',intent:'click',elementId:id});}
    else onLocateMissing({pageIndex:target.pageIndex,blockIndex:target.blockIndex});
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
  const linkCell=(field,end)=>p=>{
    if(!p.data)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-text-block-jump';
    button.textContent=p.data[field];button.title=`定位${end==='to'?'接续':'来源'}文本块`;
    for(const type of ['pointerdown','mousedown','touchstart'])button.addEventListener(type,e=>e.stopPropagation());
    button.addEventListener('click',event=>{event.stopPropagation();navigate(p.data,end);});
    return button;
  };
  const candidateColumns=[
    {field:'kind',headerName:'接续类型',width:93,minWidth:85,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'band',headerName:'线索',width:75,minWidth:68,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'fromId',headerName:'来源块',width:106,minWidth:92,cellRenderer:linkCell('fromId','from')},
    {field:'toId',headerName:'目标块',width:106,minWidth:92,cellRenderer:linkCell('toId','to')},
    {field:'fromTail',headerName:'源块末尾',flex:1,minWidth:210,tooltipField:'fromTail'},
    {field:'toHead',headerName:'目标块开头',flex:1,minWidth:210,tooltipField:'toHead'},
    {field:'reason',headerName:'判断证据',flex:1,minWidth:230,tooltipField:'reason'},
    {field:'status',headerName:'状态',width:92,minWidth:80},
  ].map(col=>({sortable:false,resizable:true,suppressMovable:true,...col}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowId:p=>p.data.id,rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:p=>navigate(p.data)});
  const virtual=createVirtualAGQuery(grid,'text-block');
  const unsubscribe=viewStore.subscribe((next,previous)=>{
    if(!active||disposed||next.focusTarget===previous.focusTarget)return;
    const focus=next.focusTarget;if(!focus)return;
    if(mode==='candidates')return;
    const id=focus.elementId?.startsWith('mineru:')?
      `p${focus.elementId.split(':')[1]}b${focus.elementId.split(':')[2]}`:
      rows.filter(r=>r.sourceLine&&r.sourceLine<=focus.sourceLine).at(-1)?.id;
    if(!id||id===selectedId)return;
    const node=grid.getRowNode(id);
    if(node?.rowIndex===null){grid.setFilterModel(null);grid.onFilterChanged();}
    if(node&&node.rowIndex!==null){node.setSelected(true,true,'api');grid.ensureNodeVisible(node,'middle');selectedId=id;}
  });
  const scoped=()=>{
    const set=mode==='candidates'?candidates:rows;
    if(scope?.operationScope?.mode!=='chapter')return set;
    const bounds=getChapter(scope.operationScope.chapterId);
    return bounds?set.filter(r=>r.from!==null&&r.from>=bounds.from&&r.from<bounds.to):[];
  };
  const updateGrid=()=>{
    // The virtual-chapter adapter caches its projected columnDefs. Reset
    // before switching AG schemas, or it restores the old block columns.
    virtual.setVirtualQuery({enabled:false});
    blocksButton.setAttribute('aria-pressed',String(mode==='blocks'));
    candidatesButton.setAttribute('aria-pressed',String(mode==='candidates'));
    grid.setGridOption('columnDefs',mode==='candidates'?candidateColumns:columns);
    grid.setGridOption('rowData',mode==='candidates'?candidates:rows);
    // Mode-specific filters cannot leak between unrelated AG schemas.
    grid.setFilterModel(null);
    refresh();
  };
  blocksButton.addEventListener('click',()=>{if(mode!=='blocks'){mode='blocks';updateGrid();}});
  candidatesButton.addEventListener('click',()=>{if(mode!=='candidates'){mode='candidates';updateGrid();}});
  const refresh=()=>{
    const list=scoped();
    if(scope)virtual.setVirtualQuery({...scope,keys:scope.operationScope?.mode==='chapter'?new Set(list.map(r=>r.from)):null});
    state.textContent=error?'文本块检查失败：'+error:!report?'正在读取 CMD 内嵌的原始 JSON…':
      mode==='candidates'?(candidateSummary?
        `只读候选 ${candidateSummary.candidates} 组 · 跨栏 ${candidateSummary.acrossColumn} · 跨页 ${candidateSummary.acrossPage} · 高线索 ${candidateSummary.high} · 中 ${candidateSummary.medium} · 低 ${candidateSummary.low} · ${candidateSummary.doublePages} 页识别双栏 · ${candidateSummary.blockedTransitions} 处结构阻断 · 全部待审阅（非自动合并）`:
        '跨页跨栏候选扫描中…'):
      `原始 ${report.blocks} 块 / ${report.pages} 页 · 源码已匹配 ${report.matched} · 缺失 ${report.missing} · 重复 ${report.duplicates} · PDF bbox ${report.withGeometry} · 无效 ${report.withoutGeometry}`+
      ` · 可见正文 ${report.readable} · 空块/仅元数据 ${report.metadataOnly}`+
      (previewMapped?` · 当前 MD 定位 ${list.filter(x=>x.expectsPreview&&previewMapped.has(x.id)).length}/${list.filter(x=>x.expectsPreview).length}`:' · MD 定位检查中')+
      ` · 未知锚点 ${report.unknown}`+
      (scope?.operationScope?.mode==='chapter'?` · 当前章节 ${list.length} 块（缺失块仍计入全文）`:'');
    if(active&&report)onStatus(mode==='candidates'?`CMD 接续候选 ${candidateSummary?.candidates??0} · 待审阅`:`CMD 文本块 ${report.matched}/${report.blocks} · 缺失 ${report.missing}`);
  };
  updateGrid();
  return Object.freeze({
    setLoading(){error='';report=null;candidateSummary=null;state.textContent='读取 CMD 无损封存数据中…';},
    setError(e){error=String(e);refresh();},
    setInventory(result){report=result.summary;previewMapped=null;rows=result.rows.map(row=>({...row,
      geometryLabel:row.geometry?'可定位':'无效',
      previewLabel:row.expectsPreview?'待检查':'无需渲染'}));selectedId=null;
      if(mode==='blocks')grid.setGridOption('rowData',rows);error='';refresh();},
    setContinuationCandidates(result){candidateSummary=result.summary;
      candidates=result.candidates.map(row=>({...row,
        from:rows.find(block=>block.id===row.fromId)?.from??null,
        reason:row.evidence.join('；')}));
      if(mode==='candidates')grid.setGridOption('rowData',candidates);refresh();},
    getBlocks(){return rows.map(({id,sourceLine,expectsPreview})=>({id,sourceLine,expectsPreview}));},
    setPreviewCoverage(ids){
      previewMapped=new Set(ids);
      for(const row of rows)row.previewLabel=!row.expectsPreview?'无需渲染':previewMapped.has(row.id)?'可定位':'未映射';
      if(mode==='blocks')grid.refreshCells({force:true});refresh();
    },
    setVirtualQuery(intent){scope=intent;refresh();},
    count(chapter){if(chapter==='all')return rows.length;const c=getChapter(chapter);
      return c?rows.filter(r=>r.from!==null&&r.from>=c.from&&r.from<c.to).length:0;},
    setActive(value){active=Boolean(value);host.hidden=!active;if(active)refresh();},
    dispose(){disposed=true;unsubscribe();grid.destroy();},
  });
}
