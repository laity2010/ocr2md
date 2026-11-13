import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import {createBlockRuntime,editBlockRuntime,acknowledgeBlockPersistence,
  runtimeStatus,projectBlockOverlays} from './block-runtime.js';
import {createBlockPersistence} from './block-persistence.js';
/** Lab OCR workflow port: saved workspace -> authorized import -> SQL navigation.
 * UI never reads disk or SQLite; those belong to the isolated OCR API.
 */
const ENDPOINT='/labs/lab-ocr/api/ocr/';
const NAV_VALUE='sql:minerujson';
const SPAN_VALUE='sql:span';
const BLOCK_VALUE='sql:block';
const COLUMNS=Object.freeze([
  {field:'global_page',headerName:'页（0起）',width:112,sortable:true},
  {field:'source_name',headerName:'源 JSON',width:170,sortable:true},
  {field:'local_page',headerName:'分段页',width:95,sortable:true},
  {field:'block_group',headerName:'块组',width:145,sortable:true},
  {field:'block_index',headerName:'块序号',width:102,sortable:true},
  {field:'block_type',headerName:'块类型',width:120,sortable:true},
  {field:'bbox_json',headerName:'覆盖框',width:158,sortable:false},
  {field:'text_preview',headerName:'内容预览',flex:1,minWidth:250,sortable:false},
  {field:'block_json',headerName:'原始块 JSON',width:280,hide:true,sortable:false},
]);
const SPAN_COLUMNS=Object.freeze([
  {field:'global_page',headerName:'Page（0起）',width:120,sortable:true},
  {field:'block_id',headerName:'Block',width:240,sortable:true},
  {field:'block_type',headerName:'Block Type',width:135,sortable:true},
  {field:'block_bbox_json',headerName:'Block BBox',width:148,sortable:false},
  {field:'parent_block_id',headerName:'父 Block',width:235,sortable:true},
  {field:'line_index',headerName:'Line',width:80,sortable:true},
  {field:'span_index',headerName:'Span',width:80,sortable:true},
  {field:'span_type',headerName:'Span Type',width:135,sortable:true},
  {field:'span_bbox_json',headerName:'Span BBox',width:154,sortable:false},
  {field:'content_preview',headerName:'内容摘要（只读）',minWidth:200,flex:1,sortable:false},
  {field:'span_id',headerName:'Span ID',width:300,hide:true},
  {field:'content',headerName:'文本内容',width:260,hide:true},
  {field:'html',headerName:'HTML',width:260,hide:true},
  {field:'image_path',headerName:'媒体路径',width:260,hide:true},
]);
const comparePBS=(left,right)=>{
  const values=text=>{
    const match=/^p(\d+)b(\d+)((?:s\d+)*)$/.exec(String(text||''));
    return match?[Number(match[1]),Number(match[2]),
      ...(match[3].match(/s\d+/g)||[]).map(n=>Number(n.slice(1)))]:null;
  };
  const a=values(left),b=values(right);
  if(!a||!b)return String(left).localeCompare(String(right),'en',{numeric:true});
  for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];
  return a.length-b.length;
};
const BLOCK_COLUMNS=Object.freeze([
  {field:'global_page',headerName:'Page（0起）',width:108,sortable:true},
  {field:'pbs',headerName:'PBS',width:125,sortable:true,sort:'asc',comparator:comparePBS},
  {field:'block_id',headerName:'Block ID',width:105,sortable:true},
  {field:'parent_block_id',headerName:'ParentID',width:125,sortable:true},
  {field:'block_type',headerName:'Block Type',width:145,sortable:true},
  {field:'block_bbox_json',headerName:'Block BBox',width:145,sortable:false},
  {field:'line_count',headerName:'Lines',width:85,sortable:true},
  {field:'span_count',headerName:'Spans',width:85,sortable:true},
  {field:'span_types',headerName:'Span Types',width:170,sortable:false},
  {field:'content_preview',headerName:'内容摘要',minWidth:210,flex:1,sortable:false},
  {field:'block_path',headerName:'原始层级路径',width:175,hide:true},
  {field:'source_block_key',headerName:'来源 Block Key',width:280,hide:true},
  {field:'block_json',headerName:'原始 Lines / Spans',width:260,hide:true},
]);
async function request(op,params,post=false,options={}){
  const url=new URL(ENDPOINT+op,location.origin);
  if(!post)for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',
    keepalive:Boolean(post&&options.keepalive),
    ...(post?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)}:{})});
  if(!response.ok){
    let reason='HTTP '+response.status;
    try{const body=await response.json();reason=body.error||reason;}catch{}
    if(response.status===403)reason='需要 Main 编辑授权：'+reason;
    throw Error(reason);
  }
  return response.json();
}

export function createLabOcrWorkflow({io,frame,navigation,settingsRoot,onStatus,showModule}){
  let workspace='',tableReady=false,spanReady=false,blockReady=false,operation=0,loaded=0;
  let currentSqlTable=null;
  let persistence=null,loadingRuntime=null,lastEditedId=null;
  const sqlReady=()=>tableReady;
  const cm=()=>frame.readStructuredRuntime();
  const status=()=>runtimeStatus(cm());
  function refreshBlockUndoRedo(){
    const state=status();
    frame.setSqlEditHistory({canUndo:state.canUndo,canRedo:state.canRedo,
      onUndo:()=>undoRedoBlock('undo'),onRedo:()=>undoRedoBlock('redo')});
  }
  function bindPersistence(){
    if(persistence)return persistence;
    const currentWorkspace=workspace;
    persistence=createBlockPersistence({
      read:cm,
      ack:(ids,revision)=>frame.reduceStructuredRuntime(state=>({
        state:acknowledgeBlockPersistence(state,ids,revision)})),
      post:batch=>request('block-edit-batch',{
        workspace:currentWorkspace,batchId:batch.batchId,
        expectedRevision:batch.expectedRevision,operations:batch.operations},true,
        {keepalive:true}),
      onStatus,
    });
    return persistence;
  }
  async function fetchBlockRows(){
    const rows=[];let offset=0,total=0;
    do{
      const part=await request('rows',{workspace,table:'block',offset,limit:200});
      if(offset===0)total=part.total;
      if(total>10000)throw Error('CM6 Block 单次加载上限 10000 行，拒绝不完整的关系编辑');
      if(!part.rows.length&&offset<total)throw Error('Block SQL 分页提前结束');
      rows.push(...part.rows.filter(row=>row.block_group==='para_blocks'));
      offset+=part.rows.length;
    }while(offset<total);
    return rows;
  }
  async function ensureBlockRuntime(preloadedRows=null){
    if(cm()?.workspace===workspace)return cm();
    if(loadingRuntime)return loadingRuntime;
    const current=workspace,epoch=operation;
    loadingRuntime=(async()=>{
      if(!blockReady||!current)throw Error('尚未初始化 para Block 表');
      const [history,rows]=await Promise.all([
        request('block-edit-state',{workspace:current,history:1}),
        preloadedRows?Promise.resolve(preloadedRows):fetchBlockRows(),
      ]);
      if(epoch!==operation||workspace!==current)
        throw Error('书籍已切换，拒绝把旧书籍状态载入 CM');
      // Only this CM6 StateField is a mutable authority. SQL is read solely
      // at first binding; subsequent Block tab switches use memory rows.
      frame.replaceStructuredRuntime(createBlockRuntime({
        workspace:current,rows,revision:history.revision,
        history:history.history??[],cursor:history.cursor??0}));
      // WCP44: legacy MinerU JSON or an earlier edit may contain p6b4s2s0.
      // Immediately canonicalize those affected pages in the ONLY writable
      // CM StateField, then enqueue the identical SQL migration. No source
      // BlockID, bbox, content or original JSON changes. The next page render
      // projects the new PBS from CM, even before SQL is persisted.
      const byId=new Map(cm().rows.map(row=>[row.block_id,row]));
      const nestedPages=new Set(cm().rows.filter(row=>{
        const parent=byId.get(row.parent_block_id);
        return (parent&&parent.parent_block_id!==null)||
          /s\d+s\d+/.test(String(row.pbs));
      }).map(row=>row.global_page+1));
      let repaired=0;
      for(const page of [...nestedPages].sort((a,b)=>a-b)){
        const result=frame.reduceStructuredRuntime(state=>
          editBlockRuntime(state,{action:'flatten',page}));
        if(result.changed){
          reflectCmBlockChange(result,null);
          repaired+=result.changedRows.length;
        }
      }
      if(history.historyTruncated)
        onStatus('Block 历史较长：CM 本次只加载最近 128 次可撤销记录','warning');
      bindPersistence();
      refreshBlockUndoRedo();
      if(repaired)onStatus(`已在 CM6 整理 ${nestedPages.size} 页的 ${repaired} 个关系／编号：仅保留父块和一级子块，后台保存 SQLite`,'ok');
      return cm();
    })();
    try{return await loadingRuntime;}
    finally{loadingRuntime=null;}
  }
  function reflectCmBlockChange(result,selectedId){
    if(!result.changed)return;
    if(currentSqlTable==='block')frame.patchSqlBlockRows(result.changedRows);
    frame.repaintPdfBlockPage(result.page);
    if(selectedId!=null){
      lastEditedId=selectedId;
      frame.focusPdfBlock({id:selectedId,page:result.page});
      if(currentSqlTable==='block')
        frame.selectSqlRowById({field:'block_id',id:selectedId});
    }
    refreshBlockUndoRedo();
    bindPersistence().changed();
  }
  async function executeBlockGesture({sourceBlockId,targetBlockId,placement,page}){
    const current=workspace;
    try{
      await ensureBlockRuntime();
      if(workspace!==current)throw Error('书籍已切换');
      const result=frame.reduceStructuredRuntime(state=>
        editBlockRuntime(state,{action:'apply',sourceBlockId,targetBlockId,placement}));
      if(!result.changed){onStatus('Block · 已是目标位置，CM 关系不变','info');return;}
      reflectCmBlockChange(result,sourceBlockId);
      onStatus(`✓ CM6 已更新 BlockID ${sourceBlockId} → ${targetBlockId} · ${placement} · 等待空闲异步保存 SQLite`,'ok');
    }catch(error){
      onStatus('CM Block 拖动失败：'+error.message,'error');
      throw error;
    }
  }
  async function undoRedoBlock(action){
    try{
      await ensureBlockRuntime();
      const result=frame.reduceStructuredRuntime(state=>editBlockRuntime(state,{action}));
      reflectCmBlockChange(result,lastEditedId);
      onStatus(`✓ CM6 ${action==='undo'?'撤销':'重做'}已生效 · 空闲时写入 SQLite`,'ok');
      return result;
    }catch(error){
      onStatus('CM Block 历史操作失败：'+error.message,'error');throw error;
    }
  }
  async function flushBlockChanges(){
    if(!cm()?.queue.length)return false;
    await bindPersistence().flush();
    return true;
  }
  // The saved book root is the only user configuration. The server selects
  // the sole PDF beneath its pdf/ child and authorizes it per request.
  const pdfUrl=directory=>{
    const url=new URL(ENDPOINT+'pdf',location.origin);
    url.searchParams.set('workspace',directory);
    return url.pathname+url.search;
  };
  let lastPdfWorkspace='',lastOverlayWorkspace='';
  const REVIEW_BLOCK_GROUP='para_blocks';
  function prepareOverlays(directory){
    if(directory===lastOverlayWorkspace)return;
    lastOverlayWorkspace=directory;
    frame.setPdfOverlays(directory?{
      level:'block',blockGroups:[REVIEW_BLOCK_GROUP],
      onBlockSelect:({blockId,pbs})=>{
        const id=String(blockId);
        // The Block ID, not PBS, is the stable identity across views.
        if(currentSqlTable==='block'&&frame.selectSqlRowById({field:'block_id',id})){
          onStatus(`PDF → AG · ${pbs} · BlockID ${id}`,'ok');
        }else{
          void openSql('block',{selectedId:id}).then(success=>{
            if(success)onStatus(`PDF → AG · ${pbs} · BlockID ${id}`,'ok');
          });
        }
      },
      onBlockDragIntent:intent=>executeBlockGesture(intent),
      projectPage:data=>projectBlockOverlays(cm(),data),
      loadPage:(page,level)=>request('overlays',{workspace:directory,page,level}),
    }:{level:'off',loadPage:null,blockGroups:null,onBlockSelect:null,
      onBlockDragIntent:null,projectPage:null});
  }
  function warmPdf(directory){
    if(directory===lastPdfWorkspace)return;
    lastPdfWorkspace=directory;
    void frame.loadPdf(directory?pdfUrl(directory):null).catch(error=>
      onStatus('PDF · 加载失败：'+error.message,'error'));
  }

  async function savedWorkspace(){
    const snapshot=await io.readSnapshot();
    const settings=JSON.parse(snapshot.text)?.settings;
    const value=settings?.['workspace.dataDirectory']?.value;
    return typeof value==='string'?value.trim():'';
  }
  function revealNavigation(){
    for(const select of [navigation,settingsRoot.querySelector('.ocr-source-file-select')]){
      if(!select)continue;
      let group=[...select.querySelectorAll('optgroup')].find(e=>e.label==='SQLite');
      if(!group){group=document.createElement('optgroup');group.label='SQLite';select.append(group);}
      if(tableReady&&!group.querySelector(`option[value="${NAV_VALUE}"]`))
        group.append(new Option('minerujson',NAV_VALUE));
      if(blockReady&&!group.querySelector(`option[value="${BLOCK_VALUE}"]`))
        group.append(new Option('block',BLOCK_VALUE));
      if(spanReady&&!group.querySelector(`option[value="${SPAN_VALUE}"]`))
        group.append(new Option('span',SPAN_VALUE));
    }
  }
  function hideNavigation(){
    for(const select of [navigation,settingsRoot.querySelector('.ocr-source-file-select')]){
      const group=[...select?.querySelectorAll('optgroup')||[]].find(e=>e.label==='SQLite');
      if(group)group.remove();
    }
  }
  async function createSpanTable(epoch){
    try{
      const result=await request('minerujson2span',{workspace},true);
      if(epoch!==operation)return false;
      spanReady=true;revealNavigation();
      onStatus(`SQLite · span：${result.spans} 行已就绪，请从导航选择 span`,'ok');
      return true;
    }catch(error){
      if(epoch===operation){spanReady=false;revealNavigation();
        onStatus('span 表生成失败，minerujson 仍可用：'+error.message,'error');}
      return false;
    }
  }
  async function createBlockTable(epoch){
    try{
      const result=await request('minerujson2block',{workspace},true);
      if(epoch!==operation)return false;
      blockReady=true;revealNavigation();
      onStatus(`SQLite · block：${result.blocks} 行已就绪，请从导航选择 block`,'ok');
      return true;
    }catch(error){
      if(epoch===operation){blockReady=false;revealNavigation();
        onStatus('block 表生成失败，其他数据仍可用：'+error.message,'error');}
      return false;
    }
  }
  async function inspectAndImport(nextWorkspace){
    const epoch=++operation;
    if(cm()?.queue.length)throw Error('CM Block 尚有待持久操作，必须先保存，拒绝切换/重建');
    persistence?.dispose();persistence=null;loadingRuntime=null;
    frame.replaceStructuredRuntime(null);
    workspace=nextWorkspace;
    lastEditedId=null;
    frame.setSqlEditHistory();
    tableReady=false;spanReady=false;blockReady=false;currentSqlTable=null;hideNavigation();frame.clearSqlRows();
    if(!workspace){prepareOverlays('');warmPdf('');onStatus('请在全局设置中绑定书籍工作目录','warning');return false;}
    onStatus('检查工作区：MinerU JSON 与 PDF…','info');
    try{
      const result=await request('inspect',{workspace});
      if(epoch!==operation)return false;
      if(result.status==='changed'){
        // Do not auto-overwrite reviewed/imported source material.
        tableReady=result.blocks>0;
        if(tableReady){revealNavigation();await createBlockTable(epoch);await createSpanTable(epoch);}
        onStatus('源 JSON 已变化：保留旧 SQL，不自动覆盖；请人工确认重新导入','warning');
        return tableReady;
      }
      if(result.status==='ready'){
        onStatus(`发现 ${result.pages} 页 MinerU JSON 和 PDF，首次导入 SQLite…`,'info');
        const imported=await request('import',{workspace},true);
        if(epoch!==operation)return false;
        if(!['imported','unchanged'].includes(imported.status))throw Error('导入结果异常：'+imported.status);
        onStatus(`SQL 导入成功：${imported.pages} 页、${imported.blocks} 行；请选择导航 SQL → minerujson`,'ok');
      }else{
        onStatus(`工作区已绑定，SQL 共 ${result.blocks} 行；请选择导航 SQL → minerujson`,'ok');
      }
      tableReady=true;revealNavigation();await createBlockTable(epoch);await createSpanTable(epoch);
      return true;
    }catch(error){
      if(epoch===operation){tableReady=false;hideNavigation();
        onStatus('工作区检查或 SQL 导入失败：'+error.message,'error');}
      return false;
    }
  }
  async function initialize(){
    const saved=await savedWorkspace();
    if(!saved){workspace='';tableReady=false;spanReady=false;blockReady=false;return false;}
    const imported=await inspectAndImport(saved);
    prepareOverlays(imported?saved:'');warmPdf(saved);
    return imported;
  }
  async function afterSave(){
    const saved=await savedWorkspace();
    if(saved!==workspace&&cm()?.queue.length)await flushBlockChanges();
    if(saved===workspace&&tableReady)return true; // never reload CM from an old SQL snapshot
    if(!saved){++operation;workspace='';tableReady=false;spanReady=false;blockReady=false;currentSqlTable=null;hideNavigation();
      frame.clearSqlRows();prepareOverlays('');warmPdf('');await showModule('settings');
      onStatus('尚未绑定工作区，请在全局设置中选择书籍目录','warning');return false;}
    const success=await inspectAndImport(saved);
    if(success){prepareOverlays(saved);warmPdf(saved);}
    return success;
  }
  async function openSql(table='minerujson',{selectedId=null}={}){
    if(!tableReady||!workspace||(table==='span'&&!spanReady)||(table==='block'&&!blockReady)){onStatus('请先绑定工作区并完成对应 SQLite 表生成','warning');return false;}
    if(!['minerujson','span','block'].includes(table))throw Error('未知的 SQLite 表');
    const id=++loaded;
    onStatus(table==='block'&&cm()?.workspace===workspace?
      '正在从 CM6 内存态投影 Block 表…':`正在从 SQLite 加载 ${table} 表并交给 CM6…`,'info');
    try{
      let entries=[];
      if(table==='block'&&cm()?.workspace===workspace){
        entries=cm().rows;
      }else{
        let offset=0,total=0;
        do{
          const page=await request('rows',{workspace,table,offset,limit:200});
          if(id!==loaded)return false;
          if(offset===0)total=page.total;
          if(total>10000)throw Error('当前 AG 单次显示上限为 10000 行，请缩小数据范围');
          if(!page.rows.length&&offset<total)throw Error('SQL 分页提前结束');
          const visible=(table==='block'||table==='span')?
            page.rows.filter(row=>row.block_group===REVIEW_BLOCK_GROUP):page.rows;
          entries.push(...visible);
          offset+=page.rows.length;
        }while(offset<total);
        if(table==='block'){
          await ensureBlockRuntime(entries);
          entries=cm().rows;
        }
      }
      if(id!==loaded)return false;
      // Only the review tables are para-only. Other columns retain Main's
      // categorical filters; none can change PDF block-group visibility.
      frame.showSqlRows(entries,(table==='span'?SPAN_COLUMNS:table==='block'?BLOCK_COLUMNS:COLUMNS).map(column=>({
        ...column,
        filter:EnumCheckboxFilter,
        filterValueGetter:params=>params.data?.[column.field]??'',
        suppressHeaderMenuButton:true,
        suppressHeaderFilterButton:false,
      })),{onSelect:row=>{
        if(table==='span')onStatus(`Span 定位：P${row.global_page} · ${row.block_id} · L${row.line_index} · S${row.span_index} · bbox ${row.span_bbox_json}`,'info');
        if(table==='block'){
          frame.focusPdfBlock({id:row.block_id,page:Number(row.global_page)+1});
          onStatus(`Block 定位：${row.pbs} · BlockID ${row.block_id} · ParentID ${row.parent_block_id??'NULL'} · AG → PDF`,'info');
        }
      }});
      currentSqlTable=table;
      if(selectedId!==null&&table==='block'&&!frame.selectSqlRowById({field:'block_id',id:selectedId})){
        onStatus(`PDF → AG · BlockID ${selectedId} 不在当前载入行中`,'warning');
        return false;
      }
      onStatus(`CM6 · ${table}：${entries.length} 行${table==='block'||table==='span'?'（只含 para_blocks）':''}，AG 只作为派生视图`,'ok');
      return true;
    }catch(error){onStatus('SQL 行读取失败：'+error.message,'error');return false;}
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&cm()?.queue.length)
      void flushBlockChanges().catch(()=>{});
  });
  // Normal navigation/page termination gets a best-effort keepalive batch.
  // This cannot guarantee persistence through a browser crash or power loss.
  window.addEventListener('pagehide',()=>{
    if(cm()?.queue.length)void flushBlockChanges().catch(()=>{});
  });
  return Object.freeze({savedWorkspace,initialize,afterSave,openSql,sqlReady,
    flushBlockChanges,refreshNavigation:revealNavigation});
}
