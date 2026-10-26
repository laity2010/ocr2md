/** Media preview-cell click must navigate the same CMD/CM6/MD/PDF path as a
 * normal Media AG row click, including when it crosses virtual chapters.
 * All checks run against real read-only Lab fixture and original 22-page PDF.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
const choose=async(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,opts] of [
  ['Chrome',chromium,{viewport:{width:1330,height:865}}],
  ['iPad WebKit',webkit,{viewport:{width:1040,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
].filter(([name])=>!process.env.OCR_TEST_BROWSER||name===process.env.OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage(opts),errors=[],writes=[],physical=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{
      const u=new URL(r.url());
      if(!['GET','HEAD'].includes(r.method())&&u.pathname.includes('/api/'))writes.push(u.pathname);
      if(u.pathname.endsWith('/api/document')&&u.searchParams.has('chapter'))physical.push(u.pathname);
    });
    await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>{
      window.__mediaFocus={views:e.detail.views,getMarkdown:e.detail.getMarkdown,getCMD:e.detail.getCMD};
    }));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:55000});
    await page.waitForFunction(()=>window.__mediaFocus?.getCMD?.()?.getIndex?.()?.chapters.length===6,
      null,{timeout:30000});
    const original=await page.evaluate(()=>window.__mediaFocus.getMarkdown());
    const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
    const all=page.locator('input[aria-label="章节所有"]');
    const element=page.locator('.ocr-lab-element-select');
    const far=await source.locator('optgroup:nth-child(2) option').nth(4).getAttribute('value');
    await choose(source,far);
    await page.waitForFunction(id=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===id,
      far,{timeout:15000});
    await all.check();
    await choose(element,'media');
    const pick=await page.evaluate(()=>{
      const {views,getCMD,getMarkdown}=window.__mediaFocus;
      const index=getCMD().getIndex(),api=views.media.api;
      const chapter=index.chapters[1]; // actual 001: five images
      for(let rowIndex=api.getDisplayedRowCount()-1;rowIndex>=0;rowIndex--){
        const row=api.getDisplayedRowAtIndex(rowIndex)?.data;
        if(!row?.line)continue;
        const owner=index.chapters.find(c=>c.startLine<=row.line&&row.line<c.endLine);
        if(owner?.id!==chapter.id)continue;
        const lines=getMarkdown().split('\n');
        let expectedPage=null;
        for(let i=row.line-1;i>=0;i--){
          const m=/minerujson:block:v1:(\d+):(\d+)/.exec(lines[i]);
          if(m){expectedPage=Number(m[1])+1;break;}
        }
        return {rowIndex,id:owner.id,line:row.line,expectedPage,url:row.url};
      }
      return null;
    });
    assert(pick?.expectedPage,'Need referenced media with PDF OCR block mapping');
    // The PDF is preheated before the AG click; it must retain location even
    // while the Markdown projection is the visible preview.
    await page.waitForFunction(()=>!document.querySelector('.ocr-preview-mode option[value="pdf"]')?.disabled,
      null,{timeout:base.startsWith('https:')?100000:45000});
    await page.evaluate(i=>window.__mediaFocus.views.media.api.ensureIndexVisible(i,'middle'),pick.rowIndex);
    const row=page.locator(`.ocr-media-grid .ag-row[row-index="${pick.rowIndex}"]`);
    await row.waitFor({state:'visible',timeout:15000});
    const thumb=row.locator('[col-id="preview"] a.ocr-media-preview-link');
    assert.equal(await thumb.getAttribute('aria-label'),`定位第 ${pick.line} 行媒体`);
    const pagesBefore=page.context().pages().length;
    await thumb.click({timeout:15000});
    assert.equal(page.context().pages().length,pagesBefore,'Normal thumbnail click must not open new tab');
    await page.waitForFunction(({id,line})=>{
      const state=window.__mediaFocus;
      return document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value==='virtual:'+id&&
        state&&document.querySelector('input[aria-label="章节所有"]')?.checked;
    },pick,{timeout:18000});
    await page.waitForFunction(line=>[...document.querySelectorAll('.ocr-markdown .ocr-outline-focused-element')]
      .some(el=>Number(el.dataset.sourceStart)<=line&&line<Number(el.dataset.sourceEnd)),
      pick.line,{timeout:18000});
    const cursor=await page.evaluate(()=>{
      const s=window.__mediaFocus;
      // Focus must be published from preview cell, not a stale row selection.
      return {chapter:document.querySelector('.ocr-source-pane .ocr-lab-file-select').value,
        module:document.querySelector('.ocr-lab-element-select').value,
        preview:document.querySelector('.ocr-markdown .ocr-outline-focused-element')?.textContent?.slice(0,90),
        cmScroll:document.querySelector('#editor .cm-scroller')?.scrollTop,
        line:s.views.media.api.getSelectedRows()[0]?.line};
    });
    assert.equal(cursor.line,pick.line,'Thumbnail should select its Media AG row');
    assert.equal(cursor.module,'media');
    await choose(page.locator('.ocr-preview-mode'),'pdf');
    await page.waitForFunction(pageNum=>Number(document.querySelector('.ocr-pdf-region-overlay')?.dataset.pdfPage)===pageNum,
      pick.expectedPage,{timeout:25000});
    assert.equal(await page.locator('.ocr-pdf-region-overlay').getAttribute('data-pdf-page'),String(pick.expectedPage));
    // Reverse direction: a real PDF block click must reselect the media item.
    await page.evaluate(()=>window.__mediaFocus.views.media.api.deselectAll());
    // The gold PDF overlay is noninteractive (pointer-events:none) and lives
    // outside the viewer's .pdfViewer event delegation. Click its real
    // on-screen coordinates to hit the underlying PDF canvas, never force
    // a synthetic click on the noninteractive overlay node.
    await page.locator('.ocr-pdf-region-overlay').scrollIntoViewIfNeeded();
    const pdfHit=await page.locator('.ocr-pdf-region-overlay').boundingBox();
    assert(pdfHit?.width>10&&pdfHit.height>10);
    await page.mouse.click(pdfHit.x+pdfHit.width/2,pdfHit.y+pdfHit.height/2);
    await page.waitForFunction(line=>window.__mediaFocus.views.media.api.getSelectedRows()[0]?.line===line,
      pick.line,{timeout:12000});
    // Reverse direction: a real Markdown block click follows the same AG row,
    // rather than publishing focus outward with no Media follower.
    await choose(page.locator('.ocr-preview-mode'),'md');
    await page.evaluate(()=>window.__mediaFocus.views.media.api.deselectAll());
    await page.locator('.ocr-markdown .ocr-outline-focused-element').first().click({timeout:16000});
    await page.waitForFunction(line=>window.__mediaFocus.views.media.api.getSelectedRows()[0]?.line===line,
      pick.line,{timeout:12000});
    // And the native CM6 caret: clicking inside the current media URL should
    // select the corresponding Media AG row without a new document or save.
    await page.evaluate(()=>window.__mediaFocus.views.media.api.deselectAll());
    const cmMediaLine=page.locator('#editor .cm-line').filter({hasText:pick.url}).first();
    await cmMediaLine.waitFor({state:'visible',timeout:14000});
    await cmMediaLine.click({position:{x:110,y:10},timeout:15000});
    await page.waitForFunction(line=>window.__mediaFocus.views.media.api.getSelectedRows()[0]?.line===line,
      pick.line,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.__mediaFocus.getMarkdown()),original);
    assert.deepEqual(physical,[]);
    assert.deepEqual(writes,[]);
    assert.deepEqual(errors,[]);
    assert.equal(await page.locator('#editor .cm-editor').count(),1);
    console.log('MEDIA_FOUR_PANE_FOCUS_PASS',name,JSON.stringify({
      line:pick.line,chapter:pick.id,pdfPage:pick.expectedPage,cmScroll:cursor.cmScroll,
      selectedMedia:true,mdHighlight:true,pdfBlock:true,noWrite:true}));
  }finally{await browser.close();}
}
