/** Regress Frame directory adoption + old setting isolation after V2 business import. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5421, url=`http://127.0.0.1:${port}/labs/lab-ocr-v2/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr-v2/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let buildlog='';server.stdout.on('data',x=>buildlog+=x);server.stderr.on('data',x=>buildlog+=x);
try{
 for(let i=0;i<90;i++){
  try{if((await fetch(url)).ok)break;}catch{}
  if(i===89)throw Error('V2 frame server not running: '+buildlog);
  await sleep(200);
 }
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:774,height:1032}:{width:1200,height:850},hasTouch:true});
   const errors=[],probes=[],oldApi=[];let imported=false,posts=0,initialized=false,logicalPosts=0;
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',req=>{if(req.url().includes('/api/v2/'))oldApi.push(req.url());});
   await page.addInitScript(()=>{
    localStorage.setItem('ocr2md.lab-ocr-v2.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{value:'/old-v2/book'}}}));
    localStorage.setItem('ocr2md.lab-frame.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{value:'/old-frame/book'}}}));
   });
   await page.route('**/api/workspace/roots',route=>route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({allowedRoots:['/demo/books']})}));
   await page.route('**/api/workspace/browse?*',route=>{
    const path=new URL(route.request().url()).searchParams.get('path');
    const children=path==='/demo/books'?[{name:'my-book',path:'/demo/books/my-book'}]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
   });
   await page.route('**/labs/lab-frame/api/workspace-io/probe',async route=>{
    const selected=route.request().postDataJSON().workspace;
    probes.push(selected);
    await sleep(200);
    return route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({verified:true,readable:true,writable:true})});
   });
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
     const op=new URL(route.request().url()).pathname.split('/').at(-1);
     if(op==='initialize-logical'){
       initialized=true;logicalPosts++;
       return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created:true,blockCount:1})});
     }
     if(op==='logical-state')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(initialized?
       {exists:true,initialized:true,blockCount:1,offset:0,columns:['logical_id'],rows:[{logical_id:1}]}:
       {exists:true,initialized:false,needsInitialization:true,blockCount:0,columns:['logical_id'],rows:[]})});
     if(op==='import'){
       posts++;imported=true;
       assert.equal(route.request().postDataJSON().confirm,'import-mineru-base');
       return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created:true})});
     }
     if(op==='state')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(imported?
       {exists:true,blockCount:1,sourceCount:1,offset:0,columns:['blockid'],rows:[{blockid:1}]}:{exists:false})});
     return route.abort();
   });
   const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   await page.locator('#settings-workspace .ag-row').first().waitFor({state:'visible',timeout:24000});
   assert.equal(res.status(),200);
   assert.equal(await page.locator('#settings-workspace').isVisible(),true);
   assert.equal(await page.locator('#workspace').isVisible(),false);
   assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
   assert.equal(await page.locator('#workspace .ocr-ag-module-select').isDisabled(),true);
   assert.equal(await page.locator('.ocr-frame-back').count(),0);
   assert.match(await page.locator('.brand').textContent(),/lab-ocr-v2/);
   const nav=await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>({
    files:[...select.querySelectorAll('optgroup option')].map(opt=>opt.textContent),
    groups:[...select.querySelectorAll('optgroup')].map(group=>group.label)}));
   assert.deepEqual(nav,{files:['settings.json'],groups:['全局设置']});
   assert.match(await page.locator('#status').textContent(),/尚未绑定工作区资料目录/);
   assert.deepEqual(probes,[],'old V2 and Lab-Frame Settings must not be inherited');
   await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
   assert.equal(await page.locator('[aria-label="当前资料目录"]').inputValue(),'');
   await page.getByRole('button',{name:'打开目录树'}).click();
   const root=page.locator('wa-tree-item[data-path="/demo/books"]');
   await root.waitFor({state:'visible',timeout:22000});
   assert.equal(await root.evaluate(item=>item.expanded),false);
   await root.locator('[part="expand-button"]').first().click();
   const child=page.locator('wa-tree-item[data-path="/demo/books/my-book"]');
   await child.waitFor({state:'visible',timeout:15000});
   await child.locator('[part="item"]').first().click();
   await page.getByRole('button',{name:'采用选中目录'}).click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('工作区文件可读写'),null,{timeout:17000});
   assert.match(await page.locator('#status').textContent(),/目录设置尚未保存/);
   assert.deepEqual(probes,['/demo/books/my-book']);
   assert.equal(posts,0,'Uncommitted workspace must never initialize SQL');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr-v2-frame.settings.json.v1')),null,
    'reading/probing a directory does not implicitly Save');
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('V2 基础表就绪'),null,{timeout:26000});
   assert.equal(posts,1);
   assert.equal(logicalPosts,1);
   assert.equal(await page.locator('#settings-workspace .ocr-source-file-select optgroup[label="SQL"] option').count(),2);
   assert.deepEqual(probes,['/demo/books/my-book','/demo/books/my-book']);
   const saved=await page.evaluate(()=>({
    latest:localStorage.getItem('ocr2md.lab-ocr-v2-frame.settings.json.v1'),
    old:localStorage.getItem('ocr2md.lab-ocr-v2.settings.json.v1'),
    frame:localStorage.getItem('ocr2md.lab-frame.settings.json.v1'),
   }));
   assert.equal(JSON.parse(saved.latest).settings['workspace.dataDirectory'].value,'/demo/books/my-book');
   assert(saved.old.includes('/old-v2/book'));assert(saved.frame.includes('/old-frame/book'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('V2 基础表就绪'),null,{timeout:24000});
   assert.equal(posts,1,'reloading existing SQLite must not reimport');
   assert.equal(logicalPosts,1,'existing logical rows must not reinitialize');
   assert.equal(probes.length,3,'saved V2 Settings re-probes on reload');
   assert.equal(await page.locator('#workspace').isVisible(),false);
   assert.deepEqual(oldApi,[]);
   assert.deepEqual(errors,[]);
   console.log('NEW_V2_CLEAN_FRAME_FULL_UX_PASS',name,JSON.stringify({probes,nav}));
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM');}
