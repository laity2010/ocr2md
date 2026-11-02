/** Real source-PDF gesture: long-press original p1b5 PDF parent label and
 * point to native image child p1b3s0 -> visible p1b3s1 origin=p1b5.
 * Test uses a temporary document; never writes to a user's book or PDF. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const hash=buf=>createHash('sha256').update(buf).digest('hex');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const originalPDF=readFileSync(pdf);
assert.equal(hash(originalPDF),'be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab');
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-reparent-real-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
 V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist'),
 V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
try {
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}await delay(180);}
 assert(ready,'isolated original PDF service unavailable');
 const wk=process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath();
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,wk]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
   page.setDefaultTimeout(22000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:70000});
   console.log('PDF_REPARENT_STEP',name,'page',response.status());
   await page.waitForTimeout(8000);
   console.log('PDF_REPARENT_DIAG',name,JSON.stringify(await page.evaluate(()=>({
     status:document.querySelector('.ocr-pdf-status')?.textContent,
     canvas:document.querySelector('.ocr-pdf-scroller .page canvas')?.width,
     pdfSelector:document.querySelector('.ocr-preview-mode')?.value,
     pdfDisabled:document.querySelector('.ocr-preview-mode option[value=pdf]')?.disabled,
     errors:document.querySelector('#status')?.textContent?.slice(0,240),
     hasModule:!!document.querySelector('#module-select')}))));
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
     document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,null,{timeout:55000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('PBS 267'),null,{timeout:55000});
   await selectPreview(page,'pdf');
   const sourceCtrl=page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"] > .ocr-pdf-block-ctrl');
   const targetChip=page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"] .ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] > .ocr-pdf-subblock-chip');
   await sourceCtrl.waitFor({state:'attached',timeout:60000});
   await targetChip.waitFor({state:'attached',timeout:60000});
   await targetChip.scrollIntoViewIfNeeded({timeout:35000});
   const from=await sourceCtrl.boundingBox(),to=await targetChip.boundingBox();
   assert(from&&to&&to.width>0&&to.height>0,`${name} real PDF tags visible`);
   const sx=from.x+from.width/2,sy=from.y+from.height/2;
   const tx=to.x+to.width/2,ty=to.y+to.height/2;
   const hit=await page.evaluate(({x,y})=>({
     hit:document.elementFromPoint(x,y)?.closest('.ocr-pdf-subblock-chip')?.textContent||null,
     within:!!document.elementFromPoint(x,y)?.closest('.ocr-pdf-scroller')
   }),{x:tx,y:ty});
   assert.equal(hit.hit,'p1b3s0',`${name} target native PDF child is clickable: ${JSON.stringify(hit)}`);
   console.log('PDF_REPARENT_STEP',name,'source_and_child',JSON.stringify({from:[sx,sy],to:[tx,ty]}));
   const pointer={bubbles:true,pointerId:72,pointerType:'touch',isPrimary:true,button:0};
   await sourceCtrl.dispatchEvent('pointerdown',{...pointer,clientX:sx,clientY:sy});
   await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:3500});
   await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:tx,clientY:ty});
   await page.locator('.ocr-pdf-subblock-chip.ocr-pdf-block-drop-target').waitFor({state:'attached',timeout:6000});
   // WebKit may clear transient toolbar text while the PDF controls repaint;
   // the actual highlighted native child chip is the stable drag target.
   assert.equal(await targetChip.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),true);
   console.log('PDF_REPARENT_STEP',name,'target-highlighted');
   await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:tx,clientY:ty});
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('p1b3s1'),
     null,{timeout:40000});
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]')&&
     !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5"]'),null,{timeout:45000});
   const pdfInfo=await page.evaluate(()=>{
     const cover=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]');
     const target=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] .ocr-pdf-subblock-chip');
     return {label:cover?.querySelector('.ocr-pdf-block-ctrl span')?.textContent,
       origin:cover?.dataset.originId,block:cover?.dataset.blockIndex,child:target?.textContent};
   });
   assert.deepEqual([pdfInfo.label,pdfInfo.origin,pdfInfo.block,pdfInfo.child],['p1b3s1','p1b5','5','p1b3s0']);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"]').count(),0);
   assert.equal(readFileSync(doc,'utf8'),source,'PDF drag must not auto-save');
   assert.equal(hash(readFileSync(pdf)),hash(originalPDF));
   await page.locator('#undo').evaluate(el=>el.click());
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5"]')&&
     !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'),null,{timeout:40000});
   await page.locator('#redo').evaluate(el=>el.click());
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'),null,{timeout:40000});
   assert.deepEqual(errors,[]);
   console.log('PDF_REPARENT_NATIVE_CHILD_PASS',name,{source:'p1b5',target:'p1b3s0',result:'p1b3s1',
     originRetained:true,pdfLabelUpdated:true,undoRedo:true,originalJSON:true,noAutoSave:true,
     realPdf:true,syntheticTouch:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
