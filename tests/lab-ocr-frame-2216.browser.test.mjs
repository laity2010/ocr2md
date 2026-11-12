/** OCR Lab integration: the complete Frame 2216 settings, directory and status
 * behavior must work under lab-ocr's own identity and storage namespace.
 * Isolated Vite production preview + authenticated API stubs; no production user data.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5324,url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const development=process.env.LAB_OCR_TEST_DEV==='1';
const dev=spawn('node',['node_modules/vite/bin/vite.js',...(development?[]:['preview']),'--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';dev.stdout.on('data',chunk=>output+=chunk);dev.stderr.on('data',chunk=>output+=chunk);
try{
 let ready=false;
 for(let i=0;i<90;i++){
  try{if((await fetch(url)).ok){ready=true;break}}catch{}
  await pause(200);
 }
 assert(ready,'Lab OCR Vite server unavailable: '+output.slice(-800));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let rootRequests=0,browseRequests=0;
   await page.route('**/api/workspace/roots',route=>{
     rootRequests++;
     return route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify({allowedRoots:['/demo/docs'],selectionError:'Old book removed'})});
   });
   await page.route('**/api/workspace/browse?*',route=>{
     browseRequests++;
     const path=new URL(route.request().url()).searchParams.get('path');
     const children=({'/demo/docs':['alpha'],'/demo/docs/alpha':['nested']}[path]||[])
       .map(name=>({name,path:path+'/'+name}));
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
   });
   await page.route('**/labs/lab-ocr/api/ocr/overlays?*',route=>{
     const u=new URL(route.request().url());
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
       level:u.searchParams.get('level'),page:Number(u.searchParams.get('page')),
       pageSize:[595,842],boxes:[]})});
   });
   await page.route('**/labs/lab-ocr/api/ocr/inspect?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'unchanged',blocks:1,pages:22})}));
   const response=await page.goto(url,{waitUntil:'domcontentloaded'});
   assert.equal(response?.status(),200);
   assert.match(await page.locator('#build-version').innerText(),/^\d{8}-\d{4}$/);
   assert.match(await page.locator('body').innerText(),/lab-ocr/);
   await page.locator('#settings-workspace').waitFor({state:'visible',timeout:20000});
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().waitFor({timeout:20000});
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   const root=page.locator('wa-tree-item[data-path="/demo/docs"]');
   const alpha=page.locator('wa-tree-item[data-path="/demo/docs/alpha"]');
   const nested=page.locator('wa-tree-item[data-path="/demo/docs/alpha/nested"]');
   await alpha.waitFor({state:'attached',timeout:15000});
   await alpha.evaluate(item=>{item.expanded=true});
   await nested.waitFor({state:'attached',timeout:14000});
   await alpha.locator('[part="item"]').first().click();
   await page.waitForFunction(()=>document.querySelector('wa-tree-item[data-path="/demo/docs/alpha"]')?.selected===true);
   const rect=await alpha.locator('[part="item"]').first().evaluate(el=>({
     fill:getComputedStyle(el).backgroundColor,width:el.getBoundingClientRect().width,
     hostWidth:el.getRootNode().host.getBoundingClientRect().width}));
   assert.equal(rect.fill,'rgb(57, 108, 90)','Frame 2216 selection must cover entire row');
   assert(rect.width>=rect.hostWidth-2,'Row highlight must span full width');
   assert.equal(await root.getAttribute('selected'),null,'No ancestor selection');
   assert.equal(await nested.getAttribute('selected'),null,'No descendant selection');
   const rootCount=rootRequests;
   await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
   assert.equal(rootRequests,rootCount,'Refresh may not re-request saved-book roots');
   assert.equal(await alpha.getAttribute('selected'),'','Refresh must retain chosen directory');
   assert.equal(await nested.count(),1,'Refresh must retain nested directories');
   assert.match(await alpha.evaluate(item=>[...item.childNodes]
     .filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent).join('')),/alpha/,
     'Refresh must retain expanded parent label');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null,
     'Selection must not implicitly save settings');
   await page.getByRole('button',{name:'采用选中目录'}).click();
   await page.waitForFunction(()=>document.querySelector('[aria-label="当前资料目录"]')?.value==='/demo/docs/alpha');
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null,
     'Adopting should still not automatically save');
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')?.includes('/demo/docs/alpha'));
   const saved=await page.evaluate(()=>({ocr:localStorage.getItem('ocr2md.lab-ocr.settings.json.v1'),
     frame:localStorage.getItem('ocr2md.lab-frame.settings.json.v1')}));
   assert.equal(JSON.parse(saved.ocr).settings['workspace.dataDirectory'].value,'/demo/docs/alpha');
   assert.equal(saved.frame,null,'OCR Lab cannot pollute Frame storage namespace');
   assert.deepEqual(errors,[]);
   console.log(name+'_LAB_OCR_FRAME_2216_PASS',JSON.stringify({rootRequests,browseRequests,
     rowFill:rect.fill,width:rect.width,hostWidth:rect.hostWidth,savedInOwnNamespace:true}));
  }finally{await browser.close()}
 }
}finally{dev.kill('SIGTERM')}
