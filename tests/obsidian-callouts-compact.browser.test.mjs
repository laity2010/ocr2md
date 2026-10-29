/** The closed callout must read as an unobtrusive inline marker, while opening
 * restores the previous card styling. CSS only; tests Chrome and iPad WebKit.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const css=readFileSync('ui/markdown-preview.css','utf8');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body>
<article class="ocr-markdown">
  <details class="ocr-callout ocr-callout--note ocr-callout-foldable" data-callout="note"><summary class="ocr-callout-title">隐藏的注释</summary><div class="ocr-callout-content"><p>隐藏的长文本</p></div></details>
  <details open class="ocr-callout ocr-callout--note ocr-callout-foldable" data-callout="note"><summary class="ocr-callout-title">展开的注释</summary><div class="ocr-callout-content"><p>可见的长文本</p></div></details>
  <aside class="ocr-callout ocr-callout--note"><div class="ocr-callout-title">普通注释</div><div class="ocr-callout-content"><p>正文</p></div></aside>
</article></body></html>`;
for(const [name,engine] of [['Chrome',chromium],['iPad WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:name==='Chrome'?1032:390,height:740},
      hasTouch:name==='iPad WebKit',isMobile:name==='iPad WebKit'});
    await page.setContent(html,{waitUntil:'load'});
    const read=()=>page.evaluate(()=>[...document.querySelectorAll('.ocr-markdown .ocr-callout')].map(el=>{
      const title=el.querySelector('.ocr-callout-title');
      const content=el.querySelector('.ocr-callout-content');
      const box=getComputedStyle(el),t=getComputedStyle(title);
      return {open:el.open??null,font:parseFloat(t.fontSize),weight:t.fontWeight,
        height:title.getBoundingClientRect().height,marginTop:parseFloat(box.marginTop),
        borderLeft:parseFloat(box.borderLeftWidth),color:t.color,
        contentHeight:content.getBoundingClientRect().height,
        paddingTop:parseFloat(t.paddingTop)};
    }));
    let [closed,expanded,always]=await read();
    assert(closed.font<expanded.font,'closed title should be smaller');
    assert(closed.font<always.font,'closed title should be smaller than a fixed callout');
    assert(Number(closed.weight)<Number(expanded.weight),'closed should use lighter lettering');
    assert(closed.marginTop<expanded.marginTop,'closed card needs less outer spacing');
    assert(closed.borderLeft<expanded.borderLeft,'closed marker border should be thinner');
    assert(closed.paddingTop<expanded.paddingTop,'closed title should use less padding');
    assert(closed.height>=36,'collapsed hit target must remain touch-friendly');
    assert.equal(closed.contentHeight,0,'hidden content still takes room');
    const summary=page.locator('details.ocr-callout').first().locator('summary');
    await summary.click();
    [closed,expanded]=await read();
    assert.equal(closed.font,expanded.font,'expanded callout did not restore font');
    assert.equal(closed.borderLeft,expanded.borderLeft,'expanded border did not restore');
    assert.equal(closed.marginTop,expanded.marginTop,'expanded spacing did not restore');
    assert(closed.contentHeight>0,'expanded text did not render');
    await summary.click();
    [closed,expanded]=await read();
    assert.equal(closed.contentHeight,0,'collapsed text not hidden again');
    assert(closed.font<expanded.font,'closed title not compact again');
    console.log('COMPACT_CALLOUT_CSS_PASS',name,JSON.stringify({closedFont:closed.font,
      openFont:expanded.font,closedTapHeight:closed.height,restoresOnToggle:true}));
  }finally{await browser.close();}
}
