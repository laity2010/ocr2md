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
  'Dr. Brown visits. He left. Another sentence!',
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
   assert(existsSync(sidecar),'auto-agreed block must already be on disk');
   let recorded=fetchStore();
   assert.equal(recorded.sourceSha256,sha);
   assert.equal(recorded.blocks.p0b0.status,'auto');
   assert(!recorded.blocks.p1b0,'disputed blocks must NOT land as automatic');
   assert(!recorded.blocks.p2b0,'zero-sentence blocks must remain pending');
   await page.locator('#pbs-page-select').selectOption('p1');
   await page.waitForFunction(()=>document.querySelector(
     '.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check')?.disabled===false,
     null,{timeout:8000});
   await page.locator('.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check').check();
   await page.waitForFunction(()=>document.querySelector('#kpi-saved')?.textContent.includes('1 仲裁'));
   for(let i=0;i<100;i++){if(fetchStore().blocks.p1b0?.engine==='intl')break;await pause(100);}
   recorded=fetchStore();
   assert.equal(recorded.blocks.p1b0.status,'arbitrated');
   assert.equal(recorded.blocks.p1b0.engine,'intl');
   assert(recorded.blocks.p1b0.boundaries.length>=2);
   await page.locator('#view-mode').selectOption('arbitrated');
   assert.deepEqual(await page.locator('#pbs-page-select option').evaluateAll(
     list=>list.map(o=>o.value)),['p1']);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#kpi-saved')?.textContent.includes('1 仲裁'),
     null,{timeout:60000});
   await page.locator('#view-mode').selectOption('arbitrated');
   await page.locator('#pbs-page-select').selectOption('p1');
   assert.equal(await page.locator('.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check').isChecked(),true);
   await page.locator('.ocr-sb-pane[data-engine="wink-nlp"] .ocr-sb-engine-adopt-check').check();
   for(let i=0;i<100;i++){if(fetchStore().blocks.p1b0?.engine==='wink-nlp')break;await pause(100);}
   assert.equal(fetchStore().blocks.p1b0.engine,'wink-nlp');
   assert.equal(await page.locator('.ocr-sb-pane[data-engine="intl"] .ocr-sb-engine-adopt-check').isChecked(),false,
     'exactly one engine can be adopted per text block');
   await page.locator('.ocr-sb-pane[data-engine="wink-nlp"] .ocr-sb-engine-adopt-check').uncheck();
   for(let i=0;i<100;i++){if(!fetchStore().blocks.p1b0)break;await pause(100);}
   recorded=fetchStore();
   assert(!recorded.blocks.p1b0,'unchecked arbitration returns disputed block to pending');
   await page.waitForFunction(()=>document.querySelector('.ocr-sb-pane[data-engine="original"] .ocr-sb-pane-status')?.textContent.includes('已仲裁 0'),null,{timeout:8000});
   assert.equal(await page.locator('#pbs-page-select').isDisabled(),true,
     '已仲裁 filter must become empty immediately when arbitration is revoked');
   assert(recorded.blocks.p0b0?.status==='auto','automatic blocks survive changes');
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
