/** Real isolated Lab server + browser; no Main, user data or mocked API. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const root=mkdtempSync(join(tmpdir(),'ocr2md-sentence-arb-'));
const runtime=join(root,'labs','sentence-benchmark','.runtime');
mkdirSync(runtime,{recursive:true});
const md=[
  '<!-- cmd:block:v1 id="p0b0" -->',
  'First sentence. Another sentence.',
  '<!-- cmd:block:v1 id="p1b0" -->',
  '<!-- cmd:block:v1 id="p1b0s0" -->',
  'Dr. Brown visits. He left. Another sentence!',
  '<!-- cmd:block:v1 id="p1b0s1" -->',
  'Mr. Smith arrives. He leaves. Another ending!',
  '<!-- cmd:block:v1 id="p2b0" -->',
  'This line is deliberately not segmented because it ends in a hard break.  '
].join('\n');
writeFileSync(join(runtime,'document.md'),md);
writeFileSync(join(runtime,'unlock-token'),'isolated-test-unlock-token-123456');
const port=await new Promise((ok,fail)=>{
 const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/labs/sentence-benchmark/';
const sidecar=join(runtime,'document.sentences.review.json');
const server=spawn('python3',['labs/sentence-benchmark/server.py'],{
 cwd:process.cwd(),env:{...process.env,V6_PORT:String(port),V6_LAB_RUNTIME:runtime,
  V6_LAB_UNLOCK_TOKEN_PATH:join(runtime,'unlock-token'),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:''},
 stdio:'ignore'
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try {
 let ready=false;
 for(let i=0;i<130;i++){
  try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
  await pause(150);
 }
 assert(ready,'isolated Lab service failed to start');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(md));
 const sha=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
 for(const [name,engine,binary] of [
  ['Chrome',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]
 ]){
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1100,height:850}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'sentence-benchmark.html',{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>document.querySelector('#kpi-saved')?.textContent.includes('1 自动')&&
     document.querySelector('#kpi-roundtrip')?.textContent==='100% PASS',null,{timeout:65000});
   const fetchStore=()=>JSON.parse(readFileSync(sidecar,'utf8'));
   // CM6 KPI updates immediately; server-side persistence is async.
   // Wait for the SAME on-disk contract, never relax its assertion.
   for(let retry=0;retry<45&&!existsSync(sidecar);retry++)await pause(100);
   assert(existsSync(sidecar),'auto-agreed block must already be on disk');
   let recorded=fetchStore();
   assert.equal(recorded.sourceSha256,sha);
   assert.equal(recorded.blocks.p0b0.status,'auto');
   assert(!recorded.blocks.p1b0s0&&!recorded.blocks.p1b0s1,
     'neither disputed child may land as automatic');
   assert(!recorded.blocks.p2b0,'zero-sentence blocks must remain pending');
   // One unified AI table contains both adopted sentences and unadopted
   // whole blocks, plus prose that the sentence engines never segmented.
   await page.locator('#toggle-translation').click();
   await page.waitForFunction(()=>document.querySelector('#translation-summary')?.textContent
     .includes('整块 3'),null,{timeout:18000});
   assert.equal(await page.locator('#translation-table tbody tr').count(),5,
     'auto two sentence rows + both disputed children + hard-break prose');
   const [unitDownload]=await Promise.all([
     page.waitForEvent('download',{timeout:20000}),
     page.locator('#export-translation').click()
   ]);
   const exported=JSON.parse(readFileSync(await unitDownload.path(),'utf8'));
   assert.equal(exported.schema,'ocr2md-translation-units/v1');
   assert.equal(exported.sourceSha256,sha);
   assert.equal(exported.rows.length,5);
   assert.deepEqual(new Set(exported.rows.map(x=>x.blockId)),
     new Set(['p0b0','p1b0s0','p1b0s1','p2b0']));
   const skipped=exported.rows.find(x=>x.blockId==='p2b0');
   assert.equal(skipped.type,'text_block');
   assert.equal(skipped.decision,'whole_block');
   assert(skipped.original.includes('literal Markdown hard break')===false);
   assert(skipped.original.includes('deliberately not segmented'));
   assert(exported.rows.every(x=>x.corrected===null&&x.translation===null));
   await page.locator('#close-translation').click();
   await page.locator('#view-mode').selectOption('disagree');
   await page.locator('#pbs-page-select').selectOption('p1');
   await page.waitForFunction(()=>
     document.querySelector('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status')?.textContent.includes('分歧块 2'),
     null,{timeout:8000});
   // Adoption immediately hides the selected block; check() would look
   // for the old checkbox to remain checked after the block changed.
   await page.locator('.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check').click();
   await page.waitForFunction(()=>
     document.querySelector('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status')?.textContent.includes('分歧块 1'),
     null,{timeout:8000});
   assert.equal(await page.locator('#view-mode').inputValue(),'disagree',
     'adoption must retain the disagreement filter');
   assert.deepEqual(await page.locator('#pbs-page-select option').evaluateAll(
     list=>list.map(o=>o.value)),['p1'],
     'p1 remains because a different child in p1 is still disputed');
   let visible=await page.locator('.ocr-sb-pane[data-engine="original"] .cm-content').textContent();
   assert(visible.includes('Mr.')&&visible.includes('Smith arrives.')&&!visible.includes('Dr. Brown'),
     'adopted child p1b0s0 must disappear without hiding disputed sibling p1b0s1');
   assert((await page.locator('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status').textContent()).includes('当前 p1b0s1'));
   await page.locator('#view-mode').selectOption('full');
   await page.locator('#view-mode').selectOption('disagree');
   await page.locator('#pbs-page-select').selectOption('p1');
   assert((await page.locator('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status').textContent()).includes('当前 p1b0s1'),
     'reopening the remaining disputed p must not reselect its adopted child');
   for(let i=0;i<100;i++){if(fetchStore().blocks.p1b0s0?.engine==='intl')break;await pause(100);}
   recorded=fetchStore();
   assert.equal(recorded.blocks.p1b0s0.status,'arbitrated');
   assert.equal(recorded.blocks.p1b0s0.engine,'intl');
   assert(!recorded.blocks.p1b0s1);
   await page.locator('#toggle-translation').click();
   assert(await page.locator('#translation-summary').textContent().then(t=>
     t.includes('整块 2')),'one adopted disputed child becomes sentence units; one sibling and hard-break remain whole');
   await page.locator('#close-translation').click();

   // Adoption immediately hides the selected block; check() would look
   // for the old checkbox to remain checked after the block changed.
   await page.locator('.ocr-sb-pane[data-engine="sentence-splitter"] .ocr-sb-engine-adopt-check').click();
   await page.waitForFunction(()=>
     document.querySelector('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status')?.textContent.includes('分歧块 0'),
     null,{timeout:8000});
   assert.equal(await page.locator('#pbs-page-select').isDisabled(),true,
     'after both disputed children are arbitrated, the page disappears from 分歧块');
   for(let i=0;i<100;i++){if(fetchStore().blocks.p1b0s1?.engine==='sentence-splitter')break;await pause(100);}
   recorded=fetchStore();
   assert.equal(recorded.blocks.p1b0s1.engine,'sentence-splitter');
   await page.locator('#view-mode').selectOption('arbitrated');
   assert.deepEqual(await page.locator('#pbs-page-select option').evaluateAll(
     list=>list.map(o=>o.value)),['p1']);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#kpi-saved')?.textContent.includes('2 仲裁'),
     null,{timeout:60000});
   await page.locator('#view-mode').selectOption('arbitrated');
   await page.locator('#pbs-page-select').selectOption('p1');
   assert.equal(await page.locator('.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check').isChecked(),true,
     'first child adoption restores after reload');
   await page.locator('.ocr-sb-pane[data-engine="wink-nlp"] .ocr-sb-engine-adopt-check').check();
   for(let i=0;i<100;i++){if(fetchStore().blocks.p1b0s0?.engine==='wink-nlp')break;await pause(100);}
   assert.equal(fetchStore().blocks.p1b0s0.engine,'wink-nlp');
   assert.equal(await page.locator('.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check').isChecked(),false,
     'adoption choices must be mutually exclusive for the selected PBS child');

   await page.locator('.ocr-sb-pane[data-engine="wink-nlp"] .ocr-sb-engine-adopt-check').uncheck();
   for(let i=0;i<100;i++){if(!fetchStore().blocks.p1b0s0)break;await pause(100);}
   recorded=fetchStore();
   assert(!recorded.blocks.p1b0s0);
   assert.equal(recorded.blocks.p1b0s1.engine,'sentence-splitter');
   await page.locator('#view-mode').selectOption('disagree');
   visible=await page.locator('.ocr-sb-pane[data-engine="original"] .cm-content').textContent();
   assert(visible.includes('Dr.')&&visible.includes('Brown visits.')&&!visible.includes('Mr. Smith'),
     'revoking p1b0s0 must restore only that child to 分歧块');

   await page.locator('#view-mode').selectOption('arbitrated');
   await page.locator('#pbs-page-select').selectOption('p1');
   assert.equal(await page.locator('.ocr-sb-pane[data-engine="sentence-splitter"] .ocr-sb-engine-adopt-check').isChecked(),true);
   await page.locator('.ocr-sb-pane[data-engine="sentence-splitter"] .ocr-sb-engine-adopt-check').uncheck();
   for(let i=0;i<100;i++){if(!fetchStore().blocks.p1b0s1)break;await pause(100);}
   recorded=fetchStore();
   assert(!recorded.blocks.p1b0s0&&!recorded.blocks.p1b0s1,
     'revoking both returns them to the disagreement filter');
   await page.waitForFunction(()=>
     document.querySelector('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status')?.textContent.includes('已仲裁 0'),
     null,{timeout:8000});
   assert.equal(await page.locator('#pbs-page-select').isDisabled(),true);
   await page.locator('#view-mode').selectOption('disagree');
   assert((await page.locator('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status').textContent()).includes('分歧块 2'));
   assert(recorded.blocks.p0b0?.status==='auto','automatic blocks survive adoption changes');
   await page.locator('#toggle-review').click();
   await page.locator('#review-filter').selectOption('all');
   await page.locator('#approve-issue').click();
   for(let i=0;i<100;i++){if(Object.keys(fetchStore().manualGold).length)break;await pause(100);}
   assert(Object.keys(fetchStore().manualGold).length>0,
     'explicit manual Gold decisions must also persist beside the arbitration');
   await page.evaluate(()=>localStorage.removeItem('ocr2md-sentence-benchmark-v1'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#kpi-reviewed')?.textContent.startsWith('1 /'),
      null,{timeout:65000});
   assert.equal(await page.locator('#kpi-roundtrip').textContent(),'100% PASS');
   recorded=fetchStore();
   const old=(await (await page.request.get(base+'api/sentence-review')).json()).revision;
   const response=await page.request.put(base+'api/sentence-review',{
     headers:{Origin:'http://127.0.0.1:'+port,
       'X-OCR2MD-Sentence-Review':'1','If-Match':'stale', 'Content-Type':'application/json'},
     data:JSON.stringify(recorded)
   });
   assert.equal(response.status(),412,'stale sidecar revision cannot overwrite');
   const mismatch=await page.request.put(base+'api/sentence-review',{
     headers:{Origin:'http://127.0.0.1:'+port,
       'X-OCR2MD-Sentence-Review':'1','If-Match':old,'Content-Type':'application/json'},
     data:JSON.stringify({...recorded,sourceSha256:'0'.repeat(64)})
   });
   assert.equal(mismatch.status(),422,'unrelated CMD cannot reuse adjudication');
   assert.deepEqual(errors,[]);
   console.log('ARBITRATION_E2E_PASS',JSON.stringify({name,auto:1,
     arbitrate:'intl->wink-nlp->pending',sidecarSHA:sha.slice(0,12),lossless:'100% PASS'}));
  }finally{await browser.close();}
 }
}finally{
 server.kill('SIGTERM');rmSync(root,{recursive:true,force:true});
}
