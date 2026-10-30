/** Offline spelling engine + CM6 Lint + AG rows + WCP focus, isolated per-browser fixture. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const original=[
  '<!-- minerujson:block:v1:0:0 -->','# Chapter One','',
  'This is a beautifull book. I recieve many letters.','',
  '```python','wrng codee','```','',
  '<!-- minerujson:source:v1','{"wrngEvidence":true}','-->','',
  '<!-- minerujson:block:v1:1:0 -->','# Chapter Two','',
  'Another paragraf contains errors.','',
].join('\n');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-spell-engine-'));
const doc=join(dir,'document.md');writeFileSync(doc,original);
const settings=join(dir,'settings.json'),auth=join(dir,'token');
writeFileSync(settings,'{}');writeFileSync(auth,'spellcheck-test-token');
const port=5977,base=`http://127.0.0.1:${port}`;
const production=process.env.SPELLCHECK_PRODUCTION==='1';
const server=production
  ?spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{
    ...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',
    V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,
    V6_STATIC_ROOT:resolve('dist'),
  }})
  :spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
    '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const screenshotDir=join('.v6','evidence','spellcheck');mkdirSync(screenshotDir,{recursive:true});
async function choose(page,value){
  await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
  await page.locator(`.ocr-navigation-popup-elements:visible [data-value="${value}"]`).click();
  await page.waitForFunction(v=>document.querySelector('#module-select')?.value===v,value);
}
try{
 let ready=false;for(let i=0;i<140;i++){
   try{if((await fetch(base)).ok){ready=true;break;}}catch{}
   await sleep(100);
 }assert(ready,'isolated Vite fixture unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  if(process.env.SPELLCHECK_ONLY_CHROME==='1'&&name!=='Chrome')continue;
  writeFileSync(doc,original);
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1110,height:800},hasTouch:mobile,isMobile:mobile});
   await context.addInitScript(()=>{
     window.__spellScanCalls=0;
     const OriginalWorker=window.Worker;
     window.Worker=class extends OriginalWorker{
       postMessage(data,...other){
         if(data&&typeof data.source==='string')window.__spellScanCalls++;
         return super.postMessage(data,...other);
       }
     };
   });
   if(production)await context.addCookies([{name:'v6edit',value:'spellcheck-test-token',domain:'127.0.0.1',path:'/'}]);
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
   const source=page.locator('#editor .cm-content');await source.waitFor({state:'visible',timeout:45000});
   assert.equal(await source.getAttribute('spellcheck'),'false');
   await choose(page,'spellcheck');
   const grid=page.locator('.ocr-spellcheck-grid');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===3,null,{timeout:40000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-cell[col-id=\"markState\"]').length===3,null,{timeout:40000});
   assert.equal(await grid.locator('.ag-cell[col-id="markState"]').filter({hasText:'已标定'}).count(),3,'not automatically CMD marked');
   assert.equal((await source.textContent()).includes('ocr2md:spellcheck'),true,'source has no inline CMD mark');
   assert.equal(await source.getAttribute('spellcheck'),'false','native spellcheck must stay off');
   assert.equal(await page.locator('.ocr-spellcheck-pane').isVisible(),true);
   const words=await grid.locator('.ag-cell[col-id="word"]').allTextContents();
   assert.deepEqual([...words].sort(),['beautifull','paragraf','recieve']);
   assert.equal(await page.locator('.ocr-spelling-lint').count(),3,'CM6 lint must decorate all real errors');
   assert.match(await grid.innerText(),/beautiful/);
   assert.match(await grid.innerText(),/receive/);
   await page.screenshot({path:join(screenshotDir,name+'-lint-ag.png')});
   const row=grid.locator('.ag-row').filter({hasText:'paragraf'}).first();
   await row.locator('.ocr-spellcheck-jump').click();
   if(production){
     await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
       .some(el=>el.textContent.includes('paragraf')),null,{timeout:15000});
   }else{
     await page.waitForFunction(()=>window.__v6cm6?.scrollState?.focusTarget?.origin==='spellcheck' &&
       window.__v6cm6?.scrollState?.focusTarget?.sourceLine===17,null,{timeout:15000});
   }
   assert.equal(readFileSync(doc,'utf8'),original,'review module wrote source');
   const virtual=await page.locator('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').first().getAttribute('value');
   assert(virtual,'virtual chapter option missing');
   await page.locator('.ocr-source-pane .ocr-lab-file-select').evaluate((el,value)=>{
     el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));
   },virtual);
   await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-control input')?.checked===false);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===2);
   // Restore complete review via the existing AG scope checkbox.
   await page.locator('.ocr-all-chapters-control input').check();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===3);
   // Re-enter should use existing scan candidates, not run another Worker job.
   const scansBefore=await page.evaluate(()=>window.__spellScanCalls);
   assert.equal(scansBefore,1,'initial automatic scan should run once');
   await choose(page,'media');
   assert.equal(await page.locator('.ocr-spelling-lint').count(),0,'marks not cleared on exit');
   await choose(page,'spellcheck');
   assert.equal(await grid.locator('.ag-row').count(),3);
   assert.equal(await page.evaluate(()=>window.__spellScanCalls),scansBefore,'re-enter triggered redundant scan');
   // The scan itself already wrote one CMD transaction; no manual mark
   // control is allowed to bypass CMD. Undo and Redo affect all 3 together.
   assert.equal(await page.locator('#spellcheck-mark-all').count(),0);
   await page.locator('#undo').click();
   await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:spellcheck'),null,{timeout:15000});
   assert.equal(await page.locator('.ocr-spelling-lint').count(),0,'Undo did not remove all annotations');
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:spellcheck'),null,{timeout:15000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===3,null,{timeout:15000});
   assert.equal(readFileSync(doc,'utf8'),original,'Undo/Redo silently saved');
   // Existing CMD marks, not the spell Worker, restore after module switching.
   await choose(page,'media');
   await choose(page,'spellcheck');
   assert.equal(await page.evaluate(()=>window.__spellScanCalls),scansBefore,'marked re-enter retriggered Worker');
   await page.screenshot({path:join(screenshotDir,name+'-cmd-marks.png')});
   // Save is always the global explicit operation.
   await page.locator('#save').click();
   for(let retry=0;retry<90&&!readFileSync(doc,'utf8').includes('ocr2md:spellcheck');retry++)await sleep(100);
   const saved=readFileSync(doc,'utf8');
   assert.equal((saved.match(/<!--ocr2md:spellcheck /g)||[]).length,3,'expected exactly three persisted CMD annotations');
   assert(saved.includes('minerujson:source:v1'),'original evidence was lost');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:45000});
   await choose(page,'spellcheck');
   // Browser restore may retain a virtual chapter and scope AG to two of
   // the three words; switch the existing AG control to All for full review.
   await page.locator('.ocr-all-chapters-control input').waitFor({state:'attached'});
   if(!(await page.locator('.ocr-all-chapters-control input').isChecked()) &&
      !(await page.locator('.ocr-all-chapters-control input').isDisabled()))
     await page.locator('.ocr-all-chapters-control input').check();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===3,null,{timeout:18000});
   assert((await page.locator('.ocr-spelling-lint').count())>=1,'saved marks lost visible lint');
   assert.equal(await page.evaluate(()=>window.__spellScanCalls),0,'saved CMD markers should not trigger spell scan after reload');
   assert.equal(await grid.locator('.ag-cell[col-id="markState"]').filter({hasText:'已标定'}).count(),3);
   await choose(page,'media');
   assert.equal(await page.locator('.ocr-spelling-lint').count(),0,'marks remained when module disabled');
   assert.equal(await page.locator('.ocr-spellcheck-pane').isVisible(),false);
   assert.deepEqual(errors,[],name+' page errors');
   console.log('SPELLCHECK_LINT_AG_PASS',name,words);
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');await sleep(150);rmSync(dir,{recursive:true,force:true});}
