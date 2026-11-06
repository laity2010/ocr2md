import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
import {ensureTextBlockSample} from './fixtures/text-block-sample.mjs';
const file=ensureTextBlockSample();
const original=readFileSync(file,'utf8');
const port=5999,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:file}});
mkdirSync('.v6/evidence/wp4',{recursive:true});
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
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
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
   // Frozen text-block review mode mounts only inventory/grouping,
   // evidence comparison and the five cross-column/cross-page candidates.
   // Retired confirmation/export writers must NOT appear in Shell or AG.
   const functionMenu=page.locator('#ag-functions-menu .module-actions[data-module="text-block"]');
   await page.locator('#ag-functions-toggle').click();
   assert.equal(await functionMenu.locator(':scope > button').count(),4);
   for(const label of ['查看原始文本块清单','切换文本块链分组展示',
     '查看跨页跨栏接续候选','同页 PDF 双框概览'])
     assert.equal(await functionMenu.locator(`button[aria-label="${label}"]`).count(),1,
       `current read-only review action not mounted: ${label}`);
   for(const label of ['确认所选文本块续接','否决所选文本块续接',
     '将所选文本块恢复待审阅','导出文本块续接审阅 JSON',
     '把当前 PBS 所在块链并入目标链'])
     assert.equal(await functionMenu.getByRole('button',{name:label}).count(),0,
       `retired review writer must not be visible: ${label}`);
   await page.keyboard.press('Escape');
   await action(page,'查看跨页跨栏接续候选');
   await page.waitForFunction(()=>/候选 5 组 · 跨栏 4 · 跨页 1/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:22000});
   assert.equal(await page.locator('.ocr-text-block-control,.ocr-block-review-bar,.ocr-text-block-state').count(),0);
   assert.equal(await page.locator('.toolbar #status').count(),1);
   await page.screenshot({path:`.v6/evidence/wp4/${name}-unified-readonly-review.png`,animations:'disabled'});
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
   await page.screenshot({path:`.v6/evidence/wp4/${name}-candidate-inventory.png`,animations:'disabled'});
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   await first.locator('.ag-cell[col-id="fromId"] button').click();
   const from=page.locator('.ocr-pdf-pair-overlay[data-role="from"][data-pdf-page="7"][data-block-index="6"]');
   const to=page.locator('.ocr-pdf-pair-overlay[data-role="to"][data-pdf-page="7"][data-block-index="7"]');
   await from.waitFor({timeout:18000});await to.waitFor({timeout:18000});
   assert.equal(await page.locator('.ocr-pdf-pair-overlay').count(),2);
   const boxA=await from.boundingBox(),boxB=await to.boundingBox();
   assert(boxA.width>4&&boxA.height>4&&boxB.width>4&&boxB.height>4);
   assert(boxA.x!==boxB.x,'cross-column frames must be spatially separated');
   await page.screenshot({path:`.v6/evidence/wp4/${name}-dual-orange.png`,animations:'disabled'});
   await action(page,'同页 PDF 双框概览');
   try{await page.waitForFunction(()=>{
     const boxes=[...document.querySelectorAll('.ocr-pdf-pair-overlay')].map(x=>x.getBoundingClientRect());
     const clip=document.querySelector('.ocr-pdf-scroller')?.getBoundingClientRect();
     return boxes.length===2&&clip&&boxes.every(b=>b.top>=clip.top-9&&b.bottom<=clip.bottom+9);
   },null,{timeout:17000});}catch(error){
     console.log('PAIR_OVERVIEW_DIAGNOSTIC',name,JSON.stringify(await page.evaluate(()=>{
       const scroller=document.querySelector('.ocr-pdf-scroller');
       const rect=b=>b?{x:b.x,y:b.y,width:b.width,height:b.height,top:b.top,bottom:b.bottom}:null;
       return {viewport:rect(scroller?.getBoundingClientRect()),scrollTop:scroller?.scrollTop,
         scrollHeight:scroller?.scrollHeight,boxes:[...document.querySelectorAll('.ocr-pdf-pair-overlay')]
           .map(e=>({role:e.dataset.role,bounds:rect(e.getBoundingClientRect())})),
         zoom:document.querySelector('.ocr-pdf-zoom')?.textContent,
         pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
         global:document.querySelector('#status')?.textContent};
     })));
     throw error;
   }
   await page.screenshot({path:`.v6/evidence/wp4/${name}-both-visible.png`,animations:'disabled'});
   // Each end's source navigation preserves the other orange rectangle.
   await first.locator('.ag-cell[col-id="toId"] button').click();
   assert.equal(await page.locator('.ocr-pdf-pair-overlay').count(),2);
   // Browsing both endpoints may not persist a continuation decision, or
   // write any structural CMD tag. Selection is view-only in this milestone.
   assert.match(await page.locator('#status').innerText(),/候选 5 组 · 跨栏 4 · 跨页 1/);
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),original);
   assert.equal(readFileSync(file,'utf8'),original);
   // Cross-page pair: both independent DOM boxes exist although on separate
   // pages. PDF scroller may show only one page in the physical viewport.
   const cross=page.locator('.ocr-text-block-grid .ag-row[row-id="p15b11--p16b0"]');
   await cross.locator('.ag-cell[col-id="fromId"] button').click();
   await page.locator('.ocr-pdf-pair-overlay[data-role="from"][data-pdf-page="16"][data-block-index="11"]').waitFor({timeout:18000});
   await page.locator('.ocr-pdf-pair-overlay[data-role="to"][data-pdf-page="17"][data-block-index="0"]').waitFor({timeout:18000});
   assert.equal(await page.locator('.ocr-pdf-pair-overlay').count(),2);
   await page.screenshot({path:`.v6/evidence/wp4/${name}-cross-page-pair.png`,animations:'disabled'});
   // The draft persists across a reload, without modifying the CMD document.
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   await action(page,'查看跨页跨栏接续候选');
   await page.waitForFunction(()=>/候选 5 组 · 跨栏 4 · 跨页 1/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:22000});
   // Summary updates before AG Grid commits the candidate rowData; the
   // immediately observed 39 rows were the prior virtualized parent view.
   // Require the five actual candidate row IDs after the grid settles.
   await page.waitForFunction(()=>{
     const rows=[...document.querySelectorAll('.ocr-text-block-grid .ag-row[row-id]')];
     return rows.length===5&&rows.every(node=>node.getAttribute('row-id')?.includes('--'));
   },null,{timeout:25000});
   assert.equal(await functionMenu.locator(':scope > button').count(),4);
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),original,
     'review-only candidate inventory and reload may not alter CMD');
   await action(page,'查看原始文本块清单');
   assert.equal(await page.locator('.ocr-pdf-pair-overlay').count(),0);

   assert.match(await page.locator('#status').innerText(),/原始 224 块/);
   await page.waitForFunction(()=>document.querySelector('.ocr-text-block-grid .ag-row[row-id="p0b0"]')!==null, null,{timeout:16000});
   await page.waitForFunction(()=>document.querySelector(
     '.ocr-text-block-grid .ag-row[row-id="p0b0"] .ag-cell[col-id="id"]')
     ?.textContent?.trim()==='p0b0',null,{timeout:17000});
   assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   assert.equal(readFileSync(file,'utf8'),original);
   console.log('WP4_BROWSER_PASS',name,{rows,state,orange:'p6b6→p6b7',crossPage:true,readOnly:true,reload:true,noDiskWrites:true,forbiddenRequests:forbidden.length,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
