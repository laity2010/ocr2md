/** Frame self-contained access interface: no Main route, no old editor cookie. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5395,url=`http://127.0.0.1:${port}/labs/lab-frame/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-frame/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
try{
 for(let i=0;i<120;i++){
   try{if((await fetch(url)).ok)break;}catch{}
   if(i===119)throw Error('Frame failed '+log);await sleep(200);
 }
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1024,height:768},hasTouch:true});
   const errors=[];let authorized=false,sessionCalls=0,unlocks=0,rootsCalls=0;
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>assert(!r.url().includes('/api/session')&&!r.url().includes('/api/workspace/roots')));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>{
     sessionCalls++;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authorized})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/unlock',r=>{
     unlocks++;assert.equal(r.request().postDataJSON().code,'FRAME1234567890');authorized=true;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authorized:true})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>{
     rootsCalls++;return r.fulfill({status:authorized?200:403,contentType:'application/json',
       body:authorized?JSON.stringify({allowedRoots:['/demo/books']}):JSON.stringify({error:'Frame auth required'})});
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#settings-workspace .ag-row').first().waitFor({state:'visible'});
   const button=page.locator('#frame-access-open');await button.waitFor({state:'visible'});
   assert.equal(await page.locator('#frame-main-authorization').count(),0);
   await button.click();await page.getByRole('textbox',{name:'Frame 访问码'}).fill('FRAME1234567890');
   await page.locator('#frame-access-dialog button[type="submit"]').click();
   await button.waitFor({state:'hidden'});
   await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   await page.locator('wa-tree-item[data-path="/demo/books"]').waitFor({state:'visible'});
   assert.equal(unlocks,1);assert(sessionCalls>=2);assert(rootsCalls>=1);
   assert.deepEqual(errors,[]);
   console.log('FRAME_INDEPENDENT_ACCESS_BROWSER_PASS',name,{sessionCalls,unlocks,rootsCalls});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
