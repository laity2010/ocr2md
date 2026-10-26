/** Reproduce actual chapter/001 + 全部 + LaTeX user scenario.
 * Observe visible AG model across immediately and 700 ms deferred CMD reindex.
 * No global Save; Undo leaves test session unchanged. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const url=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
const choose=(locator,value)=>locator.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},value);
const pause=ms=>new Promise(done=>setTimeout(done,ms));
for(const [name,engine,options] of [
 ['Chrome',chromium,{viewport:{width:1330,height:865}}],
 ['iPad WebKit',webkit,{viewport:{width:1040,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(options);
  page.on('pageerror',err=>console.log('PAGE_ERROR',name,err.message));
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>window.__diag={read:e.detail.getMarkdown,port:e.detail.getCMD,views:e.detail.views}));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
  await page.waitForFunction(()=>window.__diag?.port()?.getIndex?.()?.chapters.length===6,null,{timeout:30000});
  const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const chapter=await source.locator('optgroup:nth-child(2) option').nth(1).getAttribute('value');
  await choose(source,chapter);
  const all=page.locator('input[aria-label="章节所有"]');
  if(process.env.OCR_DIAG_CHAPTER_ONLY!=='1')await all.check();
  await choose(page.locator('.ocr-lab-element-select'),'latex');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-review-select').length>0,null,{timeout:25000});
  const before=await page.evaluate(()=>window.__diag.read());
  const timeline=await page.evaluate(async()=>{
    const host=document.querySelector('.ocr-latex-grid'),api=window.__diag.views.latex.api;
    const snap=(t)=>({t,displayed:api.getDisplayedRowCount(),rowEls:host.querySelectorAll('.ag-center-cols-container .ag-row').length,
      selected:host.querySelector('.ocr-latex-review-select')?.value,
      all:document.querySelector('input[aria-label="章节所有"]')?.checked,
      filter:api.getFilterModel(),anyFilter:api.isAnyFilterPresent(),
      first:[...Array(Math.min(3,api.getDisplayedRowCount())).keys()].map(i=>api.getDisplayedRowAtIndex(i)?.data?.line),
      scroll:host.querySelector('.ag-body-viewport')?.scrollTop});
    const select=host.querySelector('.ag-row[row-index="1"] .ocr-latex-review-select')||host.querySelector('.ocr-latex-review-select');
    const changed=select.value==='latex'?'忽略':'latex';
    const samples=[snap('before')];
    const changes=[];
    api.addEventListener('modelUpdated',()=>changes.push(snap('modelUpdated')));
    select.value=changed;select.dispatchEvent(new Event('change',{bubbles:true}));
    samples.push(snap('sync'));
    for(const [name,delay] of [['20ms',20],['100ms',80],['300ms',200],['650ms',350],['950ms',300],['1400ms',450],['2200ms',800]]){
      await new Promise(r=>setTimeout(r,delay));samples.push(snap(name));
    }
    return {changed,samples,changes};
  });
  console.log('LATEX_REVIEW_FILTER_TIMELINE',name,JSON.stringify(timeline));
  const originalCount=timeline.samples[0].displayed;
  assert(originalCount>1,'Must start with multiple LaTeX entries');
  const drops=[...timeline.samples,...timeline.changes].filter(s=>s.displayed!==originalCount);
  assert.equal(drops.length,0,'LaTeX rows disappeared or changed membership during review: '+JSON.stringify(drops));
  assert.equal(timeline.samples.at(-1).displayed,originalCount);
  await page.locator('#undo').click();
  await page.waitForFunction(text=>window.__diag.read()===text,before,{timeout:18000});
 }finally{await browser.close();}
}
