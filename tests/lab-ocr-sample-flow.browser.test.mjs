/** End-to-end sample scope: 1 MinerU JSON (<200 pages) + 1 PDF -> one SQL table. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5318,host=`http://127.0.0.1:${port}`,url=host+'/labs/lab-ocr/';
const BOOK='/demo/sample';
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',b=>log+=b);vite.stderr.on('data',b=>log+=b);
try{
 let online=false;
 for(let i=0;i<90;i++){try{if((await fetch(url)).ok){online=true;break}}catch{} await pause(200)}
 assert(online,log.slice(-850));
 for(const [name,engine] of [['Chrome',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true});
   let inspectCount=0,importCount=0,rowsCount=0,hasDb=false;
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/workspace/roots',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo']})}));
   await page.route('**/api/workspace/browse?*',r=>{
    const path=new URL(r.request().url()).searchParams.get('path');
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children:path==='/demo'?[{path:BOOK,name:'sample'}]:[]})});
   });
   await page.route('**/labs/lab-ocr/api/ocr/**',r=>{
    const path=new URL(r.request().url()).pathname;
    const operation=path.split('/').pop();
    if(operation==='inspect'){
     inspectCount++;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:hasDb?'unchanged':'ready',sources:[{name:'source.json',pages:22}],pdf:'sample.pdf',pages:22,
      blocks:hasDb?539:0,ordering:'single'})});
    }
    if(operation==='import'){
     importCount++;hasDb=true;
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'imported',pages:22,blocks:539})});
    }
    if(operation==='rows'){
     rowsCount++;
     const offset=Number(new URL(r.request().url()).searchParams.get('offset'));
     return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({table:'minerujson',total:2,
      rows:offset?[]:[{id:1,source_name:'source.json',global_page:0,local_page:0,
       block_group:'para_blocks',block_index:0,block_type:'title',bbox_json:'[1,2,3,4]',
       text_preview:'First heading',block_json:'{"type":"title"}'},
       {id:2,source_name:'source.json',global_page:1,local_page:1,
       block_group:'para_blocks',block_index:0,block_type:'text',bbox_json:'[2,3,4,5]',
       text_preview:'Second paragraph',block_json:'{"type":"text"}'}]})});
    }
    throw Error('Unexpected OCR API operation '+operation);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('#settings-workspace').waitFor({state:'visible',timeout:23000});
   assert.equal(await page.locator('#workspace').isVisible(),false,'Unbound OCR must open Settings');
   await page.waitForFunction(()=>/绑定书籍工作目录|绑定工作区/.test(document.querySelector('#status')?.textContent||''),null,{timeout:23000});
   assert.equal(await page.locator('optgroup[label="SQL"] option').count(),0);
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   const item=page.locator('wa-tree-item[data-path="'+BOOK+'"]');
   await item.waitFor({state:'attached',timeout:18000});
   await item.locator('[part="item"]').first().click();
   await page.getByRole('button',{name:'采用选中目录'}).click();
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('#workspace')&&!document.querySelector('#workspace').hidden&&
     !!document.querySelector('select.ocr-source-file-select option[value="sql:minerujson"]'),null,{timeout:20000});
   assert.equal(await page.locator('#workspace').isVisible(),true);
   assert.equal(importCount,1,'First book should import just once');
   const nav=page.locator('#workspace select.ocr-source-file-select');
   assert.equal(await nav.locator('optgroup[label="SQL"] option').innerText(),'minerujson');
   // Exercise the real visible Tom Select dropdown, not only the hidden
   // HTMLSelectElement business port.
   await page.locator('#workspace .ocr-navigation-files .ts-control').click();
   const dropdown=page.locator('.ocr-navigation-popup-files:visible');
   await dropdown.locator('.optgroup-header').filter({hasText:'SQL'}).waitFor({state:'visible'});
   await dropdown.locator('.option').filter({hasText:'minerujson'}).click();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length>=2);
   assert.equal(await page.locator('#workspace .ag-row').count(),2);
   assert.match(await page.locator('#workspace .ag-row').first().innerText(),/source.json/);
   assert.match(await page.locator('#status').innerText(),/2 行/);
   // SQL AG every column uses Main's checkbox enum popup, not text/number
   // input filters. The 'all' checkbox and distinct values support multi-select.
   const header=page.locator('#workspace .ag-header-cell[col-id="global_page"]');
   await header.locator('.ag-header-cell-filter-button').click();
   const pop=page.locator('.ocr-enum-filter:visible');
   await pop.waitFor({state:'visible'});
   const box=value=>pop.locator('.ocr-enum-filter-option[data-filter-value="'+value+'"] input');
   assert.equal(await pop.getAttribute('aria-label'),'页（0起） 筛选');
   assert.equal(await box('all').isChecked(),true);
   assert.equal(await box('0').isChecked(),true);
   assert.equal(await box('1').isChecked(),true);
   await box('1').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===1);
   assert.equal(await box('all').isChecked(),false);
   assert.equal(await box('0').isChecked(),true);
   assert.equal(await box('1').isChecked(),false);
   await box('0').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===0);
   await box('1').check();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===1);
   assert.match(await page.locator('#workspace .ag-row').first().innerText(),/1/);
   await box('0').check();
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .ag-row').length===2);
   assert.equal(await box('all').isChecked(),true);
   // Filtering is entirely client-side and never writes to the SQL backend.
   assert.equal(rowsCount,1,'Checkbox filtering must not reread or mutate SQLite');
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#workspace .dv-content-container').first().waitFor({timeout:18000});
   await page.waitForFunction(()=>!!document.querySelector('select.ocr-source-file-select option[value="sql:minerujson"]'),null,{timeout:20000});
   assert.equal(importCount,1,'Reload must not re-import unchanged JSON');
   assert(importCount>0&&inspectCount>=2&&rowsCount>0);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_SAMPLE_FLOW_PASS',name,JSON.stringify({inspectCount,importCount,rowsCount,rows:2}));
  }finally{await browser.close()}
 }
}finally{vite.kill('SIGTERM')}
