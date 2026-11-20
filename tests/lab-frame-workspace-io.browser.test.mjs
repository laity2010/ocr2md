/** Browser integration: only an actual server probe grants green global status. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const url='http://127.0.0.1:5399/labs/lab-frame/';
const dev=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-frame/vite.config.mjs','--host','127.0.0.1','--port','5399','--strictPort'],
  {stdio:['ignore','pipe','pipe']});
let output='';dev.stdout.on('data',x=>output+=x);dev.stderr.on('data',x=>output+=x);
try{
  for(let i=0;i<80;i++){
    try{if((await fetch(url)).ok)break;}catch{}
    if(i===79)throw Error('Frame dev server failed: '+output);
    await sleep(250);
  }
  for(const [engineName,engine] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:engineName==='WebKit'?{width:1024,height:800}:{width:1408,height:900},hasTouch:true});
      const errors=[],probes=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/api/workspace/roots',route=>route.fulfill({status:200,
        contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/docs']})}));
      await page.route('**/api/workspace/browse?*',route=>{
        const path=new URL(route.request().url()).searchParams.get('path');
        const children=path==='/demo/docs'?[{name:'book',path:'/demo/docs/book'}]:[];
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
      });
      await page.route('**/labs/lab-frame/api/workspace-io/probe',route=>{
        const req=route.request(),data=req.postDataJSON();
        probes.push({workspace:data.workspace,origin:req.headers().origin});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})});
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.locator('#settings-workspace .ag-row').first().waitFor({state:'visible',timeout:25000});
      await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
      await page.getByRole('button',{name:'打开目录树'}).click();
      await page.locator('wa-tree-item[data-path="/demo/docs/book"]').waitFor({state:'visible',timeout:22000});
      await page.locator('wa-tree-item[data-path="/demo/docs/book"] [part="item"]').first().click();
      await page.getByRole('button',{name:'采用选中目录'}).click();
      await page.waitForFunction(()=>document.querySelector('[aria-label="当前资料目录"]')?.value==='/demo/docs/book',null,{timeout:12000});
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('工作区文件可读写'),null,{timeout:20000});
      assert.deepEqual(probes.map(x=>x.workspace),['/demo/docs/book'],
        'adopting a directory must probe immediately, without Save');
      assert.match(await page.locator('#status').innerText(),/目录设置尚未保存/);
      assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null,
        'probing must not implicitly save settings');
      await page.locator('#global-save').click();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('全局设置已保存')&&
        document.querySelector('#status')?.textContent.includes('工作区文件可读写'),null,{timeout:20000});
      assert.equal(await page.locator('#status').getAttribute('data-kind'),'ok');
      assert.deepEqual(probes.map(x=>x.workspace),['/demo/docs/book','/demo/docs/book']);
      assert.equal(await page.locator('.ocr-frame-back').count(),0);
      assert.equal(await page.locator('#workspace').isVisible(),false);
      assert.equal(await page.locator('#workspace .ocr-outline-pane, #workspace .ocr-source-pane, #workspace .ocr-preview-pane, #workspace .ocr-detached-pdf-pane').count(),4);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('工作区文件可读写'),null,{timeout:20000});
      assert.equal(probes.length,3,'saved directory must be re-probed on startup');
      assert.deepEqual(errors,[]);
      console.log('FRAME_WORKSPACE_SUCCESS_STATUS_BROWSER_PASS',engineName,probes.length);
      const savedSettings=await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1'));
      await page.close();

      const denied=await browser.newPage({viewport:{width:1024,height:800}});
      // Reuse the real Settings component's persisted JSON (not a synthetic
      // partial record that fails its own schema validation).
      await denied.addInitScript(snapshot=>localStorage.setItem('ocr2md.lab-frame.settings.json.v1',snapshot),savedSettings);
      await denied.route('**/labs/lab-frame/api/workspace-io/probe',route=>route.fulfill({status:403,
        contentType:'application/json',body:JSON.stringify({error:'Main 编辑授权已失效'})}));
      await denied.goto(url,{waitUntil:'domcontentloaded'});
      await denied.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('工作区文件读写验证失败'),null,{timeout:20000});
      assert.equal(await denied.locator('#status').getAttribute('data-kind'),'error');
      assert(!(await denied.locator('#status').textContent()).includes('工作区文件可读写'));
      console.log('FRAME_WORKSPACE_DENIED_STATUS_BROWSER_PASS',engineName);
      await denied.close();
    }finally{await browser.close()}
  }
}finally{dev.kill('SIGTERM');}
