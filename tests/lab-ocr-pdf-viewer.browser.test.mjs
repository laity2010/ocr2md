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
   assert.equal(pdfRequests,1,'PDF must warm up via one authenticated request');
   assert.equal(await page.locator('.lab-ocr-pdf-surface').getAttribute('data-pdf-theme'),'dark');
   assert.equal(await page.locator('.lab-ocr-pdf-controls button').count(),0,'No extra PDF buttons');
   assert.equal(await page.locator('.lab-ocr-pdf-controls input').count(),1);
   assert.equal(await page.locator('.lab-ocr-pdf-controls select').count(),1);
   const previewMode=page.locator('#workspace .ocr-preview-mode');
   const split=page.locator('.ocr-preview-split-toggle input');
   const detached=page.locator('.ocr-detached-pdf-host');
   const scale=page.locator('.lab-ocr-pdf-scale');
   const pageInput=page.locator('.lab-ocr-pdf-page');
   assert.equal(await previewMode.locator('option[value="pdf"]').isDisabled(),true,
     'Split reserves PDF in detached pane');
   assert.equal(await detached.locator('.lab-ocr-pdf-root').count(),1);
   const originalRoot=await page.locator('.lab-ocr-pdf-root').evaluate(node=>{
     window.__labPdfRoot=node;return node.isConnected;
   });
   assert.equal(originalRoot,true);
   assert.deepEqual(await scale.locator('option').allTextContents(),
     ['适宽','25%','50%','75%','100%','125%','150%','200%','300%','400%']);
   assert.equal(await scale.inputValue(),'page-width');
   await pageInput.fill('3');await pageInput.press('Tab');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-page')?.value==='3');
   assert.equal(await page.locator('.lab-ocr-pdf-count').innerText(),'/ 3');
   await scale.selectOption('100');
   assert.equal(await scale.inputValue(),'100');
   await page.waitForFunction(()=>document.querySelector('.lab-ocr-pdf-scroller .page')?.getBoundingClientRect().width>650);
   const widthAt100=await page.locator('.lab-ocr-pdf-scroller .page').first().evaluate(el=>el.getBoundingClientRect().width);
   await scale.selectOption('page-width');
   assert.equal(await scale.inputValue(),'page-width');
   await split.uncheck();
   await page.waitForFunction(()=>!document.querySelector('.ocr-detached-pdf-pane'));
   assert.equal(await previewMode.locator('option[value="pdf"]').isEnabled(),true,
     'PDF option MUST be enabled after canceling split');
   assert.equal(await previewMode.inputValue(),'md');
   assert.equal(await page.locator('.ocr-preview-pane>.ocr-preview-pdf-host .lab-ocr-pdf-root').count(),1);
   await previewMode.selectOption('pdf');
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='pdf');
   assert.equal(await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-scale').isVisible(),true);
   assert.equal(await page.locator('.ocr-preview-pane>.ocr-preview-pdf-host canvas').count()>0,true);
   assert.equal(await page.evaluate(()=>document.querySelector('.lab-ocr-pdf-root')===window.__labPdfRoot),true,
     'Single preview must reuse the warmed PDFViewer, not rebuild it');
   assert.equal(pdfRequests,1,'Unsplit PDF must NOT request bytes again');
   await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-scale').selectOption('75');
   await page.waitForFunction(width=>Math.abs(document.querySelector('.lab-ocr-pdf-scroller .page')?.getBoundingClientRect().width-width*.75)<5,widthAt100);
   await previewMode.selectOption('md');
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='md');
   await previewMode.selectOption('pdf');
   assert.equal(await page.locator('.ocr-preview-pane>.ocr-preview-pdf-host canvas').count()>0,true);
   await split.check();
   await page.waitForFunction(()=>!!document.querySelector('.ocr-detached-pdf-pane'));
   assert.equal(await previewMode.inputValue(),'md');
   assert.equal(await previewMode.locator('option[value="pdf"]').isDisabled(),true);
   assert.equal(await page.locator('.ocr-detached-pdf-host .lab-ocr-pdf-root').count(),1);
   assert.equal(await page.evaluate(()=>document.querySelector('.lab-ocr-pdf-root')===window.__labPdfRoot),true);
   assert.equal(await page.locator('.lab-ocr-pdf-scale').inputValue(),'75','Zoom selection must persist');
   assert.equal(pdfRequests,1,'Re-splitting must not re-request PDF');
   await split.uncheck();
   await previewMode.selectOption('pdf');
   assert.equal(await page.locator('.ocr-preview-mode-tools .lab-ocr-pdf-controls').count(),1);
   assert.equal(pdfRequests,1);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_PDF_API_PASS',name,JSON.stringify({pages:3,pdfRequests,previewMode:'pdf',singleViewer:true}));
  }finally{await browser.close();}
 }
}finally{dev?.kill('SIGTERM');}
