/** OCR V2 MinerU Base view: compose existing Frame public Settings/navigation/AG.
 * Core ui/frame files remain byte-identical; Vite's isolated adapter exposes
 * Frame's verified workspace and AG setRows/setColumns as narrow event ports.
 */
import {createFrameStatus} from './frame/global-status.js';
import './v2-mineru-base.css';
import {pageForLogical,logicalAtOffset} from './v2-focus-map.js';
import {filterLogicalAG} from './v2-logical-ag-filter.js';
const status=createFrameStatus(document.getElementById('status'));
const API='/labs/lab-ocr-v2/api/mineru-base/';
const SETTINGS_KEY='ocr2md.lab-ocr-v2-frame.settings.json.v1';
const NAV_PREFIX='sql:';
const valueForTable=name=>name==='mineru_base'?'sql:mineru-base':NAV_PREFIX+name;
const tableForValue=value=>value==='sql:mineru-base'?'mineru_base':value.startsWith(NAV_PREFIX)?value.slice(NAV_PREFIX.length):null;
const tableLabel=name=>name==='mineru_base'?'基础表':name==='logical_block'?'逻辑表':name;
const sourceHeaders={blockid:'BlockID',source_path:'原始文件',source_sha256:'源 SHA-256',
  page_index:'页索引',page_number:'PDF 页',block_group:'块组',page_block_index:'页内索引',
  source_json_path:'JSON 路径',block_type:'原始类型',mineru_index:'MinerU 索引',
  bbox_json:'bbox',angle:'角度',level:'层级',lines_json:'lines',
  blocks_json:'blocks',block_json:'完整原始 Block JSON',record_kind:'记录类型',
  original_bytes:'原文件归档字节'};
let bound='',pending=null,active=false,offset=0,selectedTable='mineru_base';
let lastFocus=null,unsubscribeGridClick=null,wiredGrid=null;
let logicalState=null,showAllLogical=false,visibleLogicalP=null;
const $=selector=>document.querySelector(selector);
function persistedDirectory(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY))?.settings?.['workspace.dataDirectory']?.value||'';}
  catch{return '';}
}
function report(message,kind='info'){status.publish(message,kind);}
async function request(operation,workspace,{method='GET',offset=0,table='mineru_base'}={}){
  const url=API+operation+(method==='GET'?('?'+new URLSearchParams({workspace,offset:String(offset),table})):'');
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
    ...(method==='POST'?{headers:{'Content-Type':'application/json'},
      body:JSON.stringify({workspace,confirm:'import-mineru-base'})}:{})});
  let payload=null;try{payload=await response.json();}catch{}
  if(!response.ok){const error=Error(payload?.error||'HTTP '+response.status);error.status=response.status;throw error;}
  return payload;
}
function navs(){return [...document.querySelectorAll('.ocr-source-file-select')]
    .filter(el=>el.closest('#workspace,#settings-workspace'));}
function wireNav(select){
  if(select.dataset.v2MineruWired)return;
  select.dataset.v2MineruWired='yes';
  select.addEventListener('change',()=>{
    const table=tableForValue(select.value);
    if(!table)return;
    const settingPane=Boolean(select.closest('#settings-workspace'));
    if(settingPane){
      document.dispatchEvent(new CustomEvent('v2-show-frame'));
      const workNav=$('#workspace .ocr-source-file-select');
      if(workNav){workNav.value=valueForTable(table);workNav.dispatchEvent(new Event('change',{bubbles:true}));}
      return;
    }
    selectedTable=table;
    active=true;
    offset=0;
    if(bound)void fetchPage();
  });
}
function revealPhysicalTables(tables){
  if(!Array.isArray(tables))throw Error('SQLite 未返回物理表清单');
  // The server obtains this list from sqlite_master; never infer from
  // whether a table has rows or whether a business view exists.
  for(const select of navs()){
    wireNav(select);
    let group=[...select.querySelectorAll('optgroup')].find(node=>node.label==='SQL');
    if(!group){group=document.createElement('optgroup');group.label='SQL';select.append(group);}
    const previous=select.value;
    group.replaceChildren(...tables.map(({name})=>new Option(
      `${tableLabel(name)} · ${name}`,valueForTable(name))));
    if([...select.options].some(option=>option.value===previous))select.value=previous;
  }
}
function picker(){return $('#workspace .ocr-ag-toolbar');}
function logicalControls(){
  const bar=picker();if(!bar)return null;
  let label=bar.querySelector('.v2-logical-all');
  if(!label){
    label=document.createElement('label');label.className='v2-logical-all';
    const input=document.createElement('input');input.type='checkbox';
    input.setAttribute('aria-label','全部逻辑块');
    input.addEventListener('change',()=>{
      showAllLogical=input.checked;
      if(active&&selectedTable==='logical_block'&&logicalState)renderGrid(logicalState);
    });
    label.append(input,document.createTextNode('全部'));
    bar.prepend(label);
  }
  let indicator=bar.querySelector('.v2-logical-page');
  if(!indicator){
    indicator=document.createElement('span');indicator.className='v2-logical-page';
    bar.append(indicator);
  }
  return {label,indicator};
}
function currentLogicalId(){
  if(Number.isSafeInteger(lastFocus?.logicalId))return lastFocus.logicalId;
  const source=$('#workspace #editor')?.v2SourcePort;
  const position=source?.getEditorView()?.state.selection.main.head;
  return logicalAtOffset(source?.getIntervals()||[],position)?.logicalId??null;
}
function pagingControls(){
  const bar=picker();if(!bar)return null;
  let host=bar.querySelector('.v2-base-paging');
  if(host)return host;
  host=document.createElement('div');host.className='v2-base-paging';
  const prev=document.createElement('button');prev.type='button';prev.textContent='‹';
  prev.setAttribute('aria-label','SQL 表上一页');
  const label=document.createElement('span');label.className='v2-base-count';
  const next=document.createElement('button');next.type='button';next.textContent='›';
  next.setAttribute('aria-label','SQL 表下一页');
  prev.addEventListener('click',()=>{offset=Math.max(0,offset-120);void fetchPage();});
  next.addEventListener('click',()=>{offset+=120;void fetchPage();});
  host.append(prev,label,next);bar.append(host);return host;
}
function renderGrid(state){
  const port=$('#workspace .ocr-outline-grid')?.v2BaseGridPort;
  if(!port)throw Error('AG 公共数据显示接口尚未就绪');
  if(port!==wiredGrid){
    unsubscribeGridClick?.();wiredGrid=port;
    unsubscribeGridClick=port.onRowClicked(event=>{
      if(!active||!bound||!event.data)return;
      document.dispatchEvent(new CustomEvent('v2-ag-row-click',{
        detail:{table:selectedTable,row:event.data,workspace:bound}}));
    });
  }
  const columns=state.columns.map((key,index)=>({field:key,
    headerName:key==='block_type'&&state.tableName==='logical_block'?'Block Type（当前）':sourceHeaders[key]||key,
    headerTooltip:key,tooltipField:key,resizable:true,sortable:true,
    minWidth:key==='block_json'?380:key==='source_json_path'?275:key==='source_sha256'?220:105,
    width:key==='blockid'?100:key==='block_json'?440:key==='original_bytes'?155:undefined,
    pinned:index===0?'left':undefined,
    valueFormatter:key==='original_bytes'?()=>'(存于 BlockID=0)':undefined}));
  if(state.tableName==='logical_block'){
    // PBS is the user-facing identity. Retain all nine physical fields in AG.
    columns.unshift({field:'pbs',headerName:'PBS',headerTooltip:'当前逻辑块编号',
      minWidth:125,width:135,pinned:'left',resizable:true,sortable:true});
    for(const column of columns)if(column.field==='logical_id')column.pinned=undefined;
  }
  const logical=state.tableName==='logical_block';
  const controls=logicalControls();
  let view=null;
  if(controls){
    controls.label.hidden=!logical;
    controls.indicator.hidden=!logical;
    controls.label.querySelector('input').checked=showAllLogical;
  }
  if(logical){
    view=filterLogicalAG(state.rows,currentLogicalId(),showAllLogical);
    visibleLogicalP=view.p;
    if(controls)controls.indicator.textContent=showAllLogical?
      `全部 · ${view.rows.length} 行`:`p${view.p??'?'} · ${view.rows.length} / ${state.rowCount}`;
  }else visibleLogicalP=null;
  port.setColumns(columns);
  port.setRows(logical
    ?view.rows.map(row=>({...row,pbs:`p${row.p}b${row.b}s${row.s}`}))
    :state.rows);
  if(lastFocus){
    port.focusRow(state.tableName==='logical_block'?'logical_id':'blockid',
      state.tableName==='logical_block'?lastFocus.logicalId:lastFocus.baseBlockId);
  }
  const count=Number(state.rowCount??state.blockCount??0);
  const paging=logical?picker()?.querySelector('.v2-base-paging'):pagingControls();
  if(paging){
    paging.hidden=logical;
  }
  if(paging&&!logical){
    const first=count?state.offset+1:0;
    const last=Math.min(count,state.offset+state.rows.length);
    paging.querySelector('.v2-base-count').textContent=`${tableLabel(state.tableName)} ${first}–${last} / ${count}`;
    const prev=paging.querySelector('[aria-label="SQL 表上一页"]');
    const next=paging.querySelector('[aria-label="SQL 表下一页"]');
    prev.disabled=state.offset===0;
    next.disabled=state.offset+state.rows.length>=count;
  }
  const label=tableLabel(state.tableName);
  report(logical?
    `SQL 逻辑表 · ${showAllLogical?'全部':('p'+visibleLogicalP)} · ${view.rows.length} / ${count} 行 · ${state.columns.length} 列`:
    `SQL ${label}已加载 · ${count} 行 · ${state.columns.length} 列 · BlockID 为整数`,'ok');
}
let pageRequest=0;
async function fetchPage(){
  if(!bound||!active)return;
  const generation=++pageRequest;
  try{
    const state=await request('state',bound,{offset,table:selectedTable});
    if(generation!==pageRequest)return;
    if(!state.exists)throw Error('SQLite 尚未创建，请先在全局设置验证工作目录');
    revealPhysicalTables(state.tables);
    if(state.tableName==='logical_block'){
      // Full inventory is read once. Focus/checkbox updates are client-side only.
      if(state.rows.length!==state.rowCount)throw Error('逻辑表返回了不完整的分页数据');
      logicalState=state;
    }
    renderGrid(state);
  }catch(error){if(generation===pageRequest)report('SQL 物理表读取失败：'+error.message,'error');}
}
async function ensureBase(path){
  if(!path||persistedDirectory()!==path)return;
  if(pending===path)return;
  pending=path;
  try{
    report('已验证工作目录读写 · 正在核验 MinerUJSON 和 V2 基础表…');
    let state;
    try{state=await request('state',path);}
    catch(error){
      // Existing V2 filename from a retired schema: user explicitly permits
      // replacement of that one database after verified workspace access.
      if(error.status!==409)throw error;
      state={exists:false};
    }
    if(!state.exists){
      report('正在从 MinerUJSON 重建两表 V2 SQLite（仅覆盖同名数据库）…');
      await request('import',path,{method:'POST'});
      state=await request('state',path);
    }
    if(!state.exists)throw Error('SQLite 未建立');
    if(state.logicalCount===0 && state.paraBlockCount>0){
      // An older WP00/WP02 database may have a valid immutable base but an
      // empty logical table. Complete it through the same confirmed import
      // endpoint and Frame F02 check, never by overwriting the original base.
      report('检测到旧空逻辑表 · 正在自动补全逻辑块…');
      await request('import',path,{method:'POST'});
      state=await request('state',path);
      if(state.logicalCount===0)throw Error('逻辑表自动初始化未完成');
    }
    if(persistedDirectory()!==path)return; // a later verified directory won the race
    const port=$('#workspace #editor')?.v2SourcePort;
    if(!port)throw Error('现有 CM6 源码接口未就绪');
    if(port.getWorkspace()!==path){
      // Never retain an old book's source after switching verified workspaces.
      port.clear();
      if(state.logicalCount>0){
        const snapshot=await request('markdown',path);
        if(persistedDirectory()!==path)return;
        port.load(snapshot,path);
      }
    }
    if(bound!==path){logicalState=null;showAllLogical=false;lastFocus=null;}
    bound=path;
    // PDF evidence is separate and strictly read-only; never discard live
    // CM6 edits or verified SQL because a PDF is absent or ambiguous.
    const pdfPort=$('#workspace .ocr-preview-pdf-host')?.v2PDFPort;
    if(pdfPort&&pdfPort.getState().workspace!==path){
      void (async()=>{
        try{
          const projection=await request('pdf-map',path);
          if(persistedDirectory()!==path)return;
          await pdfPort.load(path,projection);
        }catch(error){report('PDF 原文未加载：'+error.message,'warning');}
      })();
    }
    revealPhysicalTables(state.tables);
    report(`✓ V2 SQLite 就绪 · ${state.tables.length} 张物理表 / ${state.blockCount} 原始块 / ${state.logicalCount} 逻辑块 · 源码窗已加载${port.getState().dirty?' · 内存有未保存编辑':''}`,'ok');
    if(active)await fetchPage();
  }catch(error){report('V2 两表初始化失败：'+error.message,'error');}
  finally{pending=null;}
}
// CM6/Markdown/PDF focus selects the logical PBS p, not the SQL row page.
// A checked '全部' keeps every row visible while focus/highlight still follows.
document.addEventListener('v2-sync-focus',event=>{
  const row=event.detail;
  const source=$('#workspace #editor')?.v2SourcePort;
  if(!row||!bound||source?.getWorkspace()!==bound)return;
  lastFocus=row;
  if(!active)return;
  if(selectedTable==='logical_block'){
    const logical=logicalState?.rows.find(item=>item.logical_id===row.logicalId);
    if(!logical)return;
    if(logical.p!==visibleLogicalP&&!showAllLogical){
      renderGrid(logicalState);
      return;
    }
    visibleLogicalP=logical.p;
    $('#workspace .ocr-outline-grid')?.v2BaseGridPort?.focusRow('logical_id',row.logicalId);
    return;
  }
  const desired=pageForLogical(row,'mineru_base');
  if(desired===null)return;
  if(desired!==offset){offset=desired;void fetchPage();return;}
  $('#workspace .ocr-outline-grid')?.v2BaseGridPort?.focusRow(
    selectedTable==='logical_block'?'logical_id':'blockid',
    selectedTable==='logical_block'?row.logicalId:row.baseBlockId);
});
// Editing is an in-memory-only event; Frame's global Save remains Settings-only.
// Repeated verified workspace events must never reset the live CM6 history.
document.addEventListener('v2-pdf-status',event=>{
  const {text,kind}=event.detail||{};
  if(text)report(text,kind||'info');
});
document.addEventListener('v2-cm-protected-separator',()=>
  report('WP04：逻辑块之间的空行是结构边界，暂不允许跨块删除或合并','warning'));
document.addEventListener('v2-cm-session',event=>{
  const {kind,dirty,blocks}=event.detail||{};
  if(kind==='clear')lastFocus=null;
  if(kind==='edit')report(dirty?`● WP04 内存修改 · ${blocks} 逻辑块 · 尚未写入 SQL`:
    `✓ WP04 撤销至原始内容 · ${blocks} 逻辑块 · SQL 未修改`,dirty?'warning':'ok');
});
// This event is issued ONLY after the original F02 probe returned readable,
// writable and verified. Ignore unsaved directory adoptions explicitly.
document.addEventListener('v2-workspace-verified',event=>{
  const {path,uncommitted}=event.detail||{};
  if(!uncommitted&&path===persistedDirectory())void ensureBase(path);
});
// Settings' navigation is asynchronous. It is created before F02 reports
// successful startup verification; no second settings state is introduced.
// SQL remains hidden if no permitted, verified/initialized book exists.
