import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const sample=resolve('.v6/tests/text-blocks/buffett-reinitialized.minerujson.md');
const original=readFileSync(sample,'utf8');
const port=5995,url=`http://127.0.0.1:${port}/`;
mkdirSync('.v6/evidence/block-join-toggle',{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:sample}});
try{
 let ready=false;for(let i=0;i<250;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }assert(ready,'test frontend unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const requests=[];await page.route('**/api/pdf-map',route=>{requests.push(route.request().url());return route.abort();});
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
   await page.locator('.ocr-navigation-popup-elements:visible [data-value="text-block"]').click();
   await page.waitForFunction(()=>/原始 224 块/.test(document.querySelector('#status')?.textContent||''),null,{timeout:30000});
   await page.getByRole('checkbox',{name:'文本块覆盖显示'}).check();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,null,{timeout:24000});
   const first=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p0b0 独立"]');
   const empty=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p2b8 独立"]');
   const target=page.locator('.ocr-pdf-block-ctrl input[aria-label="文本块 p6b7 独立"]');
   assert(await first.isDisabled());assert(await empty.isDisabled());
   assert(await target.isChecked());assert(await target.isEnabled());
   assert.equal(await page.locator('.ocr-pdf-block-ctrl').count(),224);
   await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').click();
   await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').click();
   await target.scrollIntoViewIfNeeded({timeout:18000});
   await page.waitForTimeout(500); // allow PDF.js lazy page canvas paint
   await target.click({timeout:15000});
   await page.waitForFunction(()=>/已接续 1 · 逻辑块 223/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert.equal(await target.isChecked(),false);
   assert.match(await page.locator('#status').innerText(),/已接续 1/);
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-joined-checkbox.png`,animations:'disabled'});
   await target.scrollIntoViewIfNeeded({timeout:15000});
   await target.click({timeout:15000});
   await page.waitForFunction(()=>/已接续 0 · 逻辑块 224/.test(document.querySelector('#status')?.textContent||''),null,{timeout:25000});
   assert(await target.isChecked());
   assert.equal(await page.locator('.ocr-pdf-block-cover').count(),224);
   await page.screenshot({path:`.v6/evidence/block-join-toggle/${name}-restored-checkbox.png`,animations:'disabled'});
   assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
   assert.equal(readFileSync(sample,'utf8'),original,'mother/fixture must not be autosaved');
   console.log('PDF_BLOCK_JOIN_TOGGLE_PASS',name,{originalBlocks:224,joinedLogicalBlocks:223,
     restoredBlocks:224,emptyDisabled:true,requests:requests.length,errors:errors.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
