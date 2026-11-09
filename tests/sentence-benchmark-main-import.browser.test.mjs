/** WP1 real-browser Main→Lab import and versioned sentence table publication.
 * Both servers use test-only data and random loopback ports, not live Main.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

async function openPort(){
 return new Promise((resolve,reject)=>{
  const s=createServer();s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{const value=s.address().port;s.close(error=>error?reject(error):resolve(value));});
 });
}
const root=mkdtempSync(join(tmpdir(),'ocr2md-wp1-main-import-'));
const runtime=join(root,'labs','sentence-benchmark','.runtime');mkdirSync(runtime,{recursive:true});
const md=['<!-- cmd:block:v1 id="p1b0s0" -->','','First sentence. A long sentence ends about',
          '','<!-- cmd:block:v1 id="p1b0s1" lb="m" -->','','3 percent below the interest rate. Another sentence.',''].join('\n');
writeFileSync(join(runtime,'document.md'),md);
writeFileSync(join(runtime,'unlock-token'),'wp1-test-unlock-token-123456');
const mainDoc=join(root,'main-document.md');writeFileSync(mainDoc,md);
const mainPort=await openPort(),labPort=await openPort();
const mainUrl=`http://127.0.0.1:${mainPort}/`,labUrl=`http://127.0.0.1:${labPort}/labs/sentence-benchmark/`;
const mainEnv={...process.env,V6_PORT:String(mainPort),V6_DOCUMENT_PATH:mainDoc,
 V6_SETTINGS_PATH:join(root,'main-settings.json'),V6_TOKEN_PATH:join(root,'main-token'),
 V6_LAN_TLS_HOST:'',V6_LAN_LAB_ROUTES:''};
const labEnv={...process.env,V6_PORT:String(labPort),V6_LAB_RUNTIME:runtime,
 V6_LAB_UNLOCK_TOKEN_PATH:join(runtime,'unlock-token'),V6_MAIN_REVIEWED_URL:mainUrl+'api/main-reviewed',
 V6_LAN_TLS_HOST:''};
const servers=[spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:mainEnv,stdio:'ignore'}),
 spawn('python3',['labs/sentence-benchmark/server.py'],{cwd:process.cwd(),env:labEnv,stdio:'ignore'})];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
 for(const health of [mainUrl+'healthz',labUrl+'healthz']){
  let ready=false;
  for(let i=0;i<100;i++){
   try{if((await fetch(health)).ok){ready=true;break;}}catch{}
   await pause(130);
  }
  assert(ready,'Isolated service unavailable: '+health);
 }
 const expected=await (await fetch(mainUrl+'api/main-reviewed')).json();
 assert.equal(expected.stats.reviewedJoins,1);
 for(const [name,engine,binary] of [
  ['Chromium',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]]){
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
     viewport:{width:1100,height:850},acceptDownloads:true});
   const errors=[];page.on('pageerror',err=>errors.push(err.message));
   await page.goto(labUrl+'sentence-benchmark.html',{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>document.querySelector('#sample-select')?.value==='reviewed',null,{timeout:60000});
   await page.locator('#toggle-translation').click();
   await Promise.all([page.waitForEvent('load',{timeout:60000}),page.locator('#import-main').click()]);
   await page.waitForFunction(()=>document.querySelector('#sample-select')?.value==='reviewed',null,{timeout:60000});
   await page.locator('#toggle-translation').click();
   await page.waitForFunction(()=>document.querySelector('#publish-units')?.disabled===false,null,{timeout:60000});
   await page.locator('#publish-units').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已发布标准句表'),null,{timeout:60000});
   const latest=await (await fetch(labUrl+'api/sentence-units')).json();
   assert.equal(latest.documentVersion,expected.documentVersion);
   assert.equal(latest.sourceSha256,expected.sourceCmdSha256);
   assert.equal(latest.unitVersion.length,64);
   assert(latest.rows.length>0);
   assert.equal(errors.length,0,errors.join(' | '));
   console.log('WP1_BROWSER_PASS',name,JSON.stringify({unitRows:latest.rows.length,
     unitVersion:latest.unitVersion.slice(0,12),sourceStable:true,joins:expected.stats.reviewedJoins}));
  }finally{await browser.close();}
 }
}finally{
 for(const s of servers)s.kill('SIGTERM');
 await pause(450);
 rmSync(root,{recursive:true,force:true});
}
