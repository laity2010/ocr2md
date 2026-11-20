/** OCR V2 MinerU Base view: compose existing Frame public Settings/navigation/AG.
 * Core ui/frame files remain byte-identical; Vite's isolated adapter exposes
 * Frame's verified workspace and AG setRows/setColumns as narrow event ports.
 */
import {createFrameStatus} from './frame/global-status.js';
import './v2-mineru-base.css';
const status=createFrameStatus(document.getElementById('status'));
const API='/labs/lab-ocr-v2/api/mineru-base/';
const SETTINGS_KEY='ocr2md.lab-ocr-v2-frame.settings.json.v1';
const NAV_VALUE='sql:mineru-base';
const LOGICAL_NAV='sql:logical-block';
const sourceHeaders={blockid:'BlockID',source_path:'原始文件',source_sha256:'源 SHA-256',
  page_index:'页索引',page_number:'PDF 页',block_group:'块组',page_block_index:'页内索引',
  source_json_path:'JSON 路径',block_type:'原始类型',mineru_index:'MinerU 索引',
  bbox_json:'bbox',angle:'角度',level:'层级',lines_json:'lines',
  blocks_json:'blocks',block_json:'完整原始 Block JSON',record_kind:'记录类型',
  original_bytes:'原文件归档字节'};
const logicalHeaders={logical_id:'LogicalID',parent_id:'ParentID',sort_order:'同层顺序',
  node_kind:'节点类型',block_type:'块类型',markdown:'Markdown 原文',
  source_refs:'基础表来源',attrs:'属性',revision:'版本'};
let bound='',pending=null,active='',offset=0,total=0;
const $=selector=>document.querySelector(selector);
function persistedDirectory(){
  try{return JSON.parse(localStorage.getItem(SETTINGS_KEY))?.settings?.['workspace.dataDirectory']?.value||'';}
  catch{return '';}
}
function report(message,kind='info'){status.publish(message,kind);}
async function request(operation,workspace,{method='GET',offset=0}={}){
  const url=API+operation+(method==='GET'?('?'+new URLSearchParams({workspace,offset:String(offset)})):'');
  const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',
    ...(method==='POST'?{headers:{'Content-Type':'application/json'},
      body:JSON.stringify({workspace,confirm:operation==='initialize-logical'?'initialize-logical':'import-mineru-base'})}:{})});
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
    const selected=select.value;
    if(selected!==NAV_VALUE&&selected!==LOGICAL_NAV)return;
    const settingPane=Boolean(select.closest('#settings-workspace'));
    if(settingPane){
      document.dispatchEvent(new CustomEvent('v2-show-frame'));
      const workNav=$('#workspace .ocr-source-file-select');
      if(workNav){workNav.value=selected;workNav.dispatchEvent(new Event('change',{bubbles:true}));}
      return;
    }
    active=selected;
    offset=0;
    if(bound)void fetchPage();
  });
}
function revealBaseNav(logicReady=false){
  for(const select of navs()){
    wireNav(select);
    let group=[...select.querySelectorAll('optgroup')].find(item=>item.label==='SQL');
    if(!group){group=document.createElement('optgroup');group.label='SQL';select.append(group);}
    if(!select.querySelector(`option[value="${NAV_VALUE}"]`))
      group.append(new Option('基础表 · mineru_base',NAV_VALUE));
    if(logicReady&&!select.querySelector(`option[value="${LOGICAL_NAV}"]`))
      group.append(new Option('逻辑表 · logical_block',LOGICAL_NAV));
  }
}
function picker(){return $('#workspace .ocr-ag-toolbar');}
function pagingControls(){
  const bar=picker();if(!bar)return null;
  let host=bar.querySelector('.v2-base-paging');
  if(host)return host;
  host=document.createElement('div');host.className='v2-base-paging';
  const prev=document.createElement('button');prev.type='button';prev.textContent='‹';
  prev.setAttribute('aria-label','基础表上一页');
  const label=document.createElement('span');label.className='v2-base-count';
  const next=document.createElement('button');next.type='button';next.textContent='›';
  next.setAttribute('aria-label','基础表下一页');
  prev.addEventListener('click',()=>{offset=Math.max(0,offset-120);void fetchPage();});
  next.addEventListener('click',()=>{offset+=120;void fetchPage();});
  host.append(prev,label,next);bar.append(host);return host;
}
function renderGrid(state){
  const port=$('#workspace .ocr-outline-grid')?.v2BaseGridPort;
  if(!port)throw Error('AG 公共数据显示接口尚未就绪');
  const isLogic=active===LOGICAL_NAV;
  const headers=isLogic?logicalHeaders:sourceHeaders;
  const tableName=isLogic?'逻辑表':'基础表';
  const columns=state.columns.map(key=>({field:key,headerName:headers[key]||key,
    headerTooltip:key,tooltipField:key,resizable:true,sortable:true,
    minWidth:key==='markdown'?350:key==='source_refs'?230:key==='block_json'?380:key==='source_json_path'?275:key==='source_sha256'?220:105,
    width:key==='logical_id'||key==='blockid'?105:key==='markdown'?440:key==='block_json'?440:key==='original_bytes'?155:undefined,
    pinned:key==='blockid'||key==='logical_id'?'left':undefined,
    valueFormatter:key==='original_bytes'?()=>'(存于 BlockID=0)':undefined}));
  port.setColumns(columns);
  port.setRows(state.rows);
  const paging=pagingControls();
  if(paging){
    paging.querySelector('.v2-base-count').textContent=`${tableName} ${state.offset+1}–${Math.min(state.blockCount,state.offset+state.rows.length)} / ${state.blockCount}`;
    const buttons=paging.querySelectorAll('button');
    buttons[0].disabled=state.offset===0;
    buttons[1].disabled=state.offset+state.rows.length>=state.blockCount;
  }
  const pageButtons=paging?.querySelectorAll('button');
  if(pageButtons){pageButtons[0].setAttribute('aria-label',tableName+'上一页');pageButtons[1].setAttribute('aria-label',tableName+'下一页');}
  // The original Frame toolbar selector is intentionally not reimplemented.
  report(isLogic?`SQL 逻辑表已加载 · ${state.blockCount} 个逻辑节点 · 9 列 · LogicalID 固定`:
    `SQL 基础表已加载 · ${state.blockCount} 个原始块 · ${state.sourceCount} 份 MinerUJSON · 18 列 · BlockID 为整数`,'ok');
}
let pageRequest=0;
async function fetchPage(){
  if(!bound||!active)return;
  const generation=++pageRequest;
  try{
    const state=await request(active===LOGICAL_NAV?'logical-state':'state',bound,{offset});
    if(generation!==pageRequest)return;
    if(!state.exists||state.needsInitialization)throw Error('SQL 表尚未初始化，请先在全局设置验证工作目录');
    total=state.blockCount;
    renderGrid(state);
  }catch(error){if(generation===pageRequest)report((active===LOGICAL_NAV?'逻辑表':'基础表')+'读取失败：'+error.message,'error');}
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
    bound=path;
    total=state.blockCount;
    revealBaseNav();
    // WP00 might already have a 5-column empty logical table. Upgrade it
    // transactionally; failure must leave the verified base view available.
    let logical;
    try{
      logical=await request('logical-state',path);
      if(logical.needsInitialization){
        report('正在使用 V1 公共转换器初始化逻辑表；基础表保持不变…');
        await request('initialize-logical',path,{method:'POST'});
        logical=await request('logical-state',path);
      }
      if(!logical.initialized)throw Error('逻辑表初始化未完成');
      revealBaseNav(true);
      report(`✓ V2 基础表就绪 · ${state.blockCount} 原始块；逻辑表就绪 · ${logical.blockCount} 节点 · SQL 两表`,'ok');
    }catch(error){
      report('基础表已就绪；逻辑表初始化失败：'+error.message,'error');
    }
    if(active)await fetchPage();
  }catch(error){report('V2 基础表初始化失败：'+error.message,'error');}
  finally{pending=null;}
}
// This event is issued ONLY after the original F02 probe returned readable,
// writable and verified. Ignore unsaved directory adoptions explicitly.
document.addEventListener('v2-workspace-verified',event=>{
  const {path,uncommitted}=event.detail||{};
  if(!uncommitted&&path===persistedDirectory())void ensureBase(path);
});
// Settings' navigation is asynchronous. It is created before F02 reports
// successful startup verification; no second settings state is introduced.
// SQL remains hidden if no permitted, verified/initialized book exists.
