/** Read-only, live-shape V6 stage: start-only mother in Chrome and iPad WebKit. */
import {selectPreview} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
import {buildOutline} from '../ui/outline-index.js';
import {encodeMarker} from '../ui/chapter-markers.js';
import {createHash} from 'node:crypto';
const sha=x=>createHash('sha256').update(x).digest('hex');
const file=resolve(`.v6/tests/start-only-stage-${process.pid}.md`);
// A reproducible start-only stage made from repository-owned MinerU evidence.
// It models 19 headings and 14 independently marked chapters without reading
// the user's edited Main Markdown or persisting any synthetic annotation.
const parent=resolve('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const original=readFileSync(parent),raw=original.toString('utf8');
const headings=buildOutline(raw);
assert.equal(headings.length,21);
const demoted=new Set(headings.slice(-2).map(row=>row.sourceLine));
const annotated=new Map(headings.slice(1,15).map((row,index)=>[row.sourceLine,
  encodeMarker(row.id,index%2===0)]));
const staged=raw.split('\n').flatMap((line,index)=>{
  const number=index+1;
  return [...(annotated.has(number)?[annotated.get(number)]:[]),
    demoted.has(number)?line.replace(/^#{1,6}\s+/,''):line];
}).join('\n');
const {writeFileSync}=await import('node:fs');writeFileSync(file,staged);
assert.equal(staged.includes('minerujson:end:v1:'),false);
assert.equal((staged.match(/<!-- minerujson:block:v1:/g)||[]).length,224);
assert.equal((staged.match(/<!-- ocr2md:chapter:v1/g)||[]).length,14);
assert.equal(buildOutline(staged).length,19);
const port=5276,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 env:{...process.env,V6_DOCUMENT_PATH:file,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf')},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{}],['iPad WebKit',webkit,{}]];
try{
 let started=false;for(let i=0;i<160;i++){try{if((await fetch(url)).ok){started=true;break}}catch{}await delay(150)}
 assert(started,'isolated preview server not ready');
 for(const [name,engine,launch]of engines){
  if(process.env.V6_ONLY_CHROME && name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT && name!=='iPad WebKit')continue;
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
   await page.waitForFunction(()=>window.__v6cm6?.view?.state?.doc?.lines>3000&&
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
   // PDF is preheated asynchronously. A disabled Tom Select option is not
   // a valid user action: prove the real preview is ready before tapping.
   await page.waitForFunction(()=>window.__v6cm6?.pdf?.ready &&
     !document.querySelector('.ocr-preview-mode option[value="pdf"]')?.disabled,
     null,{timeout:95000});
   await selectPreview(page,'pdf');
   // Choose a heading actually mapped to PDF page 3; row index is not a
   // portable page identity when synthetic chapter markers shift source lines.
   const page3=buildOutline(staged).find(row=>row.pdfPage===3);
   assert(page3,'fixture must include a PDF page 3 heading');
   await page.evaluate(id=>{
     const api=window.__v6cm6.outline.api;
     api.ensureNodeVisible(api.getRowNode(id));
   },page3.id);
   await page.locator(`[data-heading-source-line="${page3.sourceLine}"]`).click();
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]'),null,{timeout:40000});
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`.v6/evidence/start-only-${name.replace(' ','-').toLowerCase()}.png`});
   console.log('START_ONLY_UI_PASS',name,JSON.stringify({blocks:initial.blocks,ends:initial.ends,headings:initial.headings,chapters:initial.chapters,pdf:true,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.equal(sha(readFileSync(parent)),sha(original),'test modified repository fixture');
 assert.equal(readFileSync(file,'utf8'),staged,'test wrote staged mother');
}finally{server.kill('SIGTERM');unlinkSync(file)}
