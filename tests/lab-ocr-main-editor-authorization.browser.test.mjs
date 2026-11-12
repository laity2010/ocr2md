/** Real Lab OCR directory-tree UI + Main's formal session/unlock HTTP contract.
 * Uses only fake credentials and server responses; never touches Main secrets.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';

const port=5329;
const url=process.env.LAB_OCR_TEST_URL||`http://127.0.0.1:${port}/labs/lab-ocr/`;
const dev=process.env.LAB_OCR_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';dev?.stdout.on('data',b=>log+=b);dev?.stderr.on('data',b=>log+=b);
try{
 let ready=false;
 for(let i=0;i<90;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await pause(200);
 }
 assert(ready,'Vite unavailable: '+log.slice(-750));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true});
   page.setDefaultTimeout(18000);
   let authenticated=false,rootsCalls=0,browseCalls=0,unlockCalls=0,sessionCalls=0;
   // Mock Main verifies its own issued auth state. WebKit's intercepted
   // route headers do not reliably reflect HttpOnly cookies from route.fulfill;
   // the test separately checks that the browser did store an HttpOnly cookie.
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/api/workspace/roots',async route=>{
    rootsCalls++;
    return route.fulfill(authenticated?
      {status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo']})}:
      {status:403,contentType:'text/plain',body:'Editor authorization required'});
   });
   await page.route('**/api/workspace/browse?*',async route=>{
    browseCalls++;
    if(!authenticated)return route.fulfill({status:403,body:'Editor authorization required'});
    const path=new URL(route.request().url()).searchParams.get('path');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      path,children:path==='/demo'?[{name:'book',path:'/demo/book'}]:[],
    })});
   });
   await page.route('**/api/unlock',route=>{
    unlockCalls++;
    assert.equal(route.request().method(),'POST');
    assert.equal(route.request().headers()['content-type'],'application/json');
    const {code}=route.request().postDataJSON();
    if(code!=='testcode1234')return route.fulfill({status:403,body:'Invalid code'});
    authenticated=true;
    return route.fulfill({status:200,contentType:'application/json',
      headers:{'set-cookie':'v6edit=mock-session; Path=/; HttpOnly; SameSite=Lax'},body:'{"ok":true}'});
   });
   await page.route('**/api/session',async route=>{
    sessionCalls++;
    assert.equal(route.request().method(),'GET');
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({canSave:authenticated})});
   });
   const response=await page.goto(url,{waitUntil:'domcontentloaded'});
   assert.equal(response?.status(),200);
   await page.locator('#settings-workspace').waitFor({state:'visible'});
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   const dialog=page.getByRole('dialog',{name:'授权浏览服务器目录'});
   await dialog.waitFor({state:'visible'});
   assert.equal(rootsCalls,1);
   assert.equal(await page.locator('wa-tree-item').count(),0,'Unauthorized tree must stay empty');
   await dialog.getByRole('button',{name:'取消'}).click();
   await dialog.waitFor({state:'hidden'});
   assert.equal(rootsCalls,1,'Cancel must never retry a protected request');
   await page.getByRole('button',{name:'关闭目录选择器'}).click();
   await page.getByRole('button',{name:'打开目录树'}).click(); // retry explicitly
   await dialog.waitFor({state:'visible'});
   assert.equal(rootsCalls,2);
   const input=dialog.getByRole('textbox',{name:'Main 编辑授权码'});
   await input.fill('badcode12345');
   await dialog.getByRole('button',{name:'验证并继续浏览'}).click();
   await dialog.getByRole('alert').filter({hasText:'授权码不正确'}).waitFor({state:'visible'});
   assert.equal(await input.inputValue(),'','Credential must clear on failure');
   assert.equal(rootsCalls,2,'Failed authentication cannot re-request directory');
   assert.equal(authenticated,false);
   await input.fill('testcode1234');
   await dialog.getByRole('button',{name:'验证并继续浏览'}).click();
   await dialog.waitFor({state:'hidden'});
   await page.locator('wa-tree-item[data-path="/demo/book"]').waitFor({state:'attached'});
   assert.equal(rootsCalls,3,'The blocked roots request must retry exactly once');
   assert.equal(sessionCalls,1,'Main session must validate unlock cookie');
   assert.equal(unlockCalls,2);
   assert.equal(await page.context().cookies().then(c=>c.some(cookie=>cookie.name==='v6edit'&&cookie.httpOnly)),true,
     'Credential must be HttpOnly, not stored by the Lab');
   const book=page.locator('wa-tree-item[data-path="/demo/book"]');
   await book.locator('[part="item"]').first().click();
   await page.getByRole('button',{name:'采用选中目录'}).click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="当前资料目录"]')?.value==='/demo/book');
   assert(browseCalls>=1,'Directory selection is validated after authorization');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null,
     'Authorization and tree selection may NOT autosave settings');
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')?.includes('/demo/book'));
   assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage})).then(s=>s.includes('testcode1234')),false,
     'Editor code must never be persisted to lab localStorage');
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PUBLIC_EDITOR_AUTH_PASS',name,JSON.stringify({rootsCalls,unlockCalls,sessionCalls,browseCalls}));
  }finally{await browser.close();}
 }
}finally{dev?.kill('SIGTERM');}
