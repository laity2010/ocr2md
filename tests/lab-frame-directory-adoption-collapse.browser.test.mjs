/** Repro 0821: adopting same folder missed probe; root reopened by 5s refresh.
 * Real Frame Settings + WA-tree UI, with only authenticated HTTP responses mocked.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const url='http://127.0.0.1:5397/labs/lab-frame/';
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-frame/vite.config.mjs',
 '--host','127.0.0.1','--port','5397','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite.stdout.on('data',x=>output+=x);vite.stderr.on('data',x=>output+=x);
try{
 for(let i=0;i<80;i++){
  try{if((await fetch(url)).ok)break;}catch{}
  if(i===79)throw Error('Vite not available '+output.slice(-200));
  await sleep(200);
 }
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:774,height:1032}:{width:1180,height:860},hasTouch:true});
   const errors=[],calls=[];
   let shouldFail=false;
   page.on('pageerror',err=>errors.push(err.message));
   await page.route('**/api/workspace/roots',route=>route.fulfill({status:200,
     contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/books']})}));
   await page.route('**/api/workspace/browse?*',route=>{
     const path=new URL(route.request().url()).searchParams.get('path');
     const children=path==='/demo/books'?[{name:'book',path:'/demo/books/book'}]:[];
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/probe',async route=>{
     calls.push(route.request().postDataJSON().workspace);
     await sleep(450);
     return route.fulfill({status:shouldFail?403:200,contentType:'application/json',
       body:JSON.stringify(shouldFail?{error:'Main 编辑授权失效'}:{verified:true,readable:true,writable:true})});
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.evaluate(()=>{window.__statusTrace=[];
     new MutationObserver(()=>window.__statusTrace.push({text:document.querySelector('#status')?.textContent,
      kind:document.querySelector('#status')?.dataset.kind})).observe(document.querySelector('#status'),{childList:true,attributes:true,subtree:true});
   });
   await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
   const root=page.locator('wa-tree-item[data-path="/demo/books"]');
   const child=page.locator('wa-tree-item[data-path="/demo/books/book"]');
   await page.getByRole('button',{name:'打开目录树'}).click();
   await root.waitFor({state:'visible',timeout:19000});
   assert.equal(await root.evaluate(x=>x.expanded),false,'no auto expand at first open');
   await sleep(6100); // The previous code re-opened the root after 5s.
   assert.equal(await root.evaluate(x=>x.expanded),false,'timer must not expand collapsed root');
   assert.equal(await child.count(),0,'collapsed root must not browse children');
   await root.locator('[part="expand-button"]').first().click();
   await child.waitFor({state:'visible',timeout:15000});
   assert.equal(await root.evaluate(x=>x.expanded),true,'manual tap opens root');
   await root.locator('[part="expand-button"]').first().click();
   await page.waitForFunction(()=>document.querySelector('wa-tree-item[data-path="/demo/books"]')?.expanded===false);
   await sleep(6100);
   assert.equal(await root.evaluate(x=>x.expanded),false,'manual collapse must survive 5-second refresh');
   await root.locator('[part="expand-button"]').first().click();
   await child.waitFor({state:'visible',timeout:15000});
   async function adopt(){
    await child.locator('[part="item"]').first().click();
    await page.getByRole('button',{name:'采用选中目录'}).click();
   }
   await adopt();
   try {await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('正在验证工作区文件读写'),null,{timeout:3000});}
   catch(error){console.log('ADOPTION_STATUS_DIAGNOSTIC',name,JSON.stringify({calls,trace:await page.evaluate(()=>window.__statusTrace)}));throw error;}
   assert.doesNotMatch(await page.locator('#status').innerText(),/资料目录已加入待保存设置/);
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('工作区文件可读写'),null,{timeout:15000});
   assert.equal(await page.locator('#status').getAttribute('data-kind'),'ok');
   assert.deepEqual(calls,['/demo/books/book']);
   // Re-adopting the SAME value must also issue a fresh read/write probe.
   await page.getByRole('button',{name:'打开目录树'}).click();
   await root.waitFor({state:'visible'});
   if(!(await root.evaluate(x=>x.expanded)))await root.locator('[part="expand-button"]').first().click();
   await child.waitFor({state:'visible'});
   const reAdopt=page.getByRole('button',{name:'采用选中目录'});
   if(!(await reAdopt.isEnabled()))await child.locator('[part="item"]').first().click();
   assert.equal(await reAdopt.isEnabled(),true,'reopening must allow re-adopting an existing selection');
   await reAdopt.click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('工作区文件可读写')&&
     document.querySelector('#status')?.dataset.kind==='ok',null,{timeout:15000});
   await sleep(600);
   assert.deepEqual(calls,['/demo/books/book','/demo/books/book']);
   assert.match(await page.locator('#status').innerText(),/工作区文件可读写/);
   // A third same-folder recheck that fails must persist as the red failure,
   // not get covered by a generic 'adopted/pending Save' status.
   shouldFail=true;
   await page.getByRole('button',{name:'打开目录树'}).click();
   await root.waitFor({state:'visible'});
   if(!(await root.evaluate(x=>x.expanded)))await root.locator('[part="expand-button"]').first().click();
   await child.waitFor({state:'visible'});
   const reAdoptAgain=page.getByRole('button',{name:'采用选中目录'});
   if(!(await reAdoptAgain.isEnabled()))await child.locator('[part="item"]').first().click();
   assert.equal(await reAdoptAgain.isEnabled(),true,'reopening must allow re-adopting an existing selection');
   await reAdoptAgain.click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('工作区文件读写验证失败'),null,{timeout:15000});
   assert.equal(await page.locator('#status').getAttribute('data-kind'),'error');
   assert.match(await page.locator('#status').innerText(),/Main 编辑授权失效/);
   await sleep(600);
   assert.match(await page.locator('#status').innerText(),/读写验证失败/);
   assert.deepEqual(calls,['/demo/books/book','/demo/books/book','/demo/books/book']);
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null,
     'adopting and probing must not silently save the settings');
   assert.deepEqual(errors,[]);
   console.log('FRAME_DIRECTORY_ADOPTION_AND_MANUAL_EXPANSION_PASS',name,calls.length);
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
