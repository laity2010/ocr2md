/** WP2: current CM6 notes -> AG View -> exact source/PDF focus -> per-book
 * rules. Mocked OCR API avoids ever touching a real document/book file.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5422,book='/isolated/note-matching-book-a';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
const blocks=[
  [101,'p1b0',0,'A study finds<sup>1</sup>, and it also cites[^1] and <sup>5</sup>, plus (2).'],
  [102,'p2b1',1,'Further comparison<sup>2</sup>.'],
  [103,'p3b0',2,'## Notes'],
  [104,'p3b1',2,'1. One note applies to two citations.'],
  [105,'p3b2',2,'2. This is another note.'],
  [106,'p3b3',2,'3. Orphan source note.'],
  [107,'p2b2',1,'Another claim (2) was actually a numbered list.'],
  [108,'p3b4',2,'5. Fifth body, after a missing fourth number.'],
].map(([block_id,pbs,global_page,text])=>({block_id,pbs,global_page,
  parent_block_id:null,sibling_order:block_id,block_type:'text',
  block_group:'para_blocks',absorbed_into_block_id:null,
  block_json:JSON.stringify({type:'text',lines:[{spans:[{type:'text',content:text}]}]}),
  block_bbox_json:'[40,70,420,145]',content_preview:text,
  line_count:1,span_count:1,span_types:'text',page_size_json:'[595,842]'}));
const sourceLines=blocks.map(x=>x.content_preview);
const md=sourceLines.map((text,i)=>({line_no:i+1,line_id:`note-md-${i+1}`,
  block_id:blocks[i].block_id,text}));

try{
 let up=false;
 for(let i=0;i<130;i++){
   try{if((await fetch(url)).ok){up=true;break;}}catch{}
   await sleep(150);
 }
 assert(up,'Vite failed '+log.slice(-800));
 for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||
     process.env.LAB_OCR_TEST_BROWSER===name)){
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1250,height:900},hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let mdLoads=0,mdSaves=0,blockSaves=0,ruleLoads=0,ruleSaves=0;
   let savedRules=null,ruleRevision='initial-rev',reviewGets=0,reviewSaves=0;
   const reviews=new Map();
   await page.addInitScript(({book})=>localStorage.setItem(
     'ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
       'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
         category2:'目录',comment:'synthetic notes only',value:book,
         range:{kind:'server-directory'}}}})),{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
     const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
     const json=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
     if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(4)});
     if(op==='inspect')return json({status:'unchanged',blocks:blocks.length,pages:4,
       pdf:'notes.pdf',sources:[{name:'notes.json',pages:4}],mdSupported:true});
     if(op==='minerujson2block')return json({status:'ready',kind:'view',blocks:blocks.length});
     if(op==='rows')return json({table:'block',total:blocks.length,rows:blocks});
     if(op==='block-edit-state')return json({revision:0,cursor:0,history:[],canUndo:false,canRedo:false});
     if(op==='md-state'){mdLoads++;return json({status:'ready',revision:0,rows:md,total:md.length});}
     if(op==='note-pair-reviews'){
       reviewGets++;
       return json({status:'ready',reviews:[...reviews.values()]});
     }
     if(op==='note-pair-review-set'){
       const request=req.postDataJSON();reviewSaves++;
       const ref=request.reference,body=request.body;
       const old=reviews.get(ref.candidateId);
       if((old?.revision??null)!==request.expectedRevision)
         return route.fulfill({status:422,contentType:'application/json',
           body:JSON.stringify({error:'注释审阅状态已有其他修改，须重新加载'})});
       const revision=request.decision==='待定'?null:'0123456789abcdef'+String(reviewSaves).padStart(16,'0');
       if(request.decision==='待定')reviews.delete(ref.candidateId);
       else reviews.set(ref.candidateId,{
         ref_id:ref.candidateId,ref_line_id:ref.lineId,ref_block_id:ref.blockId,
         ref_from:ref.from,ref_to:ref.to,ref_raw:ref.raw,decision:request.decision,
         body_id:body?.candidateId??null,body_line_id:body?.lineId??null,
         body_block_id:body?.blockId??null,body_from:body?.from??null,
         body_to:body?.to??null,body_raw:body?.raw??null,revision,valid:true});
       return json({status:'saved',ref_id:ref.candidateId,decision:request.decision,
         body_id:body?.candidateId??null,revision});
     }
     if(op==='note-match-rules'){
       ruleLoads++;
       return json({status:'ready',revision:ruleRevision,
         config:savedRules??{referenceRules:[
           'ref.html-sup','ref.md-footnote','ref.unicode-sup','ref.bracket','ref.parenthesis','ref.symbol'],
           bodyRules:['body.md-footnote','body.number-dot','body.number-paren','body.number-bracket','body.labelled','body.symbol'],
           scope:'book',chapterLevel:1,weakAutoMatch:false,
           continuation:'same-block',customRules:[]}});
     }
     if(op==='note-match-rules-save'){
       const body=req.postDataJSON();ruleSaves++;
       if(body.expectedRevision!==ruleRevision)return route.fulfill({status:422,
         contentType:'application/json',body:JSON.stringify({error:'注释规则已有其他修改，请重新读取后再保存'})});
       ruleRevision='rev-'+ruleSaves;savedRules=body.config;
       return json({status:'saved',config:savedRules,revision:ruleRevision});
     }
     if(op==='block-break-reviews')return json({status:'ready',reviews:[]});
     if(op==='block-edit-batch'){blockSaves++;return json({status:'not-allowed'});}
     if(op==='md-save'){mdSaves++;return json({status:'not-allowed'});}
     if(op==='overlays'){
       const pageNo=Number(u.searchParams.get('page'));
       return json({page:pageNo,level:'block',pageSize:[595,842],
         boxes:blocks.filter(x=>x.global_page===pageNo-1).map(x=>({
           id:String(x.block_id),blockId:String(x.block_id),pbs:x.pbs,
           parentBlockId:null,blockGroup:'para_blocks',blockType:'text',
           bbox:[40,70,420,145],sourceEmpty:false}))});
     }
     throw Error('Unexpected API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#workspace select.ocr-source-file-select')
     ?.value==='sql:md',null,{timeout:20000});
   const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
   assert.deepEqual(await picker.locator('option').allTextContents(),
     ['MD 行','标题','LaTeX','断块','注释匹配']);
   const original=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument());
   await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('note_row_id'));
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-grid .ag-row').length>=2);
   // The source mentions number 5 on line 1, before number 2 on line 2.
   // AG must default to numeric number order (not source/PBS/lexical order).
   await page.waitForFunction(()=>document.querySelector('.ag-header-cell[col-id="number"]')
     ?.getAttribute('aria-sort')==='ascending',null,{timeout:12000});
   const defaultOrder=await page.evaluate(()=>[...document.querySelectorAll('.ocr-outline-grid .ag-row')]
     .sort((a,b)=>Number(a.getAttribute('row-index'))-Number(b.getAttribute('row-index')))
     .map(row=>row.querySelector('.ag-cell[col-id="number"]')?.textContent).filter(Boolean));
   assert.equal(defaultOrder[0],'1');
   assert(defaultOrder.every((number,i)=>i===0||
     Number(number)>=Number(defaultOrder[i-1])),
     'Displayed numeric order must be nondecreasing: '+defaultOrder);
   // The editable status dropdown is adjacent to a narrow pinned header.
   // Clicking that header must never reorder the AG rows accidentally;
   // the existing status-value filter must remain available.
   const statusHeader=page.locator('.ocr-outline-grid .ag-header-cell[col-id="match_state"]');
   assert.equal(await statusHeader.getAttribute('aria-sort'),null,
     'Disabled AG sort has no aria-sort attribute');
   const statusFilter=await statusHeader.locator('.ag-header-cell-filter-button').count();
   assert(statusFilter>0,'Disabled sort must not remove the AG status filter');
   await statusHeader.locator('.ag-header-cell-text').click();
   await statusHeader.locator('.ag-header-cell-text').click();
   assert.equal(await statusHeader.getAttribute('aria-sort'),null,
     'AG match_state column must not sort when tapped');
   assert.equal(await page.locator('.ocr-outline-grid .ag-header-cell[col-id="number"]')
     .getAttribute('aria-sort'),'ascending',
     'Disabling match_state sort preserves current user-selected sort column');
   const gap=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id:'gap:book:4',focusColumn:'match_state'}));
   assert.equal(gap?.status,'疑似缺号');
   assert.equal(gap?.line_id,null);
   assert.equal(gap?.pbs,'');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="match_state"]').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent
     ?.includes('注号 4 疑似缺失'),null,{timeout:12000});
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original,'Missing-number hint must never mutate the MD');
   const mdFootnoteId='pair:ref:note-md-1:'+sourceLines[0].indexOf('[^1]')+
     ':ref.md-footnote:ref';
   assert(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId),
     'A second citation in the same LineID must have its own AG row ID');
   assert.equal(ruleLoads,1);assert.equal(reviewGets,1);
   // Both existing alternative orders remain user-selectable, and neither
   // changes the source or creates any fictitious coordinates for the gap.
   const header=field=>page.locator(`.ocr-outline-grid .ag-header-cell[col-id="${field}"]`);
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id:'gap:book:4',focusColumn:'pbs'}));
   await header('pbs').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="pbs"]')
     ?.getAttribute('aria-sort')==='ascending');
   await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id:'gap:book:4',focusColumn:'line_no'}));
   await header('line_no').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="line_no"]')
     ?.getAttribute('aria-sort')==='ascending');
   const orphan=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'note-md-6',focusColumn:'match_state'}));
   assert.equal(orphan?.status,'缺注引');
   // The apparent (2) occurs inside a Notes section in this fixture and
   // correctly cannot be treated as a正文引用. A separate direct test covers weak candidates.
   const info=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'line_id',id:'note-md-1',focusColumn:'text'}));
   assert.equal(info?.kind,'注引');assert.equal(info?.pbs,'p1b0');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="text"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source .ocr-note-match-source-active'));
   const focus=await page.evaluate(()=>{
     const node=document.querySelector('.ocr-cm-source .ocr-note-match-source-active');
     const doc=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return {text:doc?.state.doc.sliceString(doc.state.selection.main.head,
       doc.state.selection.main.head+'<sup>1</sup>'.length),
       decorated:Boolean(node),line:doc?.state.doc.lineAt(doc.state.selection.main.head).number,
       block:document.querySelector('.lab-ocr-pdf-pbs-tag[data-selected="true"]')?.dataset.blockId};
   });
   assert.equal(focus.text,'<sup>1</sup>');assert.equal(focus.line,1);assert(focus.decorated);
   await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-preview-md-scroll [data-ocr-sync-selected]')]
     .some(node=>Number(node.dataset.sourceStart)<=1&&Number(node.dataset.sourceEnd)>1),
     null,{timeout:15000});
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-selected="true"]')
     ?.dataset.blockId==='101',null,{timeout:12000});
   // The body is a separately navigable AG row, on physical PDF page 3.
   const body=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'line_id',id:'note-md-4',focusColumn:'text'}));
   assert.equal(body?.kind,'注文');assert.equal(body?.pbs,'p3b1');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="text"]').click();
   await page.waitForFunction(()=>{
     const editor=document.querySelector('.ocr-cm-source')?.ocrCmTable?.editorView();
     return editor?.state.doc.sliceString(editor.state.selection.main.head,
       editor.state.selection.main.head+8)==='1. One n'&&
       !!document.querySelector('.ocr-cm-source .ocr-note-match-source-active');
   });
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-pbs-tag[data-selected="true"]')
     ?.dataset.blockId==='104');
   await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-preview-md-scroll [data-ocr-sync-selected]')]
     .some(node=>Number(node.dataset.sourceStart)<=4&&Number(node.dataset.sourceEnd)>4),
     null,{timeout:15000});
   // The body text and the ambiguous status must differ in hue AND styling.
   const colors=await page.evaluate(()=>{
     const body=document.querySelector('.ag-row-selected .ocr-note-match-text[data-kind="注文"]');
     const style=body?getComputedStyle(body):null;
     return {text:style?.color,edge:style?.borderLeftColor,edgeWidth:style?.borderLeftWidth};
   });
   assert.equal(colors.text,'rgb(132, 183, 255)');
   assert.equal(colors.edgeWidth,'3px');
   const weakId='pair:ref:note-md-1:'+sourceLines[0].indexOf('(2)')+
     ':ref.parenthesis:ref';
   const weak=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'match_state'}),weakId);
   assert.equal(weak?.status,'待核实');
   const warning=await page.evaluate(()=>{
     const cell=document.querySelector('.ag-row-selected .ocr-note-match-status-select[data-status="待核实"]');
     const style=cell?getComputedStyle(cell):null;
     return {text:style?.color,border:style?.borderTopWidth,background:style?.backgroundColor,
       choices:cell?[...cell.options].map(o=>o.textContent):[]};
   });
   assert.equal(warning.text,'rgb(255, 155, 98)');
   assert.equal(warning.border,'1px');
   assert.notEqual(warning.text,colors.text);
   assert.deepEqual(warning.choices,['已匹配','待核实','忽略','已转换','转换失败']);
   // The ignored candidate stays in the AG grid and can be restored in the
   // SAME status column. No redundant review column/toggle is allowed.
   assert(!await page.locator('.ocr-outline-pane .ocr-ag-review-toggle').isVisible());
   assert(!await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields().includes('review')));
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-match-status-select').first()
     .selectOption('忽略');
   await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'match_state'})?.match_state==='忽略',
     weakId,{timeout:12000});
   assert.equal(reviewSaves,1);
   await picker.selectOption('md');
   await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('note_row_id'));
   assert.equal(reviewGets,2,'Ignored decision must be reloaded from book SQLite');
   const ignored=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'match_state'}),weakId);
   assert.equal(ignored?.match_state,'忽略');
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-match-status-select').first()
     .selectOption('待核实');
   await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'match_state'})?.review==='待核实',
     weakId,{timeout:12000});
   assert.equal(reviewSaves,2);
   // Reopening the view intentionally resets to number order. This explicit
   // subsequent user click then verifies rule-save does NOT reset it.
   await header('line_no').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="line_no"]')
     ?.getAttribute('aria-sort')==='ascending');
   // A strong automatic match is already shown as 已匹配. Changing it to
   // 待核实 persists an explicit override; restoring 已匹配 selects its only
   // body and persists the legacy '待转换' review decision.
   const firstId='pair:ref:note-md-1:'+sourceLines[0].indexOf('<sup>1</sup>')+
     ':ref.html-sup:ref';
   const first=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'match_state'}),firstId);
   assert.equal(first?.match_state,'已匹配');
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-match-status-select').first()
     .selectOption('待核实');
   await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'match_state'})?.match_state==='待核实',firstId);
   assert.equal(reviewSaves,3);
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-match-status-select').first()
     .selectOption('已匹配');
   await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'match_state'})?.review==='待转换',firstId);
   assert.equal(reviewSaves,4);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original,'Status change must not convert source');
   const functions=page.locator('.ocr-outline-pane .ocr-ag-function-select');
   await functions.click();
   assert.deepEqual(await page.locator('.ocr-ag-function-menu [role="menuitem"]')
     .allTextContents(),['转换匹配','识别规则']);
   await page.keyboard.press('Escape');
   assert(!await functions.isDisabled());
   await functions.click();
   await page.locator('.ocr-ag-function-item[data-action="rules"]').click();
   const dialog=page.locator('.ocr-note-match-rules-dialog');
   await dialog.waitFor({state:'visible'});
   const refFormat=dialog.getByRole('combobox',{name:'注号格式'});
   const bodyFormat=dialog.getByRole('combobox',{name:'注文格式'});
   assert.equal(await dialog.locator('select').count(),2);
   assert.equal(await dialog.locator('input,textarea').count(),0);
   // Prior books with mixed formats must NOT be silently rewritten just by
   // opening the new two-selector interface.
   assert.equal(await refFormat.inputValue(),'__existing__');
   assert.equal(await bodyFormat.inputValue(),'__existing__');
   assert.deepEqual(await refFormat.locator('option').allTextContents(),[
     '当前书籍的原有多格式组合（保留不变）',
     'HTML 上标 · 正文<sup>7</sup>',
     'Markdown 脚注 · 正文[^7]',
     'Unicode 上标 · 正文⁷',
     '方括号 · 正文[7]',
     '圆括号 · 正文(7)',
     '符号 · 正文†',
     '英文字母上标 · 正文<sup>a</sup>']);
   await refFormat.selectOption('ref.html-sup');
   await bodyFormat.selectOption('body.number-dot');
   assert.equal(await dialog.locator('.ocr-note-rule-sample').first().textContent(),
     '样例：正文<sup>7</sup>');
   assert((await dialog.locator('.ocr-note-rule-regex').first().textContent())
     .includes('<sup'));
   assert.equal(await dialog.locator('.ocr-note-rule-sample').nth(1).textContent(),
     '样例：7. 注文内容');
   await dialog.getByRole('button',{name:'保存并重新识别'}).click();
   await dialog.waitFor({state:'hidden'});
   assert.equal(ruleSaves,1);
   assert.equal(savedRules.scope,'book','Old book scope must be preserved');
   assert.equal(savedRules.continuation,'same-block');
   assert.deepEqual(savedRules.referenceRules,['ref.html-sup','ref.md-footnote']);
   assert.deepEqual(savedRules.bodyRules,['body.number-dot','body.md-footnote']);
   await functions.click();
   await page.locator('.ocr-ag-function-item[data-action="rules"]').click();
   await dialog.waitFor({state:'visible'});
   assert.equal(await refFormat.inputValue(),'ref.html-sup');
   assert.equal(await bodyFormat.inputValue(),'body.number-dot');
   assert.equal(await dialog.locator('select').count(),2);
   await dialog.getByRole('button',{name:'取消'}).click();
   await dialog.waitFor({state:'hidden'});
   assert.equal(ruleSaves,1,'Reopening selected format cannot rewrite book rules');
   // Updating the note rows must preserve the manual line sort: only a
   // fresh View activation installs the numeric default again.
   assert.equal(await header('line_no').getAttribute('aria-sort'),'ascending');
   const removed=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),weakId);
   assert.equal(removed,null,'Selecting one source pattern must remove competing parenthesis matches');
   const normalized=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId);
   assert(normalized,'Existing Markdown footnote markers must remain visible for converted notes');
   await picker.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('text'));
   assert(await functions.isDisabled());
   await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('note_row_id'));
   assert.equal(ruleLoads,3);assert.equal(reviewGets,3);
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="number"]')
     ?.getAttribute('aria-sort')==='ascending');
   assert.equal(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),weakId),null,
     'Switching AG Views must read persisted source format choices');
   assert(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId),
     'Switching views must preserve standard Markdown footnote markers');
   const confirmedReload=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'review'}),firstId);
   assert.equal(confirmedReload?.review,'待转换',
     'Confirmed pairing is persisted on the book even across AG view reloading');
   // The top-level status selector has only three choices even if there are
   // multiple same-number bodies. A second-stage, body-specific selector is
   // explicitly required; no closest-row heuristic is allowed.
   const chooserEvidence=await page.evaluate(async()=>{
     const {createNoteMatchStatusCell,NOTE_MATCH_STATUS_OPTIONS}=await import(
       './note-pair-review-cell.js');
     const calls=[];
     const cell=createNoteMatchStatusCell((row,choice,bodyId)=>{
       calls.push([choice,bodyId]);return true;
     })({data:{reference_id:'ref:fake',number:'5',match_state:'待核实',
       body_choices:[{id:'body-a',pbs:'p2b1',line_no:10},
         {id:'body-b',pbs:'p3b2',line_no:17}]}});
     document.body.append(cell);
     const select=cell.querySelector('select');
     const options=[...select.options].map(option=>option.value);
     select.value='已匹配';select.dispatchEvent(new Event('change',{bubbles:true}));
     const secondary=document.querySelector('body>.ocr-note-body-choice');
     const visible=Boolean(secondary&&getComputedStyle(secondary).position==='fixed');
     secondary.value='body-b';secondary.dispatchEvent(new Event('change'));
     await Promise.resolve();await Promise.resolve();
     const result={options,defined:NOTE_MATCH_STATUS_OPTIONS,visible,calls};
     cell.remove();return result;
   });
   assert.deepEqual(chooserEvidence.options,['已匹配','待核实','忽略','已转换','转换失败']);
   assert.deepEqual(chooserEvidence.defined,['已匹配','待核实','忽略','已转换','转换失败']);
   assert.equal(chooserEvidence.visible,true);
   assert.deepEqual(chooserEvidence.calls,[['待转换','body-b']]);
   assert.equal(mdLoads,1);
   assert.equal(mdSaves,0);assert.equal(blockSaves,0);
   assert.equal(reviewSaves,4);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_NOTE_MATCH_STATUS_FUNCTION_BROWSER_PASS',name,{ruleLoads,ruleSaves,reviewGets,reviewSaves,
     mdLoads,mdSaves,blockSaves});
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
