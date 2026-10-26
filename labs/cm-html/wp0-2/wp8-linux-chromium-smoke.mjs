/** Independent Linux/aarch64 Chromium integration smoke.
 * Use against a same-container loopback lab server + isolated tmpfs fixture.
 * No external network, no production data writes.
 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const url=process.env.WP8_TEST_URL;
const executablePath=process.env.WP8_CHROMIUM_EXECUTABLE;
if(process.platform!=='linux'||!url||!executablePath)
  throw Error('Linux Chromium smoke requires Linux and explicit WP8 env');
const browser=await chromium.launch({executablePath,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:840}});
 const errors=[],calls=[],apiWrites=[];
 page.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER_PAGEERROR',e.message)});
 page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER_CONSOLE_ERROR',msg.text().slice(0,350))});
 page.on('requestfailed',req=>console.log('FAILED_REQUEST',req.method(),req.url().slice(0,180),req.failure()?.errorText));
 page.on('request',r=>{
   const target=new URL(r.url());
   if(target.pathname.endsWith('/api/document')&&target.searchParams.has('chapter'))
     calls.push('physical chapter');
   if(!['GET','HEAD'].includes(r.method())&&target.pathname.includes('/api/'))
     apiWrites.push(target.pathname);
 });
 await page.addInitScript(()=>{
   document.addEventListener('ocr2md:wp3-ag-ready',e=>{
     window.__wp8={
       views:e.detail.views,read:e.detail.getMarkdown,getCMD:e.detail.getCMD,
     };
   });
 });
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForTimeout(5000);
 console.log('LINUX_BOOTSTRAP_DIAG',JSON.stringify(await page.evaluate(()=>({
   url:location.href,heading:document.title,ready:Boolean(window.__wp8),
   portKeys:window.__wp8?.getCMD?.()&&Object.keys(window.__wp8.getCMD()).slice(0,30),
   chapterCount:window.__wp8?.getCMD?.()?.getIndex?.()?.chapters?.length,
   editor:document.querySelector('.cm-content')?.textContent?.slice(0,160),
   status:document.querySelector('#status')?.textContent?.slice(0,180),
   body:document.body.textContent.slice(0,250),
 }))));
 await page.waitForFunction(()=>window.__wp8?.getCMD?.()?.getIndex?.()?.chapters?.length===6,
   null,{timeout:15000});
 const initial=await page.evaluate(()=>{
   const i=window.__wp8.getCMD().getIndex();
   return {chars:window.__wp8.read().length,
    chapters:i.chapters.length,headings:i.queryElements({type:'heading'}).length,
    media:i.queryElements({type:'media'}).length,
    latex:i.queryElements({type:'latex'}).length,
    reviewed:i.queryElements({type:'latex'}).filter(x=>x.status==='latex').length,
    instances:Object.keys(window.__wp8.views).length,
   };
 });
 assert.deepEqual(initial,{chars:311282,chapters:6,headings:19,media:11,
   latex:42,reviewed:38,instances:3});
 const source=await page.evaluate(()=>window.__wp8.read());
 const picker=page.locator('input[aria-label="CMD 虚拟索引"]');
 await picker.check();
 await page.locator('input[aria-label="章节所有"]').uncheck();
 const options=await page.locator('.ocr-wp3-chapter-select option')
   .evaluateAll(xs=>xs.map(x=>x.value));
 await page.locator('.ocr-wp3-chapter-select').evaluate((el,v)=>{
   el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
 },options[1]);
 await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section').length>0&&
   [...document.querySelectorAll('.ocr-markdown [data-source-start]')]
   .some(x=>Number(x.dataset.sourceStart)>30),null,{timeout:23000});
 const scoped=await page.evaluate(()=>{
   const el=document.querySelector('.ocr-markdown');
   const lines=[...el.querySelectorAll('[data-source-start]')].map(x=>Number(x.dataset.sourceStart));
   return {text:el.textContent.slice(0,80),firstLine:Math.min(...lines),
     folded:document.querySelectorAll('.ocr-wp4-hidden-section').length,
     formulaRows:window.__wp8.views.latex.api.getDisplayedRowCount()};
 });
 assert(scoped.firstLine>1&&scoped.folded>0);
 assert.equal(scoped.formulaRows,25);
 assert.equal(await page.evaluate(()=>window.__wp8.read()),source);
 await page.locator('.ocr-preview-mode').evaluate(el=>{
   el.value='pdf';el.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await page.waitForFunction(()=>document.querySelector('.ocr-pdf-page')?.value, null,{timeout:20000});
 await page.locator('.ocr-pdf-page').fill('20');
 await page.locator('.ocr-pdf-page').dispatchEvent('change');
 await page.waitForFunction(()=>window.__wp8.getCMD().getIndex().chapters.length===6&&
   document.querySelector('.ocr-wp3-chapter-select')?.value==='mineru:19:0:0',
  null,{timeout:26000});
 assert.equal(await page.evaluate(()=>window.__wp8.read()),source);
 assert.deepEqual(errors,[]);
 assert.deepEqual(calls,[]);
 assert.deepEqual(apiWrites,[]);
 console.log('WP8_LINUX_ARM64_CHROMIUM_PASS',JSON.stringify({node:process.version,
   ...initial,scoped,realPdfNavigation:true,noWrites:true,allSourceUnchanged:true}));
}finally{await browser.close();}
