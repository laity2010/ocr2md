/** AG illegal-break element: bounded offline dictionary -> CMD one transaction -> CM6. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const original=[
  '<!-- minerujson:block:v1:0:0 -->','# Chapter One','',
  'The govern','ment announced a policy.','','The inter-','national organization agreed.','',
  'The government announced','a new policy today.','','',
  '<!-- minerujson:block:v1:6:6 -->','',
  'The estimated insurance float cost was only 1.72%, about','',
  '<!-- minerujson:block:v1:6:7 -->','',
  '3 percentage points below the average rate.','','',
  '<!-- minerujson:block:v1:8:3 -->','',
  'The investments included <!--ocr2md:latex id="dummy"-->$r_{t+1}$ and the end of each calendar quarter produced monthly portfolio returns weighted by dollar holdings in Berkshire’s public stocks. The stocks in the portfolio were refreshed quarterly on the basis of the latest','',
  '<!-- minerujson:block:v1:8:4 -->','',
  '13F, and the portfolio was rebalanced monthly.','','',

  '<!-- minerujson:source:v1','{"some":"govern\\nment"}','-->',
].join('\n');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-illegal-break-'));
const doc=join(dir,'document.md');writeFileSync(doc,original);
const settings=join(dir,'settings.json'),auth=join(dir,'token');writeFileSync(settings,'{}');writeFileSync(auth,'test-illegal-break-token');
const port=5976,base=`http://127.0.0.1:${port}`;
const production=process.env.LINEBREAK_PRODUCTION==='1';
const server=production
 ?spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,
    V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,
    V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,V6_STATIC_ROOT:resolve('dist')}})
 :spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
    cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shots=join('.v6','evidence','illegal-break');mkdirSync(shots,{recursive:true});
async function select(page,option){
 await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
 await page.locator(`.ocr-navigation-popup-elements:visible [data-value="${option}"]`).click();
 await page.waitForFunction(v=>document.querySelector('#module-select')?.value===v,option);
}
try{
 let ready=false;for(let i=0;i<150;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await sleep(100)}
 assert(ready,'isolated service unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  writeFileSync(doc,original);
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1110,height:800},hasTouch:mobile,isMobile:mobile});
   await context.addInitScript(()=>{window.__illegalBreakScans=0;const WorkerBase=window.Worker;
     window.Worker=class extends WorkerBase{postMessage(data,...args){
       if(data?.kind==='linebreak')window.__illegalBreakScans++;
       return super.postMessage(data,...args);
     }};});
   if(production)await context.addCookies([{name:'v6edit',value:'test-illegal-break-token',domain:'127.0.0.1',path:'/'}]);
   const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:45000});
   await select(page,'illegal-break');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===4,null,{timeout:45000});
   assert.equal(await page.evaluate(()=>window.__illegalBreakScans),1,'expected one automatic scan');
   const grid=page.locator('.ocr-illegal-break-grid');
   assert.deepEqual((await grid.locator('.ag-cell[col-id="joined"]').allTextContents()).sort(),['about 3','government','international','latest 13F']);
   // The AG "标定" column was replaced by the native 审阅 select; durable
   // annotations still live only in CMD/CM6. Do not infer marking from a
   // removed presentation column: prove all four exact CMD markers and
   // four selectable pending reviews against the same single source.
   assert.equal(await grid.locator('.ocr-illegal-break-review-select').count(),4);
   assert.deepEqual(await grid.locator('.ocr-illegal-break-review-select').evaluateAll(
     nodes=>nodes.map(node=>node.value)),Array(4).fill('待定'));
   assert.equal(await page.evaluate(()=>
     (window.__v6cm6?.cm?.readSource()?.match(/<!--ocr2md:illegal-break /g)||[]).length),4,
   'all four scans must yield actual unsaved CMD marker annotations');
   assert.equal(await page.locator('#editor .cm-editor').count(),1,
     'review must not create a second source editor');
   assert((await page.locator('.ocr-illegal-break-lint').count())>=1,'CM6 must show visible flagged word');
   assert.equal((await page.locator('#editor .cm-content').textContent()).includes('ocr2md:illegal-break'),true);
   assert.equal(readFileSync(doc,'utf8'),original,'scan silently saved source');
   await page.screenshot({path:join(shots,`${name}-marked.png`)});
   await grid.locator('.ocr-illegal-break-jump').last().click();
   if(!production)await page.waitForFunction(()=>window.__v6cm6?.scrollState?.focusTarget?.origin==='illegal-break',null,{timeout:12000});
   await page.locator('#undo').click();
   await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:illegal-break'),null,{timeout:12000});
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent.includes('ocr2md:illegal-break'),null,{timeout:12000});
   // Undo/Redo changes CM6 source and may legitimately request a new scan;
   // switching AG tabs without any further edit must not submit yet another
   // dictionary job. Compare the count around the tab switch itself.
   const scansBeforeTab=await page.evaluate(()=>window.__illegalBreakScans);
   await select(page,'media');
   assert.equal(await page.locator('.ocr-illegal-break-lint').count(),0,'lint leaked into media');
   await select(page,'illegal-break');
   assert.equal(await page.evaluate(()=>window.__illegalBreakScans),scansBeforeTab,
     'tab return without text edits needlessly re-scanned');
   await page.locator('#save').click();
   for(let n=0;n<90&&readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break').length-1!==4;n++)await sleep(100);
   assert.equal(readFileSync(doc,'utf8').split('<!--ocr2md:illegal-break').length-1,4,'CMD marks were not persisted');
   assert(readFileSync(doc,'utf8').includes('<!-- minerujson:source:v1'),'evidence lost');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:45000});
   await select(page,'illegal-break');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===4,null,{timeout:14000});
   assert.equal(await page.evaluate(()=>window.__illegalBreakScans),0,'reload should restore CMD annotations without rescanning');
   assert.equal(await grid.locator('.ag-row').count(),4);
   assert.deepEqual(errors,[],name+' JS errors');
   console.log('ILLEGAL_BREAK_AG_PASS',name,{rows:4,scansAfterReload:0,marked:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');await sleep(150);rmSync(dir,{recursive:true,force:true});}
