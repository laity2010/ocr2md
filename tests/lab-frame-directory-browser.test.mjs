/** Isolated UI test: server directory tree, explicit save, authorization failure. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium} from 'playwright';
const url='http://127.0.0.1:5297/labs/lab-frame/';
const dev=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-frame/vite.config.mjs','--host','127.0.0.1','--port','5297','--strictPort'],
  {stdio:['ignore','pipe','pipe']});
let output='';dev.stdout.on('data',b=>output+=b);dev.stderr.on('data',b=>output+=b);
let browser;
try{
  for(let i=0;i<80;i++){
    try{if((await fetch(url)).ok)break;}catch{}
    if(i===79)throw Error('Vite did not start: '+output);
    await sleep(200);
  }
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1408,height:1056},hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/workspace/roots',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({
      allowedRoots:['/demo/docs']})}));
  await page.route('**/api/workspace/browse?*',route=>{
    const path=new URL(route.request().url()).searchParams.get('path');
    const children=path==='/demo/docs'?[{name:'paper',path:'/demo/docs/paper'},
      {name:'notes',path:'/demo/docs/notes'}]:[];
    return route.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({path,children})});
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('.ocr-ag-module-select').first().selectOption('settings');
  await page.waitForFunction(()=>document.getElementById('status')?.textContent?.includes('全局设置已就绪'));
  await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
  await page.getByRole('button',{name:'打开目录树'}).click();
  const root=page.locator('wa-tree-item[data-path="/demo/docs"]');
  await root.waitFor({state:'visible',timeout:20000});
  await page.locator('wa-tree-item[data-path="/demo/docs/paper"]').waitFor({state:'visible',timeout:12000});
  const treeRect=await page.locator('.ocr-settings-directory-tree-host').boundingBox();
  assert.ok(treeRect.height>=180,'directory pane must be large enough to browse on iPad');
  await root.locator('[part="item"]').first().click();
  const choose=page.getByRole('button',{name:'采用选中目录'});
  await choose.waitFor();
  await page.waitForFunction(()=>!document.querySelector('[aria-label="采用选中目录"]')?.disabled);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null);
  await choose.click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="当前资料目录"]')?.value==='/demo/docs',null,{timeout:12000});
  assert.equal(await page.locator('[aria-label="当前资料目录"]').inputValue(),'/demo/docs');
  await page.locator('#global-save').click();
  await page.waitForFunction(()=>document.getElementById('status')?.textContent?.includes('全局设置已保存'));
  const saved=await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1'));
  assert.equal(JSON.parse(saved).settings['workspace.dataDirectory'].value,'/demo/docs');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.ocr-ag-module-select').first().selectOption('settings');
  await page.waitForFunction(()=>document.getElementById('status')?.textContent?.includes('全局设置已就绪'));
  await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
  assert.equal(await page.locator('[aria-label="当前资料目录"]').inputValue(),'/demo/docs');
  assert.deepEqual(errors,[]);
  console.log('FRAME_DIRECTORY_BIND_AND_RELOAD_PASS',saved.length);
  await page.close();
  const denied=await browser.newPage({viewport:{width:1032,height:642}});
  await denied.route('**/api/workspace/roots',route=>route.fulfill({status:403,
    body:'Editor authorization required'}));
  await denied.goto(url,{waitUntil:'domcontentloaded'});
  await denied.locator('.ocr-ag-module-select').first().selectOption('settings');
  await denied.waitForFunction(()=>document.getElementById('status')?.textContent?.includes('全局设置已就绪'));
  await denied.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
  await denied.getByRole('button',{name:'打开目录树'}).click();
  await denied.locator('#status').getByText('目录访问需要 Main 的编辑授权',{exact:false})
    .waitFor({timeout:15000});
  assert.equal(await denied.locator('#status').getAttribute('data-kind'),'error');
  assert.equal(await denied.locator('wa-tree-item').count(),0);
  console.log('FRAME_DIRECTORY_DENIED_PASS');
  await denied.close();

  const invalid=await browser.newPage({viewport:{width:1032,height:642}});
  await invalid.route('**/api/workspace/roots',route=>route.fulfill({status:200,
    contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/moved']})}));
  await invalid.route('**/api/workspace/browse?*',route=>route.fulfill({status:422,
    contentType:'text/plain',body:'目录不存在；请核对完整路径'}));
  await invalid.goto(url,{waitUntil:'domcontentloaded'});
  await invalid.locator('.ocr-ag-module-select').first().selectOption('settings');
  await invalid.waitForFunction(()=>document.getElementById('status')?.textContent?.includes('全局设置已就绪'));
  await invalid.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
  await invalid.getByRole('button',{name:'打开目录树'}).click();
  await invalid.waitForFunction(()=>document.querySelector('#status')?.textContent
    ?.includes('目录不存在；请核对完整路径'),null,{timeout:14000});
  assert.equal(await invalid.locator('#status').getAttribute('data-kind'),'error');
  assert.equal(await invalid.locator('.ocr-settings-directory-picker-message').count(),0,
    'No module-local status display');
  const color=await invalid.locator('#status').evaluate(node=>getComputedStyle(node).color);
  assert.equal(color,'rgb(244, 155, 149)','Global error status must be visibly red');
  console.log('FRAME_422_REASON_GLOBAL_RED_PASS');
}finally{
  if(browser)await browser.close();
  dev.kill('SIGTERM');
}
