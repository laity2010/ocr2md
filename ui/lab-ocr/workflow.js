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
import {projectLatexIndex,latexIndexSummary} from './latex-index.js';
import {projectBlockBreakRows,resolveBlockBreakFocus,renderBlockBreakJoinCell} from './block-break-view.js';
import {createBlockBreakReviewCell} from './block-break-review-cell.js';
import {planBlockBreakMerge,emptyMdChildBlockIds} from './block-break-merge.js';
import {projectNoteMatchRows,resolveNoteMatchFocus,compareNoteNumbers} from './note-match-view.js';
import {DEFAULT_NOTE_MATCH_CONFIG,validateNoteMatchConfig} from './note-match-index.js';
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
const MD_BREAK_COLUMNS=Object.freeze([
  {field:'pbs',headerName:'逻辑块 PBS',width:105,sortable:true,comparator:comparePBS,
    pinned:'left',lockPinned:true,lockPosition:'left'},
  {field:'join_preview',headerName:'接续预览 A / B',width:310,minWidth:205,
    cellRenderer:renderBlockBreakJoinCell,cellClass:'ocr-ag-block-break-preview',sortable:false},
  {field:'review',headerName:'审阅',width:121,minWidth:112,sortable:true,
    pinned:'right',lockPinned:true,lockPosition:'right'},
  {field:'before_pbs',headerName:'前块',width:120,sortable:true,comparator:comparePBS},
  {field:'after_pbs',headerName:'后块',width:120,sortable:true,comparator:comparePBS},
  {field:'before_line_no',headerName:'前行',width:78,sortable:true},
  {field:'line_no',headerName:'后行',width:78,sortable:true},
  {field:'kind',headerName:'类型',width:105,sortable:true},
  {field:'before_text',headerName:'前文末尾',minWidth:185,flex:1,sortable:false},
  {field:'after_text',headerName:'后文开头',minWidth:185,flex:1,sortable:false},
  {field:'reason',headerName:'检测依据',minWidth:210,flex:1,sortable:false},
  {field:'issue_id',headerName:'断块 ID',hide:true,sortable:false},
]);
const MD_NOTE_COLUMNS=Object.freeze([
  {field:'number',headerName:'注号',width:74,sortable:true,sort:'asc',
    comparator:compareNoteNumbers,
    pinned:'left',lockPinned:true,lockPosition:'left'},
  {field:'kind',headerName:'端点',width:72,sortable:true},
  {field:'text',headerName:'注引／注文 · 原文',minWidth:240,flex:1.8,sortable:false,
    cellRenderer:params=>{
      const node=document.createElement('span');
      node.className='ocr-note-match-text';node.dataset.kind=params.data?.kind??'';
      node.textContent=params.value??'';
      node.title='点击这一行定位该端点，原文不会修改';
      return node;
    }},
  {field:'status',headerName:'匹配状态',width:102,sortable:true,
    cellRenderer:params=>{
      const node=document.createElement('span');
      node.className='ocr-note-match-status';node.dataset.status=params.value??'';
      node.textContent=params.value??'';return node;
    }},
  {field:'pbs',headerName:'PBS',width:125,sortable:true,comparator:comparePBS},
  {field:'line_no',headerName:'源码行',width:92,sortable:true},
  {field:'evidence',headerName:'识别规则',minWidth:135,sortable:true},
  {field:'strength',headerName:'证据级别',width:96,sortable:true},
  {field:'reason',headerName:'判断依据',minWidth:210,flex:1,sortable:false},
  {field:'scope',headerName:'范围',minWidth:115,sortable:true},
  {field:'candidate_count',headerName:'可选注文',width:96,sortable:true},
  {field:'note_row_id',headerName:'候选ID',hide:true},
  {field:'line_id',headerName:'LineID',hide:true},
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
  let latexPresentation=null,agViewRequest=0,lastRenderedLatexSummary=null;
  let breakReviews=new Map(),recentlyMerged=new Map(),breakReviewEpoch=0;
  let noteConfig=DEFAULT_NOTE_MATCH_CONFIG,noteConfigRevision=null,noteConfigBook=null;
  let noteDialog=null,lastNoteProjection=null;
  const breakReviewBusy=new Set();
  let pdfPage=1;
  function mergedBreakRow(saved){
    if(saved?.decision!=='断块合并'||!saved.merged)return null;
    const a=md()?.rows.find(row=>row.line_id===saved.before_line_id);
    const b=md()?.rows.find(row=>row.line_id===saved.after_line_id);
    const ba=cm()?.rows.find(row=>row.block_id===a?.block_id);
    const bb=cm()?.rows.find(row=>row.block_id===b?.block_id);
    const offset=saved.split_offset,glue=saved.merge_glue;
    if(!a||!b||!ba||!bb||b.text!==''||
       (typeof saved.before_text==='string'&&saved.before_text!==a.text)||
       (typeof saved.after_text==='string'&&saved.after_text!==b.text)||
       (typeof saved.joinedText==='string'&&saved.joinedText!==a.text)||
       typeof offset!=='number'||offset<1||offset>=a.text.length||
       !['',' '].includes(glue)||a.text.slice(offset,offset+glue.length)!==glue)return null;
    const left=a.text.slice(0,offset),right=a.text.slice(offset+glue.length);
    if(!right.trim())return null;
    const parent=ba.parent_block_id==null?ba:cm().rows.find(row=>
      row.block_id===ba.parent_block_id);
    const beforeToken=/([A-Za-z]{2,60})-?$/.exec(left.trimEnd())?.[1]??'';
    const afterToken=/^([A-Za-z0-9]{2,60})/.exec(right.trimStart())?.[1]??'';
    return {issue_id:saved.issue_id,pbs:parent?.pbs??ba.pbs,
      parent_block_id:parent?.block_id??ba.block_id,
      before_block_id:ba.block_id,after_block_id:bb.block_id,
      before_pbs:ba.pbs,after_pbs:bb.pbs,
      before_line_id:a.line_id,after_line_id:b.line_id,
      before_line_no:a.line_no,line_no:b.line_no,
      block_id:b.block_id,line_id:b.line_id,global_page:bb.global_page,
      before_token:beforeToken,after_token:afterToken,
      before_text:left.slice(-110),after_text:right.slice(0,110),
      boundary:beforeToken+' / '+afterToken,
      join_preview:left.slice(-110)+glue+right.slice(0,110),
      reason:'已通过 CM6 合并，后块保留空行及原 PDF 覆盖框',
      kind:'已合并',review:'断块合并',merged:true};
  }
  function projectBreakReviewRows(){
    const pending=projectBlockBreakRows(md()?.rows??[],cm()?.rows??[]).map(
      row=>({...row,review:breakReviewDecision(row)}));
    const candidates=new Set(pending.map(row=>row.issue_id));
    const merged=[...new Map([...breakReviews,...recentlyMerged]).values()]
      .filter(saved=>!candidates.has(saved.issue_id)).map(mergedBreakRow).filter(Boolean);
    return [...pending,...merged].sort((a,b)=>a.before_line_no-b.before_line_no);
  }
  const projectedMdRows=()=>activeAgView==='latex'?
    latexPresentation.decorateLatexRows(projectLatexIndex(md()?.rows??[],cm()?.rows??[])):
    activeAgView==='title'?projectTitleMdRows(md()?.rows??[],cm()?.rows??[]):
    activeAgView==='block-break'?projectBreakReviewRows():
    activeAgView==='note-match'?(lastNoteProjection=projectNoteMatchRows(
      md()?.rows??[],cm()?.rows??[],noteConfig)).rows:
    projectLiveMdRows(md()?.rows??[],cm()?.rows??[]);
  // One candidate's CM6 edit does not invalidate decisions for independent
  // candidates. Compare their two exact source lines and stable identities
  // against the snapshot validated by the last read-only SQLite GET. An
  // unrelated merged candidate must not turn an existing reviewed pair into
  // misleading "待定" and trigger a false CAS conflict on its next edit.
  function matchingBreakReview(row){
    const saved=breakReviews.get(row.issue_id);
    const a=md()?.rows.find(item=>item.line_id===row.before_line_id);
    const b=md()?.rows.find(item=>item.line_id===row.after_line_id);
    if(!saved||saved.before_line_id!==row.before_line_id||
       saved.after_line_id!==row.after_line_id||
       saved.before_text!==a?.text||saved.after_text!==b?.text)return null;
    return saved;
  }
  function breakReviewDecision(row){
    const saved=matchingBreakReview(row);
    if(md()?.dirty||cm()?.queue?.length)return '待定';
    return saved&&!(saved.decision==='断块合并'&&!saved.merged)&&
      !saved.merged?saved.decision:'待定';
  }
  async function loadBreakReviews(){
    const epoch=++breakReviewEpoch,book=workspace,op=operation;
    // Local uncommitted CM6 source is newer than disk: never paint stored
    // decisions onto a divergent source before the user explicitly saves.
    if(md()?.dirty||cm()?.queue?.length)return false; // preserve snapshots; projection checks evidence
    const result=await request('block-break-reviews',{workspace:book});
    if(epoch!==breakReviewEpoch||book!==workspace||op!==operation)return false;
    breakReviews=new Map((result.reviews??[]).filter(item=>
      typeof item.issue_id==='string'&&
      ['断块合并','忽略'].includes(item.decision)).map(item=>{
        const before=md()?.rows.find(row=>row.line_id===item.before_line_id);
        const after=md()?.rows.find(row=>row.line_id===item.after_line_id);
        return [item.issue_id,{...item,
          before_text:before?.text,after_text:after?.text}];
      }));
    return true;
  }
  async function chooseBreakReview(row,decision){
    const book=workspace,op=operation,issue=row?.issue_id;
    if(breakReviewBusy.has(issue))return;
    const current=projectBlockBreakRows(md()?.rows??[],cm()?.rows??[]).find(
      item=>item.issue_id===issue&&item.after_line_id===row?.after_line_id);
    if(!current||md()?.dirty||cm()?.queue?.length){
      onStatus('请先保存 Block/MD 修改，再审阅最新断块候选','warning');return;
    }
    const before=md().rows.find(item=>item.line_id===current.before_line_id);
    const after=md().rows.find(item=>item.line_id===current.after_line_id);
    if(!before||!after)return;
    const recorded=matchingBreakReview(current);
    // The displayed label may say "待定" for a legacy WP3 record-only
    // merge. CAS must still use the real SQLite decision, never the label.
    const expected=recorded?.decision??'待定';
    let plan=null;
    if(decision==='断块合并'){
      try{plan=planBlockBreakMerge(current,md().rows,cm().rows);}
      catch(error){onStatus('断块合并不可执行：'+error.message,'warning');return;}
    }
    const mdVersion=md().version;
    breakReviewBusy.add(issue);
    try{
      const saved=await request('block-break-review-set',{workspace:book,
        beforeBlockId:current.before_block_id,afterBlockId:current.after_block_id,
        beforeLineId:current.before_line_id,afterLineId:current.after_line_id,
        beforeText:before.text,afterText:after.text,
        decision,expectedDecision:expected},true);
      if(op!==operation||book!==workspace)return;
      if(saved.issue_id!==issue||saved.decision!==decision)throw Error('审阅回执与候选不一致');
      if(md().version!==mdVersion){
        onStatus('断块审阅时原文被编辑，请重新载入该候选并检查原文','warning');return;
      }
      if(plan){
        // Keep the status row visible through CM6's synchronous onChange,
        // which replaces the original candidate with an empty-child row.
        recentlyMerged.set(issue,{issue_id:issue,decision:'断块合并',
          merged:true,before_line_id:plan.beforeLineId,after_line_id:plan.afterLineId,
          split_offset:plan.joinLeftLength,merge_glue:plan.joinGlue,
          joinedText:plan.joinedText});
        frame.mergeMdBlockBreak(plan);
        // Fast persistence prevents losing a reviewed merge if the browser
        // reloads. This is still the existing CM6 md-save/CAS pipeline.
        await flushMdChanges();
        if(op!==operation||book!==workspace)return;
        breakReviews.set(issue,{...recentlyMerged.get(issue),
          before_text:plan.joinedText,after_text:''});
        onStatus(`✓ 已合并 ${current.before_pbs} → ${current.after_pbs} · 后块保留空行和虚线 PDF 框 · CM6 可撤销`,'ok');
        return;
      }
      if(decision==='待定')breakReviews.delete(issue);
      else breakReviews.set(issue,{issue_id:issue,decision,merged:false,
        before_line_id:before.line_id,after_line_id:after.line_id,
        before_text:before.text,after_text:after.text});
      if(activeAgView==='block-break'&&currentSqlTable==='md')
        frame.patchMdRows(projectedMdRows());
      onStatus(`断块审阅 · ${current.before_pbs} → ${current.after_pbs} · ${decision} · 已保存（原文未变）`,'ok');
    }catch(error){
      if(/审阅状态已有其他修改|并发状态冲突/.test(error.message)){
        // Real concurrent writes or a stale source snapshot are NOT an
        // instruction to overwrite somebody else's review. Refresh the
        // authoritative state and require an explicit second selection.
        try{
          const reloaded=await loadBreakReviews();
          if(reloaded&&activeAgView==='block-break'&&currentSqlTable==='md')
            frame.patchMdRows(projectedMdRows());
          onStatus(reloaded?'断块审阅状态已从 SQLite 更新；请核对并重新选择':
            '审阅状态冲突且源码正在修改；请先保存再重新加载候选','warning');
        }catch(refreshError){
          onStatus('断块审阅冲突且同步失败：'+refreshError.message,'error');
        }
      }else onStatus('断块审阅保存失败：'+error.message,'error');
    }finally{breakReviewBusy.delete(issue);}
  }
  const reviewCell=createBlockBreakReviewCell(chooseBreakReview);
  let persistence=null,loadingRuntime=null,lastEditedId=null;
  let mdPersistence=null,mdLoading=null;
  const sqlReady=()=>tableReady;
  const readyBlock=()=>blockReady;
  const cm=()=>frame.readStructuredRuntime();
  const md=()=>frame.readMdRuntime();
  const status=()=>runtimeStatus(cm());
  async function loadNoteRules(){
    if(!workspace)throw Error('请先绑定书籍工作目录');
    const book=workspace,op=operation;
    const data=await request('note-match-rules',{workspace:book});
    if(book!==workspace||op!==operation)return false;
    noteConfig=validateNoteMatchConfig(data.config);
    noteConfigRevision=data.revision;noteConfigBook=book;
    return true;
  }
  async function saveNoteRules(config){
    if(!workspace||noteConfigBook!==workspace||!noteConfigRevision)
      throw Error('没有当前书籍的规则版本，请重新打开注释匹配视图');
    const book=workspace,op=operation,checked=validateNoteMatchConfig(config);
    try{
      const result=await request('note-match-rules-save',{workspace:book,
        config:checked,expectedRevision:noteConfigRevision},true);
      if(book!==workspace||op!==operation)throw Error('书籍已切换，规则回执过期');
      noteConfig=validateNoteMatchConfig(result.config);
      noteConfigRevision=result.revision;
      if(activeAgView==='note-match'&&currentSqlTable==='md')
        frame.patchNoteRows(projectedMdRows());
      onStatus('注释匹配 · 当前书籍识别规则已保存并立即重新扫描，Markdown 未修改','ok');
      return true;
    }catch(error){
      if(/已有其他修改/.test(error.message)){
        await loadNoteRules();
        if(activeAgView==='note-match'&&currentSqlTable==='md')
          frame.patchNoteRows(projectedMdRows());
        onStatus('注释规则已从书籍重新载入，原修改未覆盖；请复核后再保存','warning');
      }
      throw error;
    }
  }
  async function openNoteRulesDialog(){
    if(!noteDialog){
      const module=await import('./note-match-rules-dialog.js');
      noteDialog=module.createNoteMatchRulesDialog({onSave:saveNoteRules});
    }
    noteDialog.open(noteConfig);
  }

  // One semantic event, four independent projections. Never store Markdown in
  // the shared View Store, and never let one pane call another pane's private DOM.
  function locateReview({origin,intent='click',lineId=null,blockId=null,lineNo=null,
    formulaColumn=null,formulaEndColumn=null,formulaBBox=null,formulaKind=null,blockBreakId=null,
    noteFrom=null,noteTo=null}={}){
    if(currentSqlTable!=='md'||!md())return null;
    const target=resolveReviewLocation({lineId,blockId,lineNo},md().rows,cm()?.rows??[]);
    if(target){
      // A span present only in MinerU must NEVER claim a neighboring source
      // line is its own formula. Keep PDF BlockID+bbox but clear MD caret.
      const exactMissing=origin==='ag'&&Array.isArray(formulaBBox)&&
        !Number.isInteger(formulaColumn);
      publishLabFocus({origin,intent,...target,
      ...(exactMissing?{lineId:null,lineNo:null}:{}),
      ...(origin==='ag'&&Number.isInteger(formulaColumn)&&formulaColumn>=0?
        {formulaColumn}:{}),
      ...(origin==='ag'&&Number.isInteger(formulaEndColumn)&&
        Number.isInteger(formulaColumn)&&formulaEndColumn>formulaColumn?
        {formulaEndColumn}:{}),
      ...(origin==='ag'&&Array.isArray(formulaBBox)?{formulaBBox}:{}),
      ...(origin==='ag'&&formulaKind!==null?{formulaKind}:{}),
      ...(origin==='ag'&&blockBreakId?{blockBreakId}:{}),
      ...(origin==='ag'&&Number.isInteger(noteFrom)&&Number.isInteger(noteTo)?
        {noteFrom,noteTo}:{}),
      });
      return exactMissing?{...target,lineId:null,lineNo:null}:target;
    }
    return null;
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
      if(Number.isInteger(target.noteFrom)&&Number.isInteger(target.noteTo)&&target.lineNo)
        frame.focusMdNoteRange({lineNo:target.lineNo,from:target.noteFrom,
          to:target.noteTo,focus:false});
      else if(Number.isInteger(target.formulaColumn)&&target.lineNo)
        frame.focusMdFormula({lineNo:target.lineNo,column:target.formulaColumn,
          endColumn:target.formulaEndColumn,kind:target.formulaKind,focus:false});
      else if(Array.isArray(target.formulaBBox)&&target.lineNo===null){
        // OCR-only/ambiguous Span: PDF-only focus, no fictitious MD caret.
      }else{
        const first=sourceBlockStartLine(target,md().rows);
        if(first!==null)frame.focusMdLine(first,{focus:false});
      }
    }
    if(target.blockId!=null&&target.page&&target.origin!=='pdf'){
      if(Array.isArray(target.formulaBBox))
        frame.focusPdfFormula({id:target.blockId,page:target.page,
          bbox:target.formulaBBox,kind:target.formulaKind,reveal:target.intent==='click'});
      else frame.focusPdfBlock({id:target.blockId,page:target.page,
        reveal:target.intent==='click'});
    }else if(target.blockId==null||!target.page)frame.clearPdfFocus();
    frame.setReviewPair(activeAgView==='block-break'&&target.blockBreakId?
      resolveBlockBreakFocus({issueId:target.blockBreakId,
        lineId:target.lineId,blockId:target.blockId},md().rows,cm()?.rows??[]):null);
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
    // Keep independent decisions. matchingBreakReview checks the old
    // snapshot for each pair and hides only changed evidence; a transient
    // edit/Undo may restore the same pair without discarding its CAS state.
    ++breakReviewEpoch;
    for(const [id,item] of recentlyMerged){
      const before=next.rows.find(row=>row.line_id===item.before_line_id);
      const after=next.rows.find(row=>row.line_id===item.after_line_id);
      if(before?.text!==item.joinedText||after?.text!=='')recentlyMerged.delete(id);
    }
    frame.setEmptyMdBlocks(emptyMdChildBlockIds(next.rows,cm()?.rows??[]));
    frame.setReviewPair(null,{skipSource:true}); // CM6 docChanged already clears its own decorations
    if(currentSqlTable==='md'){
      if(activeAgView==='note-match')frame.patchNoteRows(projectedMdRows());
      else if(activeAgView==='latex'){
        const rows=projectedMdRows();
        frame.patchFormulaRows(rows);
        frame.setLatexHighlights(rows);
      }
      else frame.patchMdRows(projectedMdRows());
    }
    if(currentSqlTable==='md')frame.setMdEditHistory();
    frame.setMarkdownPreview(next.rows.map(r=>r.text).join('\n'),{nativeInlineMath:true});
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
        // mdContentChanged briefly shows pending while CM6 has unsaved
        // edits. Acknowledging the SQL CAS changes dirty -> false without
        // a docChanged event, so explicitly reproject just this AG view.
        // Otherwise every independent reviewed row stays visually "待定"
        // even after it becomes valid again, despite correct local cache.
        if(currentSqlTable==='md'&&activeAgView==='block-break')
          frame.patchMdRows(projectedMdRows());
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
      frame.setMarkdownPreview(result.rows.map(r=>r.text).join('\n'),{nativeInlineMath:true});
      frame.setEmptyMdBlocks(emptyMdChildBlockIds(result.rows,cm()?.rows??[]));
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
    frame.setEmptyMdBlocks(emptyMdChildBlockIds(md()?.rows??[],result.state?.rows??cm()?.rows??[]));
    ++breakReviewEpoch; // retain unaffected decisions; candidates and text snapshots validate identity
    frame.setReviewPair(null); // Block relationships may have moved
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
        if(activeAgView==='note-match')frame.patchNoteRows(projectedMdRows());
        else if(activeAgView==='latex'){
          const rows=projectedMdRows();
          frame.patchFormulaRows(rows);
          frame.setLatexHighlights(rows);
        }
        else frame.patchMdRows(projectedMdRows());
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
    breakReviews.clear();recentlyMerged.clear();++breakReviewEpoch;breakReviewBusy.clear();
    noteDialog?.dispose();noteDialog=null;
    noteConfig=DEFAULT_NOTE_MATCH_CONFIG;noteConfigRevision=null;noteConfigBook=null;lastNoteProjection=null;
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
    if(!saved){frame.setReviewPair(null);++operation;workspace='';tableReady=false;spanReady=false;blockReady=false;currentSqlTable=null;hideNavigation();
      frame.clearSqlRows();prepareOverlays('');warmPdf('');await showModule('settings');
      onStatus('尚未绑定工作区，请在全局设置中选择书籍目录','warning');return false;}
    const success=await inspectAndImport(saved);
    if(success){prepareOverlays(saved);warmPdf(saved);}
    return success;
  }
  // AG view switching is a re-projection of the resident CM6 Markdown.
  // It never reopens SQLite or replaces the MD editor StateField.
  function renderMdAg(){
    const title=activeAgView==='title',latex=activeAgView==='latex',
      broken=activeAgView==='block-break',notes=activeAgView==='note-match';
    const rows=projectedMdRows();
    lastRenderedLatexSummary=latex?latexIndexSummary(rows):null;
    const columns=latex?latexPresentation.latexColumns({filter:EnumCheckboxFilter,pbsPageKey,
        getPdfFormulaCrop:target=>frame.getPdfFormulaCrop(target)}):
      title?MD_TITLE_COLUMNS:broken?MD_BREAK_COLUMNS:notes?MD_NOTE_COLUMNS:MD_COLUMNS;
    frame.showSqlRows(rows,columns.map(column=>({
      ...column,
      ...(broken&&column.field==='review'?{cellRenderer:reviewCell}:{}),
      ...(column.field==='text'&&!latex&&!broken&&!notes?{editable:true,valueSetter:params=>{
        if(typeof params.newValue!=='string'||/[\r\n]/.test(params.newValue)){
          onStatus('AG MD 一行只能编辑一行文本；拆分请在源码窗使用 Enter','warning');
          return false;
        }
        try{frame.editMdLine(params.data.line_id,params.newValue);}
        catch(error){onStatus('MD 行编辑失败：'+error.message,'error');}
        return false;
      }}:{}),
      filter:column.filter??EnumCheckboxFilter,
      filterValueGetter:column.filterValueGetter??(params=>column.field==='line_no'?
        mdLineKind(params.data?.text):column.field==='pbs'?
          pbsPageKey(params.data?.pbs):params.data?.[column.field]??''),
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false,
    })),{
      pageScope:{page:pdfPage},
      allPagesInitially:title||latex||broken||notes,
      expandPageOnCategory:title?null:latex||broken||notes?'kind':'block_type',
      initialFilterModel:latex||broken||notes?null:{line_no:{values:['非空行']}},
      rowHeight:latex?134:broken?92:notes?66:35,
      onSelect:row=>{
        if(notes){
          const anchor=resolveNoteMatchFocus(row,md()?.rows??[],cm()?.rows??[]);
          if(!anchor){onStatus(row.status==='疑似缺号'?`注号 ${row.number} 疑似缺失 · ${row.reason}`:
            '注释端点缺失或文本已变化，请刷新候选','warning');return;}
          locateReview({origin:'ag',lineId:anchor.lineId,blockId:anchor.blockId,
            lineNo:anchor.lineNo,noteFrom:anchor.from,noteTo:anchor.to});
          onStatus(`注释 ${row.number} · ${row.kind} · ${anchor.pbs??'无 PBS'} · `+
            `${row.status} · ${row.evidence} · 源码第 ${anchor.lineNo} 行`,'info');
          return;
        }
        const target=locateReview({origin:'ag',lineId:row.line_id,
          ...(broken&&!row.merged?{blockBreakId:row.issue_id}:{}),
          blockId:row.block_id,lineNo:row.line_no,
          ...(latex?{formulaColumn:row.column,
            formulaEndColumn:Number.isInteger(row.column)&&
              typeof row.formula==='string'?row.column+row.formula.length:null,
            formulaBBox:row.pdf_bbox,
            formulaKind:row.kind==='行内'?'inline':row.kind==='独立'?'display':null}:{}),
        });
        onStatus(broken?`断块 · ${row.before_pbs} → ${row.after_pbs} · ${row.boundary} · ${row.merged?'已合并，后块空白、PDF 虚线':'审阅 '+(row.review??'待定')}`:
          latex?
          `LaTeX · ${row.pbs} · ${row.match_status} · ${row.render_status} · `+
            (target?.lineNo?`MD ${target.lineNo}`:'仅 PDF / OCR'):
          `MD 四窗定位 · ${row.line_no} · BlockID ${row.block_id??'NULL'}`,
        latex&&!['已匹配','已修订'].includes(row.match_status)?'warning':'info');
      },
    });
    frame.setAgView(activeAgView);
    frame.setAgAction(notes?{label:'识别规则',onClick:()=>void openNoteRulesDialog()}:{});
    frame.setLatexHighlights(latex?rows:[]);
    frame.setMdEditHistory();
    return rows.length;
  }
  async function setAgView(view){
    if(!['md','title','latex','block-break','note-match'].includes(view))throw Error('未知 AG 过滤视图');
    const token=++agViewRequest;
    if(view==='latex'&&!latexPresentation)
      latexPresentation=await import('./latex-view.js');
    if(view==='note-match')try{await loadNoteRules();}
      catch(error){onStatus('注释规则读取失败：'+error.message,'warning');return false;}
    if(view==='block-break')try{await loadBreakReviews();}
      catch(error){onStatus('断块审阅记录读取失败：'+error.message,'warning');return false;}
    if(token!==agViewRequest||currentSqlTable!=='md'||!md())return false;
    activeAgView=view;
    frame.setReviewPair(null);
    frame.clearMdNoteRange();
    frame.setAgView(view);
    const count=renderMdAg();
    const summary=lastRenderedLatexSummary;
    onStatus(view==='latex'?`AG LaTeX · ${summary.total} 条，原始 ${summary.original}，`+
      `精确匹配 ${summary.matched}，仅 OCR ${summary.ocrOnly}，仅 MD ${summary.mdOnly}，`+
      `有歧义 ${summary.ambiguous}，原图 ${summary.images} · 只读`:
      view==='note-match'?`AG 注释匹配 · ${lastNoteProjection?.index.stats.references??0} 注引、`+
        `${lastNoteProjection?.index.stats.bodies??0} 注文、`+
        `${lastNoteProjection?.index.stats.matched??0} 已匹配、`+
        `${lastNoteProjection?.index.stats.need_review??0} 待核实、`+
        `${lastNoteProjection?.missing_note_numbers.length??0} 个疑似缺号 · 按注号排序 · 只读`:
      `AG ${view==='title'?'标题':view==='block-break'?'断块':'MD 行'}视图 · ${count} 条${view==='block-break'?'疑似断块 · 审阅结果可保存':'投影'} · 不自动修改 MD`,'ok');
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
        if(activeAgView==='block-break')await loadBreakReviews();
        if(activeAgView==='note-match'&&noteConfigBook!==workspace)await loadNoteRules();
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
    frame.setReviewPair(null);
    frame.clearMdNoteRange();frame.setAgAction({});
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
    breakReviews.clear();recentlyMerged.clear();++breakReviewEpoch;breakReviewBusy.clear();
    noteDialog?.dispose();noteDialog=null;
    noteConfig=DEFAULT_NOTE_MATCH_CONFIG;noteConfigRevision=null;noteConfigBook=null;lastNoteProjection=null;
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
    setAgView,dispose(){noteDialog?.dispose();unsubscribeLocation();
      frame.setAgAction({});frame.setMdPreviewNavigation(null);}});
}
