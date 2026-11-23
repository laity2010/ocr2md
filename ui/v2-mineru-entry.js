/** OCR V2 MinerU Base view: compose existing Frame public Settings/navigation/AG.
 * Core ui/frame files remain byte-identical; Vite's isolated adapter exposes
 * Frame's verified workspace and AG setRows/setColumns as narrow event ports.
 */
import {createFrameStatus} from './frame/global-status.js';
import './v2-mineru-base.css';
import {pageForLogical,logicalAtOffset} from './v2-focus-map.js';
import {filterLogicalAG} from './v2-logical-ag-filter.js';
// Exact, byte-identical V1 AG Grid Community IFilterComp and its original CSS.
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './ag-enum-filter-shared.css';
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
let logicalState=null,showAllLogical=false,visibleLogicalP=null,renderedSchema='';
let acknowledged=null,acknowledgedText=null,saveTimer=null,saving=false,saveBlocked=false;
let rebuilding=false;
const STRUCT_FIELDS=['parentId','logicalOrder','p','b','s'];
const textCopy=rows=>new Map(rows.map(r=>[r.logicalId,r.markdownText]));
const structureCopy=rows=>rows.map(r=>({
  logicalId:r.logicalId,parentId:r.parentId??null,
  logicalOrder:r.logicalOrder,p:r.p,b:r.b,s:r.s}));
const $=selector=>document.querySelector(selector);
function persistedDirectory(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY))?.settings?.['workspace.dataDirectory']?.value||'';}
  catch{return '';}
}
function report(message,kind='info'){status.publish(message,kind);}
async function request(operation,workspace,{method='GET',offset=0,table='mineru_base',payload=null}={}){
  const url=API+operation+(method==='GET'?('?'+new URLSearchParams({workspace,offset:String(offset),table})):'');
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
    ...(method==='POST'?{headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload??{workspace,confirm:'import-mineru-base'})}:{})});
  let result=null;try{result=await response.json();}catch{}
  if(!response.ok){const error=Error(result?.error||'HTTP '+response.status);error.status=response.status;throw error;}
  return result;
}
function navs(){return [...document.querySelectorAll('.ocr-source-file-select')]
    .filter(el=>el.closest('#workspace,#settings-workspace'));}
function wireNav(select){
  if(select.dataset.v2MineruWired)return;
  select.dataset.v2MineruWired='yes';
  // Tom Select owns only the visible navigation projection. Its optgroup
  // header is clickable; the underlying native <select> remains the same
  // authority for SQL table selection. No additional toolbar control.
  const adapter=select.ocrNavigationSelect;
  if(!adapter?.tom?.dropdown)throw Error('SQL 导航组件未就绪');
  adapter.tom.dropdown.addEventListener('click',event=>{
    const header=event.target.closest('.optgroup-header');
    // Tom Select derives numeric data-group IDs from native optgroups; the
    // displayed SQL label, not that unstable ID, is the group identity.
    if(!header?.closest('.optgroup')||header.textContent.trim()!=='SQL')return;
    event.preventDefault();
    event.stopPropagation();
    adapter.tom.close();
    openSQLActions();
  },true);
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
function sqlActionsDialog(){
  let dialog=$('#v2-sql-actions-dialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='v2-sql-actions-dialog';
  dialog.setAttribute('aria-labelledby','v2-sql-actions-title');
  const heading=document.createElement('h2');heading.id='v2-sql-actions-title';
  heading.textContent='SQL · 数据操作';
  const info=document.createElement('p');info.className='v2-sql-actions-info';
  const importBtn=document.createElement('button');importBtn.type='button';
  importBtn.className='v2-sql-action-import';importBtn.textContent='导入基础表';
  importBtn.title='使用当前工作目录的 MinerUJSON；同源已有数据保持不变';
  const rebuildBtn=document.createElement('button');rebuildBtn.type='button';
  rebuildBtn.className='v2-sql-action-rebuild';rebuildBtn.textContent='重建逻辑表';
  rebuildBtn.title='仅覆盖当前逻辑表（PBS、类型、Raw Txt），绝不改基础表';
  const warning=document.createElement('p');warning.className='v2-sql-actions-warning';
  warning.textContent='导入基础表会验证 MinerU 来源；重建逻辑表将覆盖现有逻辑块及 PBS，原始基础表、PDF 和 MinerUJSON 不变。';
  const close=document.createElement('button');close.type='button';
  close.className='v2-sql-action-close';close.textContent='取消';
  close.addEventListener('click',()=>dialog.close());
  importBtn.addEventListener('click',()=>{
    dialog.close();void importBaseFromMineru();
  });
  rebuildBtn.addEventListener('click',()=>{
    dialog.close();void rebuildLogicalOnly();
  });
  const buttons=document.createElement('div');buttons.className='v2-sql-actions-buttons';
  buttons.append(importBtn,rebuildBtn);
  dialog.append(heading,info,buttons,warning,close);
  document.body.append(dialog);
  return dialog;
}
function openSQLActions(){
  const dialog=sqlActionsDialog();
  const workspace=bound&&bound===persistedDirectory()?bound:'';
  dialog.querySelector('.v2-sql-actions-info').textContent=workspace?
    '当前工作目录：'+workspace:'请先在全局设置中绑定并验证工作目录';
  const busy=rebuilding||saving||Boolean(pending)||
    Boolean($('#workspace #editor')?.v2SourcePort?.getState().dirty);
  for(const selector of ['.v2-sql-action-import','.v2-sql-action-rebuild']){
    dialog.querySelector(selector).disabled=!workspace||busy;
  }
  if(!dialog.open)dialog.showModal();
}
async function importBaseFromMineru(){
  const path=bound;
  if(!path||path!==persistedDirectory()){report('请先绑定并验证工作目录','error');return;}
  const source=$('#workspace #editor')?.v2SourcePort;
  if(rebuilding||saving||pending||source?.getState().dirty){
    report('当前逻辑结构尚未保存或数据库正在处理，不能导入基础表','warning');return;
  }
  // Existing import API validates F02, source hashes and schema. It preserves
  // an existing nonempty logical table and NEVER silently overwrites edits.
  rebuilding=true;
  report('正在检查并导入当前工作目录的 MinerU 基础表…');
  try{
    const result=await request('import',path,{method:'POST',
      payload:{workspace:path,confirm:'import-mineru-base'}});
    if(result.created||result.replaced||result.backfilled||result.migrated){
      clearTimeout(saveTimer);saveTimer=null;saveBlocked=true;
      source?.clear();bound='';lastFocus=null;logicalState=null;renderedSchema='';
      await ensureBase(path);
    }else if(active)await fetchPage();
    report(result.created||result.replaced||result.backfilled||result.migrated?
      '✓ 已从 MinerUJSON 导入基础表并重新加载 SQL':
      '✓ 基础表已存在且来源相同，保留现有基础表和逻辑表','ok');
  }catch(error){report('导入基础表失败：'+error.message,'error');}
  finally{rebuilding=false;}
}
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
async function rebuildLogicalOnly(){
  const path=bound;
  if(!path||path!==persistedDirectory()){report('请先在全局设置中绑定并验证工作目录','error');return;}
  if(rebuilding||saving||pending||$('#workspace #editor')?.v2SourcePort?.getState().dirty){
    report('CM6 尚有未保存正文或结构，拒绝覆盖逻辑表','warning');return;}
  // User-authorized destructive replacement of LOGICAL DATA ONLY. Remove the
  // stale debounce before the POST so it cannot race an old CM6 structure
  // commit into the freshly replaced logical table.
  rebuilding=true;clearTimeout(saveTimer);saveTimer=null;
  acknowledged=null;acknowledgedText=null;saveBlocked=true;
  report('正在仅从 para_blocks 重建逻辑表（覆盖旧逻辑行；原始基础表不变）…','warning');
  try{
    const result=await request('logical-rebuild',path,{method:'POST',
      payload:{workspace:path,confirm:'rebuild-v2-logical-only'}});
    if(!result?.rebuilt||result.baseChanged!==false)throw Error('重建回执不完整');
    const source=$('#workspace #editor')?.v2SourcePort;
    source?.clear();
    bound='';lastFocus=null;logicalState=null;renderedSchema='';
    await ensureBase(path);
    report('✓ 逻辑表已从原始 para_blocks 重建 · '+result.previousLogicalCount+
      ' → '+result.logicalCount+' 行 · 基础表与原件未修改','ok');
  }catch(error){
    report('逻辑表重建未完成：'+error.message+' · 原始基础表未修改','error');
    // Failure after the server commit may leave stale CM6 state. Reset the
    // session and require re-opening the verified workspace, not stale writes.
    acknowledged=null;acknowledgedText=null;saveBlocked=true;
  }finally{
    rebuilding=false;
  }
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
  const logical=state.tableName==='logical_block';
  // Only the AG view is reordered. The SQLite ten-column physical schema
  // and server-returned column inventory stay untouched.
  const columnKeys=logical
    ?['block_type','md_block',...state.columns.filter(key=>
      key!=='block_type'&&key!=='md_block'),'raw_block']
    :state.columns;
  // WP12: fit the ACTUAL displayed PBS and Type cell text in the current
  // AG font. Never use all hidden pages to inflate the current Type column.
  // The minimum is deliberately smaller than the fitted width: AG Grid's
  // native resize handle must allow both shrinking and expanding.
  const page=logical?filterLogicalAG(state.rows,currentLogicalId(),showAllLogical):null;
  const visibleRows=page?.rows||state.rows;
  const gridHost=$('#workspace .ocr-outline-grid');
  const cell=gridHost?.querySelector('.ag-cell');
  const measuredStyle=getComputedStyle(cell||gridHost);
  const canvas=document.createElement('canvas');
  const ctx=canvas.getContext('2d');
  if(ctx)ctx.font=measuredStyle.font||'13px "OCR2MD Sarasa",monospace';
  const px=text=>ctx?ctx.measureText(String(text??'')).width:
    String(text??'').length*8;
  const fit=(values,header,min,max)=>Math.max(min,Math.min(max,Math.ceil(Math.max(
    px(header)+54, // AG native filter icon, header padding and resize handle
    ...values.map(value=>px(value)+30) // real text and AG cell horizontal padding
  ))));
  const pbsWidth=logical?fit(visibleRows.map(row=>`p${row.p}b${row.b}s${row.s}`),'PBS',80,180):80;
  const typeWidth=logical?fit(visibleRows.map(row=>row.block_type),'Type',82,240):105;
  const columns=columnKeys.map((key,index)=>({field:key,
    headerName:logical&&key==='block_type'?'Type':
      logical&&key==='md_block'?'MD Block':
      logical&&key==='raw_block'?'Raw Block (只读)':sourceHeaders[key]||key,
    headerTooltip:key,tooltipField:key,resizable:true,
    // V1 source: ui/enum-checkbox-filter.js. AG owns the native icon,
    // popup, multi-checkbox model and onNewRowsLoaded lifecycle.
    filter:EnumCheckboxFilter,
    filterValueGetter:params=>params.data?String(params.data[key]??''):'',
    suppressHeaderMenuButton:true,suppressHeaderFilterButton:false,
    sortable:!(logical&&key==='block_type'),
    minWidth:logical&&key==='block_type'?76:
      key==='md_block'&&logical?290:key==='block_json'?380:
      key==='source_json_path'?275:key==='source_sha256'?220:105,
    width:logical&&key==='block_type'?typeWidth:key==='md_block'&&logical?420:
      key==='raw_block'&&logical?330:key==='blockid'?100:
      key==='block_json'?440:key==='original_bytes'?155:undefined,
    pinned:!logical&&index===0?'left':undefined,
    valueFormatter:key==='original_bytes'?()=>'(存于 BlockID=0)':undefined}));
  if(logical){
    // PBS is the sole pinned column, sized to its displayed values.
    columns.unshift({field:'pbs',headerName:'PBS',headerTooltip:'当前逻辑块编号',
      minWidth:72,width:pbsWidth,pinned:'left',resizable:true,sortable:false,
      filter:EnumCheckboxFilter,filterValueGetter:params=>params.data?
        `p${params.data.p}b${params.data.b}s${params.data.s}`:'',
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false});
  }
  const controls=logicalControls();
  let view=null;
  if(controls){
    controls.label.hidden=!logical;
    controls.indicator.hidden=!logical;
    controls.label.querySelector('input').checked=showAllLogical;
  }
  if(logical){
    view=page;
    visibleLogicalP=view.p;
    if(controls)controls.indicator.textContent=showAllLogical?
      `全部 · ${view.rows.length} 行`:`p${view.p??'?'} · ${view.rows.length} / ${state.rowCount}`;
  }else visibleLogicalP=null;
  const schema=state.tableName+':'+columns.map(column=>column.field).join(',');
  if(schema!==renderedSchema){port.setColumns(columns,state.tableName);renderedSchema=schema;}
  port.setRows(logical
    ?view.rows.map(row=>({...row,pbs:`p${row.p}b${row.b}s${row.s}`}))
    :state.rows);
  if(logical)port.fitColumns({pbs:pbsWidth,block_type:typeWidth});
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
      overlayCMStructure();
    }
    renderGrid(state);
  }catch(error){if(generation===pageRequest)report('SQL 物理表读取失败：'+error.message,'error');}
}
function overlayCMStructure(){
  const source=$('#workspace #editor')?.v2SourcePort;
  if(!logicalState||!source?.getState().loaded||source.getWorkspace()!==bound)return;
  const live=new Map(source.getStructureRows().map(row=>[row.logicalId,row]));
  const texts=new Map(source.getBlocks().map(row=>[row.logicalId,row.markdownText]));
  logicalState.rows=logicalState.rows.map(record=>{
    const row=live.get(record.logical_id);
    return row?{...record,parent_id:row.parentId,logical_order:row.logicalOrder,
      p:row.p,b:row.b,s:row.s,md_block:texts.get(row.logicalId)??record.md_block}:record;
  }).sort((a,b)=>a.logical_order-b.logical_order);
}
function scheduleStructureSave(){
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{saveTimer=null;void flushStructure();},850);
}
async function flushStructure(){
  if(rebuilding||saving||saveBlocked||!acknowledged||!acknowledgedText||!bound)return;
  const source=$('#workspace #editor')?.v2SourcePort;
  if(!source?.getState().loaded||source.getWorkspace()!==bound)return;
  const current=structureCopy(source.getStructureRows());
  const original=new Map(acknowledged.map(r=>[r.logicalId,r]));
  if(current.length!==original.size){report('CM6 结构数量改变，拒绝 SQL 写入','error');saveBlocked=true;return;}
  const changes=current.flatMap(row=>{
    const old=original.get(row.logicalId);
    if(!old)throw Error('CM6 结构出现未知 ID');
    const before=Object.fromEntries(STRUCT_FIELDS.map(key=>[key,old[key]]));
    const after=Object.fromEntries(STRUCT_FIELDS.map(key=>[key,row[key]]));
    return STRUCT_FIELDS.some(key=>before[key]!==after[key])?
      [{logicalId:row.logicalId,before,after}]:[];
  });
  const textRows=source.getBlocks();
  const textChanges=textRows.flatMap(row=>{
    const before=acknowledgedText.get(row.logicalId);
    if(before===undefined)throw Error('CM6 文本出现未知逻辑块');
    return before!==row.markdownText?
      [{logicalId:row.logicalId,before,after:row.markdownText}]:[];
  });
  if(!changes.length&&!textChanges.length){
    source.markPersisted(acknowledged);source.markTextPersisted(textRows);
    return;
  }
  const workspace=bound;
  saving=true;
  try{
    if(changes.length){
      const result=await request('structure-commit',workspace,{method:'POST',
        payload:{workspace,confirm:'commit-v2-structure',changes}});
      if(!result?.saved||result.changedRows!==changes.length)throw Error('SQL 结构写入回执不完整');
      if(bound!==workspace||source.getWorkspace()!==workspace)return;
      acknowledged=current;
      source.markPersisted(current);
    }
    if(textChanges.length){
      const result=await request('md-commit',workspace,{method:'POST',
        payload:{workspace,confirm:'commit-v2-md',changes:textChanges}});
      if(!result?.saved||result.changedRows!==textChanges.length)throw Error('SQL MD Block 写入回执不完整');
      if(bound!==workspace||source.getWorkspace()!==workspace)return;
      acknowledgedText=new Map(textRows.map(r=>[r.logicalId,r.markdownText]));
      source.markTextPersisted(textRows);
    }
    report(`✓ SQLite 已保存 · PBS ${changes.length} 行 / MD Block ${textChanges.length} 行 · Raw Block 未改变`,'ok');
  }catch(error){
    saveBlocked=true;
    report('WP10 SQL 写回失败，CM6 内存已保留：'+error.message+' · 后续编辑/撤销可重试','error');
  }finally{
    saving=false;
    if(!saveBlocked&&bound===workspace&&source.getState().dirty)scheduleStructureSave();
  }
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
      if(port.getState().dirty||saving)
        throw Error('当前 CM6 结构尚未写入 SQL，禁止切换工作目录以免丢失编辑');
      // Never retain an old book's source after switching verified workspaces.
      port.clear();
      if(state.logicalCount>0){
        const snapshot=await request('markdown',path);
        if(persistedDirectory()!==path)return;
        port.load(snapshot,path);
      }
    }
    if(bound!==path){logicalState=null;showAllLogical=false;lastFocus=null;
      renderedSchema='';clearTimeout(saveTimer);saveTimer=null;saveBlocked=false;}
    bound=path;
    acknowledged=structureCopy(port.getStructureRows());
    acknowledgedText=textCopy(port.getBlocks());
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
  report('WP10：不允许单次编辑跨越两个逻辑块；空行仍属于所属块','warning'));
document.addEventListener('v2-cm-session',event=>{
  const {kind,dirty,blocks}=event.detail||{};
  if(kind==='clear'){lastFocus=null;acknowledged=null;acknowledgedText=null;clearTimeout(saveTimer);saveTimer=null;}
  if(kind==='load'){
    const port=$('#workspace #editor')?.v2SourcePort;
    acknowledged=structureCopy(port?.getStructureRows()||[]);
    acknowledgedText=textCopy(port?.getBlocks()||[]);
  }
  if(kind==='structure'||kind==='edit'){
    overlayCMStructure();
    if(active&&selectedTable==='logical_block'&&logicalState)renderGrid(logicalState);
    saveBlocked=false;scheduleStructureSave();
    report(`● WP10 CM6 文本/结构已改变 · ${blocks} 逻辑块 · ${dirty?'待写 SQL':'已与 SQL 一致'}`,
      dirty?'warning':'ok');
  }
});

window.addEventListener('beforeunload',event=>{
  if($('#workspace #editor')?.v2SourcePort?.getState().dirty){
    event.preventDefault();event.returnValue='';
  }
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
