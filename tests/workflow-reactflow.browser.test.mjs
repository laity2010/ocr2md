/** Real React Flow canvas: drag, add, delete, reset, no source/AI/API access. */
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const port=await new Promise((resolve,reject)=>{
  const server=createServer();server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(err=>err?reject(err):resolve(p));});
});
const preview=spawn('node',['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  env:{...process.env,V6_LAB_ID:'translation-lab'},cwd:process.cwd(),stdio:'ignore'});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const address=`http://127.0.0.1:${port}/labs/translation-lab/workflow.html`;
try{
  let online=false;
  for(let i=0;i<100;i++){
    try{const response=await fetch(address);if(response.status===200){online=true;break;}}
    catch{}
    await wait(130);
  }
  assert(online,'workflow preview did not start');
  for(const [name,engine,binary] of [
    ['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]]){
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1194,height:834}});
      const runtimeErrors=[],apiCalls=[];
      page.on('pageerror',e=>runtimeErrors.push(e.message));
      page.on('request',req=>{
        if(/\/api\//.test(new URL(req.url()).pathname))apiCalls.push(req.url());
      });
      const response=await page.goto(address,{waitUntil:'domcontentloaded',timeout:60000});
      assert.equal(response.status(),200);
      await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===5
        && document.querySelectorAll('.react-flow__edge').length===4,null,{timeout:30000});
      assert.equal(await page.locator('[data-testid="node-count"]').textContent(),'5');
      assert.equal(await page.locator('[data-testid="edge-count"]').textContent(),'4');
      assert.equal(await page.locator('.react-flow__node').count(),5);
      assert.equal(await page.locator('.react-flow__edge').count(),4);
      for(const name of ['审阅 MD','分句','句表','翻译','译表 JSON']){
        assert.equal(await page.locator('.workflow-node-title',{hasText:name}).count(),1);
      }
      assert.equal(await page.locator('.react-flow__node[data-id="translation-module"]').count(),1);
      assert.equal(await page.locator('.react-flow__node[data-id="translation-output"]').count(),1);
      assert.equal(await page.locator('.react-flow__edge[data-id="edge-translation-to-output"]').count(),1);
      // Both a double click on the module and a toolbar action edit labels
      // in-place, without changing any node or edge identities.
      const module=page.locator('.react-flow__node[data-id="sentence-module"]');
      await module.locator('.workflow-node-title').dblclick();
      const nameInput=module.locator('input[aria-label="节点名称"]');
      await nameInput.waitFor({timeout:6000});
      await nameInput.fill('句子切分');
      await nameInput.press('Enter');
      await page.waitForFunction(()=>document.querySelector('[data-id="sentence-module"] .workflow-node-title')?.textContent==='句子切分',null,{timeout:7000});
      assert.equal(await page.locator('.react-flow__edge').count(),4);
      await module.click();
      await page.locator('#rename-selected').click();
      await nameInput.waitFor({timeout:6000});
      await nameInput.fill('这次不改');
      await nameInput.press('Escape');
      await page.waitForFunction(()=>document.querySelector('[data-id="sentence-module"] .workflow-node-title')?.textContent==='句子切分',null,{timeout:7000});
      await page.locator('#rename-selected').click();
      await nameInput.fill('分句 · 演示模块');
      await nameInput.press('Enter');
      await page.waitForFunction(()=>document.querySelector('[data-id="sentence-module"] .workflow-node-title')?.textContent==='分句 · 演示模块',null,{timeout:7000});

      const first=page.locator('.react-flow__node[data-id="reviewed-md"]');
      const before=await first.boundingBox();assert(before);
      await page.mouse.move(before.x+before.width*.45,before.y+before.height*.52);
      await page.mouse.down();
      await page.mouse.move(before.x+before.width*.45+115,before.y+before.height*.52+70,{steps:16});
      await page.mouse.up();
      await page.waitForTimeout(300);
      const moved=await first.boundingBox();assert(moved);
      assert(Math.abs(moved.x-before.x)>35 || Math.abs(moved.y-before.y)>25,
        `drag did not move node: ${JSON.stringify({before,moved})}`);

      await page.locator('#add-file-node').click();
      assert.equal(await page.locator('.react-flow__node').count(),6);
      assert.equal(await page.locator('.react-flow__node').filter({hasText:'新文件 1'}).count(),1);
      await page.locator('#rename-selected').click();
      const newFileInput=page.locator('.react-flow__node[data-id="demo-1"] input[aria-label="节点名称"]');
      await newFileInput.fill('自定义输入文件');
      await newFileInput.press('Enter');
      assert.equal(await page.locator('.react-flow__node[data-id="demo-1"]').filter({hasText:'自定义输入文件'}).count(),1);
      await page.locator('#delete-selected').click();
      assert.equal(await page.locator('.react-flow__node').count(),5);
      assert.equal(await page.locator('.react-flow__edge').count(),4);

      await page.locator('#add-module-node').click();
      assert.equal(await page.locator('.react-flow__node').count(),6);
      assert.equal(await page.locator('.react-flow__node').filter({hasText:'新模块 2'}).count(),1);
      await page.locator('#reset-workflow').click();
      await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===5
          && document.querySelectorAll('.react-flow__edge').length===4,
        null,{timeout:10000});
      assert.equal(await page.locator('[data-testid="edge-count"]').textContent(),'4');
      assert.equal(await page.locator('.react-flow__node[data-id="sentence-module"] .workflow-node-title').textContent(),'分句');

      // Deleting a pre-existing node removes both attached React Flow edges.
      await page.locator('.react-flow__node[data-id="sentence-module"]').click();
      await page.locator('#delete-selected').click();
      assert.equal(await page.locator('.react-flow__node').count(),4);
      assert.equal(await page.locator('.react-flow__edge').count(),2);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelectorAll('.react-flow__node').length===5
         && document.querySelectorAll('.react-flow__edge').length===4,null,{timeout:25000});
      assert.equal(await page.locator('.react-flow__edge').count(),4,
        'refresh must restore five-node static flow, not use storage');
      assert.deepEqual(apiCalls,[], 'workflow page should not call file or module APIs');
      assert.deepEqual(runtimeErrors,[], 'React Flow should have no runtime errors');
      console.log('WORKFLOW_BROWSER_PASS',name,
        'rename via double-click and toolbar, Enter/Escape, drag, add/delete, reset, reload, no API');
      await page.close();
    } finally{await browser.close();}
  }
}finally{
  preview.kill('SIGTERM');
}
