/** Direct public PDF viewer API browser test, mounted by the Lab PDF host. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const HOST=process.env.LAB_PDF_TEST_URL||'http://127.0.0.1:5329/labs/lab-pdf/';
const worker=process.env.LAB_PDF_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','preview','--config','labs/lab-pdf/vite.config.mjs',
 '--host','127.0.0.1','--port','5329','--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';worker?.stdout.on('data',b=>serverLog+=b);worker?.stderr.on('data',b=>serverLog+=b);
try{
 // The local dev server needs a startup probe. For published HTTPS URLs,
 // the browser context below owns certificate handling (the LAN uses a
 // self-signed certificate); Node fetch must not preempt browser acceptance.
 let online=Boolean(process.env.LAB_PDF_TEST_URL);
 if(!online)for(let i=0;i<110;i++){
  try{if((await fetch(HOST)).ok){online=true;break}}catch{}
  await pause(200);
 }
 assert.ok(online,'PDF Lab server failed: '+serverLog.slice(-900));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(23000);
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   page.on('requestfailed',r=>errors.push('network '+r.url()+' '+r.failure()?.errorText));
   page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(HOST))errors.push(r.status()+' '+r.url());});
   const res=await page.goto(HOST,{waitUntil:'domcontentloaded',timeout:60000});
   assert.equal(res.status(),200);
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pdf-host')?.ocrPdfViewer&&
     document.querySelector('#status')?.textContent?.includes('PDF 已就绪'),null,{timeout:50000});
   assert.equal(await page.locator('.opdf-root .page').count(),3);
   assert.ok(await page.locator('.opdf-root canvas').count()>=1,'PDF.js paints real page canvas');
   assert.ok(await page.locator('.opdf-root .textLayer').count()>=1,'PDF.js attaches its text layer');
   assert.ok(await page.locator('.opdf-block').count()>=3);
   const count=await page.locator('.opdf-count').innerText();assert.match(count,/3/);
   const api=await page.evaluate(()=>Object.keys(document.querySelector('.ocr-preview-pdf-host').ocrPdfViewer).sort());
   assert.deepEqual(api,['dispose','focusBlock','open','setBlockOverlays']);
   // Drawing uses source bbox percentages; zooming cannot break geometry.
   const coverage=await page.evaluate(()=>{
    const page=document.querySelector('.opdf-root .page');
    const parent=page.querySelector('.opdf-block[data-block-id="11"]');
    const pr=page.getBoundingClientRect(),r=parent.getBoundingClientRect();
    return {left:(r.left-pr.left)/pr.width*100,top:(r.top-pr.top)/pr.height*100,
      width:r.width/pr.width*100,height:r.height/pr.height*100};
   });
   assert.ok(Math.abs(coverage.left-60/595*100)<1.5,JSON.stringify(coverage));
   assert.ok(Math.abs(coverage.top-73/842*100)<1.5,JSON.stringify(coverage));
   // Public click event does not mutate SQL/CMD or derive identity from PBS.
   await page.locator('.opdf-block[data-block-id="11"] .opdf-chip').click();
   assert.match(await page.locator('.opdf-event-log').innerText(),/blockClick: BlockID=11 ParentID=NULL PBS=p1b0/);
   assert.match(await page.locator('#status').innerText(),/BlockID 11/);
   await page.locator('.opdf-overlays-toggle').uncheck();
   assert.equal(await page.locator('.opdf-block[data-block-id="11"]').isVisible(),false);
   await page.locator('.opdf-overlays-toggle').check();
   assert.equal(await page.locator('.opdf-block[data-block-id="11"]').isVisible(),true);
   // Re-label an existing block: same node, PDF canvas and stable ParentID.
   assert.ok(await page.locator('.opdf-root canvas').count()>0);
   assert.ok(await page.locator('.opdf-block[data-block-id="13"]').count()>0);
   await page.locator('[data-test="rename-pbs"]').click();
   await page.waitForFunction(()=>document.querySelector('.opdf-block[data-block-id="13"] .opdf-chip')?.textContent==='p1b9s2');
   assert.match(await page.locator('.opdf-event-log').innerText(),/ParentID 仍为 12/);
   assert.equal(await page.evaluate(()=>document.querySelector('.opdf-block[data-block-id="13"] .opdf-chip').title.includes('ParentID 12')),true);
   // API operations work directly on the exported immutable port.
   const idStable=await page.evaluate(async()=>{
    const host=document.querySelector('.ocr-preview-pdf-host'),v=host.ocrPdfViewer;
    const node=document.querySelector('.opdf-block[data-block-id="13"]');
    const canvas=document.querySelector('.opdf-root canvas');
    const res=await v.focusBlock(13);
    return {res,sameNode:document.querySelector('.opdf-block[data-block-id="13"]')===node,
      sameCanvas:document.querySelector('.opdf-root canvas')===canvas,
      selected:document.querySelector('.opdf-block[data-block-id="13"]')?.classList.contains('opdf-selected')};
   });
   assert.deepEqual(idStable,{res:{blockId:13,pageIndex:0},sameNode:true,sameCanvas:true,selected:true});
   await page.locator('[data-test="focus-32"]').click();
   await page.waitForFunction(()=>document.querySelector('.opdf-block[data-block-id="32"]')?.classList.contains('opdf-selected'));
   assert.equal(await page.locator('.opdf-page').inputValue(),'3');
   await page.locator('.opdf-block[data-block-id="32"] .opdf-chip').click();
   assert.match(await page.locator('.opdf-event-log').innerText(),/blockClick: BlockID=32 ParentID=NULL PBS=p3b1/);
   const initialScale=await page.locator('.opdf-scale').innerText();
   await page.locator('[data-action="zoom-in"]').click();
   await page.waitForFunction(original=>document.querySelector('.opdf-scale')?.textContent!==original,initialScale);
   await page.locator('[data-action="fit"]').click();
   await page.waitForTimeout(500);
   assert.ok(await page.locator('.opdf-block[data-block-id="32"]').count()===1);
   // Invalid overlay transaction must not replace the previous valid map.
   const invalid=await page.evaluate(()=>{
    const v=document.querySelector('.ocr-preview-pdf-host').ocrPdfViewer;
    try{v.setBlockOverlays([{blockId:1,pageIndex:0,bbox:[0,0,999,1],pageSize:[595,842]}]);return false}
    catch(e){return /坐标无效/.test(e.message)};
   });
   assert.equal(invalid,true);
   assert.ok(await page.locator('.opdf-block[data-block-id="32"]').count()===1);
   // Dockview split lifecycle: removing the pane disposes the public API.
   await page.evaluate(()=>{document.body.__oldViewer=document.querySelector('.ocr-preview-pdf-host').ocrPdfViewer;});
   await page.locator('.ocr-preview-split-toggle input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('.opdf-root').length===0);
   const disposedResult=await page.evaluate(async()=>{
    try{await document.body.__oldViewer.focusBlock(13);return 'unexpected'}catch(e){return e.message}
   });
   assert.match(disposedResult,/已销毁/);
   await page.locator('.ocr-preview-split-toggle input').check();
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pdf-host')?.ocrPdfViewer&&
     document.querySelector('#status')?.textContent?.includes('PDF 已就绪'),null,{timeout:50000});
   assert.equal(await page.locator('.opdf-root .page').count(),3);
   assert.deepEqual(errors,[]);
   console.log('LAB_PDF_PUBLIC_VIEWER_API_PASS',name,JSON.stringify({pages:3,blocks:8,coverage,scale:initialScale}));
  }finally{await browser.close()}
 }
}finally{worker?.kill('SIGTERM')}
