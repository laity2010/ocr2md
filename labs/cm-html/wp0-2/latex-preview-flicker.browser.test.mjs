/** Lab review -> KaTeX cell and Markdown DOM identity regression. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
for(const [name,engine,options] of [
 ['Chrome',chromium,{viewport:{width:1320,height:840}}],
 ['iPad WebKit',webkit,{viewport:{width:1040,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
].filter(([name])=>!process.env.OCR_TEST_BROWSER||name===process.env.OCR_TEST_BROWSER)){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(options),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.includes('/api/'))writes.push(r.url());});
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>window.__flicker={read:e.detail.getMarkdown,views:e.detail.views}));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:55000});
  await page.waitForFunction(()=>window.__flicker?.views?.latex?.api,null,{timeout:24000});
  const original=await page.evaluate(()=>window.__flicker.read());
  await page.locator('.ocr-lab-element-select').evaluate(e=>{e.value='latex';e.dispatchEvent(new Event('change',{bubbles:true}));});
  const select=page.locator('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select');
  await select.waitFor({state:'visible',timeout:20000});
  const before=await page.evaluate(()=>{
    const grid=document.querySelector('.ocr-latex-grid'),row=grid.querySelector('.ag-row[row-index="1"]');
    const preview=row.querySelector('[col-id="preview"] .ocr-latex-preview');
    const body=document.querySelector('.ocr-markdown');
    const parent=body?.parentElement;
    if(!preview||!body)throw Error('Preview missing');
    window.__flickerBefore={preview,html:preview.innerHTML,mdFirst:body.firstElementChild,mdHTML:body.innerHTML,
      body,scroll:parent.scrollTop};
    const count={mdChildChanges:0,previewRemovals:0,mdMutations:0};
    const observer=new MutationObserver(records=>{for(const rec of records){
      if(rec.target===body && rec.type==='childList')count.mdChildChanges++;
      if(rec.target===preview.parentElement && rec.removedNodes.length)count.previewRemovals++;
      if(body.contains(rec.target)||rec.target===body)count.mdMutations++;
    }});
    observer.observe(body,{childList:true,subtree:true,attributes:true});
    observer.observe(preview.parentElement,{childList:true});
    window.__flickerCount=count;window.__flickerObserver=observer;
    return {line:Number(row.querySelector('.ocr-latex-review-select').getAttribute('aria-label')?.match(/\d+/)?.[0]),status:row.querySelector('.ocr-latex-review-select').value,
      previewHTML:preview.innerHTML.length,markdownHTML:body.innerHTML.length,mdStarts:body.querySelectorAll('[data-source-start]').length};
  });
  const choice=before.status==='latex'?'忽略':'latex';
  await select.selectOption(choice);
  await page.waitForFunction(({length,choice})=>window.__flicker.read().length!==length&&
    document.querySelector('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select')?.value===choice,
  {length:original.length,choice},{timeout:16000});
  await page.waitForTimeout(1300);
  const after=await page.evaluate(()=>{
    const b=window.__flickerBefore,grid=document.querySelector('.ocr-latex-grid'),row=grid.querySelector('.ag-row[row-index="1"]');
    const preview=row.querySelector('[col-id="preview"] .ocr-latex-preview'),body=document.querySelector('.ocr-markdown');
    window.__flickerObserver.disconnect();
    return {samePreview:preview===b.preview,previewHTMLUnchanged:preview?.innerHTML===b.html,
      sameMdFirst:body.firstElementChild===b.mdFirst,mdHTMLUnchanged:body.innerHTML===b.mdHTML,
      beforeScroll:b.scroll,afterScroll:body.parentElement.scrollTop,events:window.__flickerCount,
      displayed:window.__flicker.views.latex.api.getDisplayedRowCount()};
  });
  console.log('LATEX_PREVIEW_FLICKER_DIAG',name,JSON.stringify({before,after}));
  await page.locator('#undo').click();
  await page.waitForFunction(text=>window.__flicker.read()===text,original,{timeout:16000});
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  assert(after.samePreview,'unchanged KaTeX AG preview unnecessarily remounted');
  assert(after.sameMdFirst,'unmodified Markdown beginning remounted');
  console.log('LATEX_PREVIEW_FLICKER_PASS',name);
 }finally{await browser.close();}
}
