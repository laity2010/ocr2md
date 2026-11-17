/** WP3.2: real CM6 single-transaction Obsidian conversion + SQL CAS mocked
 * per isolated synthetic book. Chromium + iPad-WebKit, source ID preservation.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5462,book='/isolated/note-conversion-book';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
const source=['We saw<sup>7</sup> here.',
  '## Notes',
  '7. We began by purchasing insurance that usually delivered an',
  'underwriting profit. Even more important, float grew over time.'];
const blocks=source.slice(0,3).map((text,i)=>({block_id:201+i,pbs:`p${i<2?1:2}b${i}`,
  global_page:i<2?0:1,parent_block_id:null,sibling_order:i,
  block_type:'text',block_group:'para_blocks',absorbed_into_block_id:null,
  block_json:JSON.stringify({type:'text',lines:[{spans:[{type:'text',content:text}]}]}),
  block_bbox_json:'[40,70,420,145]',content_preview:text,
  line_count:1,span_count:1,span_types:'text',page_size_json:'[595,842]'}));
const initialRows=source.map((text,i)=>({line_no:i+1,line_id:`convert-line-${i}`,
  block_id:blocks[Math.min(i,2)].block_id,text}));
try{
 let up=false;
 for(let i=0;i<130;i++){
   try{if((await fetch(url)).ok){up=true;break;}}catch{}await sleep(150);
 }
 assert(up,'Vite startup failed '+log.slice(-1000));
 for(const [name,type] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([n])=>!process.env.LAB_OCR_TEST_BROWSER||n===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await type.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1200,height:880},hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let md=initialRows.map(row=>({...row})),mdRevision=0,mdSaves=0,reviewGets=0;
   let armCount=0,reviewSetCount=0,blockSaves=0;
   const decisions=new Map();
   await page.addInitScript(({book})=>localStorage.setItem(
     'ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
       'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
         category2:'目录',comment:'conversion test',value:book,
         range:{kind:'server-directory'}}}})),{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
     const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
     const json=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
     if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(3)});
     if(op==='inspect')return json({status:'unchanged',blocks:blocks.length,pages:3,
       pdf:'synthetic.pdf',sources:[{name:'synthetic.json',pages:3}],mdSupported:true});
     if(op==='minerujson2block')return json({status:'ready',kind:'view',blocks:blocks.length});
     if(op==='rows')return json({table:'block',rows:blocks,total:blocks.length});
     if(op==='block-edit-state')return json({revision:0,cursor:0,history:[],canUndo:false,canRedo:false});
     if(op==='md-state')return json({status:'ready',revision:mdRevision,rows:md,total:md.length});
     if(op==='note-match-rules')return json({status:'ready',revision:'rule1',config:{
       referenceRules:['ref.html-sup','ref.md-footnote','ref.unicode-sup','ref.bracket','ref.parenthesis','ref.symbol'],
       bodyRules:['body.md-footnote','body.number-dot','body.number-paren','body.number-bracket','body.labelled','body.symbol'],
       scope:'book',chapterLevel:1,weakAutoMatch:false,continuation:'same-block',customRules:[]}});
     if(op==='note-pair-reviews'){
       reviewGets++;
       return json({status:'ready',reviews:[...decisions.values()].map(item=>{
         const ref=md.find(x=>x.line_id===item.ref_line_id),body=md.find(x=>x.line_id===item.body_line_id);
         const valid=Boolean(ref?.text.slice(item.ref_from,item.ref_to)===item.ref_raw&&
           body?.text.slice(item.body_from,item.body_to)===item.body_raw&&
           (!item.conversion||!item.conversion.updates.every(ch=>
             md.find(x=>x.line_id===ch.line_id)?.text===ch.afterText)));
         const converted=Boolean(item.conversion?.updates.every(ch=>
           md.find(x=>x.line_id===ch.line_id)?.text===ch.afterText));
         return {...item,valid,converted,conversion:item.conversion&&{
           converted_ref_id:item.conversion.converted_ref_id,
           converted_body_id:item.conversion.converted_body_id,
           updates:item.conversion.updates.map(ch=>({line_id:ch.line_id}))}};
       })});
     }
     if(op==='note-pair-review-set'){
       const body=req.postDataJSON(),prior=decisions.get(body.reference.candidateId);
       reviewSetCount++;
       assert.equal(body.expectedRevision,prior?.revision??null);
       const rev=String(reviewSetCount).padStart(32,'0');
       decisions.set(body.reference.candidateId,{
         ref_id:body.reference.candidateId,ref_line_id:body.reference.lineId,
         ref_block_id:body.reference.blockId,ref_from:body.reference.from,
         ref_to:body.reference.to,ref_raw:body.reference.raw,
         body_id:body.body?.candidateId??null,body_line_id:body.body?.lineId??null,
         body_block_id:body.body?.blockId??null,body_from:body.body?.from??null,
         body_to:body.body?.to??null,body_raw:body.body?.raw??null,
         decision:body.decision,revision:rev});
       return json({status:'saved',ref_id:body.reference.candidateId,
         decision:body.decision,body_id:body.body?.candidateId??null,revision:rev});
     }
     if(op==='note-pair-convert-prepare'){
       const payload=req.postDataJSON(),prior=decisions.get(payload.referenceId);
       armCount++;
       assert.equal(prior.decision,'待转换');
       assert.equal(prior.revision,payload.expectedRevision);
       for(const item of payload.plan.updates)
         assert.equal(md.find(x=>x.line_id===item.lineId)?.text,item.beforeText,
           'PREPARE requires unchanged original MD');
       const conversion={converted_ref_id:payload.plan.convertedReferenceId,
         converted_body_id:payload.plan.convertedBodyId,
         updates:payload.plan.updates.map(item=>({line_id:item.lineId,
           block_id:item.blockId,afterText:item.afterText}))};
       const revision=String(100+armCount).padStart(32,'0');
       decisions.set(payload.referenceId,{...prior,conversion,revision});
       return json({status:'prepared',ref_id:payload.referenceId,revision,conversion});
     }
     if(op==='md-save'){
       const payload=req.postDataJSON();mdSaves++;
       assert.equal(payload.expectedRevision,mdRevision,'MD SQLite CAS revision');
       md.splice(payload.start-1,payload.deleteCount,...payload.insert.map(x=>({...x})));
       md=md.map((row,i)=>({...row,line_no:i+1}));
       mdRevision++;
       return json({status:'saved',revision:mdRevision,total:md.length});
     }
     if(op==='block-break-reviews')return json({status:'ready',reviews:[]});
     if(op==='block-edit-batch'){blockSaves++;return json({status:'not-allowed'});}
     if(op==='overlays'){
       const p=Number(u.searchParams.get('page'));
       return json({page:p,level:'block',pageSize:[595,842],boxes:blocks.filter(x=>x.global_page===p-1)
         .map(x=>({id:String(x.block_id),blockId:String(x.block_id),pbs:x.pbs,
           parentBlockId:null,blockGroup:'para_blocks',blockType:'text',
           bbox:[40,70,420,145],sourceEmpty:false}))});
     }
     throw Error('Unexpected API: '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#workspace select.ocr-source-file-select')
     ?.value==='sql:md',null,{timeout:22000});
   const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
   await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('note_row_id'));
   const from=source[0].indexOf('<sup>7</sup>');
   const oldId=`pair:ref:convert-line-0:${from}:ref.html-sup:ref`;
   const newId=`pair:ref:convert-line-0:${from}:ref.md-footnote:ref`;
   const select=async id=>page.evaluate(value=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id:value,focusColumn:'match_state'}),id);
   assert.equal((await select(oldId))?.match_state,'已匹配');
   const funcs=page.locator('.ocr-outline-pane .ocr-ag-function-select');
   await funcs.selectOption('convert');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent
     ?.includes('已转换 1 个'),null,{timeout:30000});
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:16000});
   const converted=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument());
   assert(converted.includes('We saw[^7] here.'));
   assert(converted.includes('[^7]: We began by purchasing insurance that usually delivered an'));
   assert(converted.includes('    underwriting profit. Even more important, float grew over time.'));
   assert.equal(mdSaves,1);assert.equal(armCount,1);
   assert.equal(reviewSetCount,1);assert.equal(blockSaves,0);
   assert.equal((await select(newId))?.match_state,'已转换');
   // One CM6 history entry covers source line, definition, continuation.
   assert(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.undoMarkdown()));
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),source.join('\n'));
   assert(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.redoMarkdown()));
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),converted);
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:16000});
   await picker.selectOption('md');await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('match_state'));
   assert.equal((await select(newId))?.match_state,'已转换');
   const identity=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime().rows.map(x=>({lineId:x.line_id,blockId:x.block_id})));
   assert.deepEqual(identity,initialRows.map(x=>({lineId:x.line_id,blockId:x.block_id})));
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_NOTE_7_SAME_BLOCK_CONVERSION_BROWSER_PASS',name,
     {mdSaves,armCount,reviewSetCount,reviewGets,blockSaves});
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
