/** AM WCP semantic events in an isolated Main dev server (no Lab persistent data).
 * Mirrors the actual active WCP handlers, not abandoned Lab-only workspaces.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const scratch=mkdtempSync(join(tmpdir(),'ocr2md-wcp-events-'));
const documentPath=join(scratch,'document.md');
const settingsPath=join(scratch,'settings.json');
const settings='{"settings":{}}\n';
writeFileSync(documentPath,fixture);
writeFileSync(settingsPath,settings);
const port=5968,origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_LAB_ID:'',V6_DOCUMENT_PATH:documentPath,V6_SETTINGS_PATH:settingsPath},stdio:'ignore'});
try{
 let ready=false;
 for(let attempt=0;attempt<130;attempt++){
  try{if((await fetch(origin)).ok){ready=true;break}}catch{}
  await new Promise(resolve=>setTimeout(resolve,130));
 }
 assert(ready,'Isolated WCP Vite server could not start');
 for(const [name,engine,device] of [['Chrome',chromium,{viewport:{width:1440,height:900}}],
  ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true}]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage(device);
   const errors=[],writes=[];
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',req=>{if(req.url().startsWith(origin+'/api/')&&!['GET','HEAD'].includes(req.method()))writes.push(req.method())});
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await page.addInitScript(()=>{
    window.__wcpAuditEvents={};
    document.addEventListener('ocr2md:wp3-ag-ready',event=>{window.__wcpAuditBridge=event.detail});
    for(const kind of ['lab-virtual-select','lab-virtual-open','wp3-ag-ready','wp4-virtual-scope']){
     window.__wcpAuditEvents[kind]=0;
     document.addEventListener('ocr2md:'+kind,()=>{window.__wcpAuditEvents[kind]++});
    }
   });
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
   const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
   await page.locator('.ocr-source-pane .ocr-navigation-files .ts-control').waitFor({state:'visible',timeout:50000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length>=3,null,{timeout:25000});
   const chapterCount=await source.locator('option[value^="virtual:"]').count();
   // New virtual chapter navigation must not suppress the business-critical
   // '独立成章' checkbox. Its CMD markers are what define these chapters.
   await page.locator('.ocr-outline-grid .ag-body-horizontal-scroll-viewport').evaluate(el=>{
     el.scrollLeft=el.scrollWidth;
     el.dispatchEvent(new Event('scroll',{bubbles:true}));
   });
   const boundary=page.locator('.ocr-outline-grid .ocr-outline-checkbox').first();
   await boundary.waitFor({state:'attached',timeout:20000});
   assert((await page.locator('.ocr-outline-grid .ag-header-cell[col-id="independent"]').count())>0,
     'Virtual heading AG must preserve the editable independent marker column');
   assert.equal(await page.locator('.ocr-outline-grid .ag-header-cell[col-id="chapterFile"]').count(),0,
     'No legacy physical chapter-export column in virtual chapter view');
   const second=await source.locator('option[value^="virtual:"]').nth(1).getAttribute('value');
   await source.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},second);
   await page.waitForFunction(v=>new URLSearchParams(location.search).get('view')===v.slice(8),second,{timeout:16000});
   const all=page.locator('input[aria-label="章节所有"]');
   await all.check();
   await page.waitForFunction(()=>{
    const index=window.__wcpAuditBridge?.getChapterIndex?.();
    const selected=document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value;
    if(!index||!selected)return false;
    return [...document.querySelectorAll('.ocr-outline-grid .ag-row [data-heading-source-line]')].some(el=>{
     const line=Number(el.dataset.headingSourceLine);
     const chapter=index.chapters.find(x=>x.startLine<=line&&line<x.endLine);
     return chapter&&'virtual:'+chapter.id!==selected;
    });
   },null,{timeout:19000});
   const target=await page.evaluate(()=>{
    const index=window.__wcpAuditBridge.getChapterIndex();
    const selected=document.querySelector('.ocr-source-pane .ocr-lab-file-select').value;
    for(const el of document.querySelectorAll('.ocr-outline-grid .ag-row [data-heading-source-line]')){
     const line=Number(el.dataset.headingSourceLine);
     const chapter=index.chapters.find(x=>x.startLine<=line&&line<x.endLine);
     if(chapter&&'virtual:'+chapter.id!==selected)
      return {chapter:chapter.id,row:el.closest('.ag-row').getAttribute('row-index')};
    }
    return null;
   });
   assert(target,'No rendered AG heading belongs to another indexed chapter');
   await page.locator(`.ocr-outline-grid .ag-row[row-index="${target.row}"] [col-id="title"]`).click();
   await page.waitForFunction(ch=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value==='virtual:'+ch,target.chapter,{timeout:19000});
   const counts=await page.evaluate(()=>window.__wcpAuditEvents);
   for(const kind of Object.keys(counts))assert(counts[kind]>0,`WCP ${kind} was not seen`);
   assert.equal(await all.isChecked(),true,'Cross-chapter focus lost the AG all-chapter scope');
   assert.deepEqual(writes,[],'WCP focus unexpectedly wrote data');
   assert.deepEqual(errors,[],'WCP produced browser errors');
   console.log('WCP_SEMANTIC_EVENTS_PASS',name,JSON.stringify({chapterCount,counts,crossChapter:true,errors,writes}));
  }finally{await browser.close()}
 }
}finally{
 server.kill('SIGTERM');
 assert.equal(readFileSync(documentPath,'utf8'),fixture);
 assert.equal(readFileSync(settingsPath,'utf8'),settings);
 rmSync(scratch,{recursive:true,force:true});
}
