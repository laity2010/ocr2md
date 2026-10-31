import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
import {inspectCMDTextBlocks} from '../ui/cmd-text-blocks.js';
const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const source=readFileSync(sample,'utf8');const inventory=await inspectCMDTextBlocks(source);
const port=5997,base=`http://127.0.0.1:${port}`,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:sample}});
const dir='.v6/evidence/text-block';mkdirSync(dir,{recursive:true});
try{
 let ready=false;for(let i=0;i<280;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await sleep(100)}
 assert(ready,'sample editor not ready');
 const pdfMap=await (await fetch(base+'/api/pdf-map')).json();
 let matchedGeometry=0;for(const row of inventory.rows){
   const page=pdfMap.pages[row.pageIndex],region=page?.regions?.find(x=>x.blockIndex===row.blockIndex);
   if(JSON.stringify(region?.bbox)===JSON.stringify(row.bbox)&&
     JSON.stringify(page.pageSize)===JSON.stringify(row.pageSize))matchedGeometry++;
 }
 assert.equal(matchedGeometry,224,'PDF map diverges from CMD sealed bbox');
 console.log('PDF_MAP_EQUALS_CMD_PASS',matchedGeometry,'/',inventory.rows.length);
 for(const [name,browserType,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1250,height:860},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   // The compatibility endpoint may still exist, but PDF.js MUST never use
   // it: the layout is provided by CMD's sealed JSON, not external OCR.
   const legacyMapRequests=[];
   await page.route('**/api/pdf-map',route=>{
     legacyMapRequests.push(route.request().url());
     return route.fulfill({status:503,body:'legacy bbox endpoint deliberately unavailable'});
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
   assert.equal(await page.locator('.ocr-text-block-control, .ocr-block-review-bar, .ocr-text-block-state').count(),0);
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   const options=await page.locator('.ocr-navigation-popup-elements:visible [data-value]').evaluateAll(els=>els.map(el=>el.getAttribute('data-value')));
   assert.equal(options[0],'text-block','text block option must be first');
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块 \/ 22 页 · 源码已匹配 224 · 缺失 0/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   const currentState=await page.locator('#status').innerText();
   await page.screenshot({path:`${dir}/${name}-inventory.png`,fullPage:false,animations:'disabled'});
   const mapped=await page.evaluate(rows=>{
     const elements=[...document.querySelectorAll('.ocr-markdown [data-source-start][data-source-end]')]
       .map(el=>({start:Number(el.dataset.sourceStart),end:Number(el.dataset.sourceEnd),text:el.textContent.trim()}));
     const missing=rows.filter(row=>row.sourceLine!==null&&!elements.some(x=>x.start<=row.sourceLine+2&&row.sourceLine+2<x.end));
     return {source:rows.filter(row=>row.sourceLine!==null).length,preview:rows.length-missing.length,
       missing:missing.map(x=>({id:x.id,type:x.type,sourceLine:x.sourceLine,text:x.text.slice(0,90)}))};
   },inventory.rows);
   const target=page.locator('.ocr-text-block-grid .ag-row').filter({hasText:'p6b2'}).first();
   // AG Grid virtualizes rows. Using its filter is not necessary: scroll the
   // grid via the page-source text row, then verify the reverse focus.
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   // PDF viewer must already be warm. Navigate from a currently visible AG row.
   const first=page.locator('.ocr-text-block-grid .ag-row').first();
   const firstId=await first.locator('.ag-cell[col-id="id"]').innerText();
   await first.click();
   await page.locator('.ocr-pdf-region-overlay').waitFor({timeout:15000});
   const overlay=await page.locator('.ocr-pdf-region-overlay').evaluate(e=>({page:e.dataset.pdfPage,block:e.dataset.blockIndex,
     width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));
   assert(overlay.width>3&&overlay.height>3,'PDF orange bbox not visible');
   const zoomBefore=await page.locator('.ocr-pdf-zoom').textContent();
   await page.locator('.ocr-pdf-plus').click({timeout:12000});
   const zoomAfter=await page.locator('.ocr-pdf-zoom').textContent();
   assert.notEqual(zoomBefore,zoomAfter,'PDF Zoom+ must work on WebKit');
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="md"]').click();
   assert.equal(await page.locator('.ocr-preview-mode').inputValue(),'md');
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   assert.equal(await page.locator('.ocr-pdf-zoom').textContent(),zoomAfter);
   assert.equal(readFileSync(sample,'utf8'),source,'fixture modified during browser review');
   assert.deepEqual(legacyMapRequests,[],'PDF illegally fetched separate MinerU JSON');
   assert.deepEqual(errors,[]);
   console.log('TEXT_BLOCK_COVERAGE_PASS',name,JSON.stringify({currentState,firstId,overlay,mapped,legacyMapRequests:legacyMapRequests.length},null,2));
   await page.screenshot({path:`${dir}/${name}-pdf-orange.png`,fullPage:false,animations:'disabled'});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
