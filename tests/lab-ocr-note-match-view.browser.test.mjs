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
  [101,'p1b0',0,'A study finds<sup>1</sup>, and it also cites[^1].'],
  [102,'p2b1',1,'Further comparison<sup>2</sup>.'],
  [103,'p3b0',2,'## Notes'],
  [104,'p3b1',2,'1. One note applies to two citations.'],
  [105,'p3b2',2,'2. This is another note.'],
  [106,'p3b3',2,'3. Orphan source note.'],
  [107,'p2b2',1,'Another claim (2) was actually a numbered list.'],
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
   let savedRules=null,ruleRevision='initial-rev';
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
   const mdFootnoteId='pair:ref:note-md-1:'+sourceLines[0].indexOf('[^1]')+
     ':ref.md-footnote:ref';
   assert(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')?.ocrSqlGrid
     ?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId),
     'A second citation in the same LineID must have its own AG row ID');
   assert.equal(ruleLoads,1);
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
   assert.equal(ruleLoads,2);
   assert.equal(await page.evaluate(id=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'kind'}),mdFootnoteId),null,
     'Switching AG Views must read saved per-book configuration');
   assert.equal(mdLoads,1);
   assert.equal(mdSaves,0);assert.equal(blockSaves,0);
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_NOTE_MATCH_WP2_BROWSER_PASS',name,{ruleLoads,ruleSaves,
     mdLoads,mdSaves,blockSaves});
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
