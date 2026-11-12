/** Lab PDF: isolated frame plus real reusable PDF.js viewer and public fixture. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';

const port=5327;
const root=process.env.LAB_PDF_TEST_URL||`http://127.0.0.1:${port}/labs/lab-pdf/`;
const server=process.env.LAB_PDF_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','preview','--config','labs/lab-pdf/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';server?.stdout.on('data',b=>log+=b);server?.stderr.on('data',b=>log+=b);
try{
 let online=false;
 for(let i=0;i<100;i++){
  if(server&&server.exitCode!==null)break;
  try{if((await fetch(root)).ok){online=true;break}}catch{}
  await pause(200);
 }
 assert.ok(online,'Lab PDF entry unavailable: '+log.slice(-700));
 for(const [engineName,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true,ignoreHTTPSErrors:true});
   page.setDefaultTimeout(18000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(root,{waitUntil:'domcontentloaded',timeout:50000});
   assert.equal(response.status(),200);
   assert.equal((await page.locator('#lab-pdf-home').innerText()).trim(),'OCR2MD lab-pdf');
   assert.match(await page.title(),/Lab PDF/);
   assert.match(await page.locator('#build-version').innerText(),/^\d{8}-\d{4}$/);
   await page.locator('#workspace .dv-content-container').first().waitFor();
   assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
   assert.equal(await page.locator('#workspace .ag-row').count(),0);
   await page.waitForFunction(()=>document.querySelector('.ocr-preview-pdf-host')?.ocrPdfViewer&&
     document.querySelector('#status')?.textContent?.includes('PDF 已就绪'),null,{timeout:50000});
   assert.equal(await page.locator('#workspace .opdf-page').count(),1);
   assert.equal(await page.locator('#workspace .opdf-page').isEnabled(),true);
   assert.equal(await page.locator('#workspace .opdf-root .page').count(),3);
   assert.equal(await page.locator('#global-save').isVisible(),true);
   const native=page.locator('#workspace .ocr-source-file-select');
   assert.equal(await native.locator('optgroup').count(),1);
   assert.equal(await native.locator('optgroup option').innerText(),'settings.json');
   await page.locator('#workspace .ocr-navigation-files .ts-control').click();
   await page.locator('.ocr-navigation-popup-files:visible .option').click();
   await page.locator('#settings-workspace .dv-content-container').first().waitFor();
   assert.equal(await page.locator('#settings-workspace .dv-content-container').count(),3);
   const sarasa=page.locator('#settings-workspace .ocr-settings-readonly-value');
   assert.equal(await sarasa.inputValue(),'Sarasa');
   assert.equal(await sarasa.isDisabled(),true);
   await page.locator('#settings-workspace .ag-row').nth(1).click();
   const slider=page.locator('#settings-font-slider');
   assert.equal(await slider.inputValue(),'16');
   await slider.fill('18');
   if(await page.locator('#status').evaluate(el=>getComputedStyle(el).fontSize)!=='18px')
    await slider.dispatchEvent('input');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('#status')).fontSize==='18px');
   const before=await page.evaluate(()=>({
    pdf:localStorage.getItem('ocr2md.lab-pdf.settings.json.v1'),
    frame:localStorage.getItem('ocr2md.lab-frame.settings.json.v1'),
    ocr:localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')
   }));
   assert.deepEqual(before,{pdf:null,frame:null,ocr:null});
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-pdf.settings.json.v1')?.includes('"value": 18'));
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null);
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-ocr.settings.json.v1')),null);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#workspace .dv-content-container').first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--ocr-frame-font-size')),'18px');
   assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
   assert.deepEqual(errors,[]);
   console.log('LAB_PDF_BOOTSTRAP_PASS',engineName,'four panes, own settings, navigation, real PDF.js');
  }finally{await browser.close()}
 }
}finally{server?.kill('SIGTERM')}
