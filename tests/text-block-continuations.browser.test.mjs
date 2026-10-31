import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const file=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const original=readFileSync(file,'utf8');
const port=5998,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:file}});
mkdirSync('.v6/evidence/wp3',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
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
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('.ocr-text-block-state')?.textContent||''),null,{timeout:25000});
   await page.locator('.ocr-text-block-control [aria-label="查看跨页跨栏接续候选"]').click();
   await page.waitForFunction(()=>/只读候选 5 组 · 跨栏 4 · 跨页 1/.test(document.querySelector('.ocr-text-block-state')?.textContent||''),null,{timeout:20000});
   await page.locator('.ocr-text-block-grid .ag-cell[col-id="toId"]').first().waitFor({timeout:16000});
   await page.waitForFunction(()=>{const nodes=[...document.querySelectorAll('.ocr-text-block-grid .ag-row[row-id]')];
     return nodes.length===5&&nodes.every(node=>node.getAttribute('row-id')?.includes('--'));},null,{timeout:18000});
   const rowIds=await page.locator('.ocr-text-block-grid .ag-row').evaluateAll(elements=>
     elements.map(el=>({idx:el.getAttribute('row-index'),id:el.getAttribute('row-id'),col:el.querySelector('[col-id="toId"]')?.textContent})).slice(0,40));
   const rows=new Set(rowIds.map(x=>x.id).filter(Boolean)).size;
   assert.equal(rows,5);
   const state=await page.locator('.ocr-text-block-state').textContent();
   const first=page.locator('.ocr-text-block-grid .ag-row').filter({hasText:'p6b6'}).first();
   assert.equal(await first.locator('.ag-cell[col-id="toId"]').innerText(),'p6b7');
   await page.screenshot({path:`.v6/evidence/wp3/${name}-candidate-inventory.png`,animations:'disabled'});
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   await first.locator('.ag-cell[col-id="fromId"] button').click();
   await page.locator('.ocr-pdf-region-overlay[data-pdf-page="7"][data-block-index="6"]').waitFor({timeout:18000});
   await page.screenshot({path:`.v6/evidence/wp3/${name}-source-orange.png`,animations:'disabled'});
   await first.locator('.ag-cell[col-id="toId"] button').click();
   await page.locator('.ocr-pdf-region-overlay[data-pdf-page="7"][data-block-index="7"]').waitFor({timeout:18000});
   await page.screenshot({path:`.v6/evidence/wp3/${name}-target-orange.png`,animations:'disabled'});
   await page.locator('.ocr-text-block-control [aria-label="查看原始文本块清单"]').click();
   assert.match(await page.locator('.ocr-text-block-state').innerText(),/原始 224 块/);
   await page.waitForFunction(()=>document.querySelector('.ocr-text-block-grid .ag-row[row-id="p0b0"]')!==null, null,{timeout:16000});
   assert.equal(await page.locator('.ocr-text-block-grid .ag-row[row-id="p0b0"] .ag-cell[col-id="id"]').innerText(),'p0b0');
   assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   assert.equal(readFileSync(file,'utf8'),original);
   console.log('WP3_BROWSER_PASS',name,{rows,state,orange:'p6b6→p6b7',forbiddenRequests:forbidden.length,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
