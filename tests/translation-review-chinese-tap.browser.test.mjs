/** Real 402-row right-pane English/Chinese tap -> left Markdown ID regression.
 * Both lines of every translated pair MUST carry the SAME canonical ID;
 * pointerup landing on a different line must not hijack an earlier tap.
 */
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import assert from 'node:assert/strict';

const url=process.env.OCR2MD_REVIEW_URL||
  'https://192.168.1.10:4443/labs/sentence-benchmark/translation-review.html';
for(const [name,engine,executablePath] of [
  ['Chromium',chromium,chromeExecutable()],
  ['iPad-WebKit',webkit,webkit.executablePath()],
]){
  const browser=await engine.launch({headless:true,executablePath});
  try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
      viewport:{width:1130,height:820},ignoreHTTPSErrors:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:100000});
    // This regression is intentionally against the archived 402-row AI view.
    // The new published 394-row reviewed MD is the separate default view.
    await page.locator('#revision-mode').selectOption('historical');
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent
      .includes('单语 MD 重组无损 PASS'),null,{timeout:130000});
    const panes=page.locator('.ocr-sb-pane[data-engine="translation"]');
    const cases=[];
    for(const index of [30,90,170,240,350]){
      const picker=page.locator('#record-picker');
      const id=await picker.locator('option').nth(index).getAttribute('value');
      await picker.selectOption(id);
      await page.waitForTimeout(400);
      for(let engineIndex=0;engineIndex<2;engineIndex++){
        const pane=panes.nth(engineIndex);
        const candidates=await pane.evaluate(host=>{
          const box=host.querySelector('.cm-scroller').getBoundingClientRect();
          return [...host.querySelectorAll('.cm-line[data-tr-unit-part="zh"]')]
            .filter(node=>{const rect=node.getBoundingClientRect();
              return rect.top>box.top+40&&rect.bottom<box.bottom-30;})
            .map(node=>node.getAttribute('data-tr-unit-id'));
        });
        assert(candidates.length>0,'right translated Chinese rows must have explicit IDs');
        // Choose a known visible line, preferably not the currently active ID.
        const active=await picker.inputValue();
        const chosen=candidates.find(x=>x!==active)||candidates[0];
        const zh=pane.locator(`.cm-line[data-tr-unit-part="zh"][data-tr-unit-id="${chosen}"]`);
        assert.equal(await zh.count(),1,'one rendered Chinese line per sentence');
        const english=pane.locator(`.cm-line[data-tr-unit-part="en"][data-tr-unit-id="${chosen}"]`);
        assert.equal(await english.count(),1,'paired English line carries the same stable ID');
        if(name==='iPad-WebKit')await zh.tap();
        else await zh.click({position:{x:36,y:8}});
        await page.waitForTimeout(260);
        const selected=await picker.inputValue();
        const left=await page.locator('.ocr-tr-reader-current').getAttribute('data-unit-id');
        const marker=await page.locator('.ocr-tr-reader-marker-current [data-gutter-unit]')
          .getAttribute('data-gutter-unit');
        assert.equal(selected,chosen,`clicked Chinese row must resolve ID ${chosen}, not p5b2`);
        assert.equal(left,chosen,'left Markdown must highlight the exact translated unit');
        assert.equal(marker,chosen,'left gutter must follow the same unit');
        const leftVisual=await page.evaluate(()=>{
          const root=document.querySelector('.ocr-tr-reader-scroll');
          const rect=root.getBoundingClientRect();
          const current=root.querySelector('.ocr-tr-reader-current').getBoundingClientRect();
          return {top:current.top-rect.top,bottom:current.bottom-rect.top,
            height:rect.height};
        });
        assert(leftVisual.top<leftVisual.height+30&&leftVisual.bottom>-30,
          'click should reveal matching left source rather than a distant old heading');
        cases.push({index,engineIndex,clicked:chosen,left:marker,leftY:Math.round(leftVisual.top)});
      }
    }
    // Simulate Safari retargeting between pointerdown and pointerup. Even if
    // pointerup lands on a DIFFERENT visible translation row, keep down ID.
    const retarget=await page.evaluate(()=>{
      const pane=document.querySelector('.ocr-sb-pane[data-engine="translation"]');
      const box=pane.querySelector('.cm-scroller').getBoundingClientRect();
      const nodes=[...pane.querySelectorAll('.cm-line[data-tr-unit-part="zh"]')]
        .filter(el=>{const r=el.getBoundingClientRect();return r.top>box.top+30&&r.bottom<box.bottom-30;});
      if(nodes.length<2)return {skipped:true};
      const a=nodes[0],b=nodes.find(x=>x.dataset.trUnitId!==a.dataset.trUnitId);
      if(!b)return {skipped:true};
      const r=a.getBoundingClientRect(),opts={bubbles:true,isPrimary:true,
        pointerId:178,button:0,clientX:r.left+25,clientY:r.top+8};
      a.dispatchEvent(new PointerEvent('pointerdown',opts));
      b.dispatchEvent(new PointerEvent('pointerup',opts));
      return {expected:a.dataset.trUnitId,upHit:b.dataset.trUnitId};
    });
    assert(!retarget.skipped,'need at least two distinct visible Chinese lines');
    await page.waitForTimeout(250);
    assert.equal(await page.locator('#record-picker').inputValue(),retarget.expected,
      'pointerup retarget must not select the wrong (possibly p5b2) sentence');
    assert.deepEqual(errors,[]);
    console.log(name,'CHINESE_LINE_ID_PASS',JSON.stringify({cases,retarget,errors}));
  }finally{await browser.close();}
}
