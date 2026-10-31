/** CMD-anchored block coverage, entirely read-only, not a focus/highlight replacement. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
import {inspectCMDTextBlocks} from '../ui/cmd-text-blocks.js';
const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const source=readFileSync(sample,'utf8');
const originalInventory=await inspectCMDTextBlocks(source);
const port=5996,origin=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:sample}});
mkdirSync('.v6/evidence/block-coverage-lens',{recursive:true});
try{
 let ready=false;for(let i=0;i<280;i++){
  try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }assert(ready,'coverage test editor unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1210,height:800},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const forbidden=[];await page.route('**/api/pdf-map',route=>{
     forbidden.push(route.request().url());return route.fulfill({status:503,body:'separate map disabled'});
   });
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="media"]').click();
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   const toggle=page.locator('.ocr-preview-switchbar .ocr-preview-block-toggle input');
   assert.equal(await page.locator('.ocr-lab-ag-toolbar [aria-label="文本块覆盖显示"]').count(),0);
   assert.equal(await toggle.count(),1);
   assert.equal(await toggle.isChecked(),true,'PDF coverage is checked by default');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224 &&
     document.querySelectorAll('.ocr-md-block-covered').length>=150,null,{timeout:22000});
   const total=await page.evaluate(()=>({md:document.querySelectorAll('.ocr-md-block-covered').length,
     mdIds:new Set([...document.querySelectorAll('.ocr-md-block-covered')].map(x=>x.dataset.coverageBlock)).size,
     pdf:document.querySelectorAll('.ocr-pdf-block-cover').length,
     pdfIds:new Set([...document.querySelectorAll('.ocr-pdf-block-cover')].map(x=>x.dataset.blockId)).size,
     markedMissing:!!document.querySelector('.ocr-pdf-block-cover[data-block-id="missing"]'),
     pointer:getComputedStyle(document.querySelector('.ocr-pdf-block-cover')).pointerEvents,
     pdfOpacity:getComputedStyle(document.querySelector('.ocr-pdf-block-cover')).backgroundColor,
   }));
   const coverageIds=await page.locator('.ocr-md-block-covered').evaluateAll(nodes=>
     [...new Set(nodes.map(node=>node.dataset.coverageBlock))]);
   const unpainted=originalInventory.rows.filter(r=>r.expectsPreview&&!coverageIds.includes(r.id))
     .map(r=>({id:r.id,line:r.sourceLine,text:r.text,type:r.type}));
   console.log('BLOCK_LENS_UNPAINTED',name,JSON.stringify(unpainted));
   assert.equal(total.pdfIds,224);assert(total.mdIds>=175,'too few independent Markdown blocks mapped');
   assert.equal(total.pointer,'none');assert.equal(total.markedMissing,false);
   await page.screenshot({path:`.v6/evidence/block-coverage-lens/${name}-md-all.png`,animations:'disabled'});
   // Standard focus on an AG block retains its stronger MD focus class.
   const first=page.locator('.ocr-text-block-grid .ag-row').first();
   const firstId=await first.locator('.ag-cell[col-id="id"]').innerText();
   await first.click();
   await page.waitForFunction(()=>document.querySelector('.ocr-outline-focused-element.ocr-md-block-covered'),null,{timeout:15000});
   const focus=page.locator('.ocr-outline-focused-element.ocr-md-block-covered').first();
   const focusStyle=await focus.evaluate(node=>({background:getComputedStyle(node).backgroundColor,
     shadow:getComputedStyle(node).boxShadow}));
   assert(focusStyle.shadow.includes('rgb('),'focus border must stay distinct');
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   assert(await toggle.isVisible(),'coverage checkbox lives in PDF toolbar');
   await page.locator('.ocr-pdf-region-overlay').waitFor({timeout:17000});
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   const focusPdf=page.locator('.ocr-pdf-region-overlay');
   const focusPdfId='p'+(Number(await focusPdf.getAttribute('data-pdf-page'))-1)+'b'+(await focusPdf.getAttribute('data-block-index'));
   assert(await page.locator(`.ocr-pdf-block-cover[data-block-id="${focusPdfId}"]`).count());
   const z=await page.evaluate(()=>({focus:getComputedStyle(document.querySelector('.ocr-pdf-region-overlay')).zIndex,
     coverage:getComputedStyle(document.querySelector('.ocr-pdf-block-cover')).zIndex}));
   assert(Number(z.focus)>Number(z.coverage),'PDF focus must remain above coverage');
   await page.screenshot({path:`.v6/evidence/block-coverage-lens/${name}-pdf-focus-on-cover.png`,animations:'disabled'});
   const zoomBefore=await page.locator('.ocr-pdf-zoom').innerText();
   await page.locator('.ocr-pdf-plus').click();
   assert.notEqual(await page.locator('.ocr-pdf-zoom').innerText(),zoomBefore);
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,null,{timeout:18000});
   // A/B focus remains independent of inventory lens.
   await page.locator('#ag-functions-toggle').click();
   await page.getByRole('button',{name:'查看跨页跨栏接续候选'}).click();
   await page.locator('.ocr-text-block-grid .ag-cell[col-id="toId"]').first().waitFor({timeout:15000});
   await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-text-block-grid .ag-row[row-id]')]
     .some(row=>row.getAttribute('row-id')?.includes('--')),null,{timeout:14000});
   const row=page.locator('.ocr-text-block-grid .ag-row[row-id*="--"]').first();
   const candidateId=await row.getAttribute('row-id');
   await row.click(); // row click selects the candidate without depending on AG Grid's horizontal column virtualization
   await page.locator('.ocr-pdf-pair-overlay[data-role="from"]').waitFor({timeout:17000});
   assert.equal(await page.locator('.ocr-pdf-pair-overlay').count(),2);
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.waitForTimeout(450); // screenshot after PDF.js canvas repaint, not mid-zoom
   await page.screenshot({path:`.v6/evidence/block-coverage-lens/${name}-pdf-pair-on-cover.png`,animations:'disabled'});
   await toggle.uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===0,
     null,{timeout:15000});
   assert(await page.locator('.ocr-md-block-covered').count()>150,
     'single PDF toggle must leave the remembered Markdown coverage intact');
   assert.equal(await page.locator('.ocr-pdf-pair-overlay').count(),2,'coverage off must preserve A/B selection');
   await page.screenshot({path:`.v6/evidence/block-coverage-lens/${name}-coverage-off-pair-stays.png`,animations:'disabled'});
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="media"]').click();
   assert.equal(await toggle.isVisible(),true,'PDF toolbar retains coverage checkbox across AG modules');
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   assert.equal(await toggle.isChecked(),true,'selecting text-block AG automatically enables PDF blocks');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
     null,{timeout:18000});
   assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
   assert.equal(readFileSync(sample,'utf8'),source,'must not edit CMD');
   console.log('BLOCK_COVERAGE_LENS_PASS',name,{firstId,total,focusStyle,z,errors,forbidden});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
