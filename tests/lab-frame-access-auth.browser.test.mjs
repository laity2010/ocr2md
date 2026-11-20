/** Inline Frame authorization in the Settings directory picker, no modal. */
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
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:774,height:1032}:{width:1024,height:768},hasTouch:true});
   const errors=[];let authorized=false,sessionCalls=0,unlocks=0,rootsCalls=0;
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>assert(!r.url().includes('/api/session')&&!r.url().includes('/api/workspace/roots')));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>{
     sessionCalls++;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authorized})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/unlock',r=>{
     unlocks++;
     const valid=r.request().postDataJSON().code==='FRAME1234567890';
     if(valid)authorized=true;
     return r.fulfill({status:valid?200:403,contentType:'application/json',
       body:JSON.stringify(valid?{authorized:true}:{error:'Frame 访问码不正确'})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>{
     rootsCalls++;return r.fulfill({status:authorized?200:403,contentType:'application/json',
       body:authorized?JSON.stringify({allowedRoots:['/demo/books']}):JSON.stringify({error:'Frame auth required'})});
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#settings-workspace .ag-row').first().waitFor({state:'visible'});
   assert.equal(await page.locator('.toolbar #frame-access-open').count(),0);
   assert.equal(await page.locator('#frame-access-dialog').count(),0);
   assert.equal(await page.locator('#frame-main-authorization').count(),0);
   assert.equal(await page.locator('#frame-access-open').count(),0,
     'Do not mount an authorization form before the Workspace directory control exists');
   await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
   const picker=page.locator('#settings-workspace .ocr-settings-directory-picker');
   await page.getByRole('button',{name:'打开目录树'}).click();
   await picker.waitFor({state:'visible'});
   const form=picker.locator('#frame-directory-access');
   const submit=form.locator('#frame-access-open');
   const input=form.getByRole('textbox',{name:'Frame 访问码'});
   await submit.waitFor({state:'visible'});await input.waitFor({state:'visible'});
   assert.equal(await rootsCalls,0,'No filesystem roots should be queried without authorization');
   assert.equal(await picker.locator('wa-tree-item').count(),0);
   const authRect=await picker.locator('.ocr-settings-directory-auth-host').boundingBox();
   const treeRect=await picker.locator('.ocr-settings-directory-tree-host').boundingBox();
   assert(authRect&&treeRect&&authRect.y+authRect.height<=treeRect.y+2,
      'Authorization form must be immediately above the tree within the same picker');
   await input.fill('WRONG');await submit.click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('Frame 访问码不正确'));
   assert.equal(await page.locator('#status').getAttribute('data-kind'),'error');
   assert.equal(await form.isVisible(),true);
   assert.equal(rootsCalls,0);
   await input.fill('FRAME1234567890');await submit.click();
   await form.waitFor({state:'hidden'});
   await picker.locator('wa-tree-item[data-path="/demo/books"]').waitFor({state:'visible'});
   assert.equal(unlocks,2);assert(sessionCalls>=2);assert(rootsCalls>=1);
   await page.getByRole('button',{name:'关闭目录选择器'}).click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   await picker.locator('wa-tree-item[data-path="/demo/books"]').waitFor({state:'visible'});
   assert.equal(await form.isVisible(),false,'Existing authorization should reuse the same signed cookie');
   authorized=false;
   await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
   await form.waitFor({state:'visible'});
   assert.equal(await picker.locator('wa-tree-item').count(),0,
     'Expired Frame session must hide any stale authorized directory tree');
   assert.deepEqual(errors,[]);
   console.log('FRAME_INLINE_DIRECTORY_AUTH_BROWSER_PASS',name,{sessionCalls,unlocks,rootsCalls});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
