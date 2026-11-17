/** WP3.2: real CM6 single-transaction Obsidian conversion + SQL CAS mocked
 * per isolated synthetic book. Chromium + iPad-WebKit, source ID preservation.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const failureMode=process.env.NOTE_FAIL_MODE==='1';
const partialMode=process.env.NOTE_PARTIAL_MODE==='1';
const port=partialMode?5456:failureMode?5458:5457,book='/isolated/note-conversion-book';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
const source=[partialMode?
  'Assessing taxes<sup>9</sup> and overseas[^10] Hence.':
  'Assessing taxes<sup>9</sup> and overseas<sup>10</sup> Hence.',
  ...(failureMode?['A separate claim<sup>11</sup>.']:[]),
  '## Notes','9. For a corporation, capital gains taxes apply.',
  partialMode?'[^10]: International taxes are complex.':
    '10. International taxes are complex.',
  ...(failureMode?['11. This separate note fails on request.']:[])];
const blocks=source.map((text,i)=>({block_id:201+i,pbs:`p${i<2?1:2}b${i}`,
  global_page:i<2?0:1,parent_block_id:null,sibling_order:i,
  block_type:'text',block_group:'para_blocks',absorbed_into_block_id:null,
  block_json:JSON.stringify({type:'text',lines:[{spans:[{type:'text',content:text}]}]}),
  block_bbox_json:'[40,70,420,145]',content_preview:text,
  line_count:1,span_count:1,span_types:'text',page_size_json:'[595,842]'}));
const initialRows=source.map((text,i)=>({line_no:i+1,line_id:`convert-line-${i}`,
  block_id:blocks[i].block_id,text}));
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
   let armCount=0,reviewSetCount=0,blockSaves=0,failCount=0;
   const decisions=new Map();
   if(partialMode){
     const base='Assessing taxes<sup>9</sup> and overseas<sup>10</sup> Hence.';
     const originalOffset=base.indexOf('<sup>10</sup>');
     const referenceId=`ref:convert-line-0:${originalOffset}:ref.html-sup`;
     const conversion={number:'10',
       converted_ref_id:`ref:convert-line-0:${source[0].indexOf('[^10]')}:ref.md-footnote`,
       converted_body_id:'body:convert-line-3:0:body.md-footnote',
       updates:[{line_id:'convert-line-0',block_id:201,afterText:source[0]},
         {line_id:'convert-line-3',block_id:204,afterText:source[3]}]};
     decisions.set(referenceId,{ref_id:referenceId,ref_line_id:'convert-line-0',
       ref_block_id:201,ref_from:originalOffset,ref_to:originalOffset+13,
       ref_raw:'<sup>10</sup>',decision:'待转换',
       body_id:'body:convert-line-3:0:body.number-dot',
       body_line_id:'convert-line-3',body_block_id:204,
       body_from:0,body_to:source[3].length,body_raw:'10. International taxes are complex.',
       revision:'a'.repeat(32),conversion});
   }
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
         const ref=md.find(x=>x.line_id===item.ref_line_id);
         const body=md.find(x=>x.line_id===item.body_line_id);
         const variants=item.conversion?
           [item.conversion,...(item.conversion.alternates??[])]:[];
         const active=variants.find(version=>version.updates?.length&&
           version.updates.every(change=>md.find(x=>x.line_id===change.line_id)
             ?.text===change.afterText));
         const valid=Boolean(ref?.text.slice(item.ref_from,item.ref_to)===item.ref_raw&&
           body?.text.slice(item.body_from,item.body_to)===item.body_raw&&!active);
         return {...item,valid,converted:Boolean(active),conversion:item.conversion&&{
           converted_ref_id:(active??item.conversion).converted_ref_id,
           converted_body_id:(active??item.conversion).converted_body_id,
           updates:(active??item.conversion).updates.map(ch=>({line_id:ch.line_id}))}};
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
     if(op==='note-pair-convert-prepare'&&failureMode){
       failCount++;
       return route.fulfill({status:422,contentType:'application/json',
         body:JSON.stringify({error:'synthetic conversion safety rejection'})});
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
     if(op==='note-pair-group-prepare'){
       const payload=req.postDataJSON();armCount++;
       assert.equal(payload.members.length,partialMode?1:2);
       assert.equal(payload.anchors.length,partialMode?1:0);
       const originals=payload.members.map(m=>decisions.get(m.referenceId));
       assert(originals.every((prior,i)=>prior?.decision==='待转换'&&
         prior.revision===payload.members[i].expectedRevision));
       for(const item of payload.updates)
         assert.equal(md.find(x=>x.line_id===item.lineId)?.text,item.beforeText);
       const members=payload.members.map((item,i)=>{
         const conversion={number:item.number,converted_ref_id:item.convertedReferenceId,
           converted_body_id:item.convertedBodyId,
           group_id:'group-synthetic',
           updates:payload.updates.map(u=>({line_id:u.lineId,block_id:u.blockId,
             afterText:u.afterText}))};
         const revision=String(100+armCount*20+i).padStart(32,'0');
         decisions.set(item.referenceId,{...originals[i],conversion,revision});
         return {ref_id:item.referenceId,revision,conversion};
       });
       for(const anchor of payload.anchors){
         const prior=decisions.get(anchor.referenceId);
         assert(prior&&prior.revision===anchor.expectedRevision);
         const prev=prior.conversion;
         const conversion={...prev,converted_ref_id:anchor.convertedReferenceId,
           updates:prev.updates.map(change=>{
             const updated=payload.updates.find(item=>item.lineId===change.line_id);
             return updated?{...change,afterText:updated.afterText}:change;
           }),alternates:[prev,...(prev.alternates??[])]};
         const revision=String(200+armCount).padStart(32,'0');
         decisions.set(anchor.referenceId,{...prior,conversion,revision});
         members.push({ref_id:anchor.referenceId,revision,conversion});
       }
       return json({status:'prepared',group_id:'group-synthetic',members});
     }
     if(op==='note-pair-convert-issues'){
       const payload=req.postDataJSON();
       const failures=payload.items.map((item,i)=>{
         const id=item.reference.candidateId,old=decisions.get(id);
         const revision=String(800+i).padStart(32,'0');
         decisions.set(id,{...old,ref_id:id,ref_line_id:item.reference.lineId,
           ref_block_id:item.reference.blockId,ref_from:item.reference.from,
           ref_to:item.reference.to,ref_raw:item.reference.raw,
           decision:old?.decision??'待核实',revision,
           issue:{code:item.code,reason:item.reason}});
         return {ref_id:id,revision,issue:{code:item.code,reason:item.reason}};
       });
       return json({status:'saved',issues:failures});
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
   const original=source.join('\n');
   const old9=`pair:ref:convert-line-0:${source[0].indexOf('<sup>9</sup>')}:ref.html-sup:ref`;
   const old10=partialMode?
     `pair:ref:convert-line-0:${source[0].indexOf('[^10]')}:ref.md-footnote:ref`:
     `pair:ref:convert-line-0:${source[0].indexOf('<sup>10</sup>')}:ref.html-sup:ref`;
   const afterLine=source[0].replace('<sup>9</sup>','[^9]').replace('<sup>10</sup>','[^10]');
   const new9=`pair:ref:convert-line-0:${afterLine.indexOf('[^9]')}:ref.md-footnote:ref`;
   const new10=`pair:ref:convert-line-0:${afterLine.indexOf('[^10]')}:ref.md-footnote:ref`;
   const select=async id=>page.evaluate(value=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.selectById({field:'note_row_id',id:value,focusColumn:'match_state'}),id);
   assert.equal((await select(old9))?.match_state,'已匹配');
   assert.equal((await select(old10))?.match_state,partialMode?'已转换':'已匹配');
   const functionPicker=page.locator('.ocr-outline-pane .ocr-ag-function-select');
   await functionPicker.click();
   await page.locator('.ocr-ag-function-item[data-action="convert"]').click();
   await page.waitForFunction(expected=>document.querySelector('#status')?.textContent
     ?.includes(expected),partialMode?'已转换 1 个':'已转换 2 个',{timeout:30000});
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:15000});
   const converted=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument());
   assert(converted.includes(afterLine));
   assert(converted.includes('[^9]: For a corporation, capital gains taxes apply.'));
   assert(converted.includes('[^10]: International taxes are complex.'));
   assert.equal(mdSaves,1,'One grouped CM6 transaction must trigger one MD CAS save');
   assert.equal(armCount,1,'One grouped prepare must cover 9 and 10');
   assert.equal(reviewSetCount,partialMode?1:failureMode?3:2);
   assert.equal(blockSaves,0);
   assert.equal((await select(new9))?.match_state,'已转换');
   assert.equal((await select(new10))?.match_state,'已转换');
   if(failureMode){
     assert.equal(failCount,1);
     const old11=`pair:ref:convert-line-1:${source[1].indexOf('<sup>11</sup>')}:ref.html-sup:ref`;
     await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')
       ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'match_state'})
       ?.match_state==='转换失败',old11,{timeout:15000});
     const failed=await select(old11);
     assert.equal(failed.match_state,'转换失败');
     assert(failed.conversion_error.includes('synthetic conversion safety rejection'));
     assert.equal(await page.locator('.ocr-outline-grid .ocr-note-match-status-select[aria-label="注号 11 匹配状态"]').first().inputValue(),
       '转换失败');
     const header=page.locator('.ocr-outline-grid .ag-header-cell[col-id="match_state"]');
     const filterButton=header.locator('.ag-header-cell-filter-button');
     assert(await filterButton.count(),
       'AG match_state must expose the existing EnumCheckboxFilter UI');
     await filterButton.click();
     const filter=page.locator('.ocr-enum-filter:visible').first();
     await filter.locator('[data-filter-value="all"] input').uncheck();
     await filter.locator('[data-filter-value="转换失败"] input').check();
     await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-outline-grid .ag-row')]
       .filter(el=>el.getAttribute('row-index')!==null).length>=1);
     const visible=await page.locator('.ocr-outline-grid .ag-row .ag-cell[col-id="number"]').allTextContents();
     assert(visible.length>=1&&visible.every(value=>value==='11'),
       'Filtering conversion failures must only show failed number 11: '+visible);
     await page.keyboard.press('Escape');
     // Keep this AG filter while testing CM6 Undo: filters must never
     // change the editor transaction or its Markdown persistence.
   }
   // A single Undo must restore both notes and their two body definitions.
   assert(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.undoMarkdown()));
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),original);
   if(partialMode){
     await page.waitForFunction(id=>document.querySelector('.ocr-outline-grid')
       ?.ocrSqlGrid?.selectById({field:'note_row_id',id,focusColumn:'match_state'})
       ?.match_state==='已转换',old10,{timeout:12000});
   }
   assert(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.redoMarkdown()));
   assert.equal(await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()),converted);
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:20000});
   await picker.selectOption('md');await picker.selectOption('note-match');
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid')
     ?.ocrSqlGrid?.columnFields()?.includes('match_state'));
   assert.equal((await select(new9))?.match_state,'已转换');
   assert.equal((await select(new10))?.match_state,'已转换');
   // The read-only converted option is visible and filterable, not
   // manually forgeable by clicking a non-converted status dropdown.
   const state=page.locator('.ocr-outline-grid .ocr-note-match-status-select[aria-label="注号 10 匹配状态"]').first();
   assert.equal(await state.inputValue(),'已转换');
   assert(await state.isDisabled());
   const identity=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdRuntime().rows.map(x=>({lineId:x.line_id,blockId:x.block_id})));
   assert.deepEqual(identity,initialRows.map(x=>({lineId:x.line_id,blockId:x.block_id})));
   assert.deepEqual(errors,[]);
   console.log(partialMode?'LAB_OCR_NOTE_PARTIAL_REBASE_BROWSER_PASS':
     failureMode?'LAB_OCR_NOTE_FAILED_FILTER_BROWSER_PASS':
     'LAB_OCR_NOTE_SAME_LINE_9_10_BROWSER_PASS',name,
     {mdSaves,armCount,reviewSetCount,reviewGets,blockSaves});
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
