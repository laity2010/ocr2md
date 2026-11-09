/** TR12: read-only sentence ID gutter and heading outline, real 402-row MD. */
import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const url=process.env.OCR2MD_REVIEW_URL||
  'https://192.168.1.10:4443/labs/sentence-benchmark/translation-review.html';
for(const [name,engine,binary] of [
  ['Chrome',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,webkit.executablePath()],
]){
  const browser=await engine.launch({headless:true,executablePath:binary});
  try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1130,height:820}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent
      .includes('单语 MD 重组无损 PASS'),null,{timeout:130000});
    const sentence=page.getByRole('checkbox',{name:'句子编号'});
    const fold=page.getByRole('checkbox',{name:'折叠到标题'});
    assert.equal(await sentence.isChecked(),false);
    assert.equal(await fold.isChecked(),false);
    const firstId=page.locator('.ocr-tr-reader-unit-id').first();
    assert.equal(await firstId.isVisible(),false);
    assert.equal(await page.locator('.ocr-tr-reader-line-number').first().isVisible(),true);
    const initial=await page.evaluate(()=>{
      const scroll=document.querySelector('.ocr-tr-reader-scroll');
      const body=scroll.querySelector('.ocr-markdown');
      return {gutter:scroll.querySelector('.ocr-tr-reader-gutter').getBoundingClientRect().width,
        text:body.textContent,images:body.querySelectorAll('img').length,
        math:body.querySelectorAll('.katex').length,
        callouts:body.querySelectorAll('details.ocr-callout').length,
        allHeadings:body.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6').length,
        headingTags:[...body.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6')].map(x=>x.tagName),
        headingFonts:[...body.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6')].map(x=>parseFloat(getComputedStyle(x).fontSize)),
        allSentenceIds:scroll.querySelectorAll('[data-unit-id]').length};
    });
    assert.equal(initial.allHeadings,19);
    assert.equal(initial.allSentenceIds,402);
    await sentence.check();
    assert.equal(await firstId.isVisible(),true);
    assert.equal(await page.locator('.ocr-tr-reader-unit-id').count(),402);
    const withIds=await page.locator('.ocr-tr-reader-gutter').evaluate(x=>x.getBoundingClientRect().width);
    assert(withIds-initial.gutter>=80,'sentence column must add visible width');
    await sentence.uncheck();
    assert.equal(await firstId.isVisible(),false);

    const wanted=await page.locator('#record-picker option').nth(330).getAttribute('value');
    await page.locator('#record-picker').selectOption(wanted);
    await page.waitForTimeout(350);
    const before=await page.locator('.ocr-tr-reader-scroll').evaluate(x=>x.scrollTop);
    await fold.check();
    await page.waitForTimeout(180);
    const summary=await page.evaluate(()=>{
      const root=document.querySelector('.ocr-tr-reader-scroll');
      const body=root.querySelector('article');
      const sections=[...body.querySelectorAll(':scope > details.ocr-tr-heading-section')];
      const headings=sections.map(x=>x.querySelector(':scope > summary > :is(h1,h2,h3,h4,h5,h6)'));
      return {outline:body.classList.contains('ocr-tr-heading-outline'),
        headings:headings.length,closed:sections.filter(x=>!x.open).length,
        visibleHeadings:headings.filter(x=>x?.getClientRects().length>0).length,
        visibleBody:sections.filter(x=>x.querySelector('.ocr-tr-heading-content')?.getClientRects().length>0).length,
        text:body.textContent,
        tags:headings.map(x=>x?.tagName),
        fonts:headings.map(x=>x?parseFloat(getComputedStyle(x).fontSize):0),
        scroll:root.scrollTop};
    });
    assert.equal(summary.outline,true);
    assert.equal(summary.text===initial.text,true,'native folding must not lose whitespace text nodes');
    assert.equal(summary.headings,19);
    assert.equal(summary.closed,19,'native details must own all initial fold states');
    assert.equal(summary.visibleHeadings,19,'outline retains every H1-H6 heading');
    assert.equal(summary.visibleBody,0,'all section bodies are natively folded');
    assert.deepEqual(summary.tags,initial.headingTags,'all 19 heading levels must remain unchanged');
    assert.deepEqual(summary.fonts,initial.headingFonts,
      'native folding must preserve the exact Markdown font size of every H1-H6');
    assert(Math.min(...summary.fonts.filter((_,i)=>summary.tags[i]==='H1'))>
      Math.max(...summary.fonts.filter((_,i)=>summary.tags[i]==='H2')),
      'rendered H1 must retain larger Markdown typography than H2');
    assert.equal(await page.locator('#record-picker').inputValue(),wanted,
      'folding must not switch the selected sentence');

    // Browser-native details/summary, not custom aria/click/keyboard state.
    const header=page.locator('.ocr-tr-heading-summary').nth(10);
    const section=header.locator('xpath=..');
    assert.equal(await section.evaluate(x=>x.open),false);
    await header.click();
    assert.equal(await section.evaluate(x=>x.open),true);
    const expanded=await section.evaluate(x=>
      x.querySelector('.ocr-tr-heading-content').getClientRects().length>0);
    assert(expanded,'click expands only its own section through native details');
    await header.click();
    assert.equal(await section.evaluate(x=>x.open),false);
    assert.equal(await page.locator('#record-picker').inputValue(),wanted);

    // The right AI selection must reveal the *corresponding* hidden source
    // paragraph inside its heading section, not old heading 225|p5b2.
    const remote=await page.locator('#record-picker option').nth(390).getAttribute('value');
    await page.locator('#record-picker').selectOption(remote);
    await page.waitForTimeout(550);
    const visible=await page.evaluate(id=>{
      const node=document.querySelector(`.ocr-tr-reader-scroll [data-unit-id="${id}"]`);
      const scroller=document.querySelector('.ocr-tr-reader-scroll');
      const r=node.getBoundingClientRect(),v=scroller.getBoundingClientRect();
      return {current:node.classList.contains('ocr-tr-reader-current'),
        displayed:node.getClientRects().length>0,visible:r.bottom>v.top&&r.top<v.bottom,
        old:document.querySelector('.ocr-tr-reader-current')?.dataset.unitId};
    },remote);
    assert(visible.current&&visible.displayed&&visible.visible,
      'a selected hidden sentence must expand and reveal its own heading section');
    assert.equal(visible.old,remote,'old 225|p5b2 must not take focus');
    assert.equal(await page.locator('#record-picker').inputValue(),remote);

    await sentence.check();
    assert.equal(await page.locator(`[data-gutter-unit="${remote}"]`).isVisible(),true);
    await fold.uncheck();
    await page.waitForTimeout(220);
    assert.equal(await fold.isChecked(),false);
    const restored=await page.evaluate(()=>{
      const root=document.querySelector('.ocr-tr-reader-scroll');
      const body=root.querySelector('article');
      return {allBodyVisible:[...body.children].every(x=>getComputedStyle(x).display!=='none'),
        originalHeadings:body.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6').length,
        foldedSections:body.querySelectorAll('details.ocr-tr-heading-section').length,
        text:body.textContent,
        images:body.querySelectorAll('img').length,
        math:body.querySelectorAll('.katex').length,
        callouts:body.querySelectorAll('details.ocr-callout').length,
        scroll:root.scrollTop,ids:root.querySelectorAll('[data-unit-id]').length};
    });
    assert.equal(restored.allBodyVisible,true);
    assert.equal(restored.originalHeadings,19);
    assert.equal(restored.foldedSections,0);
    assert.equal(restored.text===initial.text,true,'folding must preserve ALL HTML text nodes, including whitespace');
    assert.equal(restored.images,18);assert(restored.math>=40);
    assert.equal(restored.callouts,7);assert.equal(restored.ids,402);
    assert(Math.abs(restored.scroll-before)<15,
      'leaving heading outline restores the saved original reading position');
    assert.deepEqual(errors,[]);
    console.log(name,'TR12_OUTLINE_PASS',JSON.stringify({
      headings:summary.headings,initialGutter:initial.gutter,expandedGutter:withIds,
      savedScroll:before,restoredScroll:restored.scroll,remote,images:restored.images,
      math:restored.math,callouts:restored.callouts,errors}));
  }finally{await browser.close();}
}
