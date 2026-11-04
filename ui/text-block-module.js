/** AG text-block inventory: complete CMD-owned PBS/BC view and semantic action intents. */
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {publishFocus,viewStore} from './view-store.js';
import {createVirtualAGQuery} from './virtual-ag-query.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {TEXT_BLOCKS_READ_ONLY} from './text-block-readonly.js';
import {textBlockPageFilterModel,sortTextBlockPBSRows} from './text-block-page-scope.js';
import {resolveCMDBlockFocusRow} from './cmd-block-chains.js';
import './text-block-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#e9ab52',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
  selectedRowBackgroundColor:'rgba(225,161,66,.15)',fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
export function createTextBlockModule(host,getChapter,onStatus=()=>{},onLocateMissing=()=>{},onCompare=()=>{},actionsHost,onMarkSubblocks=()=>Promise.reject(Error('CMD 尚未准备好')),onChainAction=()=>Promise.reject(Error('CMD 块链操作不可用')),onSummary=()=>{}){
  host.classList.add('ocr-text-block-pane');
  if(!(actionsHost instanceof HTMLElement)||actionsHost.dataset.module!=='text-block')
    throw Error('文本块模块功能需挂载至现有 AG 功能菜单');
  // Reparent the ORIGINAL controls into the Shell-owned module action group.
  // No second toolbar or status row is created inside the AG pane.
  const subblocksButton=document.createElement('button');
  subblocksButton.type='button';subblocksButton.textContent='标定原始子块';
  subblocksButton.title='只添加 MinerU blocks[] 原始父子路径标签；不重写正文，一次 Undo 可撤销';
  subblocksButton.addEventListener('click',async()=>{
    if(subblocksButton.disabled)return;
    subblocksButton.disabled=true;
    try{
      const result=await onMarkSubblocks();
      onStatus(result.changed?`已标定 ${result.inserted} 个原始子块 · CMD 未保存，可 Undo`:
        `原始子块已完整标定（${result.existing} 个），无须重复修改`);
    }catch(error){onStatus('原始子块标定失败：'+error.message);}
    finally{subblocksButton.disabled=false;}
  });
  const blocksButton=document.createElement('button');blocksButton.type='button';blocksButton.textContent='原始文本块';
  blocksButton.setAttribute('aria-label','查看原始文本块清单');
  const groupButton=document.createElement('button');groupButton.type='button';groupButton.textContent='按块链分组';
  groupButton.setAttribute('aria-label','切换文本块链分组展示');
  const targetButton=document.createElement('button');targetButton.type='button';targetButton.textContent='设为合并目标';
  targetButton.setAttribute('aria-label','将当前 PBS 设为目标链');
  const mergeButton=document.createElement('button');mergeButton.type='button';mergeButton.textContent='并入目标链';
  mergeButton.setAttribute('aria-label','把当前 PBS 所在块链并入目标链');
  const splitButton=document.createElement('button');splitButton.type='button';splitButton.textContent='从此拆链';
  splitButton.setAttribute('aria-label','在当前 PBS 之前拆分块链');
  const moveAfterButton=document.createElement('button');moveAfterButton.type='button';moveAfterButton.textContent='移动至目标后';
  moveAfterButton.setAttribute('aria-label','仅将所选 PBS 移至目标块后');
  const firstButton=document.createElement('button');firstButton.type='button';firstButton.textContent='移动至链首';
  firstButton.setAttribute('aria-label','仅将所选 PBS 移至当前块链最前');
  const extractButton=document.createElement('button');extractButton.type='button';extractButton.textContent='独立成链';
  extractButton.setAttribute('aria-label','将所选 PBS 独立成单块链');
  const bboxButton=document.createElement('button');bboxButton.type='button';bboxButton.textContent='应用框坐标';
  bboxButton.setAttribute('aria-label','应用选中 PBS 的 PDF 覆盖框四坐标');
  const bboxReset=document.createElement('button');bboxReset.type='button';bboxReset.textContent='恢复原框';
  bboxReset.setAttribute('aria-label','清除所选 PBS 的人工 PDF 框修正');
  const bboxEditor=document.createElement('div');bboxEditor.className='ocr-pbs-bbox-editor';
  bboxEditor.setAttribute('aria-label','PDF 覆盖框坐标 x0 y0 x1 y1');
  const bboxInputs=['x0','y0','x1','y1'].map(key=>{
    const label=document.createElement('label');label.textContent=key;
    const input=document.createElement('input');input.type='number';input.step='any';
    input.setAttribute('aria-label',`PDF bbox ${key}`);label.append(input);bboxEditor.append(label);return input;
  });
  const migrateButton=document.createElement('button');migrateButton.type='button';migrateButton.textContent='迁移旧标签';
  migrateButton.setAttribute('aria-label','显式迁移旧版 MinerU 块链标签');
  const candidatesButton=document.createElement('button');candidatesButton.type='button';candidatesButton.textContent='接续候选';
  candidatesButton.setAttribute('aria-label','查看跨页跨栏接续候选');
  const confirmButton=document.createElement('button');confirmButton.type='button';confirmButton.textContent='确认续接';
  confirmButton.setAttribute('aria-label','确认所选文本块续接');
  const rejectButton=document.createElement('button');rejectButton.type='button';rejectButton.textContent='否决续接';
  rejectButton.setAttribute('aria-label','否决所选文本块续接');
  const resetButton=document.createElement('button');resetButton.type='button';resetButton.textContent='待审阅';
  resetButton.setAttribute('aria-label','将所选文本块恢复待审阅');
  const overviewButton=document.createElement('button');overviewButton.type='button';overviewButton.textContent='双框概览';
  overviewButton.setAttribute('aria-label','同页 PDF 双框概览');
  overviewButton.title='缩小同页 PDF，尽量同时看到 A、B；跨页可点击 A/B 分别定位';
  const exportButton=document.createElement('button');exportButton.type='button';exportButton.textContent='导出审阅记录';
  exportButton.setAttribute('aria-label','导出文本块续接审阅 JSON');
  // 06b2901 read-only marking surface: keep inventory, grouping, and A/B
  // lookup. No edit control is mounted into Shell's action menu.
  actionsHost.append(blocksButton,groupButton,candidatesButton,overviewButton);
  overviewButton.addEventListener('click',()=>onCompare({overview:true}));
  const gridHost=document.createElement('div');gridHost.className='ocr-text-block-grid';host.append(gridHost);
  let rows=[],tableRows=[],absorbedRoots=new Set(),grouped=false,collapsedChains=new Set(),targetId=null,dragBusy=false,candidates=[],candidateSummary=null,mode='blocks',report=null,scope=null,active=false,disposed=false,error='',selectedId=null,previewMapped=null;
  let selectedCandidateId=null,documentSha=null,reviews=new Map();
  let currentPDFPage=1,showAllPages=false;
  const storageKey=sha=>`ocr2md:continuation-review:v1:${sha}`;
  const restore=sha=>{
    try{
      const record=JSON.parse(localStorage.getItem(storageKey(sha))||'null');
      if(record?.sourceSha!==sha||record.schemaVersion!==1)return new Map();
      return new Map(Object.entries(record.decisions||{}).filter(([id,value])=>
        /^p\d+b\d+--p\d+b\d+$/.test(id)&&['已确认','已否决'].includes(value)));
    }catch{return new Map();}
  };
  const persist=()=>{
    if(!documentSha)return;
    try{localStorage.setItem(storageKey(documentSha),JSON.stringify({schemaVersion:1,sourceSha:documentSha,
      decisions:Object.fromEntries(reviews)}));}
    catch{onStatus('审阅状态仅保留在当前页面，请导出 JSON 备份');}
  };
  const selectedCandidate=()=>candidates.find(x=>x.id===selectedCandidateId)||null;
  const chooseCandidate=(row,reveal='from')=>{
    if(!row)return;
    selectedCandidateId=row.id;
    grid.getRowNode(row.id)?.setSelected(true,true,'api');
    refresh();
    onCompare({from:{pageIndex:row.fromPage-1,blockIndex:row.fromBlockIndex},
      to:{pageIndex:row.toPage-1,blockIndex:row.toBlockIndex},reveal});
  };
  const setReview=value=>{
    const row=selectedCandidate();if(!row)return;
    if(value==='待审阅')reviews.delete(row.id);else reviews.set(row.id,value);
    persist();row.status=value;
    grid.refreshCells({force:true});refresh();
  };
  confirmButton.addEventListener('click',()=>setReview('已确认'));
  rejectButton.addEventListener('click',()=>setReview('已否决'));
  resetButton.addEventListener('click',()=>setReview('待审阅'));
  exportButton.addEventListener('click',()=>{
    if(!candidateSummary||!documentSha)return;
    const payload={schemaVersion:1,kind:'ocr2md-continuation-review',
      sourceSha:documentSha,reviewedAt:new Date().toISOString(),
      note:'人工审阅意见，不改变 CMD Block，不代表原始 OCR 关系已合并',
      summary:{...candidateSummary,confirmed:candidates.filter(c=>c.status==='已确认').length,
        rejected:candidates.filter(c=>c.status==='已否决').length},
      records:candidates.map(({id,kind,fromId,toId,fromPage,toPage,fromBbox,toBbox,status,evidence})=>
        ({id,kind,fromId,toId,fromPage,toPage,fromBbox,toBbox,status,evidence}))};
    const object=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)+'\n'],{type:'application/json'}));
    const link=document.createElement('a');link.href=object;link.download=`ocr2md-continuation-review-${documentSha.slice(0,12)}.json`;
    host.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(object),1500);
  });
  const navigate=(row,end='from')=>{
    if(!row)return;
    if(row.isChainHeader){if(collapsedChains.has(row.chainId))collapsedChains.delete(row.chainId);else collapsedChains.add(row.chainId);updateBlockRows();return;}
    if(mode==='candidates')chooseCandidate(row,end);
    const id=mode==='candidates'?(end==='to'?row.toId:row.fromId):row.id;
    const target=tableRows.find(x=>x.id===id)||rows.find(x=>x.id===id);
    if(!target)return;
    // The per-row 源码行 jump button stops AG's row click to preserve
    // pointer gestures, so explicitly select the SAME logical PBS row here.
    // Otherwise source/PDF update while AG remains on the preceding block.
    const rowNode=grid.getRowNode(id);
    if(rowNode&&rowNode.rowIndex!==null&&!rowNode.isSelected())
      rowNode.setSelected(true,true,'api');
    selectedId=id;refreshActionButtons();
    syncBBoxFields();
    if(target.sourceLine){publishFocus({sourceLine:target.contentLine??target.sourceLine,
      origin:'text-block',intent:'click',elementId:id});}
    else onLocateMissing({pageIndex:target.pageIndex,blockIndex:target.blockIndex});
  };
  const jump=p=>{
    if(!p.data||p.data.isChainHeader)return '';
    const button=document.createElement('button');button.type='button';button.className='ocr-text-block-jump';
    button.textContent=p.data.sourceLine??'PDF';button.title=p.data.sourceLine?'定位源码及 PDF':'源码锚点缺失，仅定位 PDF';
    for(const e of ['pointerdown','mousedown','touchstart'])button.addEventListener(e,x=>x.stopPropagation());
    button.addEventListener('click',e=>{e.stopPropagation();navigate(p.data);});return button;
  };
  // Pointer-based drag handle is within the AG owner's grid. It works for
  // mouse, stylus and iPad pointer-touch, without HTML5 drag ghosts, global
  // source movement, or reaching into CM6/PDF internals.
  let drag=null;
  const dropAt=(x,y)=>{
    const element=document.elementFromPoint(x,y);
    const row=element?.closest?.('[row-id]');
    if(!row||!gridHost.contains(row))return null;
    const data=grid.getRowNode(row.getAttribute('row-id'))?.data;
    if(!data)return null;
    const targetId=data.isChainHeader?data.chainMembers?.at(-1):data.id;
    const atom=tableRows.find(item=>item.id===targetId);
    return atom?.format==='cmd-v1'?{targetId,row}:null;
  };
  const clearHover=()=>{
    if(drag?.hover)drag.hover.classList.remove('ocr-pbs-drop-target');
    if(drag)drag.hover=null;
  };
  const handleDrag=p=>{
    const atom=p.data;
    if(!atom||atom.isChainHeader||atom.format!=='cmd-v1'||mode!=='blocks'||report?.invalidBCMarks)return '';
    const handle=document.createElement('button');handle.type='button';
    handle.className='ocr-pbs-drag-handle';handle.dataset.pbsDragHandle=atom.id;
    handle.setAttribute('aria-label',`拖动 ${atom.id} 调整块链成员`);
    handle.title=`拖动 ${atom.id} 到目标块后（只移动这一块）`;
    handle.textContent='⠿';
    handle.addEventListener('click',event=>event.stopPropagation());
    handle.addEventListener('pointerdown',event=>{
      if(drag||dragBusy||!active||mode!=='blocks'||
        event.pointerType==='mouse'&&event.button!==0)return;
      event.preventDefault();event.stopPropagation();
      drag={id:atom.id,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
        moved:false,hover:null};
      selectedId=atom.id;refreshActionButtons();
      try{handle.setPointerCapture(event.pointerId);}catch{}
    });
    handle.addEventListener('pointermove',event=>{
      if(!drag||drag.id!==atom.id||event.pointerId!==drag.pointerId)return;
      const moved=Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY);
      if(moved<8&&!drag.moved)return;
      drag.moved=true;event.preventDefault();
      clearHover();const target=dropAt(event.clientX,event.clientY);
      if(target&&target.targetId!==drag.id){drag.hover=target.row;
        target.row.classList.add('ocr-pbs-drop-target');}
    });
    const stop=event=>{
      if(!drag||drag.id!==atom.id||event.pointerId!==drag.pointerId)return;
      const activeDrag=drag;
      const target=event.type==='pointerup'&&activeDrag.moved?
        dropAt(event.clientX,event.clientY):null;
      clearHover();drag=null;
      try{if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);}catch{}
      if(target&&target.targetId!==activeDrag.id){
        const source=tableRows.find(atom=>atom.id===activeDrag.id);
        const destination=tableRows.find(atom=>atom.id===target.targetId);
        if(source?.kind==='parent'&&destination?.kind==='child')
          void execute('reparent',{memberId:activeDrag.id,targetId:target.targetId});
        else void execute('move',{memberId:activeDrag.id,targetId:target.targetId,placement:'after'});
      }
      event.preventDefault();event.stopPropagation();
    };
    handle.addEventListener('pointerup',stop);
    handle.addEventListener('pointercancel',stop);
    handle.addEventListener('lostpointercapture',()=>{
      if(drag?.id===atom.id){clearHover();drag=null;}
    });
    return handle;
  };
  const columns=[
    {field:'pdfPage',headerName:'页码',width:82,minWidth:70,pinned:'left',lockPinned:true,
      filter:EnumCheckboxFilter,suppressHeaderMenuButton:true,cellDataType:false},
    {field:'sourceLine',headerName:'源码行',width:82,minWidth:75,pinned:'left',lockPinned:true,cellRenderer:jump},
    {field:'id',headerName:'PBS / BC',width:155,minWidth:128,cellRenderer:p=>{
      if(!p.data?.isChainHeader){
        if(p.data?.origin&&p.data.origin!==p.value){
          const label=document.createElement('span');label.textContent=p.value;
          label.title=`新 PBS ${p.value} · 原始 OCR ${p.data.origin}`;
          return label;
        }
        return p.value;
      }
      const button=document.createElement('button');button.className='ocr-text-block-group';
      button.textContent=`${collapsedChains.has(p.data.chainId)?'▸':'▾'} ${p.data.chainId}`;
      button.setAttribute('aria-label',`展开或收起 ${p.data.chainId}`);
      button.addEventListener('click',e=>{e.stopPropagation();navigate(p.data);});return button;
    }},
    {field:'type',headerName:'类型',width:134,minWidth:100,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
    {field:'text',headerName:'源码',flex:1,minWidth:240,tooltipField:'text'},
    {field:'kind',headerName:'层级',width:85,minWidth:75,valueFormatter:p=>
      p.data?.isChainHeader?'块链':p.value==='child'?`子块 ${p.data.depth}`:'父块'},
    {field:'parentId',headerName:'所属父块',width:112,minWidth:95},
    {field:'chainLabel',headerName:'块链 BC',width:120,minWidth:105},
    {field:'chainPosition',headerName:'链序',width:74,minWidth:66},
    {field:'chainSize',headerName:'链成员',width:79,minWidth:70},
    {field:'chainPrev',headerName:'链前驱',width:105,minWidth:90},
    {field:'chainType',headerName:'对象类型',width:100,minWidth:85},
    {field:'chainRole',headerName:'成员角色',width:97,minWidth:85},
    {field:'review',headerName:'审阅',width:90,minWidth:80},
    {field:'note',headerName:'审阅备注',width:145,minWidth:100,tooltipField:'note'},
    {field:'originalText',headerName:'原始 OCR 摘要',width:220,minWidth:150,tooltipField:'originalText'},
    {field:'bboxText',headerName:'有效覆盖 bbox',width:180,minWidth:140},
    {field:'ocrBBoxText',headerName:'OCR 原始 bbox',width:180,minWidth:140},
    {field:'bboxSource',headerName:'覆盖来源',width:104,minWidth:94},
    {field:'ocrRole',headerName:'OCR 推定角色',width:110,minWidth:90},
    {field:'format',headerName:'标签格式',width:96,minWidth:82},
    {field:'joinLabel',headerName:'逻辑接续',width:125,minWidth:108},
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
    {field:'status',headerName:'人工审阅',width:100,minWidth:92,filter:EnumCheckboxFilter,suppressHeaderMenuButton:true},
  ].map(col=>({sortable:false,resizable:true,suppressMovable:true,...col}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowData:[],rowHeight:32,
    getRowId:p=>p.data.id,rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    isRowSelectable:p=>!p.data?.isChainHeader,
    onRowClicked:p=>navigate(p.data)});
  const virtual=createVirtualAGQuery(grid,'text-block');
  const unsubscribe=viewStore.subscribe((next,previous)=>{
    if(!active||disposed||next.focusTarget===previous.focusTarget)return;
    const focus=next.focusTarget;if(!focus)return;
    if(mode==='candidates')return;
    const target=resolveCMDBlockFocusRow(tableRows,focus);
    const id=target?.id;
    if(!id||id===selectedId)return;
    let node=grid.getRowNode(id);
    if(grouped&&!node&&tableRows.some(r=>r.id===id)){collapsedChains.delete(tableRows.find(r=>r.id===id).chainId);updateBlockRows();node=grid.getRowNode(id);}
    if(node?.rowIndex===null&&target?.pdfPage){
      // A source/PDF focus changes only the page column's visible selection,
      // not the user's unrelated AG filters or the full underlying row set.
      grid.setFilterModel(textBlockPageFilterModel(grid.getFilterModel(),target.pdfPage));
      node=grid.getRowNode(id);
    }
    if(node&&node.rowIndex!==null){node.setSelected(true,true,'api');grid.ensureNodeVisible(node,'middle');selectedId=id;}
  });
  const scoped=()=>{
    const set=mode==='candidates'?candidates:tableRows;
    const bounds=scope?.operationScope?.mode==='chapter'?getChapter(scope.operationScope.chapterId):null;
    const inChapter=scope?.operationScope?.mode!=='chapter'?set:
      bounds?set.filter(r=>r.from!==null&&r.from>=bounds.from&&r.from<bounds.to):[];
    // PDF navigation affects ONLY the text-block AG view. Every original
    // parent/child CMD atom remains in tableRows for PDF overlay and Undo.
    // The grid must own EVERY page's row data. A pre-filtered rowData only
    // exposed the current page to the header popup and made manual selection
    // of another page impossible. The page column filter owns visibility.
    return inChapter;
  };
  const projectedRows=()=>{
    // Structural correction is a logical view over immutable original OCR.
    // AG always shows current PBS numeric order, not historical OCR/CM6
    // source-line order. A new source may be canonical, but an older reviewed
    // document might still contain legacy semantic-order children.
    // Sorting is view-only: never mutate source, origin=, or PDF bbox.
    const atoms=sortTextBlockPBSRows(scoped());
    const aliased=atoms.filter(a=>a.kind==='child'&&a.origin&&a.origin!==a.id)
      .sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
    for(const alias of aliased){
      const match=/^(p\d+b\d+s)(\d+)$/.exec(alias.id);
      if(!match)continue;
      const previous=match[1]+(Number(match[2])-1);
      const index=atoms.findIndex(a=>a.id===alias.id);
      const sibling=atoms.findIndex(a=>a.id===previous);
      if(index<0||sibling<0)continue;
      atoms.splice(index,1);
      const dest=atoms.findIndex(a=>a.id===previous);
      atoms.splice(dest+1,0,alias);
    }
    const membership=new Map(),ordered=[];
    for(const atom of atoms){
      const key=atom.chainId||`unmarked:${atom.id}`;
      if(!membership.has(key)){membership.set(key,[]);ordered.push(key);}
      membership.get(key).push(atom);
    }
    const result=[];
    for(const key of ordered){
      const members=membership.get(key);
      if(!grouped){result.push(...[...members].sort((a,b)=>(a.chainPosition??1)-(b.chainPosition??1)));continue;}
      if(members.length===1&&members[0].chainSize<=1){result.push(members[0]);continue;}
      const sortedMembers=[...members].sort((a,b)=>(a.chainPosition??1)-(b.chainPosition??1));
      const first=sortedMembers[0];
      result.push({id:`group:${key}`,isChainHeader:true,kind:'chain',chainId:key,
        chainLabel:first.chainLabel,chainSize:first.chainSize,chainType:first.chainType,
        sourceLine:null,from:members[0].from,
        pageIndex:first.pageIndex,pdfPage:first.pdfPage,
        chainMembers:[...first.chainMembers],
        text:`${first.chainSize} 个成员 · 当前视图 ${members.length} 个 · ${first.chainType||'未设对象类型'}`});
      if(!collapsedChains.has(key))result.push(...sortedMembers);
    }
    return result;
  };
  const updateBlockRows=()=>{if(mode==='blocks')grid.setGridOption('rowData',projectedRows());};
  // Only explicit PDF navigation or the top-level 全部 toggle resets this
  // column's selection. Choosing a different page in the popup remains in
  // effect until the PDF page actually changes again.
  const applyPageFilter=()=>{
    if(mode!=='blocks')return;
    grid.setFilterModel(textBlockPageFilterModel(grid.getFilterModel(),currentPDFPage,showAllPages));
  };
  const selectedAtom=()=>tableRows.find(r=>r.id===selectedId&&r.format==='cmd-v1')||null;
  const syncBBoxFields=()=>{
    const atom=selectedAtom();
    for(const [index,input] of bboxInputs.entries())
      input.value=atom?.bbox?.[index]===undefined?'':String(atom.bbox[index]);
  };
  const refreshActionButtons=()=>{
    const selected=selectedAtom(),invalid=Boolean(report?.invalidBCMarks);
    targetButton.disabled=!selected||invalid;
    mergeButton.disabled=!selected||invalid||!targetId||selected.chainId===tableRows.find(r=>r.id===targetId)?.chainId;
    splitButton.disabled=!selected||invalid||selected.chainPosition<=1;
    const target=tableRows.find(r=>r.id===targetId);
    moveAfterButton.disabled=!selected||invalid||!target||target.format!=='cmd-v1'||target.id===selected.id;
    firstButton.disabled=!selected||invalid||selected.chainPosition<=1;
    extractButton.disabled=!selected||invalid||selected.chainSize<=1;
    bboxButton.disabled=!selected||invalid;
    bboxReset.disabled=!selected||invalid||selected?.bboxSource!=='人工修正';
    migrateButton.disabled=invalid||!tableRows.some(r=>r.format==='legacy');
    groupButton.setAttribute('aria-pressed',String(grouped));
    targetButton.title=targetId?`目标 ${targetId}`:'先点击一个 PBS 行设为合并目标';
    mergeButton.title=targetId?`把当前 PBS 所属 BC 并入 ${targetId} 所属 BC`:'请先选定目标链';
  };
  const execute=async(kind,payload={})=>{
    if(TEXT_BLOCKS_READ_ONLY)throw Error('只读文本块不可执行 CMD 结构编辑');
    if(dragBusy)return;
    dragBusy=true;
    try{
      const result=await onChainAction(kind,payload);
      if(result.changed)onStatus(`✓ CMD ${({merge:'合链',split:'拆链',migrate:'旧标签迁移',move:'移动单个 PBS',reparent:'归入子块并重新编号',extract:'独立成链',bbox:'PDF 框修正','bbox-reset':'恢复原框'})[kind]||kind} ${result.changed} 处 · 未保存，可 Undo`);
      else onStatus('块链关系无须修改');
    }catch(e){onStatus('CMD 块链操作拒绝：'+e.message,'error');}
    finally{dragBusy=false;}
  };
  groupButton.addEventListener('click',()=>{grouped=!grouped;updateBlockRows();refreshActionButtons();});
  targetButton.addEventListener('click',()=>{if(selectedAtom()){targetId=selectedId;refreshActionButtons();onStatus(`合并目标已选择：${targetId} · 选另一块再点击「并入目标链」`);}});
  mergeButton.addEventListener('click',()=>{if(selectedAtom()&&targetId&&targetId!==selectedId)
    void execute('merge',{destinationId:targetId,sourceId:selectedId});});
  moveAfterButton.addEventListener('click',()=>{if(selectedAtom()&&targetId&&targetId!==selectedId)
    void execute('move',{memberId:selectedId,targetId,placement:'after'});});
  firstButton.addEventListener('click',()=>{
    const atom=selectedAtom();if(atom?.chainPosition>1)
      void execute('move',{memberId:atom.id,targetId:atom.chainMembers[0],placement:'before'});
  });
  extractButton.addEventListener('click',()=>{if(selectedAtom()?.chainSize>1)
    void execute('extract',{memberId:selectedId});});
  splitButton.addEventListener('click',()=>{if(selectedAtom())void execute('split',{memberId:selectedId});});
  bboxButton.addEventListener('click',()=>{
    const selected=selectedAtom();if(!selected)return;
    const bbox=bboxInputs.map(input=>input.value.trim()===''?NaN:Number(input.value));
    if(bbox.some(x=>!Number.isFinite(x))){onStatus('请输入全部四个有效 PDF 坐标','error');return;}
    void execute('bbox',{memberId:selected.id,bbox});
  });
  bboxReset.addEventListener('click',()=>{if(selectedAtom())void execute('bbox-reset',{memberId:selectedId});});
  migrateButton.addEventListener('click',()=>{if(tableRows.some(r=>r.format==='legacy'))void execute('migrate');});
  const updateGrid=()=>{
    // The virtual-chapter adapter caches its projected columnDefs. Reset
    // before switching AG schemas, or it restores the old block columns.
    virtual.setVirtualQuery({enabled:false});
    for(const button of [overviewButton,confirmButton,rejectButton,resetButton,exportButton])
      button.hidden=mode!=='candidates';
    for(const button of [groupButton,targetButton,mergeButton,moveAfterButton,firstButton,extractButton,splitButton,migrateButton,bboxEditor,bboxButton,bboxReset])
      button.hidden=mode!=='blocks';
    if(mode==='blocks'){onCompare(null);selectedCandidateId=null;}
    blocksButton.setAttribute('aria-pressed',String(mode==='blocks'));
    candidatesButton.setAttribute('aria-pressed',String(mode==='candidates'));
    grid.setGridOption('columnDefs',mode==='candidates'?candidateColumns:columns);
    grid.setGridOption('rowData',mode==='candidates'?candidates:projectedRows());
    // Mode-specific filters cannot leak between unrelated AG schemas.
    grid.setFilterModel(null);
    if(mode==='blocks')applyPageFilter();
    refresh();
  };
  blocksButton.addEventListener('click',()=>{if(mode!=='blocks'){mode='blocks';updateGrid();}});
  candidatesButton.addEventListener('click',()=>{if(mode!=='candidates'){mode='candidates';updateGrid();}});
  const refresh=()=>{
    const selected=Boolean(selectedCandidate());
    refreshActionButtons();
    for(const button of [confirmButton,rejectButton,resetButton,overviewButton])button.disabled=!selected;
    overviewButton.disabled=!selected||selectedCandidate().fromPage!==selectedCandidate().toPage;
    const list=scoped();
    if(scope)virtual.setVirtualQuery({...scope,keys:scope.operationScope?.mode==='chapter'?new Set(list.map(r=>r.from)):null});
    const pageModel=grid.getFilterModel()?.pdfPage;
    const chosenPages=Array.isArray(pageModel?.values)?pageModel.values:[];
    const pageDescription=showAllPages?'全部页':
      chosenPages.length===1&&chosenPages[0]===String(currentPDFPage)?`第 ${currentPDFPage} 页`:
      chosenPages.length?`页码 ${chosenPages.join('、')}`:'全部页';
    const pageRowCount=mode==='blocks'&&chosenPages.length?
      list.filter(row=>chosenPages.includes(String(row.pdfPage))).length:list.length;
    const summary=error?'文本块检查失败：'+error:!report?'正在读取 CMD 内嵌的原始 JSON…':
      mode==='candidates'?(candidateSummary?
        `候选 ${candidateSummary.candidates} 组 · 跨栏 ${candidateSummary.acrossColumn} · 跨页 ${candidateSummary.acrossPage} · 已确认 ${candidates.filter(x=>x.status==='已确认').length} · 已否决 ${candidates.filter(x=>x.status==='已否决').length} · 待审阅 ${candidates.filter(x=>x.status==='待审阅').length} · ${candidateSummary.blockedTransitions} 处结构阻断 · 不合并原文` :
        '跨页跨栏候选扫描中…'):
      `原始 ${report.blocks} 块 / ${report.pages} 页 · PBS ${tableRows.length}（子块 ${tableRows.filter(r=>r.kind==='child').length}） · BC ${report.bcChains??0} 链 · 源码已匹配 ${report.matched} · 缺失 ${report.missing} · 重复 ${report.duplicates} · PDF bbox ${report.withGeometry} · 无效 ${report.withoutGeometry}`+
      ` · 可见正文 ${report.readable} · 空块/仅元数据 ${report.metadataOnly} · 已接续 ${report.joined??0} · 逻辑块 ${report.logicalBlocks??report.blocks}`+
      (previewMapped?` · 当前 MD 定位 ${list.filter(x=>x.kind==='parent'&&x.expectsPreview&&previewMapped.has(x.id)).length}/${list.filter(x=>x.kind==='parent'&&x.expectsPreview).length}`:' · MD 定位检查中')+
      ` · AG ${pageDescription} ${pageRowCount} 块`+
      ` · 未知锚点 ${report.unknown}`+(report.invalidBCMarks?` · 无效 BC 标签 ${report.invalidBCMarks}`:'')+
      (scope?.operationScope?.mode==='chapter'?` · 当前章节 ${list.length} 块（缺失块仍计入全文）`:'');
    if(active)onSummary('文本块：父块「之前／作为子块／之后」，同父子块「之前／之后」可用 · 其他结构操作只读 · '+(mode==='candidates'&&selectedCandidate()?`A ${selectedCandidate().fromId} ↔ B ${selectedCandidate().toId} · `:'')+summary,error||report?.invalidBCMarks?'error':'ok');
  };
  updateGrid();
  return Object.freeze({
    setLoading(){error='';report=null;candidateSummary=null;refresh();},
    setError(e){error=String(e);refresh();},
    setInventory(result){
      if(documentSha!==result.summary.sourceSha){documentSha=result.summary.sourceSha;reviews=restore(documentSha);selectedCandidateId=null;onCompare(null);}
      report=result.summary;previewMapped=null;rows=result.rows.map(row=>({...row,
      geometryLabel:row.geometry?'可定位':'无效',
      joinLabel:row.joinPrev?`↳ ${row.logicalId}`:row.logicalId===row.id?'独立':`独立 · ${row.logicalId}`,
      previewLabel:row.expectsPreview?'待检查':'无需渲染'}));
      tableRows=(result.atoms?.rows||rows).map(row=>({...row,
        pdfPage:Number.isInteger(row.pdfPage)?row.pdfPage:row.pageIndex+1}));
      absorbedRoots=new Set((result.atoms?.absorbedParents||[]).map(row=>row.origin));
      if(selectedId&&!tableRows.some(row=>row.id===selectedId))selectedId=null;
      if(targetId&&!tableRows.some(row=>row.id===targetId))targetId=null;
      if(mode==='blocks')updateBlockRows();syncBBoxFields();error='';refresh();},
    setContinuationCandidates(result){candidateSummary=result.summary;
      candidates=result.candidates.map(row=>({...row,status:reviews.get(row.id)||'待审阅',
        from:rows.find(block=>block.id===row.fromId)?.from??null,
        reason:row.evidence.join('；')}));
      if(mode==='candidates')grid.setGridOption('rowData',candidates);
      if(selectedCandidateId&&!selectedCandidate()){selectedCandidateId=null;onCompare(null);}
      refresh();},
    getBlocks(){
      const alias=new Map(tableRows.filter(r=>r.origin&&r.origin!==r.id&&
        r.chainRole!=='body')
        .map(r=>[r.origin,r]));
      const childAlias=new Map(tableRows.filter(r=>r.kind==='child'&&
        r.chainRole!=='body'&&/^p\d+b\d+s\d+(?:\.\d+)*$/.test(r.origin))
        .map(r=>[r.origin,r.id]));
      const bodyAlias=new Map(tableRows.filter(r=>r.kind==='child'&&r.chainRole==='body')
        .map(r=>[r.origin,r.id]));
      const physical=rows.filter(row=>!absorbedRoots.has(row.id))
        .map(({id,pageIndex,blockIndex,sourceLine,expectsPreview,geometry,anchorCount,joinPrev,joinable,logicalId})=>{
        const corrected=alias.get(id);
        const nativeChildren=Object.fromEntries([...childAlias].filter(([origin])=>
          origin.startsWith(id+'s')));
        // A moved/renumbered parent is still the SAME physical PDF rectangle.
        // Raw OCR inventory can report old physical id as "missing" because
        // the current CMD line now carries a DIFFERENT logical id. Use the
        // current CMD atom's validated anchor/source line for the overlay;
        // otherwise a successful After insertion silently loses A's chip.
        return {id:corrected?.id||id,origin:id,pageIndex,blockIndex,
          sourceLine:corrected?.sourceLine??sourceLine,
          expectsPreview:corrected?.expectsPreview??expectsPreview,
          geometry:corrected?.geometry??geometry,
          anchorCount:corrected?1:anchorCount,
          joinPrev:corrected?null:joinPrev,joinable:corrected?false:joinable,
          logicalId:corrected?.id||logicalId,nativeChildren,bodyChildId:bodyAlias.get(id)||null};
      });
      // A dissolved OCR parent no longer owns a parent label. Its original
      // native child bboxes remain in the PDF, now labelled as direct children
      // of the destination logical parent. Use physical subregion geometry,
      // never fabricate a new bbox from the current logical s index.
      for(const row of tableRows)if(row.kind==='child'&&row.geometry&&
        [...absorbedRoots].some(root=>row.origin===root||row.origin.startsWith(root+'s'))){
        physical.push({id:row.id,origin:row.origin,pageIndex:row.pageIndex,
          blockIndex:row.blockIndex,sourceLine:row.sourceLine,
          expectsPreview:row.expectsPreview,geometry:true,anchorCount:1,
          joinPrev:null,joinable:false,logicalId:row.parentId,bbox:row.bbox,
          promoted:true,isChildCover:true});
      }
      // A promoted original child is now an independent logical parent.
      // Add its own PDF overlay, using the *native child bbox*, without
      // fabricating any new OCR source block in the original 224 parents.
      for(const row of tableRows)if(row.kind==='parent'&&row.origin!==row.id&&
        /^p\d+b\d+s\d+$/.test(row.origin)&&row.geometry)
        physical.push({id:row.id,origin:row.origin,pageIndex:row.pageIndex,
          blockIndex:row.blockIndex,sourceLine:row.sourceLine,expectsPreview:row.expectsPreview,
          geometry:true,anchorCount:1,joinPrev:row.joinPrev,joinable:false,
          logicalId:row.id,bbox:row.bbox,promoted:true});
      return physical;
    },
    setPreviewCoverage(ids){
      previewMapped=new Set(ids);
      for(const row of rows)row.previewLabel=!row.expectsPreview?'无需渲染':previewMapped.has(row.id)?'可定位':'未映射';
      for(const row of tableRows)if(row.kind==='parent')
        row.previewLabel=!row.expectsPreview?'无需渲染':previewMapped.has(row.id)?'可定位':'未映射';
      if(mode==='blocks')grid.refreshCells({force:true});refresh();
    },
    setVirtualQuery(intent){scope=intent;updateBlockRows();refresh();},
    setCurrentPDFPage(pageNumber){
      if(!Number.isInteger(pageNumber)||pageNumber<1||pageNumber===currentPDFPage)return;
      currentPDFPage=pageNumber;
      if(!showAllPages)applyPageFilter();
      if(active)refresh();
    },
    setShowAllPages(enabled){
      const next=Boolean(enabled);if(next===showAllPages)return;
      showAllPages=next;applyPageFilter();if(active)refresh();
    },
    count(chapter){if(chapter==='all')return rows.length;const c=getChapter(chapter);
      return c?rows.filter(r=>r.from!==null&&r.from>=c.from&&r.from<c.to).length:0;},
    setActive(value){active=Boolean(value);host.hidden=!active;if(!active)onCompare(null);if(active){updateBlockRows();refresh();}},
    dispose(){disposed=true;onCompare(null);unsubscribe();grid.destroy();actionsHost.replaceChildren();},
  });
}
