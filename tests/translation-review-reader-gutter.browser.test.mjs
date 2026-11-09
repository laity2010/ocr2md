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
    // This regression is intentionally against the archived 402-row AI view.
    // The new published 394-row reviewed MD is the separate default view.
    await page.locator('#revision-mode').selectOption('historical');
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
    const idsToggle=page.getByRole('checkbox',{name:'句子编号'});
    assert.equal(await idsToggle.isChecked(),false,
      'sentence ID column stays hidden until explicitly enabled');
    assert.equal(await page.locator('.ocr-tr-reader-unit-id').first().isVisible(),false);
    await idsToggle.check();
    assert.equal(await page.locator('.ocr-tr-reader-unit-id').first().isVisible(),true,
      'checkbox must expose existing 402 canonical sentence IDs');

    // Rendered Markdown reintroduces the empty line only at source block
    // boundaries. Five sentences in p1b7 stay tightly stacked, but p1b8
    // begins with a full paragraph break. The underlying clean MD is inert.
    const spacing=await page.evaluate(()=>{
      const byId=id=>document.querySelector(`.ocr-tr-reader-scroll [data-unit-id="${id}"]`);
      const same=byId('p1b7-s002'),fresh=byId('p1b8-s001');
      return {same:parseFloat(getComputedStyle(same).marginTop),
        next:parseFloat(getComputedStyle(fresh).marginTop),
        sameIsNew:same.classList.contains('ocr-tr-reader-block-start'),
        nextIsNew:fresh.classList.contains('ocr-tr-reader-block-start')};
    });
    assert.equal(spacing.same,0,'same text block must not introduce a blank line');
    assert.equal(spacing.sameIsNew,false);
    assert(spacing.next>=12,'next source text block needs visible blank line');
    assert.equal(spacing.nextIsNew,true);
    for(const [i,pane] of (await page.locator('.ocr-sb-pane[data-engine="translation"]').all()).entries()){
      const first=await pane.locator('.cm-line').first().textContent();
      assert.equal(first,'Buffett’s Alpha','right pane begins directly with corrected English');
      const englishChange=await pane.locator('.ocr-tr-english-change').first().textContent();
      assert.equal(englishChange,'f','only the inserted character in Buffett is colored');
      const visible=await pane.locator('.cm-content').textContent();
      assert(!visible.includes('校正英文')&&!visible.includes('中文译文'),
        'remove labeled fields from English/Chinese reading view');
    }

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

    // iPad Safari regression: 225 | p5b2 is an early document heading. A
    // later real touch on another visible sentence must never jump to that
    // fixed old heading, even if the native panel focus tries to scroll the
    // nested reader during the pointerup phase.
    const p5=page.locator('.ocr-tr-reader-scroll [data-unit-id="p5b2-b001"]');
    const p5Anchor=await p5.evaluate(el=>el.getBoundingClientRect().top);
    assert(p5Anchor<0,'regression needs the p5b2 heading far above the viewport');
    const tapId=await page.evaluate(()=>{
      const port=document.querySelector('.ocr-tr-reader-scroll').getBoundingClientRect();
      return [...document.querySelectorAll('.ocr-tr-reader-unit-id')]
        .find(button=>{
          const rect=button.getBoundingClientRect();
          return rect.top>port.top+80&&rect.bottom<port.bottom-100;
        })?.dataset.gutterUnit;
    });
    assert(tapId,'the synthetic Safari jump must tap a VISIBLE sentence ID');
    const sameViewport=await page.locator('.ocr-tr-reader-scroll').evaluate(el=>el.scrollTop);
    const visibleTap=page.locator(`[data-gutter-unit="${tapId}"]`);
    await page.evaluate(id=>{
      const button=document.querySelector(`[data-gutter-unit="${id}"]`);
      button.addEventListener('pointerup',()=>{
        const scroller=document.querySelector('.ocr-tr-reader-scroll');
        const heading=scroller.querySelector('[data-unit-id="p5b2-b001"]');
        const headingTop=heading.getBoundingClientRect().top-
          scroller.getBoundingClientRect().top+scroller.scrollTop;
        // Deliberately reproduce the native WebKit focus-anchor jump.
        scroller.scrollTop=headingTop;
      },{once:true});
    },tapId);
    await visibleTap.tap();
    await page.waitForTimeout(300);
    const preserved=await page.locator('.ocr-tr-reader-scroll').evaluate(el=>el.scrollTop);
    assert(Math.abs(preserved-sameViewport)<3,
      `iPad tap jumped to stale heading 225|p5b2: ${sameViewport} -> ${preserved}`);
    assert.equal(await page.locator('#record-picker').inputValue(),tapId);

    // Regression: tapping a visible sentence is a *selection* operation, not
    // an instruction to re-center the article or to repeatedly move AI panes.
    const inView=await page.evaluate(()=>{
      const box=document.querySelector('.ocr-tr-reader-scroll').getBoundingClientRect();
      return [...document.querySelectorAll('.ocr-tr-reader-unit-id')]
        .filter(button=>{
          const r=button.getBoundingClientRect();
          return r.top>box.top+45&&r.bottom<box.bottom-75;
        }).slice(0,4).map(button=>button.dataset.gutterUnit);
    });
    assert(inView.length>=2,'at least two visible units required for click-sync test');
    const clickId=inView.find(id=>id!==chosen);
    assert(clickId,'visible sentence distinct from active sentence missing');
    const scroller=page.locator('.ocr-tr-reader-scroll');
    const paneScroll=()=>page.locator('.ocr-sb-pane[data-engine="translation"] .cm-scroller')
      .evaluateAll(list=>list.map(x=>x.scrollTop));
    const leftBefore=await scroller.evaluate(el=>el.scrollTop);
    await page.locator(`[data-gutter-unit="${clickId}"]`).click();
    await page.waitForTimeout(700);
    assert.equal(await page.locator('#record-picker').inputValue(),clickId);
    assert(Math.abs(await scroller.evaluate(el=>el.scrollTop)-leftBefore)<4,
      'clicking a visible sentence ID should not move the reader');
    const aiAfterFirst=await paneScroll();
    await page.locator(`[data-gutter-unit="${clickId}"]`).click();
    await page.waitForTimeout(600);
    assert.deepEqual(await paneScroll(),aiAfterFirst,
      'repeated click on same ID must not move either AI pane');
    assert(Math.abs(await scroller.evaluate(el=>el.scrollTop)-leftBefore)<4,
      'repeated ID click must not re-center the reader');
    const nextVisible=inView.find(id=>id!==clickId&&id!==chosen);
    if(nextVisible){
      const beforeBody=await scroller.evaluate(el=>el.scrollTop);
      await page.locator(`.ocr-tr-reader-scroll [data-unit-id="${nextVisible}"]`)
        .click({position:{x:28,y:8}});
      await page.waitForTimeout(450);
      assert.equal(await page.locator('#record-picker').inputValue(),nextVisible);
      assert(Math.abs(await scroller.evaluate(el=>el.scrollTop)-beforeBody)<4,
        'clicking visible paragraph should not scroll its source view');
    }

    // Repeating a click on a currently highlighted CM6 line is also a no-op.
    const aiLine=page.locator('.ocr-sb-pane[data-engine="translation"] .ocr-tr-current').first();
    const beforeAI=await paneScroll(),beforeReader=await scroller.evaluate(el=>el.scrollTop);
    await aiLine.click({position:{x:28,y:8}});
    await page.waitForTimeout(550);
    assert.equal(await page.locator('#record-picker').inputValue(),nextVisible||clickId);
    assert(Math.abs(await scroller.evaluate(el=>el.scrollTop)-beforeReader)<4,
      'clicking the selected AI sentence must not jump the original preview');
    assert.deepEqual(await paneScroll(),beforeAI,
      'clicking selected AI sentence must not cause cross-pane re-centering');

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
    assert.equal(await page.locator('#record-picker').inputValue(),beforeNote.selected);
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
