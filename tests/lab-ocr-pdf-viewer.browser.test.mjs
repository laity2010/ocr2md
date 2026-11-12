/** Direct public loadPdf browser contract, with a genuine PDF.js text layer. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5328,host=`http://127.0.0.1:${port}`,url=process.env.LAB_OCR_TEST_URL||host+'/labs/lab-ocr/';
const book='/demo/ocr-book';
const dev=process.env.LAB_OCR_TEST_URL?null:spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';dev?.stdout.on('data',b=>log+=b);dev?.stderr.on('data',b=>log+=b);
try{
 let ready=false;
 for(let i=0;i<120;i++){
  try{if((await fetch(url)).ok){ready=true;break;}}catch{}
  await pause(200);
 }
 assert(ready,'OCR Vite failed: '+log.slice(-800));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(18000);
   const errors=[];let pdfRequests=0;
   page.on('pageerror',error=>errors.push(error.message));
   page.on('console',message=>{if(message.type()==='error')console.error('BROWSER_ERROR',message.text());});
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
        value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',route=>{
    const operation=new URL(route.request().url()).pathname.split('/').pop();
    if(operation==='pdf'){
      pdfRequests++;
      assert.equal(new URL(route.request().url()).searchParams.get('workspace'),book);
      return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf()});
    }
    if(operation==='inspect')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      status:'unchanged',blocks:2,pages:3,pdf:'original.pdf',sources:[{name:'mineru.json',pages:3}]})});
    if(operation==='minerujson2block')return route.fulfill({status:200,contentType:'application/json',body:'{"blocks":2}'});
    if(operation==='minerujson2span')return route.fulfill({status:200,contentType:'application/json',body:'{"spans":2}'});
    throw Error('Unexpected OCR API: '+operation);
   });
   const response=await page.goto(url,{waitUntil:'domcontentloaded'});
   assert.equal(response.status(),200);
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-root canvas')&&
     document.querySelector('.lab-ocr-pdf-placeholder')?.hidden&&
     document.querySelector('.lab-ocr-pdf-count')?.textContent==='/ 3',null,{timeout:17000}).catch(async error=>{
       console.error('PDF_DIAGNOSTIC',JSON.stringify(await page.evaluate(()=>({
         status:document.querySelector('#status')?.textContent,
         pdfRoot:!!document.querySelector('.lab-ocr-pdf-root'),
         placeholder:document.querySelector('.lab-ocr-pdf-placeholder')?.textContent,
         pages:document.querySelectorAll('.lab-ocr-pdf-scroller .page').length,
         canvas:document.querySelectorAll('.lab-ocr-pdf-root canvas').length,
         workspaceHidden:document.querySelector('#workspace')?.hidden,
         frameStatus:document.querySelector('.ocr-detached-pdf-pane')?.innerText?.slice(0,220),
       }))));console.error('REQUESTS',pdfRequests,'JS_ERRORS',errors);throw error;
     });
   assert.equal(await page.locator('.lab-ocr-pdf-scroller .page').count(),3);
   assert.ok(await page.locator('.lab-ocr-pdf-scroller .textLayer').count()>=1);
   assert.equal(pdfRequests,1,'PDF requested once while warming the first page');
   assert.equal(await page.locator('.lab-ocr-pdf-surface').getAttribute('data-pdf-theme'),'dark');
   const pageInput=page.locator('.lab-ocr-pdf-page');
   await pageInput.fill('3');await pageInput.press('Tab');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-page')?.value==='3');
   await page.getByRole('button',{name:'上一页'}).click();
   assert.equal(await pageInput.inputValue(),'2');
   const before=await page.locator('.lab-ocr-pdf-zoom').innerText();
   await page.getByRole('button',{name:'放大'}).click();
   await page.waitForFunction(prior=>document.querySelector('.lab-ocr-pdf-zoom')?.textContent!==prior,before);
   await page.getByRole('button',{name:'适宽'}).click();
   await page.getByRole('button',{name:'整页'}).click();
   await page.getByRole('button',{name:'顺时针旋转 90°'}).click();
   assert.equal(await page.locator('.lab-ocr-pdf-scroller canvas').count()>0,true);
   await page.locator('.ocr-preview-split-toggle input').uncheck();
   await page.waitForFunction(()=>!document.querySelector('.lab-ocr-pdf-root'));
   await page.locator('.ocr-preview-split-toggle input').check();
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-placeholder')?.hidden&&
     document.querySelector('.lab-ocr-pdf-count')?.textContent==='/ 3',null,{timeout:60000});
   assert.equal(pdfRequests,2,'Split reopens the bound PDF without changing settings');
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PDF_API_PASS',name,JSON.stringify({pages:3,pdfRequests,initialZoom:before}));
  }finally{await browser.close();}
 }
}finally{dev?.kill('SIGTERM');}
