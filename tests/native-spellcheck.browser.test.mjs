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
  const browser=await engine.launch({headless:true});
  try{
   const context=await browser.newContext({viewport:{width:1110,height:800},hasTouch:mobile,isMobile:mobile});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
   const source=page.locator('#editor .cm-content');await source.waitFor({state:'visible',timeout:45000});
   assert.equal(await source.getAttribute('spellcheck'),'false');
   await choose(page,'spellcheck');
   const grid=page.locator('.ocr-spellcheck-grid');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===3,null,{timeout:40000});
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
   // Any edit invalidates outstanding findings; undo recomputes them.
   await page.locator('#editor .cm-line').filter({hasText:'beautifull'}).click();
   await page.keyboard.press('End');
   await page.keyboard.type(' zzwrongspeling');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===4,null,{timeout:40000});
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-spellcheck-grid .ag-row').length===3,null,{timeout:40000});
   assert.equal(readFileSync(doc,'utf8'),original,'review/undo silently saved');
   await choose(page,'media');
   assert.equal(await page.locator('.ocr-spelling-lint').count(),0,'marks not cleared on exit');
   assert.equal(await page.locator('.ocr-spellcheck-pane').isVisible(),false);
   assert.deepEqual(errors,[],name+' page errors');
   console.log('SPELLCHECK_LINT_AG_PASS',name,words);
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');await sleep(150);rmSync(dir,{recursive:true,force:true});}
