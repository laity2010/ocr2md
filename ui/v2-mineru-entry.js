/** OCR V2 MinerU Base view: compose existing Frame public Settings/navigation/AG.
 * Core ui/frame files remain byte-identical; Vite's isolated adapter exposes
 * Frame's verified workspace and AG setRows/setColumns as narrow event ports.
 */
import {createFrameStatus} from './frame/global-status.js';
import './v2-mineru-base.css';
import {pageForLogical,logicalAtOffset} from './v2-focus-map.js';
import {filterLogicalAG} from './v2-logical-ag-filter.js';
import {AG_VIEWS,viewColumns,viewFilter,titleClickLine,usesMdLines,mdLineColumns} from './v2-ag-views.js';
import {effectiveBlockType} from './v2-live-block-type.js';
import './v2-ag-views.css';
import {resolveV2NoteEndpoint,noteMatchColumns} from './v2-note-match.js';
import {createV2NoteSession} from './v2-note-session.js';
import {planV2NoteConversion} from './v2-note-conversion.js';
import {createNoteMatchStatusCell} from './lab-ocr/note-pair-review-cell.js';
import {mountNoteToolbar} from './v2-note-toolbar.js';
import './lab-ocr/note-match-view.css';
import {projectV2Latex,resolveV2Formula,latexIndexSummary} from './v2-latex.js';
import {decorateLatexRows,latexColumns} from './lab-ocr/latex-view.js';
import './v2-latex.css';
import {createBreakSession,resolveBreakPair,breakColumns} from './v2-block-break.js';
import {createBlockBreakReviewCell} from './lab-ocr/block-break-review-cell.js';
import './v2-block-break.css';
import {createLabOcrMediaView} from './lab-ocr/media-view.js';
import {mediaContext,mediaColumns,planMediaEdits,planBareMediaNormalization,resolveMediaRow} from './v2-media.js';
import './lab-ocr/media-view.css';
import {planV2InlineMath} from './v2-inline-math.js';
import {projectV2TableRows,resolveV2TableLine,TABLE_COLUMNS,planV2TableOrganization} from './v2-table-view.js';
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
let agView='frame',savedLogicalFilter=null,renderedView='frame';
let savedLineFilter=null;
let tableAll=true,savedTableFilter=null;
let noteAll=true,noteFocusKey=null,savedNoteFilter=null,noteToolbar=null;
const noteSession=createV2NoteSession();
function convertMatchedNotes(){
  const source=sourceForNotes();
  if(agView!=='note-match'||!logicalState||!source?.getState().loaded)
    throw Error('请先打开注释匹配 View');
  if(source.getState().dirty||saving||saveBlocked||rebuilding)
    throw Error('请先确认当前正文已保存，再转换匹配');
  const index=source.getMdLineIndex(),plan=planV2NoteConversion(noteSession,index);
  for(const item of plan.failures){
    if(item.bodyId)noteSession.recordIssue(index,item.row.reference_id,item.bodyId,item.reason);
  }
  if(plan.updates.length)source.replaceMdLines(plan.updates);
  renderGrid(logicalState);
  report(plan.converted||plan.failures.length?
    `注释匹配 · 已转换 ${plan.converted} 个 · 失败 ${plan.failures.length} 个${plan.converted?' · 正文待写 SQL':''}`:
    '注释匹配 · 当前没有可转换的已匹配注引',plan.failures.length?'warning':'ok');
}
function completeInlineMath(){
  const source=sourceForNotes();
  if(agView!=='latex'||!source?.getState().loaded||!logicalState)
    throw Error('请先打开 LaTeX View');
  if(source.getState().dirty||saving||saveBlocked||rebuilding)
    throw Error('请先保存当前正文，再补全行内公式');
  if(!latexEvidence.length)throw Error('原始公式证据尚未就绪');
  const index=source.getMdLineIndex(),plan=planV2InlineMath(index,latexEvidence);
  if(plan.updates.length)source.replaceMdLines(plan.updates);
  report(`行内公式 · 补全 ${plan.formulaCount} 条 / ${plan.updates.length} 行 · 已有 ${plan.already.length} 块 · 跳过 ${plan.skipped.length} 块${plan.updates.length?' · 可撤销':''}`,plan.skipped.length?'warning':'ok');
}
let latexAll=true,latexEvidence=[],latexIndex=null,latexRaw=null,latexRows=[],latexFocus=null,savedLatexFilter=null;
let latexPaint=null,latexPaintQueued=false;
const pdfForLatex=()=>$('#workspace .ocr-preview-pdf-host')?.v2PDFPort;
function getLatexRows(index){
  if(index!==latexIndex||latexRaw!==latexEvidence){
    latexRows=decorateLatexRows(projectV2Latex(index,latexEvidence)).map(Object.freeze);
    latexIndex=index;latexRaw=latexEvidence;latexFocus=null;
  }
  return latexRows;
}
function paintLatex(index,rows){
  // renderGrid also runs inside CM6 updateListener: dispatch decorations
  // only AFTER that transaction has finished, and reject stale revisions.
  latexPaint={index,rows};
  if(latexPaintQueued)return;latexPaintQueued=true;
  queueMicrotask(()=>{
    latexPaintQueued=false;
    const job=latexPaint,source=sourceForNotes();
    if(job.index&&(agView!=='latex'||source?.getMdLineIndex()!==job.index))return;
    const mapped=job.rows.filter(r=>resolveV2Formula(job.index,r));
    source?.setLatexHighlights(job.index,mapped);
    $('#workspace')?.classList.toggle('ocr-latex-all-active',Boolean(job.index));
    if(!job.index)pdfForLatex()?.clearFormulaFocus();
    pdfForLatex()?.setFormulaHighlights(job.rows.filter(r=>r.pdf_bbox&&r.page_size).map(r=>({id:r.formula_id,page:r.page,bbox:r.pdf_bbox,pageSize:r.page_size})));
  });
}
function focusAGLatex(port,focus){
  const rows=port.getDisplayedRows();
  const matching=r=>r.block_id===focus.logicalId&&(r.source_line===focus.sourceLine||focus.origin==='pdf');
  const r=rows.find(r=>r.formula_id===latexFocus&&matching(r))||rows.find(matching);
  latexFocus=r?.formula_id??null;port.focusRow('formula_id',latexFocus);
}
const breakSession=createBreakSession();
let breakAll=true,breakFocus=null,savedBreakFilter=null,breakPaint=null,breakQueued=false;
function paintBreak(index,pair){
  breakPaint={index,pair};
  if(breakQueued)return;breakQueued=true;
  queueMicrotask(()=>{
    breakQueued=false;
    const job=breakPaint,source=sourceForNotes();
    if(job.index&&(agView!=='block-break'||source?.getMdLineIndex()!==job.index))return;
    $('#workspace')?.classList.toggle('v2-break-active',Boolean(job.index));
    source?.setBreakPair(job.index,job.pair);
    pdfForLatex()?.setBreakPair(job.pair);
  });
}
function focusAGBreak(port,focus){
  const rows=port.getDisplayedRows(),match=r=>[r.before_block_id,r.after_block_id].includes(focus.logicalId);
  const row=rows.find(r=>r.issue_id===breakFocus&&match(r))||rows.find(match);
  breakFocus=row?.issue_id??null;port.focusRow('issue_id',breakFocus);
  const index=sourceForNotes()?.getMdLineIndex();
  paintBreak(index,row?resolveBreakPair(index,row)??[]:[]);
}
const breakReviewCell=createBlockBreakReviewCell((row,decision)=>{
  try{
    const source=sourceForNotes();
    if(agView!=='block-break'||!source?.getState().loaded||source.getState().dirty||saving||saveBlocked||rebuilding)
      throw Error('请先保存当前正文，再审阅断块');
    const index=source.getMdLineIndex(),plan=breakSession.choose(index,row,decision);
    breakFocus=row.issue_id;
    if(plan.updates.length){source.replaceMdLines(plan.updates);breakSession.accept(plan.receipt);}
    renderGrid(logicalState);
    const latest=source.getMdLineIndex(),current=breakSession.project(latest).find(r=>r.issue_id===breakFocus);
    paintBreak(latest,current?resolveBreakPair(latest,current)??[]:[]);
    report(plan.updates.length?'断块已合并 · 后块保留空行 · 正文可撤销':'断块审阅 · '+decision+' · 仅当前会话','ok');
  }catch(error){report(error.message,'warning');}
});
let mediaAll=true,mediaController=null,mediaBook=null,mediaActive=false,mediaQueued=false,savedMediaFilter=null;
function resetMedia(){
  mediaController?.dispose();mediaController=null;mediaBook=null;mediaActive=false;
  mediaAll=true;savedMediaFilter=null;
}
function getMediaController(){
  const source=sourceForNotes(),book=source?.getWorkspace();
  if(!book||!source?.getMdLineIndex())throw Error('媒体 View 需要当前工作目录和 MD Line');
  if(mediaController&&mediaBook===book)return mediaController;
  resetMedia();mediaBook=book;
  const controller=createLabOcrMediaView({
    request:(op,{workspace,...args},post=false)=>{
      if(workspace!==book||sourceForNotes()?.getWorkspace()!==book)throw Error('书籍已切换');
      return request(op,book,post?{method:'POST',payload:{workspace,...args}}:{query:args});
    },
    read:()=>{
      const p=sourceForNotes();
      return p?.getWorkspace()===book?mediaContext(book,p.getMarkdown(),p.getMdLineIndex()):
        {workspace:'',source:'',mdRows:null,blocks:[]};
    },
    replace:edits=>{
      const p=sourceForNotes();
      if(p?.getWorkspace()!==book||rebuilding||saveBlocked)throw Error('书籍或保存状态已变化');
      const plan=planMediaEdits(p.getMdLineIndex(),p.getMarkdown(),edits);
      if(plan.length)p.replaceMdLines(plan);
      return {changed:edits.length};
    },
    onChanged:()=>{
      if(mediaQueued)return;mediaQueued=true;
      queueMicrotask(()=>{
        mediaQueued=false;
        if(mediaController===controller&&mediaActive&&agView==='media'&&logicalState){
          renderGrid(logicalState);
          document.dispatchEvent(new Event('v2-media-preview-refresh'));
        }
      });
    },onStatus:report,
  });
  mediaController=controller;return controller;
}
function setMediaActive(value){
  if(value===mediaActive)return;
  mediaActive=value;
  if(!value){mediaController?.setActive(false);return;}
  const controller=getMediaController();
  mediaActive=true;controller.setActive(true);
  queueMicrotask(()=>{if(mediaController===controller&&mediaActive)
    void controller.scan().catch(error=>report('媒体清单刷新失败：'+error.message,'warning'));});
}
function organizeTableMarkdown(){
 const p=sourceForNotes(),port=$('#workspace .ocr-outline-grid')?.v2BaseGridPort;
 if(agView!=='table'||!p?.getState().loaded||p.getWorkspace()!==bound||!logicalState||rebuilding||saveBlocked)
   throw Error('表格 View 或保存状态已变化');
 const id=lastFocus?.logicalId;
 if(!port?.getDisplayedRows().some(r=>r.logical_id===id))throw Error('请先选中表格 View 中的一行');
 const plan=planV2TableOrganization(p.getMdLineIndex(),logicalState.rows,id);
 if(plan.length)p.replaceMdLines(plan,{allowMultiline:true});
 report(plan.length?'✓ 表格源码已组织 · 可撤销':'表格源码已是目标格式','ok');
}
function normalizeMediaMarkdown(){
 const p=sourceForNotes();
 if(agView!=='media'||!p?.getState().loaded||rebuilding||saveBlocked)throw Error('媒体 View 或保存状态已变化');
 const plan=planBareMediaNormalization(p.getMdLineIndex(),p.getMarkdown());
 if(plan.length)p.replaceMdLines(plan);
 report(plan.length?`✓ 已规范化 ${plan.length} 条图片引用 · 可撤销`:'图片引用已是规范格式','ok');
}
function focusAGMedia(port,focus){
  const rows=port.getDisplayedRows();
  const row=rows.find(r=>r.block_id===focus.logicalId&&r.line_no===focus.sourceLine)||
    (focus.origin==='pdf'?rows.find(r=>r.block_id===focus.logicalId):null);
  port.focusRow('media_row_id',row?.media_row_id??null);
}
const allForView=()=>agView==='table'?tableAll:agView==='media'?mediaAll:agView==='block-break'?breakAll:agView==='latex'?latexAll:agView==='note-match'?noteAll:showAllLogical;
const sourceForNotes=()=>$('#workspace #editor')?.v2SourcePort;
function getNoteProjection(index){
  return noteSession.project(index,Boolean(sourceForNotes()?.getState().dirty));
}
const noteStatusRenderer=createNoteMatchStatusCell((row,choice,bodyId)=>{
  try{
    if(agView!=='note-match')return false;
    const source=sourceForNotes();
    noteSession.choose(source.getMdLineIndex(),row,choice,bodyId,source.getState().dirty);
    renderGrid(logicalState);report('注释审阅决定已应用 · 仅当前会话','ok');return true;
  }catch(error){report(error.message,'warning');return false;}
});
const renderNoteStatus=params=>{
  const el=noteStatusRenderer(params),select=el.querySelector('select');
  if(select)select.title='人工决定仅当前会话有效；不写入正文或额外 SQL 表';
  return el;
};
let renderedDataTable='',renderedRows=[];
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
async function request(operation,workspace,{method='GET',offset=0,table='mineru_base',payload=null,query={}}={}){
  const url=API+operation+(method==='GET'?('?'+new URLSearchParams({workspace,offset:String(offset),table,...query})):'');
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
    selectedTable=table;agView='frame';
    const viewPicker=picker()?.querySelector('.ocr-ag-module-select');
    if(viewPicker)viewPicker.value='frame';
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
const currentOwnedLF=()=>Boolean($('#workspace #editor')?.v2SourcePort?.getState().ownedLF);
const isLineView=view=>usesMdLines(view,currentOwnedLF());
function wireViewPicker(){
  const select=picker()?.querySelector('.ocr-ag-module-select');
  if(!select)return;
  if(!select.dataset.v2ViewWired){
    select.dataset.v2ViewWired='yes';
    select.replaceChildren(...Object.entries(AG_VIEWS).map(([value,config])=>
      new Option(config.label,value)));
    select.setAttribute('aria-label','选择 AG 过滤视图');
    select.title='同一 AG Grid：逻辑块与 MD Line 公共投影';
    select.addEventListener('change',()=>{
      if(!bound||!AG_VIEWS[select.value])return;
      if((isLineView(select.value)||['note-match','latex','block-break','media','table'].includes(select.value))&&!$('#workspace #editor')?.v2SourcePort?.getMdLineIndex()){select.value=agView;return;}
      const next=select.value;
      if(next===agView)return;
      agView=next;selectedTable='logical_block';active=true;offset=0;
      ++pageRequest; // an old physical table response must not replace this view
      if(logicalState){overlayCMStructure();renderGrid(logicalState);}
      else void fetchPage();
    });
  }
  select.disabled=!bound;
  for(const option of select.options)if(['line','note-match','latex','block-break','media','table'].includes(option.value))option.disabled=!currentOwnedLF();
  select.value=agView;
}
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
  rebuildBtn.className='v2-sql-action-rebuild';rebuildBtn.textContent='初始化逻辑表（覆盖编辑）';
  rebuildBtn.title='危险：从原始 para_blocks 重新生成逻辑表，覆盖当前 MD Block 和 PBS 关系；基础表及原件不变';
  const normalizeBtn=document.createElement('button');normalizeBtn.type='button';
  normalizeBtn.className='v2-sql-action-normalize';
  normalizeBtn.textContent='仅整理正文断行（不重建）';
  normalizeBtn.title='仅修改当前 MD Block 正文；不重建基础表、PBS 或原件，使用 CM6 原生 Undo';
  normalizeBtn.addEventListener('click',()=>{
    const source=$('#workspace #editor')?.v2SourcePort;
    if(!source?.getState().loaded||source.getState().dirty||saving||rebuilding||pending){
      report('请先进入逻辑表并保存当前修改','warning');return;
    }
    const count=source.countMultiline();
    if(!count){report('当前逻辑块已是单行，不需要整理','ok');dialog.close();return;}
    if(normalizeBtn.dataset.confirm!=='yes'){
      normalizeBtn.dataset.confirm='yes';
      normalizeBtn.textContent='确认整理 '+count+' 个逻辑块';
      info.textContent='即将修改 '+count+' 行 MD Block 的断行。包含手工编辑的换行也会整理；可用 CM6 撤销，并按原 SQL 旧值增量保存。不影响基础表、PBS 或 PDF。';
      return;
    }
    dialog.close();
    try{
      const count=source.normalizeLines();
      report('已将 '+count+' 个逻辑块整理为单行；SQL 将按原规则增量保存，CM6 可撤销','ok');
    }catch(error){report('单行整理未完成：'+error.message,'error');}
  });
  const repairBtn=document.createElement('button');repairBtn.type='button';
  repairBtn.className='v2-sql-action-table-repair';
  repairBtn.textContent='恢复跨页表格正文（不重建）';
  repairBtn.title='预览并恢复确证的跨页表格缺失内容，仅写入未经人工编辑的 MD Block，保留 PBS 与基础表';
  repairBtn.addEventListener('click',async()=>{
    const source=$('#workspace #editor')?.v2SourcePort;
    const path=bound;
    if(!path||path!==persistedDirectory()||selectedTable!=='logical_block'||
      !source?.getState().loaded||source.getWorkspace()!==path||
      source.getState().dirty||saving||rebuilding||pending){
      report('请进入逻辑表并先保存当前编辑后，再恢复跨页表格','warning');return;
    }
    if(repairBtn.dataset.confirm!=='yes'){
      repairBtn.disabled=true;
      try{
        const plan=await request('table-repair-preview',path);
        if(path!==bound||source.getState().dirty||source.getWorkspace()!==path)
          throw Error('预览期间工作目录或源码发生变化，请重新打开菜单');
        if(plan?.schema!=='v2-table-repair/v1'||!Array.isArray(plan.candidates)||
          plan.changeCount!==plan.candidates.length)throw Error('表格预览结构不合法');
        if(!plan.changeCount){
          report(plan.skippedEdited?
            `没有可安全恢复的表格行；${plan.skippedEdited} 行已被人工编辑，不能覆盖`:
            '没有需要恢复的表格正文','ok');dialog.close();return;
        }
        repairBtn._candidatePlan=plan;
        repairBtn.dataset.confirm='yes';
        repairBtn.textContent=`确认恢复 ${plan.changeCount} 行表格正文`;
        info.textContent=`将按页恢复 ${plan.changeCount} 个已验证的表格子块；另外跳过 ${plan.skippedEdited} 个已编辑的块。含跨页合并/重复脚注调整，先核对原值、可 Undo，使用现有 SQL MD Block 差量提交；PBS、PDF、基础表不变。`;
      }catch(error){report('表格恢复预览失败：'+error.message,'error');}
      finally{repairBtn.disabled=false;}
      return;
    }
    try{
      const plan=repairBtn._candidatePlan;
      if(!plan||!Array.isArray(plan.candidates))throw Error('表格恢复清单已失效');
      const count=source.applyTableRecovery(plan.candidates);
      dialog.close();
      report(`已从原始预处理块恢复 ${count} 行表格内容 · 使用 CM6 撤销/重做，SQLite 随后差量保存`, 'ok');
    }catch(error){report('表格恢复被拒绝：'+error.message,'error');}
  });
  const warning=document.createElement('p');warning.className='v2-sql-actions-warning';
  warning.textContent='「初始化逻辑表」从原始资料重新生成真实换行正文，旧编辑留在备份中。基础表、PDF、MinerUJSON 均保持不变。';
  const close=document.createElement('button');close.type='button';
  close.className='v2-sql-action-close';close.textContent='取消';
  close.addEventListener('click',()=>dialog.close());
  importBtn.addEventListener('click',()=>{
    dialog.close();void importBaseFromMineru();
  });
  rebuildBtn.addEventListener('click',()=>{
    if(rebuildBtn.dataset.confirm!=='yes'){
      rebuildBtn.dataset.confirm='yes';
      rebuildBtn.textContent='确认初始化逻辑表';
      info.textContent='将从原始 para_blocks 全新初始化真实换行逻辑表，不迁移现有 MD Block 和 PBS 编辑；先保留旧库备份，原始基础表及原件不变。';
      return;
    }
    dialog.close();void rebuildLogicalOnly();
  });
  const buttons=document.createElement('div');buttons.className='v2-sql-actions-buttons';
  buttons.append(importBtn,rebuildBtn,normalizeBtn,repairBtn);
  dialog.append(heading,info,buttons,warning,close);
  document.body.append(dialog);
  return dialog;
}
function openSQLActions(){
  const dialog=sqlActionsDialog();
  const workspace=bound&&bound===persistedDirectory()?bound:'';
  const normal=dialog.querySelector('.v2-sql-action-normalize');
  normal.dataset.confirm='';normal.textContent='仅整理正文断行（不重建）';
  const tableRepair=dialog.querySelector('.v2-sql-action-table-repair');
  tableRepair.dataset.confirm='';tableRepair._candidatePlan=null;
  tableRepair.textContent='恢复跨页表格正文（不重建）';
  const rebuild=dialog.querySelector('.v2-sql-action-rebuild');
  rebuild.dataset.confirm='';rebuild.textContent='初始化逻辑表（覆盖编辑）';
  dialog.querySelector('.v2-sql-actions-info').textContent=workspace?
    '当前工作目录：'+workspace:'请先在全局设置中绑定并验证工作目录';
  const busy=rebuilding||saving||Boolean(pending)||
    Boolean($('#workspace #editor')?.v2SourcePort?.getState().dirty);
  for(const selector of ['.v2-sql-action-import','.v2-sql-action-rebuild']){
    dialog.querySelector(selector).disabled=!workspace||busy;
  }
  const sourceState=$('#workspace #editor')?.v2SourcePort?.getState();
  normal.disabled=!workspace||busy||selectedTable!=='logical_block'||!sourceState?.loaded||sourceState.ownedLF;
  tableRepair.disabled=normal.disabled;
  if(sourceState?.ownedLF){
    normal.title='真实换行模式不允许单行整理';
    tableRepair.title='真实换行模式表格修复待兼容验收';
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
      if(agView==='table')tableAll=input.checked;else if(agView==='media')mediaAll=input.checked;else if(agView==='block-break')breakAll=input.checked;else if(agView==='latex')latexAll=input.checked;else if(agView==='note-match')noteAll=input.checked;else showAllLogical=input.checked;
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
      payload:{workspace:path,confirm:'initialize-v2-owned-logical'}});
    if(!result?.rebuilt||result.baseChanged!==false||result.schema!=='v2-logical-md/v3')throw Error('真实换行初始化回执不完整');
    const source=$('#workspace #editor')?.v2SourcePort;
    source?.clear();
    $('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.clear();
    bound='';lastFocus=null;logicalState=null;renderedSchema='';
    await ensureBase(path);
    if(!source?.getState().ownedLF||source.getBlocks().length!==result.logicalCount)
      throw Error('已初始化但新正文尚未加载，请重新打开工作目录');
    report('✓ 真实换行逻辑表已初始化 · '+result.previousLogicalCount+
      ' → '+result.logicalCount+' 行 · 基础表与原件未修改'+(result.backupFile?' · 已保留旧库备份':''),'ok');
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
function focusAGLine(port,focus){
  const index=$('#workspace #editor')?.v2SourcePort?.getMdLineIndex();
  const line=index?.atSourceLine(focus.sourceLine);
  port.focusRow('source_line',line?.logical_id===focus.logicalId?line.source_line:index?.forBlock(focus.logicalId)[0]?.source_line??null);
}
function focusAGNote(port,focus){
  const index=$('#workspace #editor')?.v2SourcePort?.getMdLineIndex();
  const rows=port.getDisplayedRows();
  const match=r=>r.source_line===focus.sourceLine&&r.logical_id===focus.logicalId&&resolveV2NoteEndpoint(index,r);
  const row=rows.find(r=>r.note_row_id===noteFocusKey&&match(r))||rows.find(match);
  noteFocusKey=row?.note_row_id??null;
  port.focusRow('note_row_id',noteFocusKey);
}
function renderGrid(state){
  const port=$('#workspace .ocr-outline-grid')?.v2BaseGridPort;
  if(!port)throw Error('AG 公共数据显示接口尚未就绪');
  if(port!==wiredGrid){
    unsubscribeGridClick?.();wiredGrid=port;
    unsubscribeGridClick=port.onRowClicked(event=>{
      if(!active||!bound||!event.data)return;
      if(selectedTable==='logical_block'&&agView==='table'){
        const source=sourceForNotes(),index=source?.getMdLineIndex(),row=event.data;
        if(!index||source.getWorkspace()!==bound)return;
        const live=logicalState?.rows.find(r=>r.logical_id===row.logical_id);
        const first=index.forBlock(row.logical_id)[0];
        if(!live||!first||first.pbs!==row.pbs||live.block_type!==row.block_type)return;
        const line=resolveV2TableLine(index,row);
        if(line){
          document.dispatchEvent(new CustomEvent('v2-ag-row-click',{detail:{
            table:selectedTable,row:line,workspace:bound,lineRow:true,sourceLine:line.source_line}}));
        }else if(row.line_no==null&&!index.forBlock(row.logical_id).some(l=>l.md_line.trim())){
          // PDF-only rows have no direct content anchor. Keep CM6 and MD
          // preview untouched; select only the real logical PDF cover.
          const pdf=pdfForLatex();
          if(pdf?.focusId(row.logical_id,true)){
            lastFocus={logicalId:row.logical_id,baseBlockId:live.base_blockid,
              logicalOrder:live.logical_order,origin:'outline',sourceLine:null};
            port.focusRow('logical_id',row.logical_id);
          }
        }else return;
        report(`表格 · ${row.block_type} · ${row.pbs} · ${line?'源码行 '+line.source_line:row.global_page==null?'无直接 MD 行 / 无 PDF 映射':'仅 PDF 块（无直接 MD 行）'}`);
        return;
      }
      if(selectedTable==='logical_block'&&agView==='media'){
        const source=sourceForNotes(),line=resolveMediaRow(source?.getMdLineIndex(),source?.getMarkdown(),event.data);
        if(line)document.dispatchEvent(new CustomEvent('v2-ag-row-click',{detail:{
          table:selectedTable,row:line,workspace:bound,lineRow:true,sourceLine:line.source_line}}));
        else report(event.data.line_id?'媒体引用位置已过期':'未引用本地媒体 · '+event.data.url,'info');
        return;
      }
      if(selectedTable==='logical_block'&&agView==='block-break'){
        const source=sourceForNotes(),index=source?.getMdLineIndex(),row=event.data;
        if(!index||!breakSession.project(index).includes(row))return;
        const pair=resolveBreakPair(index,row),line=index.resolve(row.after_ref);
        if(!pair||!line){report('断块端点已过期','warning');return;}
        breakFocus=row.issue_id;
        document.dispatchEvent(new CustomEvent('v2-ag-row-click',{detail:{
          table:selectedTable,row:line,workspace:bound,lineRow:true,sourceLine:line.source_line}}));
        paintBreak(index,pair);return;
      }
      if(selectedTable==='logical_block'&&agView==='latex'){
        const source=sourceForNotes(),index=source?.getMdLineIndex(),row=event.data;
        if(!index||!getLatexRows(index).includes(row))return;
        latexFocus=row.formula_id;
        const line=resolveV2Formula(index,row);
        if(line){
          document.dispatchEvent(new CustomEvent('v2-ag-row-click',{detail:{
            table:selectedTable,row:line,workspace:bound,lineRow:true,sourceLine:line.source_line}}));
          source.focusFormula(index,row);
        }else if(row.pdf_bbox){
          const owner=source.getIntervals().find(r=>r.logicalId===row.block_id);
          if(owner)document.dispatchEvent(new CustomEvent('v2-ag-row-click',{detail:{
            table:selectedTable,row:{logical_id:owner.logicalId},workspace:bound}}));
        }
        if(row.pdf_bbox)pdfForLatex()?.focusFormula(row);
        report(`LaTeX · ${row.pbs} · ${row.match_status} · ${row.render_status} · ${line?'MD '+line.source_line:'仅 PDF / OCR'}`);
        return;
      }
      if(selectedTable==='logical_block'&&agView==='note-match'){
        const index=$('#workspace #editor')?.v2SourcePort?.getMdLineIndex();
        const line=resolveV2NoteEndpoint(index,event.data);
        if(!line){report('注释端点无物理位置或已过期，请核对当前正文','warning');return;}
        noteFocusKey=event.data.note_row_id;
        document.dispatchEvent(new CustomEvent('v2-ag-row-click',{detail:{
          table:selectedTable,row:line,workspace:bound,lineRow:true,sourceLine:line.source_line}}));
        return;
      }
      document.dispatchEvent(new CustomEvent('v2-ag-row-click',{
        detail:{table:selectedTable,row:event.data,workspace:bound,
          lineRow:selectedTable==='logical_block'&&isLineView(agView),
          sourceLine:selectedTable==='logical_block'?(isLineView(agView)?event.data.source_line:
            agView==='title'?titleClickLine(event.data,event.event?.target):null):null}}));
    });
  }
  const logical=state.tableName==='logical_block';
  const nextView=logical?agView:'frame';
  const lineView=logical&&isLineView(nextView);
  const noteView=logical&&nextView==='note-match';
  const latexView=logical&&nextView==='latex';
  const breakView=logical&&nextView==='block-break';
  const mediaView=logical&&nextView==='media';
  const tableView=logical&&nextView==='table';
  const media=mediaView?getMediaController():null;
  setMediaActive(mediaView);
  const all=allForView();
  const lineIndex=(lineView||noteView||latexView||breakView||mediaView||tableView)?$('#workspace #editor')?.v2SourcePort?.getMdLineIndex():null;
  if((lineView||noteView||latexView||breakView||mediaView||tableView)&&!lineIndex)throw Error('MD Line View 需要真实 LF 文档');
  const notes=noteView?getNoteProjection(lineIndex):null;
  const formulas=latexView?getLatexRows(lineIndex):null;
  const breaks=breakView?breakSession.project(lineIndex):null;
  const mediaRows=mediaView?media.rows():null;
  const tableRows=tableView?projectV2TableRows(lineIndex,state.rows,pdfForLatex()?.getCovers()||[]):null;
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
  const page=logical?filterLogicalAG(state.rows,currentLogicalId(),all):null;
  const lineRows=tableView?(all?tableRows:tableRows.filter(r=>r.p===page.p)):mediaView?(all?mediaRows:mediaRows.filter(r=>lineIndex.atSourceLine(r.line_no)?.p===page.p)):breakView?(all?breaks:breaks.filter(r=>r.p===page.p)):latexView?(all?formulas:formulas.filter(r=>r.p===page.p)):noteView?(all?notes.rows:notes.rows.filter(r=>r.p===page.p)):lineView?(all?lineIndex.rows:lineIndex.rows.filter(r=>r.p===page.p)):null;
  const visibleRows=lineRows||page?.rows||state.rows;
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
  const pbsWidth=logical?fit(visibleRows.map(row=>row.pbs??`p${row.p}b${row.b}s${row.s}`),'PBS',80,180):80;
  const typeWidth=logical?fit(visibleRows.map(row=>row.block_type),'Type',82,240):105;
  let columns=columnKeys.map((key,index)=>({field:key,
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
  if(tableView){
    columns=TABLE_COLUMNS.map(c=>({...c,pinned:c.pinned??null,sort:c.sort??null,
      resizable:true,filter:EnumCheckboxFilter,
      filterValueGetter:p=>c.field==='pbs'?(/^p\d+/.exec(p.data?.pbs??'')?.[0]??''):String(p.data?.[c.field]??''),
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false}));
  }else if(mediaView){
    columns=mediaColumns(media).map(c=>({...c,resizable:true,filter:EnumCheckboxFilter,
      filterValueGetter:p=>c.field==='pbs'?(/^p\d+/.exec(p.data?.pbs??'')?.[0]??''):String(p.data?.[c.field]??''),
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false}));
  }else if(breakView){
    columns=breakColumns(breakReviewCell).map(c=>({...c,resizable:true,filter:EnumCheckboxFilter,
      filterValueGetter:p=>c.field==='pbs'?(/^p\d+/.exec(p.data?.pbs??'')?.[0]??''):String(p.data?.[c.field]??''),
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false}));
  }else if(latexView){
    columns=latexColumns({filter:EnumCheckboxFilter,pbsPageKey:value=>/^p\d+/.exec(value??'')?.[0]??'',
      getPdfFormulaCrop:target=>pdfForLatex()?.renderFormulaCrop(target)}).map(c=>({
        ...c,pinned:null,sort:null,resizable:true,filter:c.filter??EnumCheckboxFilter,
        filterValueGetter:c.filterValueGetter??(p=>String(p.data?.[c.field]??'')),
        suppressHeaderMenuButton:true,suppressHeaderFilterButton:false}));
  }else if(noteView){
    columns=noteMatchColumns(renderNoteStatus).map(c=>({...c,resizable:true,filter:EnumCheckboxFilter,
      filterValueGetter:c.filterValueGetter??(p=>String(p.data?.[c.field]??'')),
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false}));
  }else if(lineView){
    columns=mdLineColumns(nextView).map(c=>({...c,headerTooltip:c.field,tooltipField:c.field,
      resizable:true,sortable:!['pbs','block_type','line_type'].includes(c.field),
      filter:EnumCheckboxFilter,filterValueGetter:c.filterValueGetter??(p=>String(p.data?.[c.field]??'')),
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false,
      minWidth:c.field==='md_line'?220:72,width:c.field==='md_line'?420:
        c.field==='pbs'?pbsWidth:c.field==='block_type'?typeWidth:105}));
  }else if(logical){
    // PBS is pinned only in the default logical-block view.
    columns.unshift({field:'pbs',headerName:'PBS',headerTooltip:'当前逻辑块编号',
      minWidth:72,width:pbsWidth,pinned:'left',resizable:true,sortable:false,
      filter:EnumCheckboxFilter,filterValueGetter:params=>params.data?
        `p${params.data.p}b${params.data.b}s${params.data.s}`:'',
      suppressHeaderMenuButton:true,suppressHeaderFilterButton:false});
    if(nextView!=='frame'){
      columns.push({field:'source_line',headerName:'源码行号',width:105,minWidth:76,
        resizable:true,sortable:true,filter:EnumCheckboxFilter,
        filterValueGetter:p=>String(p.data?.source_line??''),
        suppressHeaderMenuButton:true,suppressHeaderFilterButton:false});
      columns=viewColumns(nextView,columns);
    }
  }
  const controls=logicalControls();
  if(!noteToolbar&&picker())noteToolbar=mountNoteToolbar(picker(),{
    getConfig:()=>noteSession.getConfig(),
    onConfig:config=>{
      if(agView!=='note-match'||!logicalState)throw Error('注释视图已关闭');
      noteSession.configure(config);noteFocusKey=null;savedNoteFilter=null;
      port.setFilterModel(null);renderGrid(logicalState);
      report('注释格式已应用并重新识别 · 仅当前会话','ok');
    },onStatus:report,onConvert:convertMatchedNotes,onInlineMath:completeInlineMath,onDownloadAll:()=>getMediaController().downloadAll(),onMediaScan:()=>getMediaController().scan(),onNormalizeMedia:normalizeMediaMarkdown,onOrganizeTable:organizeTableMarkdown,
  });
  noteToolbar?.setVisible(noteView||latexView||mediaView||tableView,tableView?'table':mediaView?'media':latexView?'latex':'note-match');
  let view=null;
  if(controls){
    controls.label.hidden=!logical;
    controls.indicator.hidden=!logical;
    controls.label.querySelector('input').checked=all;
  }
  if(logical){
    view=(lineView||noteView||latexView||breakView||mediaView||tableView)?{p:page.p,rows:lineRows}:page;
    visibleLogicalP=view.p;
    if(controls)controls.indicator.textContent=all?
      `全部 · ${view.rows.length} 行`:`p${view.p??'?'} · ${view.rows.length} / ${tableView?tableRows.length:mediaView?mediaRows.length:breakView?breaks.length:latexView?formulas.length:noteView?notes.rows.length:lineView?lineIndex.rows.length:state.rowCount}`;
  }else visibleLogicalP=null;
  const schema=state.tableName+':'+nextView+':'+columns.map(column=>column.field).join(',');
  const switchingView=renderedView!==nextView;
  if(switchingView){
    if(renderedView==='frame'&&renderedSchema.startsWith('logical_block:'))
      savedLogicalFilter=port.getFilterModel();
    if(renderedView==='line')savedLineFilter=port.getFilterModel();
    if(renderedView==='note-match')savedNoteFilter=port.getFilterModel();
    if(renderedView==='latex'){savedLatexFilter=port.getFilterModel();paintLatex(null,[]);}
    if(renderedView==='block-break'){savedBreakFilter=port.getFilterModel();paintBreak(null,[]);}
    if(renderedView==='media')savedMediaFilter=port.getFilterModel();
    if(renderedView==='table')savedTableFilter=port.getFilterModel();
    if(tableView||renderedView==='table'||mediaView||renderedView==='media'||breakView||renderedView==='block-break'||latexView||renderedView==='latex')port.setRowHeight(tableView?58:mediaView?78:breakView?92:latexView?134:35);
    port.setFilterModel(null);
  }
  if(schema!==renderedSchema){port.setColumns(columns,state.tableName+':'+nextView);renderedSchema=schema;}
  renderedView=nextView;
  const rows=(lineView||noteView||latexView||breakView||mediaView||tableView)?lineRows:logical?view.rows.map(row=>({...row,pbs:`p${row.p}b${row.b}s${row.s}`})):state.rows;
  // Switching presets with identical rows must not reload AG rowData.
  // Existing page scope and live CM6 edits may change the common row set.
  const dataTable=state.tableName+(tableView?':table':mediaView?':media':breakView?':break':latexView?':latex':noteView?':note':lineView?':line':'');
  const sameRows=renderedDataTable===dataTable&&rows.length===renderedRows.length&&
    rows.every((row,i)=>{
      const old=renderedRows[i],keys=Object.keys(row);
      if(lineView||noteView||latexView||breakView)return row===old;
      return keys.length===Object.keys(old).length&&keys.every(key=>row[key]===old[key]);
    });
  if(!sameRows){
    const currentViewFilter=!switchingView&&nextView!=='frame'?port.getFilterModel():null;
    port.setRows(rows);renderedRows=rows;renderedDataTable=dataTable;
    // The common page scope can briefly omit a selected Type. Preserve the
    // view filter through the ordinary AG row refresh, not a separate dataset.
    if(currentViewFilter)port.setFilterModel(currentViewFilter);
  }
  if(switchingView){
    // This is the SAME logical rowData, including non-title blocks. The
    // native AG EnumCheckboxFilter alone determines visible block types.
    port.setFilterModel(nextView==='frame'?(logical?savedLogicalFilter:null):nextView==='line'?savedLineFilter:tableView?savedTableFilter:mediaView?savedMediaFilter:breakView?savedBreakFilter:latexView?savedLatexFilter:noteView?savedNoteFilter:viewFilter(nextView,lineView));
    if(nextView==='frame')savedLogicalFilter=null;
  }
  if(logical&&!noteView&&!latexView&&!breakView&&!mediaView&&!tableView)port.fitColumns({pbs:pbsWidth,block_type:typeWidth});
  if(lastFocus){
    if(mediaView)focusAGMedia(port,lastFocus);
    else if(breakView)focusAGBreak(port,lastFocus);
    else if(latexView)focusAGLatex(port,lastFocus);
    else if(noteView)focusAGNote(port,lastFocus);
    else if(lineView)focusAGLine(port,lastFocus);
    else port.focusRow(state.tableName==='logical_block'?'logical_id':'blockid',
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
  if(breakView){const selected=breaks.find(r=>r.issue_id===breakFocus);paintBreak(lineIndex,selected?resolveBreakPair(lineIndex,selected)??[]:[]);}
  if(latexView)paintLatex(lineIndex,formulas);
  const math=latexView?latexIndexSummary(formulas):null;
  report(tableView?`AG 表格 · ${tableRows.length} 个块 · ${tableRows.filter(r=>r.line_no==null).length} 无直接 MD 行 · ${port.getDisplayedRows().length} 行`:mediaView?`AG 媒体 · ${mediaRows.length} 项 · 远端 ${mediaRows.filter(r=>!r.local).length} · 本地 ${mediaRows.filter(r=>r.local).length}`:breakView?`AG 断块 · ${breaks.filter(r=>!r.merged).length} 疑似断块 · ${breaks.filter(r=>r.merged).length} 已合并 · 忽略决定仅当前会话`:latexView?`AG LaTeX · ${math.total} 条 · 原始 ${math.original} · 已匹配/修订 ${math.matched} · 渲染失败 ${formulas.filter(r=>r.render_status==='失败').length} · ${port.getDisplayedRows().length} 行`:noteView?`AG 注释匹配 · ${notes.index.stats.references} 注引 · ${notes.index.stats.bodies} 注文 · ${port.getDisplayedRows().length} 行 · 审阅决定仅当前会话`:logical&&nextView!=='frame'?
    `AG ${AG_VIEWS[nextView].label} · Type 筛选 · ${port.getDisplayedRows().length} 行`:logical?
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
  const intervals=source.getIntervals();
  const lines=new Map(intervals.map(row=>[row.logicalId,source.getLineAtOffset(row.from)]));
  const owned=source.getState().ownedLF;
  const records=logicalState.rows;
  logicalState.rows=records.map(record=>{
    const row=live.get(record.logical_id);
    if(!row)return record;
    const md=texts.get(row.logicalId)??record.md_block;
    const storedType=record.stored_block_type??record.block_type;
    return {...record,parent_id:row.parentId,logical_order:row.logicalOrder,
      p:row.p,b:row.b,s:row.s,source_line:lines.get(row.logicalId),
      md_block:md,stored_block_type:storedType,
      block_type:owned?storedType:effectiveBlockType(storedType,md)};
  }).sort((a,b)=>a.logical_order-b.logical_order);
  if(source.getState().ownedLF)logicalState.rowCount=logicalState.logicalCount=logicalState.rows.length;
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
  if(current.length!==original.size||new Set(current.map(r=>r.logicalId)).size!==original.size||current.some(r=>!original.has(r.logicalId))){
    report('逻辑块库存不允许改变，拒绝 SQL 写入','error');saveBlocked=true;return;
  }
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
    const owned=source.getState().ownedLF;
    if(owned&&changes.length){
      const boundaries=rows=>new Map(rows.map((r,i)=>{
        const next=rows[i+1];
        return [r.logicalId,next&&r.p===next.p&&r.b===next.b?next.logicalId:null];
      }));
      const before=boundaries(acknowledged),after=boundaries(current);
      const expectedBoundaryText=acknowledged.filter(r=>before.get(r.logicalId)!==after.get(r.logicalId))
        .map(r=>({logicalId:r.logicalId,before:acknowledgedText.get(r.logicalId)}));
      const result=await request('structure-commit',workspace,{method:'POST',
        payload:{workspace,confirm:'commit-v2-owned-structure',changes,textChanges,
          expectedStructure:acknowledged,expectedBoundaryText}});
      if(!result?.saved||result.changedRows!==changes.length||result.textChangedRows!==textChanges.length)
        throw Error('SQL 真实换行归组原子写入回执不完整');
      if(bound!==workspace||source.getWorkspace()!==workspace)return;
      acknowledged=current;acknowledgedText=textCopy(textRows);
      source.markPersisted(current);source.markTextPersisted(textRows);
    }else{
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
        payload:{workspace,confirm:owned?'commit-v2-owned-md':'commit-v2-md',changes:textChanges,
          ...(owned?{expectedStructure:acknowledged}:{})}});
      if(!result?.saved||result.changedRows!==textChanges.length)throw Error('SQL MD Block 写入回执不完整');
      if(bound!==workspace||source.getWorkspace()!==workspace)return;
      acknowledgedText=new Map(textRows.map(r=>[r.logicalId,r.markdownText]));
      source.markTextPersisted(textRows);
    }
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
      renderedSchema='';renderedDataTable='';renderedRows=[];agView='frame';savedLogicalFilter=null;savedLineFilter=null;tableAll=true;savedTableFilter=null;resetMedia();breakAll=true;breakFocus=null;savedBreakFilter=null;breakSession.reset();paintBreak(null,[]);latexAll=true;latexEvidence=[];latexIndex=null;latexRaw=null;latexRows=[];latexFocus=null;savedLatexFilter=null;noteAll=true;noteSession.reset();noteToolbar?.reset();noteFocusKey=null;savedNoteFilter=null;clearTimeout(saveTimer);saveTimer=null;saveBlocked=false;}
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
          latexEvidence=projection.formulaBlocks||[];
          const loaded=await pdfPort.load(path,projection);
          if(bound===path&&['latex','table'].includes(agView)&&logicalState){
            // Repaint once native PDF is ready. Reuse the same projected
            // rows if the CM6 revision and OCR evidence did not change.
            renderGrid(logicalState);
          }
        }catch(error){report('PDF 原文未加载：'+error.message,'warning');}
      })();
    }
    revealPhysicalTables(state.tables);
    wireViewPicker();
    report(`✓ V2 SQLite 就绪 · ${state.tables.length} 张物理表 / ${state.blockCount} 原始块 / ${state.logicalCount} 逻辑块 · 源码窗已加载${port.getState().dirty?' · 内存有未保存编辑':''}`,'ok');
    if(port.getState().legacyArtificialCount)report('保留历史逻辑块 · 正文可编辑 · 不再允许分割或增删逻辑 ID','ok');
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
    if(logical.p!==visibleLogicalP&&!allForView()){
      renderGrid(logicalState);
      return;
    }
    visibleLogicalP=logical.p;
    const port=$('#workspace .ocr-outline-grid')?.v2BaseGridPort;
    if(port&&agView==='media')focusAGMedia(port,row);
    else if(port&&agView==='block-break')focusAGBreak(port,row);
    else if(port&&agView==='latex')focusAGLatex(port,row);
    else if(port&&agView==='note-match')focusAGNote(port,row);
    else if(port&&isLineView(agView))focusAGLine(port,row);
    else port?.focusRow('logical_id',row.logicalId);
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
document.addEventListener('v2-media-pasted',event=>{
  if(mediaActive&&mediaBook===event.detail?.workspace)
    void mediaController?.scan().catch(error=>report(error.message,'warning'));
});
document.addEventListener('v2-cm-status',event=>{
  const {text,kind}=event.detail||{};
  if(text)report(text,kind||'info');
});
document.addEventListener('v2-pdf-status',event=>{
  const {text,kind}=event.detail||{};
  if(text)report(text,kind||'info');
});
document.addEventListener('v2-cm-protected-separator',()=>
  report('跨块编辑归属不明确，已拒绝；完整行删除仍保留逻辑块','warning'));
document.addEventListener('v2-cm-session',event=>{
  const {kind,dirty,blocks}=event.detail||{};
  if(kind==='clear'){resetMedia();paintBreak(null,[]);paintLatex(null,[]);lastFocus=null;acknowledged=null;acknowledgedText=null;clearTimeout(saveTimer);saveTimer=null;}
  if(kind==='load'){
    const port=$('#workspace #editor')?.v2SourcePort;
    acknowledged=structureCopy(port?.getStructureRows()||[]);
    acknowledgedText=textCopy(port?.getBlocks()||[]);
  }
  if(kind==='saved'&&agView==='note-match'&&active&&logicalState&&selectedTable==='logical_block')renderGrid(logicalState);
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
