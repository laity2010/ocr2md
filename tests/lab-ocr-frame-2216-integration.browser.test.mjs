/** Integration contract: OCR review inherits Frame 2216 without sharing its
 * settings namespace, release identity, or business dataset.
 * Runs the actual lab-ocr Vite entry in Chromium and iPad WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
import {shouldReload} from '../ui/frame/refresh.js';

const port=5307,url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
assert(shouldReload('local',{schema:'ocr2md-frame/v1',name:'lab-ocr',version:'new'},'lab-ocr'));
assert(!shouldReload('local',{schema:'ocr2md-frame/v1',name:'lab-frame',version:'new'},'lab-ocr'));
const dev=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),'--strictPort'],
  {stdio:['ignore','pipe','pipe']});
let serverOutput='';dev.stdout.on('data',chunk=>serverOutput+=chunk);dev.stderr.on('data',chunk=>serverOutput+=chunk);
try{
  let ready=false;
  for(let i=0;i<90;i++){
    if(dev.exitCode!==null)throw Error('OCR Vite exited: '+serverOutput.slice(-900));
    try{if((await fetch(url)).ok){ready=true;break}}catch{}
    await sleep(200);
  }
  assert(ready,'OCR Vite did not start: '+serverOutput.slice(-900));
  for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400&&!new URL(r.url()).pathname.startsWith('/fonts/sarasa-'))
        errors.push('HTTP '+r.status()+' '+r.url());});
      // Isolated Vite preview lacks Agent Link's separately served Sarasa fonts;
      // these are intentionally excluded from the HTTP status assertion.
      let rootsCalls=0,browseCalls=0;
      await page.route('**/api/workspace/roots',route=>{
        rootsCalls++;
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({allowedRoots:['/demo/ocr-review'],activeBook:'',selectionError:'Old book moved'})});
      });
      await page.route('**/api/workspace/browse?*',route=>{
        browseCalls++;
        const path=new URL(route.request().url()).searchParams.get('path');
        const children=path==='/demo/ocr-review'?[{name:'review-book',path:'/demo/ocr-review/review-book'}]:[];
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
      });
      await page.route('**/labs/lab-ocr/api/ocr/pdf?*',route=>route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf()}));
      await page.route('**/labs/lab-ocr/api/ocr/inspect?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'unchanged',blocks:1,pages:22})}));
      await page.route('**/labs/lab-ocr/api/ocr/minerujson2block',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'unchanged',table:'block',blocks:0})}));
      await page.route('**/labs/lab-ocr/api/ocr/minerujson2span',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'unchanged',table:'span',spans:0})}));
      const response=await page.goto(url,{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),200);
      await page.locator('#settings-workspace').waitFor({state:'visible',timeout:16000});
      await page.locator('#settings-workspace .ocr-frame-back').click();
      await page.locator('#workspace .dv-content-container').first().waitFor({timeout:16000});
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
      assert.match(await page.locator('#lab-ocr-home').innerText(),/lab-ocr/);
      assert.match(await page.locator('#status').innerText(),/lab-ocr/);
      const label=await page.locator('.ocr-ag-module-select').first().locator('option[value="frame"]').innerText();
      assert.match(label,/OCR 审阅/,'Preserve OCR review module label');
      assert.equal(await page.locator('#workspace .ag-row').count(),0,'OCR review remains empty before business data');
      await page.locator('.ocr-ag-module-select').first().selectOption('settings');
      await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'})
        .first().waitFor({state:'visible',timeout:18000});
      await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
      await page.getByRole('button',{name:'打开目录树'}).click();
      const child=page.locator('wa-tree-item[data-path="/demo/ocr-review/review-book"]');
      await child.waitFor({state:'attached',timeout:14000});
      await child.locator('[part="item"]').first().click();
      await page.waitForFunction(()=>document.querySelector('wa-tree-item[data-path="/demo/ocr-review/review-book"]')?.selected===true);
      const selectedStyle=await child.locator('[part="item"]').first().evaluate(el=>{
        const r=el.getBoundingClientRect();const h=el.getRootNode().host.getBoundingClientRect();
        return {background:getComputedStyle(el).backgroundColor,width:r.width,hostWidth:h.width};
      });
      assert.equal(selectedStyle.background,'rgb(57, 108, 90)');
      assert(selectedStyle.width>=selectedStyle.hostWidth-2);
      assert.equal(await page.getByRole('button',{name:'采用选中目录'}).isEnabled(),true);
      await page.getByRole('button',{name:'采用选中目录'}).click();
      await page.waitForFunction(()=>document.querySelector('[aria-label="当前资料目录"]')?.value==='/demo/ocr-review/review-book');
      assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null);
      assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null,
        'Directory selection must remain unsaved until global Save');
      await page.locator('#global-save').click();
      await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')?.includes('/demo/ocr-review/review-book'));
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')));
      assert.equal(saved.settings['workspace.dataDirectory'].value,'/demo/ocr-review/review-book');
      assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null,
        'Lab OCR must not write Frame preference namespace');
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('.ocr-ag-module-select').first().selectOption('settings');
      await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
      assert.equal(await page.locator('[aria-label="当前资料目录"]').inputValue(),'/demo/ocr-review/review-book');
      assert.deepEqual(errors,[]);
      console.log(name+'_LAB_OCR_FRAME_2216_MERGE_PASS',JSON.stringify({rootsCalls,browseCalls,selectedStyle}));
    }finally{await browser.close();}
  }
}finally{dev.kill('SIGTERM');}
