/** Live sealed 402-row reviewer: gutter geometry and scroll-loop regression.
 * Browser URL can be overridden for isolated deployments. Uses real Lab data.
 */
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const url=process.env.OCR2MD_REVIEW_URL||
  'http://127.0.0.1:4412/labs/sentence-benchmark/translation-review.html';
for(const [name,engine,binary] of [
  ['Chromium',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]
]){
  const browser=await engine.launch({headless:true,
    ...(binary?{executablePath:binary}:{})});
  try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1130,height:820}});
    const pageErrors=[];
    page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent
      .includes('单语 MD 重组无损 PASS'),null,{timeout:130000});
    const initial=await page.evaluate(()=>({
      records:document.querySelectorAll('#record-picker option').length,
      images:document.querySelectorAll('.ocr-tr-reader-scroll img').length,
      math:document.querySelectorAll('.ocr-tr-reader-scroll .katex').length,
      callouts:document.querySelectorAll('.ocr-tr-reader-scroll details.ocr-callout').length,
      table:document.querySelectorAll('.ocr-tr-reader-scroll table').length,
      gutterUnits:document.querySelectorAll('.ocr-tr-reader-unit-id').length,
      lineLabels:document.querySelectorAll('.ocr-tr-reader-line-number').length,
      anchors:document.querySelectorAll('.ocr-tr-reader-scroll [data-unit-id]').length,
    }));
    assert.equal(initial.records,402);
    assert.equal(initial.gutterUnits,402);
    assert(initial.lineLabels>=402);
    assert.equal(initial.anchors,402);
    assert.equal(initial.images,18);
    assert(initial.math>=40);
    assert.equal(initial.callouts,7);
    assert(initial.table>=9);

    // Explicit navigation is permitted to center the clicked sentence.
    const id=await page.locator('#record-picker option').nth(350).getAttribute('value');
    await page.locator('#record-picker').selectOption(id);
    await page.waitForTimeout(850);
    const geometry=await page.evaluate(id=>{
      const marker=document.querySelector(`.ocr-tr-reader-marker [data-gutter-unit="${id}"]`)?.parentElement;
      const block=document.querySelector(`.ocr-tr-reader-scroll [data-unit-id="${id}"]`);
      return {delta:marker.getBoundingClientRect().top-block.getBoundingClientRect().top,
        marked:document.querySelectorAll('.ocr-tr-reader-marker-current').length,
        sourceLine:marker.dataset.sourceLine,
        title:marker.textContent};
    },id);
    assert(Math.abs(geometry.delta)<3,'gutter must align to the rendered text Y');
    assert.equal(geometry.marked,1);
    assert(geometry.title.includes(id));
    assert.equal(await page.locator('.ocr-tr-reader-current').count(),1);
    assert.equal(await page.locator('.ocr-tr-current').count(),2);
    const chosen=await page.locator('#record-picker').inputValue();

    // User gesture + scroll observation must not invoke another pane reveal.
    const before=await page.locator('.ocr-tr-reader-scroll').evaluate(el=>{
      const next=Math.max(0,Math.min(el.scrollHeight-el.clientHeight,el.scrollTop+430));
      el.dispatchEvent(new Event('pointerdown',{bubbles:true}));
      el.scrollTop=next;
      return next;
    });
    await page.waitForTimeout(300);
    const after=await page.locator('.ocr-tr-reader-scroll').evaluate(el=>el.scrollTop);
    await page.waitForTimeout(850);
    const settled=await page.locator('.ocr-tr-reader-scroll').evaluate(el=>el.scrollTop);
    assert(Math.abs(after-before)<12,`user scroll jumped on first sync: ${before} -> ${after}`);
    assert(Math.abs(settled-after)<12,`feedback scroll loop: ${after} -> ${settled}`);
    assert.equal(await page.locator('#record-picker').inputValue(),chosen,
      'scroll must not change the selected sentence ID');
    assert.equal(await page.locator('.ocr-tr-reader-marker-current [data-gutter-unit]')
      .getAttribute('data-gutter-unit'),chosen,
      'reader highlight must remain on the explicitly selected sentence');
    assert.equal(await page.locator('.ocr-tr-reader-marker-current').count(),1);
    assert.equal(await page.locator('.ocr-tr-reader-current').count(),1);

    // Main's shared Floating UI footnote component: no hash jump on a
    // citation click, note content in one popup, explicit locate and return.
    const ref=page.locator('.ocr-tr-reader-scroll sup.footnote-ref a[href^="#fn"]').first();
    assert(await ref.count()>0,'real document must include a visible note reference');
    await ref.scrollIntoViewIfNeeded();
    const beforeNote=await page.evaluate(()=>({
      hash:location.hash,
      top:document.querySelector('.ocr-tr-reader-scroll').scrollTop,
      selected:document.querySelector('#record-picker').value,
    }));
    await ref.click();
    const card=page.locator('.ocr-footnote-popover');
    await card.waitFor({state:'visible'});
    assert((await card.locator('.ocr-footnote-card-content').textContent()).trim().length>10,
      'Main popover must contain the real note body');
    assert.equal(await card.count(),1);
    assert.equal(await page.evaluate(()=>location.hash),beforeNote.hash,'footnote clicked hash');
    assert(Math.abs((await page.locator('.ocr-tr-reader-scroll').evaluate(el=>el.scrollTop))-
      beforeNote.top)<3,'footnote clicked scrolled the preview');
    assert.equal(await page.locator('#record-picker').inputValue(),beforeNote.selected);
    const locate=card.getByRole('button',{name:'定位注文'});
    assert(await locate.isVisible(),'real note must expose Main note-locate action');
    await locate.click();
    assert.equal(await card.isVisible(),false);
    const back=page.getByRole('button',{name:'↩ 返回注引'});
    assert(await back.isVisible());
    await back.click();
    assert.equal(await back.isVisible(),false);
    assert(Math.abs((await page.locator('.ocr-tr-reader-scroll').evaluate(el=>el.scrollTop))-
      beforeNote.top)<3,'return to citation must restore exact reading scroll');
    assert.equal(await page.locator('#record-picker').inputValue(),chosen);
    await ref.click();
    await card.getByRole('button',{name:'关闭注释'}).click();
    assert.equal(await card.isVisible(),false);

    // Changing a collapsed table only remeasures markers, not sentence IDs.
    const details=page.locator('details.ocr-callout').first();
    assert.equal(await details.evaluate(node=>node.open),false);
    await details.locator('summary').click();
    assert.equal(await details.evaluate(node=>node.open),true);
    assert.equal(await page.locator('.ocr-tr-reader-unit-id').count(),402);
    assert.deepEqual(pageErrors,[]);
    console.log(name,'GUTTER_SCROLL_FOOTNOTE_PASS',JSON.stringify({initial,id,geometry,before,after,settled,
      selectionPinned:true,mainFootnotePopup:true,hashPreserved:true,locateReturn:true}));
  }finally{await browser.close();}
}
