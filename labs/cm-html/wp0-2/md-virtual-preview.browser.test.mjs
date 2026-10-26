/** WP5 real browser: absolute source lines survive chapter Markdown clipping,
 * original AG + CM6 focus and the *real* isolated source-backed PDF.js viewer.
 * No saved-document mutation or physical chapter IO is permitted.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
const choose=async(locator,value)=>locator.evaluate((el,next)=>{
  el.value=next;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1290,height:830}}],
  ['iPad WebKit',webkit,{viewport:{width:1032,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage(options);
    const errors=[],writes=[],physical=[];let pageLoads=0,pdfBytes=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',req=>{
      const url=new URL(req.url());
      if(req.resourceType()==='document')pageLoads++;
      if(url.pathname.endsWith('/api/document')&&url.searchParams.has('chapter'))physical.push(url.toString());
      if(!['GET','HEAD'].includes(req.method())&&url.pathname.includes('/api/'))writes.push(url.pathname);
      if(url.pathname.endsWith('/api/pdf'))pdfBytes++;
    });
    await page.addInitScript(()=>{
      window.__wp5Scope=null;
      document.addEventListener('ocr2md:wp4-virtual-scope',e=>{window.__wp5Scope=e.detail?.scope??null;});
      document.addEventListener('ocr2md:wp3-ag-ready',e=>{
        window.__wp5Read=e.detail.getMarkdown;window.__wp5Ag=e.detail.views;
      });
    });
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
    const index=page.locator('input[aria-label="CMD 虚拟索引"]');
    await index.waitFor({state:'visible',timeout:27000});
    const original=await page.evaluate(()=>window.__wp5Read());
    const md=page.locator('.ocr-markdown');
    assert((await md.textContent()).includes('Bufett’s Alpha'));
    const chapter=page.locator('.ocr-wp3-chapter-select');
    await index.check();
    await page.locator('input[aria-label="章节所有"]').uncheck();
    const ids=await chapter.locator('option').evaluateAll(xs=>xs.map(x=>x.value));
    assert.equal(ids.length,6);
    await choose(chapter,ids[1]);
    await page.waitForFunction(id=>window.__wp5Scope?.id===id&&
      document.querySelector('.ocr-markdown')?.textContent.includes('Buffett’s Alpha'),ids[1],{timeout:16000});
    await page.waitForTimeout(400);
    assert(!(await md.textContent()).includes('Bufett’s Alpha'),'First chapter leaked into chapter 001 MD');
    const location=await page.evaluate(()=>{
      const {from,to}=window.__wp5Scope;
      const src=window.__wp5Read();
      const first=src.slice(0,from).split('\n').length;
      const last=src.slice(0,to).split('\n').length;
      const spans=[...document.querySelectorAll('.ocr-markdown [data-source-start][data-source-end]')]
        .map(x=>[Number(x.dataset.sourceStart),Number(x.dataset.sourceEnd)]);
      return {first,last,spans,from,to};
    });
    assert(location.spans.length>10,'Chapter Markdown lost token mapping');
    assert(location.spans.every(([a,b])=>a>=location.first&&b<=location.last+1&&b>a),
      'Markdown token source lines are relative, not full-document lines');
    // Click the chapter heading in MD; the original AG row must follow.
    const heading=md.locator('h1[data-source-start]').first();
    await heading.click();
    await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-row-selected'),null,{timeout:16000});
    const highlight=await heading.getAttribute('class');
    assert(highlight?.includes('ocr-outline-focused-element'),'Preview did not react to own focus');
    // AG title row -> Markdown location (no substring projection), preserving
    // the absolute source coordinate used by CM6 and PDF.
    const titleRow=page.locator('.ocr-outline-grid .ag-row[row-index="1"]');
    await titleRow.locator('[col-id="title"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-markdown .ocr-outline-focused-element')]
      .some(x=>Number(x.dataset.sourceStart)>0),null,{timeout:16000});
    // Real PDF.js should be ready from the isolated 22-page original PDF.
    await page.waitForFunction(()=>!document.querySelector('.ocr-preview-mode option[value="pdf"]')?.disabled,
      null,{timeout:45000});
    const previewMode=page.locator('.ocr-preview-mode');
    await choose(previewMode,'pdf');
    const input=page.locator('.ocr-pdf-page');
    await input.waitFor({state:'visible'});
    await input.fill('20');
    await input.dispatchEvent('change');
    await page.waitForFunction(id=>window.__wp5Scope?.id===id,ids[4],{timeout:18000});
    await page.waitForFunction(()=>{
      const scope=window.__wp5Scope,source=window.__wp5Read?.();
      if(!scope||!source)return false;
      const first=source.slice(0,scope.from).split('\n').length;
      const previewFirst=Number(document.querySelector('.ocr-markdown [data-source-start]')?.dataset.sourceStart);
      return Number.isInteger(previewFirst)&&previewFirst>=first;
    },null,{timeout:18000});
    const pdfScope=await page.evaluate(()=>{
      const scope=window.__wp5Scope;
      const source=window.__wp5Read();
      return {id:scope.id,page:document.querySelector('.ocr-pdf-page')?.value,
        firstLine:source.slice(0,scope.from).split('\n').length,
        previewStart:Number(document.querySelector('.ocr-markdown [data-source-start]')?.dataset.sourceStart)};
    });
    assert(pdfScope.previewStart>=pdfScope.firstLine,'PDF jumped to chapter but MD preview did not remap');
    assert.equal(await page.evaluate(()=>window.__wp5Read()),original);
    // Undo/Redo and file sessions remain outside this read-only task.
    await page.locator('input[aria-label="章节所有"]').check();
    await page.waitForFunction(()=>window.__wp5Scope===null &&
      document.querySelector('.ocr-markdown')?.textContent.includes('Bufett’s Alpha'),null,{timeout:18000});
    assert.deepEqual(errors,[]);
    assert.deepEqual(writes,[]);
    assert.deepEqual(physical,[]);
    assert.equal(pageLoads,1);
    assert.equal(pdfBytes,1,'PDF reloaded during virtual chapter switch');
    console.log('WP5_FOUR_PANE_PASS',name,JSON.stringify({
      chapters:ids.length,sourceLines:location.spans.length,headingClick:true,agToMd:true,
      pdfChapter:pdfScope.id,pdfPage:pdfScope.page,pdfFetchedOnce:true,
      physicalChapterLoads:physical.length,sourceUnchanged:true,
    }));
  }finally{await browser.close();}
}
