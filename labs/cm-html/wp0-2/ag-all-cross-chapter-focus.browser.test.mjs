/** AG 全部: selecting an out-of-scope native AG row must atomically
 * switch the source navigator's virtual chapter, keep All enabled, and
 * replay the identical global source line to CM6/MD/PDF followers.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
const choose=(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,device] of [
 ['Chrome',chromium,{viewport:{width:1330,height:865}}],
 ['iPad WebKit',webkit,{viewport:{width:1040,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(device);
  const errors=[],physical=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    const url=new URL(r.url());
    if(url.pathname.endsWith('/api/document')&&url.searchParams.has('chapter'))
      physical.push(url.toString());
    if(!['GET','HEAD'].includes(r.method())&&url.pathname.includes('/api/'))
      writes.push(url.pathname);
  });
  await page.addInitScript(()=>{
    document.addEventListener('ocr2md:wp3-ag-ready',e=>{
      window.__cross={
        views:e.detail.views,getCMD:e.detail.getCMD,getMarkdown:e.detail.getMarkdown,
      };
    });
    window.__crossOpen=[];
    document.addEventListener('ocr2md:lab-virtual-open',e=>
      window.__crossOpen.push({id:e.detail.id,preserveAll:e.detail.preserveAll}));
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:55000});
  await page.waitForFunction(()=>window.__cross?.getCMD?.()?.getIndex?.()?.chapters.length===6,
    null,{timeout:30000});
  const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const element=page.locator('.ocr-lab-element-select');
  const all=page.locator('input[aria-label="章节所有"]');
  const id001=await source.locator('optgroup:nth-child(2) option').nth(1).getAttribute('value');
  const original=await page.evaluate(()=>window.__cross.getMarkdown());
  await choose(source,id001);
  await page.waitForFunction(v=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===v &&
    document.querySelectorAll('.ocr-wp4-hidden-section').length>0,id001,{timeout:21000});
  await all.check();
  assert(await all.isChecked());
  const cases=[];
  // Exercise both business AG row-click origins and their different schemas.
  for(const [kind,host] of [
    ['media','.ocr-media-grid'],
    ['latex','.ocr-latex-grid'],
    ['chapter-boundary','.ocr-outline-grid'],
  ]){
    await choose(element,kind);
    if(kind==='chapter-boundary'){
      // The actual PDF.js viewer remains on the original continuous PDF.
      // Switch it on before the distant outline click so the active overlay
      // (not just MD focus) proves that the PDF follows the same source line.
      // Cloudflare round trips can delay PDF.js preheat on iPad WebKit.
      // Do not relax focus/page assertions; only bound the remote warmup.
      const pdfWarmupTimeout=base.startsWith('https://')?100000:40000;
      await page.waitForFunction(()=>!document.querySelector(
        '.ocr-preview-mode option[value="pdf"]')?.disabled,null,{timeout:pdfWarmupTimeout});
      await choose(page.locator('.ocr-preview-mode'),'pdf');
    }
    const gridName=kind==='chapter-boundary'?'outline':kind;
    const pick=await page.evaluate(gridName=>{
      const {views,getCMD}=window.__cross;
      const index=getCMD().getIndex();
      const api=views[gridName].api;
      for(let rowIndex=api.getDisplayedRowCount()-1;rowIndex>=0;rowIndex--){
        const row=api.getDisplayedRowAtIndex(rowIndex)?.data;
        if(!row)continue;
        const line=gridName==='outline'?row.sourceLine:row.line;
        const owner=index.chapters.find(c=>c.startLine<=line&&line<c.endLine);
        // Target a chapter other than 001, favour a distant location so
        // the viewport and PDF page must both move.
        if(owner&&owner.id!=='mineru:1:1:0'&&owner.id!==index.chapters[1].id)
          return {rowIndex,line,id:owner.id,value:row.id};
      }
      return null;
    },gridName);
    assert(pick,kind+' should have an out-of-chapter row');
    // Go back to chapter 001 so each click tests cross-chapter navigation.
    if(await source.inputValue()!==id001)await choose(source,id001);
    await page.waitForFunction(id=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===id,
      id001,{timeout:13000});
    // Explicit source-file dropdown selects chapter-only AG by design.
    // The user can re-enable 全部 to pick another chapter.
    if(!(await all.isChecked()))await all.check();
    const apiKey=kind==='chapter-boundary'?'outline':kind;
    await page.evaluate(({apiKey,rowIndex})=>{
      window.__cross.views[apiKey].api.ensureIndexVisible(rowIndex,'middle');
    },{apiKey,rowIndex:pick.rowIndex});
    const row=page.locator(host+' .ag-row[row-index="'+pick.rowIndex+'"]').first();
    await row.waitFor({state:'visible',timeout:12000});
    const clickable=kind==='chapter-boundary'?row.locator('[col-id="title"]').first():
      kind==='media'?row.locator('[col-id="line"]').first():row.locator('[col-id="line"]').first();
    await clickable.click({timeout:15000});
    await page.waitForFunction(id=>
      document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value==='virtual:'+id,
      pick.id,{timeout:22000});
    assert(await all.isChecked(),'All must survive AG cross-chapter navigation');
    assert.equal(await element.inputValue(),kind,'AG element module should remain unchanged');
    await page.waitForFunction(line=>[...document.querySelectorAll(
      '.ocr-markdown .ocr-outline-focused-element[data-source-start]')].some(el=>
       Number(el.dataset.sourceStart)<=line&&line<Number(el.dataset.sourceEnd)),
      pick.line,{timeout:18000});
    assert((await page.locator('.ocr-wp4-hidden-section').count())>0);
    assert.equal(await page.evaluate(()=>window.__cross.getMarkdown()),original);
    const clicked=await page.evaluate(()=>window.__crossOpen.at(-1));
    assert.deepEqual(clicked,{id:pick.id,preserveAll:true});
    if(kind==='chapter-boundary'){
      await page.waitForFunction(()=>Number(document.querySelector(
        '.ocr-pdf-region-overlay')?.dataset.pdfPage)>=18,
        null,{timeout:23000});
      const pdfRegion=await page.locator('.ocr-pdf-region-overlay').getAttribute('data-pdf-page');
      assert.equal(pdfRegion,'22','AG focus did not target the last original PDF page');
    }
    cases.push({module:kind,from:id001,to:pick.id,line:pick.line});
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(physical,[]);
  assert.deepEqual(writes,[]);
  assert.equal(await page.locator('#editor .cm-editor').count(),1);
  console.log('AG_ALL_CROSS_CHAPTER_FOCUS_PASS',name,JSON.stringify({
    clicks:cases,allPreserved:true,threeAGs:true,
    globalSourceCoordinates:true,previewHighlight:true,
    noPhysicalChapterReads:true,noApiWrites:true,sourceUnchanged:true,
  }));
 }finally{await browser.close();}
}
