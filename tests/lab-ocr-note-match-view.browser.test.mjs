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
   const gap=await page.evaluate(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id:'gap:book:4',focusColumn:'status'}));
   assert.equal(gap?.status,'疑似缺号');
   assert.equal(gap?.line_id,null);
   assert.equal(gap?.pbs,'');
   await page.locator('.ocr-outline-grid .ag-row-selected .ag-cell[col-id="status"]').click();
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
     ?.ocrSqlGrid?.selectById({field:'line_id',id:'note-md-6',focusColumn:'status'}));
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
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'status'}),weakId);
   assert.equal(weak?.status,'待核实');
   const warning=await page.evaluate(()=>{
     const cell=document.querySelector('.ag-row-selected .ocr-note-match-status[data-status="待核实"]');
     const style=cell?getComputedStyle(cell):null;
     return {text:style?.color,border:style?.borderTopWidth,background:style?.backgroundColor};
   });
   assert.equal(warning.text,'rgb(255, 155, 98)');
   assert.equal(warning.border,'1px');
   assert.notEqual(warning.text,colors.text);
   // Ignore a weak reference -> immediately leave the current candidate
   // queue, but remain recoverable through the AG-owned 'show ignored' toggle.
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-review-trigger').click();
   await page.locator('.ocr-note-review-menu .ocr-note-review-option[data-review="忽略"]').click();
   await page.waitForFunction(id=>!document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'status',preserveFilters:true}),
     weakId,{timeout:12000});
   assert.equal(reviewSaves,1);
   await picker.selectOption('md');
   await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('note_row_id'));
   assert.equal(reviewGets,2,'Ignored decision must be reloaded from book SQLite');
   assert.equal(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,preserveFilters:true}),weakId),null,
     'Ignored candidate stays outside pending queue after reopening the View');
   const showIgnored=page.locator('.ocr-outline-pane .ocr-ag-review-toggle input');
   assert.equal(await showIgnored.isChecked(),false);
   await showIgnored.check();
   const ignored=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'review'}),weakId);
   assert.equal(ignored?.review,'忽略');assert.equal(ignored?.status,'已忽略');
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-review-trigger').click();
   await page.locator('.ocr-note-review-menu .ocr-note-review-option[data-review="待定"]').click();
   await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'review'})?.review==='待定',
     weakId,{timeout:12000});
   assert.equal(reviewSaves,2);
   await showIgnored.uncheck();
   // Reopening the view intentionally resets to number order. This explicit
   // subsequent user click then verifies rule-save does NOT reset it.
   await header('line_no').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="line_no"]')
     ?.getAttribute('aria-sort')==='ascending');
   // Confirm a unique body without editing or converting Markdown.
   const firstId='pair:ref:note-md-1:'+sourceLines[0].indexOf('<sup>1</sup>')+
     ':ref.html-sup:ref';
   const first=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'review'}),firstId);
   assert.equal(first?.review,'待定');
   await page.locator('.ocr-outline-grid .ag-row-selected .ocr-note-review-trigger').click();
   await page.locator('.ocr-note-review-menu .ocr-note-review-option[data-review="待转换"]').first().click();
   await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'review'})?.review==='待转换',
     firstId,{timeout:12000});
   assert.equal(reviewSaves,3);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original,'Confirmation must not convert source in WP3.1');
   // One AG toolbar action controls the rules modal; no additional grid.
   const button=page.locator('.ocr-outline-pane .ocr-ag-extra-action');
   assert.equal(await button.textContent(),'识别规则');
   await button.click();
   const dialog=page.locator('.ocr-note-match-rules-dialog');
   await dialog.waitFor({state:'visible'});
   const scope=dialog.locator('select').first();
   await scope.selectOption('chapter');
   await dialog.locator('input[value="ref.md-footnote"]').uncheck();
   const custom=dialog.locator('textarea');
   assert.equal(await custom.inputValue(),'[]');
   await dialog.getByRole('button',{name:'应用并保存规则'}).click();
   await dialog.waitFor({state:'hidden'});
   assert.equal(ruleSaves,1);assert.equal(savedRules.scope,'chapter');
   assert(!savedRules.referenceRules.includes('ref.md-footnote'));
   // Updating the note rows must preserve the manual line sort: only a
   // fresh View activation installs the numeric default again.
   assert.equal(await header('line_no').getAttribute('aria-sort'),'ascending');
   const removed=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId);
   assert.equal(removed,null,'Saving book rules must remove now-disabled candidates without reloading CM6');
   await picker.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('text'));
   assert.equal(await button.isVisible(),false);
   await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('note_row_id'));
   assert.equal(ruleLoads,3);assert.equal(reviewGets,3);
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="number"]')
     ?.getAttribute('aria-sort')==='ascending');
   assert.equal(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId),null,
     'Switching AG Views must read saved per-book configuration');
   const confirmedReload=await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'review'}),firstId);
   assert.equal(confirmedReload?.review,'待转换',
     'Confirmed pairing is persisted on the book even across AG view reloading');
   assert.equal(mdLoads,1);
   assert.equal(mdSaves,0);assert.equal(blockSaves,0);
   assert.equal(reviewSaves,3);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_NOTE_MATCH_WP3_1_BROWSER_PASS',name,{ruleLoads,ruleSaves,reviewGets,reviewSaves,
     mdLoads,mdSaves,blockSaves});
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
