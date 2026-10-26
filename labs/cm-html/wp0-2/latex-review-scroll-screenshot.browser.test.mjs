/** Actual user path: virtual chapter/001, AG all, LaTeX review click,
 * Markdown scrolled to middle BEFORE and AFTER async chapter re-index. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
const savedir='audit-reports/screenshots';
const engines=[['Chrome',chromium,{viewport:{width:1440,height:900},deviceScaleFactor:1}],['iPad-WebKit',webkit,{viewport:{width:1100,height:880},isMobile:true,hasTouch:true,deviceScaleFactor:1}]];
for(const [name,engine,options] of engines.filter(([n])=>!process.env.OCR_TEST_BROWSER||n===process.env.OCR_TEST_BROWSER)){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(options);
  page.on('pageerror',e=>console.log('PAGE_ERR',name,e.message));
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>window.__labReview={source:e.detail.getMarkdown,views:e.detail.views}));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:65000});
  await page.waitForFunction(()=>window.__labReview?.views?.latex?.api,null,{timeout:30000});
  const file=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const chapter=await file.locator('optgroup:nth-child(2) option').nth(1).getAttribute('value');
  await file.evaluate((el,val)=>{el.value=val;el.dispatchEvent(new Event('change',{bubbles:true}));},chapter);
  await page.waitForTimeout(900);
  const all=page.locator('input[aria-label="章节所有"]');
  if(!await all.isChecked())await all.check();
  await page.locator('.ocr-lab-element-select').evaluate(el=>{el.value='latex';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.locator('.ocr-latex-grid .ocr-latex-review-select').first().waitFor({state:'visible',timeout:20000});
  const pane=page.locator('.ocr-preview-md-scroll');
  await page.waitForFunction(()=>{
    const pane=document.querySelector('.ocr-preview-md-scroll');
    return pane&&pane.scrollHeight>pane.clientHeight*2;
  },null,{timeout:15000});
  await page.evaluate(()=>{
    const pane=document.querySelector('.ocr-preview-md-scroll');
    const protoDesc=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
    const log=window.__scrollLog=[];
    if(protoDesc?.get&&protoDesc?.set){
      Object.defineProperty(pane,'scrollTop',{
        configurable:true,get(){return protoDesc.get.call(this);},
        set(value){log.push({t:Math.round(performance.now()),kind:'setter',value,
          stack:new Error().stack?.split('\n').slice(1,5).join(' / ')});
          protoDesc.set.call(this,value);},
      });
    }
    pane.addEventListener('scroll',()=>log.push({t:Math.round(performance.now()),kind:'scroll',value:pane.scrollTop}),{passive:true});
    document.addEventListener('ocr2md:wp4-virtual-scope',event=>log.push({t:Math.round(performance.now()),kind:'scope',
      reason:event.detail?.reason,range:event.detail?.scope && [event.detail.scope.from,event.detail.scope.to]}));
  });
  // User-like scrolling of the real preview viewport, independent of source.
  await pane.hover();
  await page.mouse.wheel(0,840);
  await page.waitForTimeout(550);
  const before=await page.evaluate(()=>{
    const md=document.querySelector('.ocr-preview-md-scroll');
    return {scrollTop:md.scrollTop,scrollHeight:md.scrollHeight,height:md.clientHeight,
      firstSource:document.querySelector('.ocr-markdown [data-source-start]')?.dataset.sourceStart,
      currentScope:document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value,
      count:window.__labReview.views.latex.api.getDisplayedRowCount(),
      status:document.querySelector('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select')?.value};
  });
  assert(before.scrollTop>80,'Need meaningful scrolled position to detect regression');
  await page.screenshot({path:`${savedir}/latex-scroll-${name}-before.png`,animations:'disabled'});
  const select=page.locator('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select');
  await select.click({timeout:16000}); // actual pointer click on the review control
  await select.selectOption('latex');
  const timeline=[];
  for(const [label,time] of [['immediate',15],['100ms',100],['350ms',250],['850ms',500],['1450ms',600],['2200ms',750]]){
    await page.waitForTimeout(time);
    timeline.push(await page.evaluate(label=>({label,scrollTop:document.querySelector('.ocr-preview-md-scroll')?.scrollTop,
      height:document.querySelector('.ocr-preview-md-scroll')?.scrollHeight,
      count:window.__labReview.views.latex.api.getDisplayedRowCount(),
      currentScope:document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value}),label));
  }
  await page.screenshot({path:`${savedir}/latex-scroll-${name}-after.png`,animations:'disabled'});
  console.log('LATEX_SCROLL_BEFORE_AFTER',name,JSON.stringify({before,timeline,trace:await page.evaluate(()=>window.__scrollLog)}));
  // The review changes CM6 source in memory, but must not move the preview.
  const minimum=Math.min(...timeline.map(x=>x.scrollTop));
  assert(minimum>before.scrollTop-40,`Review jumped Markdown backwards ${before.scrollTop} -> ${minimum}`);
  assert(Math.max(...timeline.map(x=>x.scrollTop))<before.scrollTop+160,'Review moved Markdown far forward');
  await page.locator('#undo').click();
 }finally{await browser.close();}
}
