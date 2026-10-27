/** Real WCP four-pane / PDF.js integration, on explicitly isolated Lab origin. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL;
if(!/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/labs\/cm-html\/$/.test(base||''))
  throw Error('Explicit isolated Lab URL required');
const choose=(sel,value)=>sel.evaluate((el,v)=>{
  el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,opts] of [
 ['Chromium',chromium,{viewport:{width:1330,height:860}}],
 ['iPad WebKit',webkit,{viewport:{width:1040,height:780},hasTouch:true,isMobile:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try {
  const page=await browser.newPage(opts);
  const errors=[],escapes=[],writes=[];let pdfReads=0,documentLoads=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    const url=new URL(r.url());
    if(url.pathname.endsWith('/api/pdf'))pdfReads++;
    if(r.resourceType()==='document')documentLoads++;
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/'))escapes.push(url.pathname);
    if(!['GET','HEAD'].includes(r.method())&&url.pathname.includes('/api/'))writes.push(url.pathname);
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  const nav=page.locator('.ocr-source-pane .ocr-lab-file-select');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length===6,null,{timeout:28000});
  const chapter=await nav.locator('optgroup:nth-child(2) option').nth(1).getAttribute('value');
  await choose(nav,chapter);
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section').length>0,null,{timeout:16000});
  await page.waitForFunction(()=>document.querySelector('.ocr-preview-mode option[value="pdf"]')?.disabled===false,null,{timeout:45000});
  const mode=page.locator('.ocr-preview-mode');
  await choose(mode,'pdf');
  await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='pdf',null,{timeout:12000});
  const rows=page.locator('.ocr-outline-grid .ag-row');
  await rows.first().waitFor({state:'attached',timeout:12000});
  await page.locator('.ocr-outline-grid .ag-row [col-id="title"]').first().click();
  await page.waitForFunction(()=>Number(document.querySelector('.ocr-pdf-region-overlay')?.dataset.pdfPage)>0,null,{timeout:22000});
  const pdfPage=Number(await page.locator('.ocr-pdf-region-overlay').getAttribute('data-pdf-page'));
  assert(pdfPage>=1&&pdfPage<=22,'Original 22-page PDF mapping invalid');
  await choose(mode,'md');
  await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='md',null,{timeout:9000});
  const heading=page.locator('.ocr-markdown h1[data-source-start]').first();
  await heading.waitFor({state:'visible',timeout:14000});
  await heading.click();
  await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-row-selected'),null,{timeout:12000});
  assert((await heading.getAttribute('class')||'').includes('ocr-outline-focused-element'));
  assert.equal(await page.locator('#editor .cm-editor').count(),1);
  assert.equal(pdfReads,1,'Original PDF re-fetched during virtual chapter navigation');
  assert.equal(documentLoads,1,'Page reloaded on virtual chapter navigation');
  assert.deepEqual(errors,[]);
  assert.deepEqual(escapes,[]);
  assert.deepEqual(writes,[]);
  console.log('WCP_FOUR_PANE_PDF_PASS',name,JSON.stringify({
    pdfPage,pdfFetchedOnce:true,pdfAndMDFocus:true,
    editorInstances:1,documentLoads,escapedRequests:0,writes:0
  }));
 } finally {await browser.close();}
}
