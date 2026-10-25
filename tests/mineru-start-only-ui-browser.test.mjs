/** Read-only, live-shape V6 stage: start-only mother in Chrome and iPad WebKit. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
import {buildOutline} from '../ui/outline-index.js';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const file=resolve(`.v6/tests/start-only-stage-${process.pid}.md`);
const parent=resolve('.v6/workspace/buffetts-alpha.minerujson.md');
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const original=readFileSync(parent),old=original.toString('utf8');
const migrator=resolve('scripts/v6_remove_end_markers.mjs');
const wasLegacy=old.includes('<!-- minerujson:end:v1:');
if(wasLegacy)execFileSync(process.execPath,[migrator,'--document',parent,'--output',file]);
else {const {writeFileSync}=await import('node:fs');writeFileSync(file,original);}
const staged=readFileSync(file,'utf8');
assert.equal(staged.includes('minerujson:end:v1:'),false);
assert.equal((staged.match(/<!-- minerujson:block:v1:/g)||[]).length,224);
assert.equal((staged.match(/<!-- ocr2md:chapter:v1/g)||[]).length,14);
assert.equal(buildOutline(staged).length,19);
const port=5276,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 env:{...process.env,V6_DOCUMENT_PATH:file,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf')},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
 ['iPad WebKit',webkit,{executablePath:webkit.executablePath()}]];
try{
 let started=false;for(let i=0;i<160;i++){try{if((await fetch(url)).ok){started=true;break}}catch{}await delay(150)}
 assert(started,'isolated preview server not ready');
 for(const [name,engine,launch]of engines){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
   await page.waitForFunction(()=>window.__v6cm6?.view?.state?.doc?.lines>3500&&
     window.__v6cm6?.outline?.rows?.length===19&&
     document.querySelector('.ocr-markdown')?.textContent?.includes('Bufett'),null,{timeout:95000});
   const initial=await page.evaluate(()=>({
    headings:window.__v6cm6.outline.rows.length,
    first:window.__v6cm6.outline.rows[0],
    last:window.__v6cm6.outline.rows.at(-1),
    blocks:(window.__v6cm6.view.state.doc.toString().match(/<!-- minerujson:block:v1:/g)||[]).length,
    ends:(window.__v6cm6.view.state.doc.toString().match(/<!-- minerujson:end:v1:/g)||[]).length,
    chapters:(window.__v6cm6.view.state.doc.toString().match(/<!-- ocr2md:chapter:/g)||[]).length,
    previewLeaksEvidence:document.querySelector('.ocr-markdown').textContent.includes('minerujson:page:v1'),
    dirty:window.__v6cm6.dirty,
   }));
   assert.equal(initial.blocks,224);assert.equal(initial.ends,0);assert.equal(initial.headings,19);
   assert.equal(initial.chapters,14);assert.equal(initial.previewLeaksEvidence,false);
   assert.equal(initial.dirty,false);
   await page.locator('.ocr-preview-mode').selectOption('pdf');
   await page.locator('.ag-row[row-index="3"] [col-id="title"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]'),null,{timeout:40000});
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`.v6/evidence/start-only-${name.replace(' ','-').toLowerCase()}.png`});
   console.log('START_ONLY_UI_PASS',name,JSON.stringify({blocks:initial.blocks,ends:initial.ends,headings:initial.headings,chapters:initial.chapters,pdf:true,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.equal(sha(readFileSync(parent)),sha(original),'test touched official mother');
 assert.equal(readFileSync(file,'utf8'),staged,'test wrote staged mother');
}finally{server.kill('SIGTERM');unlinkSync(file)}
