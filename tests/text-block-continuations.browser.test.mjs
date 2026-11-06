import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
import {ensureTextBlockSample} from './fixtures/text-block-sample.mjs';
const file=ensureTextBlockSample();
const original=readFileSync(file,'utf8');
const port=5998,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:file}});
mkdirSync('.v6/evidence/wp3',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const action=async(page,label)=>{
  await page.locator('#ag-functions-toggle').click();
  await page.locator('#ag-functions-menu').getByRole('button',{name:label,exact:true}).click();
};
try{
 let ready=false;for(let i=0;i<300;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(100);
 }assert(ready,'dev preview unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1250,height:860},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const forbidden=[];await page.route('**/api/pdf-map',route=>{
     forbidden.push(route.request().url());return route.fulfill({status:503,body:'legacy disabled'});
   });
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   assert.equal(await page.locator('.ocr-text-block-control, .ocr-block-review-bar, .ocr-text-block-state').count(),0,'no local toolbar or status in AG');
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   await action(page,'查看跨页跨栏接续候选');
   await page.waitForFunction(()=>/候选 5 组 · 跨栏 4 · 跨页 1/.test(document.querySelector('#status')?.textContent||''),null,{timeout:20000});
   await page.locator('.ocr-text-block-grid .ag-cell[col-id="toId"]').first().waitFor({timeout:16000});
   await page.waitForFunction(()=>{const nodes=[...document.querySelectorAll('.ocr-text-block-grid .ag-row[row-id]')];
     return nodes.length===5&&nodes.every(node=>node.getAttribute('row-id')?.includes('--'));},null,{timeout:18000});
   const rowIds=await page.locator('.ocr-text-block-grid .ag-row').evaluateAll(elements=>
     elements.map(el=>({idx:el.getAttribute('row-index'),id:el.getAttribute('row-id'),col:el.querySelector('[col-id="toId"]')?.textContent})).slice(0,40));
   const rows=new Set(rowIds.map(x=>x.id).filter(Boolean)).size;
   assert.equal(rows,5);
   const state=await page.locator('#status').textContent();
   const first=page.locator('.ocr-text-block-grid .ag-row').filter({hasText:'p6b6'}).first();
   assert.equal(await first.locator('.ag-cell[col-id="toId"]').innerText(),'p6b7');
   await page.screenshot({path:`.v6/evidence/wp3/${name}-candidate-inventory.png`,animations:'disabled'});
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   await first.locator('.ag-cell[col-id="fromId"] button').click();
   await page.locator('.ocr-pdf-pair-overlay[data-role="from"][data-pdf-page="7"][data-block-index="6"]').waitFor({timeout:18000});
   await page.screenshot({path:`.v6/evidence/wp3/${name}-source-orange.png`,animations:'disabled'});
   await first.locator('.ag-cell[col-id="toId"] button').click();
   await page.locator('.ocr-pdf-pair-overlay[data-role="to"][data-pdf-page="7"][data-block-index="7"]').waitFor({timeout:18000});
   await page.screenshot({path:`.v6/evidence/wp3/${name}-target-orange.png`,animations:'disabled'});
   await action(page,'查看原始文本块清单');
   assert.match(await page.locator('#status').innerText(),/原始 224 块/);
   // AG Grid mounts the virtual row before its cell renderer is populated,
   // especially on touch WebKit after switching candidate → inventory views.
   // Wait for the actual rendered logical CMD ID, not just the empty row shell.
   await page.waitForFunction(()=>document.querySelector(
     '.ocr-text-block-grid .ag-row[row-id="p0b0"] .ag-cell[col-id="id"]')
     ?.textContent?.trim()==='p0b0',null,{timeout:16000});
   assert.equal(await page.locator('.ocr-text-block-grid .ag-row[row-id="p0b0"] .ag-cell[col-id="id"]').innerText(),'p0b0');
   assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   assert.equal(readFileSync(file,'utf8'),original);
   console.log('WP3_BROWSER_PASS',name,{rows,state,orange:'p6b6→p6b7',forbiddenRequests:forbidden.length,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
