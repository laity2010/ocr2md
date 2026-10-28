/** Shared MD/PDF viewer splits into two Dockview peers without reinitializing PDF.js. */
import {selectPreview} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const path=resolve(`.v6/tests/preview-split-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
writeFileSync(path,fixture);
const port=5265,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
 '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:path},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['iPad WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
try{
 let ready=false;for(let i=0;i<140;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(120)}
 assert(ready,'isolated dev server unavailable');
 for(const [name,engine,launch] of engines){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let pdfRequests=0;page.on('request',r=>{if(r.url().includes('/api/pdf')&&!r.url().includes('map'))pdfRequests++});
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__v6cm6?.pdf?.ready &&
     window.__v6cm6?.outline?.rows.length===21 &&
     document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,
     null,{timeout:80000});
   const initial=await page.evaluate(()=>{
    window.__originalPdf=window.__v6cm6.pdf;
    window.__originalCanvas=document.querySelector('.pdfViewer');
    window.__originalMd=document.querySelector('.ocr-preview-md-scroll');
    return {groups:document.querySelectorAll('.dv-groupview').length,
      checked:document.querySelector('.ocr-preview-split-toggle input').checked,
      pdfView:window.__v6cm6.pdf,mode:document.querySelector('.ocr-preview-mode').value,
      docSize:window.__v6cm6.view.state.doc.length};
   });
   assert.equal(initial.groups,3);assert.equal(initial.checked,false);assert.equal(initial.mode,'md');
   await page.locator('.ocr-preview-split-toggle input').check();
   await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===4&&
     document.querySelector('.ocr-detached-pdf-pane .pdfViewer'),null,{timeout:20000});
   await page.waitForTimeout(850);
   const split=await page.evaluate(()=>{
    const rect=el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {groups:document.querySelectorAll('.dv-groupview').length,
      pdfSame:window.__originalPdf===window.__v6cm6.pdf,
      viewerSame:window.__originalCanvas===document.querySelector('.pdfViewer'),
      mdSame:window.__originalMd===document.querySelector('.ocr-preview-md-scroll'),
      checked:document.querySelector('.ocr-preview-split-toggle input').checked,
      selectDisabled:document.querySelector('.ocr-preview-mode').disabled,
      source:rect(document.querySelector('.ocr-source-pane')),
      md:rect(document.querySelector('.ocr-preview-pane')),
      pdf:rect(document.querySelector('.ocr-detached-pdf-pane')),
      pdfPort:rect(document.querySelector('.ocr-pdf-scroller')),
      pdfStatus:document.querySelector('.ocr-pdf-status').textContent,
      mdVisible:getComputedStyle(document.querySelector('.ocr-preview-md-scroll')).visibility,
      pdfVisible:getComputedStyle(document.querySelector('.ocr-preview-pdf-host')).visibility,
      pdfToolbar:document.querySelector('.ocr-pdf-tools').closest('.ocr-detached-pdf-pane')!==null,
      docSize:window.__v6cm6.view.state.doc.length};
   });
   console.log('PREVIEW_SPLIT_MEASURE',name,JSON.stringify(split));
   assert.equal(split.groups,4);
   assert(split.pdfSame&&split.viewerSame&&split.mdSame);
   assert(split.checked&&split.selectDisabled&&split.pdfToolbar);
   assert.equal(split.pdfStatus,'就绪');
   assert.equal(split.mdVisible,'visible');assert.equal(split.pdfVisible,'visible');
   assert(split.pdf.width>100&&split.md.width>100);
   assert(split.pdf.left>=split.md.right-4,'PDF should stand immediately right of Markdown preview');
   assert(Math.abs(split.md.top-split.pdf.top)<5,'PDF/MD should be in parallel at same top');
   assert(split.docSize===initial.docSize,'split must not touch document data');
   const controls=await page.evaluate(()=>{
     const bar=document.querySelector('.ocr-detached-pdf-toolbar').getBoundingClientRect();
     return ['.ocr-pdf-minus','.ocr-pdf-fit','.ocr-pdf-plus','.ocr-pdf-page'].map(sel=>{
       const r=document.querySelector(sel).getBoundingClientRect();
       return {name:sel,visible:r.width>10&&r.left>=bar.left-2&&r.right<=bar.right+2,
         right:r.right,barRight:bar.right};
     });
   });
   assert(controls.every(v=>v.visible),`${name} PDF controls clipped: ${JSON.stringify(controls)}`);
   await page.setViewportSize({width:834,height:642});
   await page.waitForTimeout(380);
   const portrait=await page.evaluate(()=>{
     const md=document.querySelector('.ocr-preview-pane').getBoundingClientRect();
     const pdf=document.querySelector('.ocr-detached-pdf-pane').getBoundingClientRect();
     return {mdWidth:md.width,pdfWidth:pdf.width,pdfLeft:pdf.left,mdRight:md.right};
   });
   assert(portrait.mdWidth>120&&portrait.pdfWidth>120&&
     portrait.pdfLeft>=portrait.mdRight-4,'narrow iPad PDF/MD stopped being parallel');
   await page.setViewportSize({width:1032,height:642});
   await page.waitForTimeout(350);
   await page.screenshot({path:`.v6/evidence/preview-split-${name==='Chrome'?'chrome':'ipad-webkit'}.png`,timeout:20000});
   await page.locator('.ocr-pdf-plus').click();
   const zoom=await page.locator('.ocr-pdf-zoom').textContent();
   await page.locator('.ag-row[row-index="4"] [col-id="title"]').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]'),null,{timeout:20000});
   const selected=await page.evaluate(()=>document.querySelector('.ocr-pdf-region-overlay')?.dataset.blockIndex);
   assert(selected,'AG click must still locate PDF block in split mode');
   await page.locator('.ocr-preview-split-toggle input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===3 &&
     document.querySelector('.ocr-preview-pane .pdfViewer'),null,{timeout:20000});
   const merged=await page.evaluate(()=>({
     samePdf:window.__originalPdf===window.__v6cm6.pdf,
     sameCanvas:window.__originalCanvas===document.querySelector('.pdfViewer'),
     pdfHost:!!document.querySelector('.ocr-preview-pane .ocr-preview-pdf-host'),
     toolbar:document.querySelector('.ocr-pdf-tools').parentElement.dataset.mode,
     checked:document.querySelector('.ocr-preview-split-toggle input').checked,
     selectEnabled:!document.querySelector('.ocr-preview-mode').disabled,
     mdVisible:getComputedStyle(document.querySelector('.ocr-preview-md-scroll')).visibility,
     groups:document.querySelectorAll('.dv-groupview').length}));
   assert.deepEqual(merged,{samePdf:true,sameCanvas:true,pdfHost:true,toolbar:'pdf',
     checked:false,selectEnabled:true,mdVisible:'visible',groups:3});
   await selectPreview(page,'pdf');
   await page.waitForFunction(()=>getComputedStyle(document.querySelector('.ocr-preview-pdf-host')).visibility==='visible');
   assert.equal(await page.locator('.ocr-pdf-zoom').textContent(),zoom,'PDF zoom should survive merge');
   // Toggle while the combined preview currently shows PDF, not just MD.
   await page.locator('.ocr-preview-split-toggle input').check();
   await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===4,null,{timeout:16000});
   await page.locator('.ocr-preview-split-toggle input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===3,null,{timeout:16000});
   assert.deepEqual(errors,[]);
   assert.deepEqual(readFileSync(path),fixture,'split must not modify fixture on disk');
   console.log('PREVIEW_SPLIT_PASS',name,JSON.stringify({groups:'3 → 4 → 3 → 4 → 3',
     pdfSingleInstance:true,zoomPreserved:true,pdfFocus:true,sourceUntouched:true,pdfRequests,errors:errors.length}));
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM');unlinkSync(path)}
