/** Directory A's late failure must not overrule B's verified write access. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const url='http://127.0.0.1:5398/labs/lab-frame/';
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-frame/vite.config.mjs',
 '--host','127.0.0.1','--port','5398','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';vite.stdout.on('data',x=>output+=x);vite.stderr.on('data',x=>output+=x);
try{
 for(let i=0;i<80;i++){
  try{if((await fetch(url)).ok)break;}catch{}
  if(i===79)throw Error('Vite not ready: '+output);
  await sleep(200);
 }
 for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1100,height:820},hasTouch:true});
   let releaseFirst,firstStarted=false;
   const firstGate=new Promise(resolve=>{releaseFirst=resolve});
   const requests=[];
   await page.route('**/api/workspace/roots',route=>route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({allowedRoots:['/test/root']})}));
   await page.route('**/api/workspace/browse?*',route=>{
    const path=new URL(route.request().url()).searchParams.get('path');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,
      children:path==='/test/root'?[{name:'a',path:'/test/root/a'},{name:'b',path:'/test/root/b'}]:[]})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/probe',async route=>{
    const path=route.request().postDataJSON().workspace;
    requests.push(path);
    if(path==='/test/root/a'){
     firstStarted=true;
     await firstGate;
     await route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'A directory revoked'})});
    }else{
     assert.equal(path,'/test/root/b');
     await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})});
    }
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
   async function choose(path){
    await page.getByRole('button',{name:'打开目录树'}).click();
    await page.locator('wa-tree-item[data-path="'+path+'"] [part="item"]').first().click();
    await page.getByRole('button',{name:'采用选中目录'}).click();
    await page.waitForFunction(v=>document.querySelector('[aria-label="当前资料目录"]')?.value===v,path,{timeout:12000});
   }
   await choose('/test/root/a');
   for(let i=0;i<40&&!firstStarted;i++)await sleep(50);
   assert.equal(firstStarted,true);
   await choose('/test/root/b');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('工作区文件可读写'),null,{timeout:16000});
   assert.equal(await page.locator('#status').getAttribute('data-kind'),'ok');
   const firstResponse=page.waitForResponse(res=>res.url().includes('/api/workspace-io/probe')&&res.status()===403,{timeout:20000});
   releaseFirst();await firstResponse;
   await sleep(200);
   assert.equal(await page.locator('#status').getAttribute('data-kind'),'ok','old directory result must never override newer result');
   assert.match(await page.locator('#status').innerText(),/工作区文件可读写.*目录设置尚未保存/);
   assert.deepEqual(requests,['/test/root/a','/test/root/b']);
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null,'probe must not Save');
   console.log('FRAME_DIRECTORY_LATEST_PROBE_WINS_PASS',name,requests.length);
  }finally{await browser.close()}
 }
}finally{vite.kill('SIGTERM')}
