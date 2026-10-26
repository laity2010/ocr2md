/** iPad Safari-like three Tom Select borders and shared font setting.
 * Baseline: record each wrapper/control/toolbar geometry before asserting. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
for(const [name,engine,device] of [['Chrome',chromium,{viewport:{width:1408,height:900}}],
 ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
 if(process.env.OCR_TEST_BROWSER&&process.env.OCR_TEST_BROWSER!==name)continue;
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({...device,ignoreHTTPSErrors:true});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000});
  await page.locator('.ocr-source-pane .ocr-navigation-files .ts-control').waitFor({state:'visible',timeout:40000});
  await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').waitFor({state:'visible',timeout:25000});
  await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').waitFor({state:'visible',timeout:25000});
  const measure=()=>page.evaluate(()=>{
    const rect=e=>{const r=e.getBoundingClientRect();return {top:+r.top.toFixed(2),bottom:+r.bottom.toFixed(2),height:+r.height.toFixed(2),left:+r.left.toFixed(2),right:+r.right.toFixed(2)};};
    return ['files','elements','preview'].map(kind=>{
      const el=document.querySelector(`.ocr-navigation-${kind}.ts-wrapper`),ctl=el.querySelector('.ts-control'),parent=el.parentElement;
      return {kind,bar:rect(parent),wrap:rect(el),ctrl:rect(ctl),
        selected:ctl.querySelector('.item')?.textContent, font:getComputedStyle(ctl).fontSize,
        overflow:getComputedStyle(parent).overflow,
        clipTop:rect(el).top<rect(parent).top||rect(ctl).top<rect(parent).top,
        clipBottom:rect(el).bottom>rect(parent).bottom||rect(ctl).bottom>rect(parent).bottom};
    });
  });
  const before=await measure();
  console.log('THREE_NAV_GEOMETRY',name,JSON.stringify(before));
  await page.screenshot({path:`audit-reports/screenshots/nav-all-${name}-before.png`,animations:'disabled',timeout:40000});
  if(process.env.OCR_BASELINE==='1')continue;
  for(const g of before){
    assert(g.wrap.top>=g.bar.top-0.2&&g.wrap.bottom<=g.bar.bottom+0.2,`${g.kind} wrapper outside toolbar`);
    assert(g.ctrl.top>=g.bar.top-0.2&&g.ctrl.bottom<=g.bar.bottom+0.2,`${g.kind} control outside toolbar`);
    assert.equal(g.clipTop,false,`${g.kind} top border clipped`);
    assert.equal(g.clipBottom,false,`${g.kind} bottom border clipped`);
  }
  // Global Settings controls all three navigators, including 16pt maximum.
  await page.evaluate(()=>document.documentElement.style.setProperty('--ocr-navigation-font-size','16pt'));
  const large=await measure();
  for(const g of large){
    assert(g.wrap.top>=g.bar.top-0.2&&g.wrap.bottom<=g.bar.bottom+0.2,
      `${g.kind} 16pt wrapper outside toolbar`);
    assert(g.ctrl.top>=g.bar.top-0.2&&g.ctrl.bottom<=g.bar.bottom+0.2,
      `${g.kind} 16pt control outside toolbar`);
    assert(parseFloat(g.font)>20,`${g.kind} fails to use global 16pt font`);
  }
  await page.evaluate(()=>document.documentElement.style.setProperty('--ocr-navigation-font-size','10pt'));
  // Business navigation and both menus still work after the geometry change.
  await page.locator('.ocr-navigation-elements .ts-control').click();
  await page.locator('body>.ocr-navigation-popup-elements:visible').waitFor({state:'visible',timeout:7000});
  await page.keyboard.press('Escape');
  await page.locator('.ocr-navigation-preview .ts-control').click();
  await page.locator('body>.ocr-navigation-popup-preview:visible').waitFor({state:'visible',timeout:7000});
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);
  console.log('THREE_NAV_BORDERS_PASS',name,JSON.stringify({normal:before.map(x=>[x.kind,x.wrap.height,x.ctrl.height]),large:large.map(x=>[x.kind,x.font])}));
 }finally{await browser.close();}
}
