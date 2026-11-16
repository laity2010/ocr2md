import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import {createBlockRuntime,editBlockRuntime,acknowledgeBlockPersistence,
  runtimeStatus,projectBlockOverlays} from './block-runtime.js';
import {createBlockPersistence} from './block-persistence.js';
import {pbsPageKey} from './pbs-page-filter.js';
import {createMdRuntime,editedMdRuntime,acknowledgeMdRuntime,
  mdSplice,reorderMdByBlocks} from './md-runtime.js';
import {createMdPersistence} from './md-persistence.js';
import {projectMdAgRows,mdLineKind} from './md-ag-projection.js';
import {projectLiveMdRows,projectTitleMdRows,renderTitleMdCell} from './title-view.js';
import {resolveReviewLocation,sourceBlockStartLine} from './four-pane-location.js';
import {viewStore,publishLabFocus} from '../view-store.js';
/** Lab OCR workflow port: saved workspace -> authorized import -> SQL navigation.
 * UI never reads disk or SQLite; those belong to the isolated OCR API.
 */
const ENDPOINT='/labs/lab-ocr/api/ocr/';
const NAV_VALUE='sql:minerujson';
const SPAN_VALUE='sql:span';
const BLOCK_VALUE='sql:block';
const MD_VALUE='sql:md';
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
  {field:'pbs',headerName:'PBS',width:125,sortable:true,sort:'asc',comparator:comparePBS},
  {field:'block_type',headerName:'Block Type',width:145,sortable:true},
  {field:'level',headerName:'Level',width:85,sortable:true},
  {field:'content_preview',headerName:'摘要',minWidth:210,flex:1,sortable:false},
  {field:'global_page',headerName:'Page（0起）',width:108,sortable:true},
  {field:'block_id',headerName:'Block ID',width:105,sortable:true},
  {field:'parent_block_id',headerName:'ParentID',width:125,sortable:true},
  {field:'block_bbox_json',headerName:'Block BBox',width:145,sortable:false},
  {field:'line_count',headerName:'Lines',width:85,sortable:true},
  {field:'span_count',headerName:'Spans',width:85,sortable:true},
  {field:'span_types',headerName:'Span Types',width:170,sortable:false},
  {field:'block_path',headerName:'原始层级路径',width:175,hide:true},
  {field:'source_block_key',headerName:'来源 Block Key',width:280,hide:true},
  {field:'block_json',headerName:'原始 Lines / Spans',width:260,hide:true},
]);
// MD is a LINE view of the existing reviewed Block table, not a replacement
// with fewer columns. Keep every original Block column after the fixed indexes.
const MD_COLUMNS=Object.freeze([
  {field:'line_no',headerName:'行号',width:88,sortable:true,sort:'asc',
    pinned:'left',lockPinned:true,lockPosition:'left'},
  {field:'pbs',headerName:'PBS',width:125,sortable:false,
    pinned:'left',lockPinned:true,lockPosition:'left'},
  {field:'block_type',headerName:'Block Type',width:145,sortable:true},
  {field:'text',headerName:'摘要 · MD 行',flex:1,minWidth:210,sortable:false},
  ...BLOCK_COLUMNS.filter(column=>!['pbs','block_type'].includes(column.field)),
  {field:'line_id',headerName:'LineID',width:230,hide:true,sortable:false},
]);
const MD_TITLE_COLUMNS=Object.freeze([
  // Outline text remains visible while users inspect/filter metadata columns.
  // Fixed width is intentional: AG Grid's flex width and pinned columns
  // interact poorly in a narrow Dockview pane on iPad WebKit.
  {field:'text',headerName:'MD 行',width:235,minWidth:160,sortable:false,
    pinned:'left',lockPinned:true,lockPosition:'left',
    cellRenderer:renderTitleMdCell,cellClass:'ocr-ag-title-text'},
  {field:'line_no',headerName:'行号',width:89,sortable:true,sort:'asc'},
  {field:'pbs',headerName:'PBS',width:125,sortable:true,comparator:comparePBS},
  {field:'level',headerName:'Level',width:78,sortable:true},
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
  let workspace='',tableReady=false,spanReady=false,blockReady=false,mdReady=false,
    mdSupported=false,operation=0,loaded=0;
  let blockProjectionKind=null;
  let currentSqlTable=null;
  let activeAgView='md'; // AG presentation only; CM6 and SQLite are unchanged.
  let pdfPage=1;
  const projectedMdRows=()=>activeAgView==='title'?
    projectTitleMdRows(md()?.rows??[],cm()?.rows??[]):
    projectLiveMdRows(md()?.rows??[],cm()?.rows??[]);
  let persistence=null,loadingRuntime=null,lastEditedId=null;
  let mdPersistence=null,mdLoading=null;
  const sqlReady=()=>tableReady;
  const readyBlock=()=>blockReady;
  const cm=()=>frame.readStructuredRuntime();
  const md=()=>frame.readMdRuntime();
  const status=()=>runtimeStatus(cm());
  // One semantic event, four independent projections. Never store Markdown in
  // the shared View Store, and never let one pane call another pane's private DOM.
  function locateReview({origin,intent='click',lineId=null,blockId=null,lineNo=null}){
    if(currentSqlTable!=='md'||!md())return null;
    const target=resolveReviewLocation({lineId,blockId,lineNo},md().rows,cm()?.rows??[]);
    if(target)publishLabFocus({origin,intent,...target});
    return target;
  }
  const unsubscribeLocation=viewStore.subscribe((state,previous)=>{
    const target=state.labFocusTarget;
    if(!target||target===previous.labFocusTarget||currentSqlTable!=='md'||!md())return;
    // PDF page must be updated BEFORE AG attempts to select its filtered row.
    if(target.page)frame.setSqlPdfPage(target.page);
    if(target.origin!=='ag'){
      const found=target.lineId?frame.selectMdLine(target.lineId):null;
      const fallback=!found&&target.blockId!=null?
        frame.selectSqlRowById({field:'block_id',id:target.blockId,
          preserveFilters:true,focusSource:false}):false;
      // A hidden/absent row is not the previously selected AG row. Keep all
      // filters, but clear the stale highlight instead of implying a match.
      if(!found&&!fallback)frame.clearMdAgSelection();
    }
    if(target.lineNo){
      frame.highlightMdSource(target.lineNo,{reveal:target.origin!=='cm6'&&target.intent==='click'});
      frame.highlightMdPreview(target.lineNo,{reveal:target.origin!=='preview'&&target.intent==='click'});
    }else{
      frame.highlightMdSource(null);
      frame.highlightMdPreview(null);
    }
    // External navigation is a caret move, not a text edit or focus steal.
    // Source-origin gestures keep their exact CM6 position; AG rows may point
    // to a later line but the source caret always lands at logical Block start.
    if(target.origin!=='cm6'&&target.intent==='click'){
      const first=sourceBlockStartLine(target,md().rows);
      if(first!==null)frame.focusMdLine(first,{focus:false});
    }
    if(target.blockId!=null&&target.page&&target.origin!=='pdf')
      frame.focusPdfBlock({id:target.blockId,page:target.page,
        reveal:target.intent==='click'});
    else if(target.blockId==null||!target.page)frame.clearPdfFocus();
  });
  frame.setMdPreviewNavigation(lineNo=>locateReview({origin:'preview',lineNo}));
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
  function mdContentChanged(next){
    if(currentSqlTable==='md')frame.patchMdRows(projectedMdRows());
    if(currentSqlTable==='md')frame.setMdEditHistory();
    frame.setMarkdownPreview(next.rows.map(r=>r.text).join('\n'));
    if(mdPersistence&&next.dirty)mdPersistence.changed();
  }
  function mdCursorChanged(lineNo,{docChanged=false}={}){
    if(currentSqlTable!=='md')return;
    const row=md()?.rows[lineNo-1];
    if(row)locateReview({origin:'cm6',lineId:row.line_id,
      intent:docChanged?'edit':'click'});
  }
  function bindMdPersistence(){
    if(mdPersistence)return mdPersistence;
    const book=workspace;
    mdPersistence=createMdPersistence({
      read:md,
      ack:(rows,revision)=>{
        frame.replaceMdRuntime(acknowledgeMdRuntime(md(),rows,revision));
      },
      post:async batch=>{
        if(cm()?.queue.length)await flushBlockChanges();
        // Browser keepalive bodies are capped near 64 KiB. A large pasted MD
        // splice must be sent as a normal request, never silently rejected.
        return request('md-save',{workspace:book,blockRevision:cm()?.revision??0,
          ...batch},true,{keepalive:false});
      },
      onStatus,
    });
    return mdPersistence;
  }
  async function ensureMdRuntime(){
    if(md())return md();
    if(mdLoading)return mdLoading;
    if(!workspace||!blockReady||!mdSupported)return null;
    const book=workspace,epoch=operation;
    mdLoading=(async()=>{
      await ensureBlockRuntime();
      let result=await request('md-state',{workspace:book});
      if(result.status==='missing'){
        if(cm()?.queue.length)await flushBlockChanges();
        result=await request('md-initialize',{workspace:book},true);
      }
      if(book!==workspace||epoch!==operation)
        throw Error('工作区已切换，拒绝载入旧书籍 MD');
      if(!Array.isArray(result.rows)||!result.rows.length)
        throw Error('MD 行表为空，拒绝显示不完整文稿');
      frame.loadMdRuntime(createMdRuntime(result.rows,result.revision),{
        reconcile:(state,text,options)=>editedMdRuntime(state,text,
          ()=>'md-'+crypto.randomUUID(),options),
        onChange:mdContentChanged,
        onSelection:mdCursorChanged,
      });
      frame.setMarkdownPreview(result.rows.map(r=>r.text).join('\n'));
      mdReady=true;
      bindMdPersistence();
      revealNavigation();
      onStatus('MD 行表已就绪 · '+result.rows.length+' 行，CM6 已加载完整 Markdown','ok');
      return md();
    })();
    try{return await mdLoading;}
    finally{mdLoading=null;}
  }
  async function flushMdChanges(){
    return md()?.dirty?bindMdPersistence().flush():false;
  }
  async function flushAllChanges(){
    const block=await flushBlockChanges();
    const document=await flushMdChanges();
    return block||document;
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
        const ambiguous=cm().rows.some(row=>{
          if(row.global_page+1!==page||row.parent_block_id===null)return false;
          const parent=byId.get(row.parent_block_id);
          return parent&&parent.global_page!==row.global_page&&
            (parent.parent_block_id!==null||
             !String(row.pbs).startsWith(String(parent.pbs)+'s'));
        });
        if(ambiguous){
          // Never silently renumber a legacy cross-page link whose display
          // PBS contradicts its immutable ParentID. Keep the original CM
          // state for manual review instead of overwriting it on load.
          onStatus(`第 ${page} 页存在跨页旧关系/PBS 冲突，跳过自动两级整理以保护人工结果`,'warning');
          continue;
        }
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
    if(md()){
      const nextRows=reorderMdByBlocks(md().rows,cm().rows);
      if(mdSplice(md().rows,nextRows)){
        const prior=md();
        const updated={...prior,rows:nextRows,version:prior.version+1,
          dirty:Boolean(mdSplice(prior.savedRows,nextRows))};
        frame.replaceMdRuntime(updated);
        mdContentChanged(updated);
      }else if(currentSqlTable==='md'){
        // A Block's PBS may change without changing its MD text/order.
        frame.patchMdRows(projectedMdRows());
      }
    }
    for(const page of result.pages??[result.page])
      frame.repaintPdfBlockPage(page);
    if(selectedId!=null){
      const selectedRow=cm()?.rows.find(row=>row.block_id===selectedId);
      const displayId=selectedRow?.absorbed_into_block_id??selectedId;
      lastEditedId=displayId;
      // The user just dropped a label at the intended location. Update only
      // its selection, never re-center the PDF as if AG requested navigation.
      const displayPage=cm()?.rows.find(row=>row.block_id===displayId)?.global_page+1||result.page;
      frame.focusPdfBlock({id:displayId,page:displayPage,reveal:false});
      if(currentSqlTable==='block')
        frame.selectSqlRowById({field:'block_id',id:displayId});
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
      level:'block',blockGroups:[REVIEW_BLOCK_GROUP],allowSpan:spanReady,
      onPageChange:page=>{
        if(!Number.isSafeInteger(page)||page<1)return;
        pdfPage=page;
        if(currentSqlTable==='block'||currentSqlTable==='md')frame.setSqlPdfPage(page);
      },
      onBlockSelect:({blockId,pbs})=>{
        const id=Number(blockId);
        // PDF must not switch out of the full Markdown four-pane review when
        // the target MD line happens to be filtered out of AG.
        if(currentSqlTable==='md'){
          const target=locateReview({origin:'pdf',blockId:id});
          onStatus(target?.lineNo?`PDF → 四窗 · ${pbs} · BlockID ${id}`:
            `PDF BlockID ${id} 暂无可定位的 MD 行`,target?.lineNo?'ok':'warning');
        }else if(currentSqlTable==='block'&&frame.selectSqlRowById({field:'block_id',id})){
          onStatus(`PDF → AG · ${pbs} · BlockID ${id}`,'ok');
        }else{
          void openSql('block',{selectedId:id}).then(success=>{
            if(success)onStatus(`PDF → AG · ${pbs} · BlockID ${id}`,'ok');
          });
        }
      },
      onExtractText:({blockId,text})=>{
        if(!md()||!workspace)throw Error('尚未加载可编辑 Markdown 源码');
        if(typeof text!=='string'||!text.trim())
          throw Error('所选 PDF 覆盖框内没有原生文本层文字');
        const block=cm()?.rows.find(row=>String(row.block_id)===String(blockId));
        // The PDF viewer supplies the exact PDF.js bbox-region text; the
        // Block row is used only for the status label, never as a fallback.
        frame.insertMdAtCursor(text);
        onStatus(`PDF · 已提取 ${block?.pbs??blockId} 的 PDF 文本层 ${text.length} 个字符到 CM6 光标处；可撤销`,'ok');
      },
      onBlockDragIntent:intent=>executeBlockGesture(intent),
      projectPage:data=>projectBlockOverlays(cm(),data),
      loadPage:(page,level)=>request('overlays',{workspace:directory,page,level}),
    }:{level:'off',loadPage:null,blockGroups:null,onBlockSelect:null,
      onExtractText:null,
      onBlockDragIntent:null,projectPage:null,onPageChange:null});
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
      if(workspace&&!mdReady&&!group.querySelector('option[value="sql:initialize"]'))
        group.append(new Option('数据库管理 · 初始化 SQL（重建扩展）','sql:initialize'));
      if(mdReady)group.querySelector('option[value="sql:initialize"]')?.remove();
      if(tableReady&&!group.querySelector(`option[value="${NAV_VALUE}"]`))
        group.append(new Option('minerujson',NAV_VALUE));
      if(mdReady&&!group.querySelector(`option[value="${MD_VALUE}"]`))
        group.append(new Option('md',MD_VALUE));
      if(blockReady&&!group.querySelector(`option[value="${BLOCK_VALUE}"]`))
        group.append(new Option('block',BLOCK_VALUE));
      if(spanReady&&!group.querySelector(`option[value="${SPAN_VALUE}"]`))
        group.append(new Option('span',SPAN_VALUE));
      if(!spanReady)group.querySelector(`option[value="${SPAN_VALUE}"]`)?.remove();
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
      blockReady=result.status!=='missing';
      blockProjectionKind=result.kind??'table';
      revealNavigation();
      if(!blockReady){
        onStatus('MinerU 无损源表已就绪；请在 SQLite → 数据库管理中手动初始化 para Block VIEW','warning');
        return false;
      }
      onStatus(result.kind==='table'
        ?'检测到旧版 Block 实体表；点击 SQLite → 数据库管理才会重建为 VIEW（清空旧审阅）'
        :`SQLite · para Block VIEW：${result.blocks} 行已就绪`,
        result.kind==='table'?'warning':'ok');
      return true;
    }catch(error){
      if(epoch===operation){blockReady=false;revealNavigation();
        onStatus('block 表生成失败，其他数据仍可用：'+error.message,'error');}
      return false;
    }
  }
  async function inspectAndImport(nextWorkspace){
    const epoch=++operation;
    if(cm()?.queue.length||md()?.dirty)
      throw Error('CM Block/MD 尚有待持久操作，必须先保存，拒绝切换/重建');
    persistence?.dispose();persistence=null;loadingRuntime=null;
    mdPersistence?.dispose();mdPersistence=null;mdLoading=null;
    frame.replaceStructuredRuntime(null);
    frame.clearMdRuntime();
    pdfPage=1;
    workspace=nextWorkspace;
    lastEditedId=null;
    frame.setSqlEditHistory();
    tableReady=false;spanReady=false;blockReady=false;mdReady=false;mdSupported=false;
    currentSqlTable=null;hideNavigation();frame.clearSqlRows();
    if(!workspace){prepareOverlays('');warmPdf('');onStatus('请在全局设置中绑定书籍工作目录','warning');return false;}
    onStatus('检查工作区：MinerU JSON 与 PDF…','info');
    try{
      const result=await request('inspect',{workspace});
      if(epoch!==operation)return false;
      mdSupported=result.mdSupported===true;
      if(result.status==='changed'){
        // Do not auto-overwrite reviewed/imported source material.
        tableReady=result.blocks>0;
        if(tableReady){
          revealNavigation();
          if(await createBlockTable(epoch)&&blockProjectionKind==='table')await createSpanTable(epoch);
        }
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
      tableReady=true;revealNavigation();
      if(await createBlockTable(epoch)&&blockProjectionKind==='table')await createSpanTable(epoch);
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
    prepareOverlays(imported&&blockReady?saved:'');warmPdf(saved);
    if(imported&&blockReady&&mdSupported){
      try{await ensureMdRuntime();}
      catch(error){onStatus('MD 行表加载失败；旧 Block 审阅仍可用：'+error.message,'error');}
    }
    return imported;
  }
  async function afterSave(){
    const saved=await savedWorkspace();
    if(saved!==workspace){
      await flushAllChanges();
    }
    if(saved===workspace&&tableReady)return true; // never reload CM from an old SQL snapshot
    if(!saved){++operation;workspace='';tableReady=false;spanReady=false;blockReady=false;currentSqlTable=null;hideNavigation();
      frame.clearSqlRows();prepareOverlays('');warmPdf('');await showModule('settings');
      onStatus('尚未绑定工作区，请在全局设置中选择书籍目录','warning');return false;}
    const success=await inspectAndImport(saved);
    if(success){prepareOverlays(saved);warmPdf(saved);}
    return success;
  }
  // AG view switching is a re-projection of the resident CM6 Markdown.
  // It never reopens SQLite or replaces the MD editor StateField.
  function renderMdAg(){
    const title=activeAgView==='title';
    const rows=projectedMdRows();
    const columns=title?MD_TITLE_COLUMNS:MD_COLUMNS;
    frame.showSqlRows(rows,columns.map(column=>({
      ...column,
      ...(column.field==='text'?{editable:true,valueSetter:params=>{
        if(typeof params.newValue!=='string'||/[\r\n]/.test(params.newValue)){
          onStatus('AG MD 一行只能编辑一行文本；拆分请在源码窗使用 Enter','warning');
          return false;
        }
        try{frame.editMdLine(params.data.line_id,params.newValue);}
        catch(error){onStatus('MD 行编辑失败：'+error.message,'error');}
        return false;
      }}:{}),
      filter:EnumCheckboxFilter,
      filterValueGetter:params=>column.field==='line_no'?
        mdLineKind(params.data?.text):column.field==='pbs'?
          pbsPageKey(params.data?.pbs):params.data?.[column.field]??'',
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false,
    })),{
      pageScope:{page:pdfPage},
      // Title is a document-wide view by default, with the existing AG
      // all-pages checkbox visibly checked; users may uncheck for this page.
      allPagesInitially:title,
      expandPageOnCategory:title?null:'block_type',
      // Blank lines remain in the source/SQL, hidden only in both AG views.
      initialFilterModel:{line_no:{values:['非空行']}},
      onSelect:row=>{
        locateReview({origin:'ag',lineId:row.line_id});
        onStatus('MD 四窗定位 · '+row.line_no+' · BlockID '+(row.block_id??'NULL'),'info');
      },
    });
    frame.setAgView(activeAgView);
    frame.setMdEditHistory();
    return rows.length;
  }
  function setAgView(view){
    if(!['md','title'].includes(view))throw Error('未知 AG 过滤视图');
    activeAgView=view;
    frame.setAgView(view);
    if(currentSqlTable!=='md'||!md())return false;
    const count=renderMdAg();
    onStatus(`AG ${view==='title'?'标题':'MD 行'}视图 · ${count} 条投影 · 不修改 MD/SQLite`,'ok');
    return true;
  }
  async function openSql(table='minerujson',{selectedId=null}={}){
    if(table==='md'){
      if(!blockReady||!mdSupported){
        onStatus('MD 行表需要已初始化的 Block 和支持 MD 的 Lab 后端','warning');
        return false;
      }
      try{
        await ensureMdRuntime();
        const rows=md().rows;
        renderMdAg();
        currentSqlTable='md';
        frame.setMdEditHistory();
        if(selectedId!=null){
          const selected=frame.selectSqlRowById({field:'block_id',id:selectedId,preserveFilters:true});
          if(!selected)onStatus('BlockID '+selectedId+' 暂无 MD 行','warning');
        }
        onStatus('CM6 Markdown · '+rows.length+' 行（含空行）· AG 是同一份 MD 的行视图','ok');
        return true;
      }catch(error){onStatus('MD 行表打开失败：'+error.message,'error');return false;}
    }
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
        filterValueGetter:params=>table==='block'&&column.field==='pbs'?
          pbsPageKey(params.data?.pbs):params.data?.[column.field]??'',
        suppressHeaderMenuButton:true,
        suppressHeaderFilterButton:false,
      })),{pageScope:table==='block'?{page:pdfPage}:null,
        onSelect:row=>{
        if(table==='span')onStatus(`Span 定位：P${row.global_page} · ${row.block_id} · L${row.line_index} · S${row.span_index} · bbox ${row.span_bbox_json}`,'info');
        if(table==='block'){
          frame.focusPdfBlock({id:row.block_id,page:Number(row.global_page)+1});
          onStatus(`Block 定位：${row.pbs} · BlockID ${row.block_id} · ParentID ${row.parent_block_id??'NULL'} · AG → PDF`,'info');
        }
      }});
      currentSqlTable=table;
      activeAgView='md';frame.setAgView('md');
      if(table==='block')refreshBlockUndoRedo();
      if(selectedId!==null&&table==='block'&&!frame.selectSqlRowById({field:'block_id',id:selectedId})){
        onStatus(`PDF → AG · BlockID ${selectedId} 不在当前载入行中`,'warning');
        return false;
      }
      onStatus(`CM6 · ${table}：${entries.length} 行${table==='block'||table==='span'?'（只含 para_blocks）':''}，AG 只作为派生视图`,'ok');
      return true;
    }catch(error){onStatus('SQL 行读取失败：'+error.message,'error');return false;}
  }
  async function initializeSql(){
    if(mdReady||md()){
      onStatus('已有 MD 行表，禁止清空 Block 审阅及映射；请先独立备份并规划迁移','error');
      return false;
    }
    if(!workspace||!tableReady){
      onStatus('请先在全局设置绑定并导入 MinerU JSON 基础表','warning');return false;
    }
    if(!window.confirm('初始化 SQL 将重建 para Block VIEW 和 block_review 扩展表，并清空现有人工关系、Undo/Redo 历史及旧 Span 表。原始 MinerU JSON 和 PDF 不变。确定继续吗？'))
      return false;
    if(cm()?.queue.length)await flushBlockChanges();
    const active=workspace;
    onStatus('正在事务内重建 para Block VIEW 与扩展表（原始 MinerU 不变）…','info');
    const result=await request('initialize-sql',{workspace:active,confirmReset:true},true);
    if(workspace!==active)throw Error('书籍已切换，必须重新检查初始化结果');
    ++loaded;
    persistence?.dispose();persistence=null;loadingRuntime=null;
    frame.replaceStructuredRuntime(null);
    frame.setSqlEditHistory();
    frame.clearSqlRows();
    currentSqlTable=null;
    blockReady=true;spanReady=false;blockProjectionKind='view';
    hideNavigation();revealNavigation();
    lastOverlayWorkspace='';
    frame.setPdfOverlays({level:'off'});
    prepareOverlays(active);
    onStatus(`✓ 已重新初始化 SQLite：${result.blocks} 个 para Block，block=VIEW、block_review=扩展表；旧审阅历史已清空`,'ok');
    return true;
  }
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&cm()?.queue.length)
      void flushBlockChanges().catch(()=>{});
    if(document.visibilityState==='hidden'&&md()?.dirty)
      void flushMdChanges().catch(()=>{});
  });
  // Normal navigation/page termination gets a best-effort keepalive batch.
  // This cannot guarantee persistence through a browser crash or power loss.
  window.addEventListener('pagehide',()=>{
    if(cm()?.queue.length)void flushBlockChanges().catch(()=>{});
    if(md()?.dirty)void flushMdChanges().catch(()=>{});
  });
  return Object.freeze({savedWorkspace,initialize,initializeSql,afterSave,openSql,
    sqlReady,blockReady:readyBlock,mdReady:()=>mdReady,
    flushBlockChanges,flushAllChanges,refreshNavigation:revealNavigation,
    setAgView,dispose(){unsubscribeLocation();frame.setMdPreviewNavigation(null);}});
}
