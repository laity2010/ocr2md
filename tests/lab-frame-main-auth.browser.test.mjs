/** Lab-Frame public Main session recovery, without copying/editing cookies. */
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
  if(i===119)throw Error('Frame failed to start '+log);
  await sleep(200);
 }
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:1024,height:768}:{width:1230,height:850},hasTouch:true});
   let canSave=false,rootsCalls=0,probeCalls=0,unlockCalls=0,sessionCalls=0;
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(request.url().includes('/api/unlock'))unlockCalls++;});
   await page.route('**/api/session',route=>{
    sessionCalls++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({canSave})});
   });
   await page.route('**/api/workspace/roots',route=>{
    rootsCalls++;
    return route.fulfill({status:canSave?200:403,contentType:canSave?'application/json':'text/plain',
      body:canSave?JSON.stringify({allowedRoots:['/demo/books']}):'Editor authorization required'});
   });
   await page.route('**/api/workspace/browse?*',route=>{
    const path=new URL(route.request().url()).searchParams.get('path');
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({path,children:path==='/demo/books'?[{path:'/demo/books/book',name:'book'}]:[]})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/probe',route=>{
    probeCalls++;
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({verified:true,readable:true,writable:true})});
   });
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
   await page.locator('#settings-workspace .ag-row').first().waitFor({state:'visible',timeout:27000});
   const auth=page.locator('#frame-main-authorization');
   await auth.waitFor({state:'visible',timeout:15000});
   assert.equal(await auth.getAttribute('href'),'/');
   assert.equal(await auth.getAttribute('target'),'_blank');
   assert.equal(await auth.getAttribute('rel'),'noopener noreferrer');
   assert.equal(await auth.textContent(),'前往 Main 授权');
   await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('需要 Main 的编辑授权'),null,{timeout:15000});
   assert.equal(await page.locator('#status').getAttribute('data-kind'),'error');
   assert.equal(probeCalls,0);assert.equal(unlockCalls,0);
   canSave=true; // only Main's ORIGINAL flow can change this in production
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await auth.waitFor({state:'hidden',timeout:14000});
   await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
   await page.locator('wa-tree-item[data-path="/demo/books"]').waitFor({state:'visible',timeout:16000});
   assert(rootsCalls>=2);assert(sessionCalls>=2);
   assert.equal(probeCalls,0);assert.equal(unlockCalls,0);
   canSave=false; // if Main expires later, Frame must immediately re-show link
   await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await auth.waitFor({state:'visible',timeout:14000});
   assert.equal(unlockCalls,0);
   assert.deepEqual(errors,[]);
   console.log('FRAME_MAIN_AUTH_RECOVERY_PASS',name,JSON.stringify({rootsCalls,sessionCalls,probeCalls,unlockCalls,errors}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM')}
