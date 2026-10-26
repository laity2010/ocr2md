/** Lab screenshot regression: source file navigator must fit its panel and
 * popup must remain fully on screen. Verify at iPad landscape and narrow layouts. */
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
const cases=[
 ['Chrome-1440',chromium,{viewport:{width:1440,height:900}}],
 ['iPad-1024',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
 ['iPad-820',webkit,{viewport:{width:820,height:900},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
].filter(([name])=>!process.env.OCR_TEST_BROWSER||process.env.OCR_TEST_BROWSER===name);
const screenshotDir='audit-reports/screenshots';
const rect=e=>{const r=e?.getBoundingClientRect();return r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}:null;};
for(const [name,engine,config] of cases){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(config);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  const nav=page.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
  await nav.waitFor({state:'visible',timeout:32000});
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length>=6,null,{timeout:26000});
  const native=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const chapter=await native.locator('optgroup:nth-child(2) option').nth(1).getAttribute('value');
  await native.evaluate((node,value)=>{node.value=value;node.dispatchEvent(new Event('change',{bubbles:true}));},chapter);
  await page.waitForFunction(value=>document.querySelector('.ocr-source-pane .ocr-navigation-files .ts-control .item')?.textContent.includes('001-'),chapter,{timeout:13000});
  const before=await page.evaluate(()=>{
    const src=document.querySelector('.ocr-source-pane');
    const bar=src.querySelector('.ocr-source-file-toolbar');
    const ctrl=bar.querySelector('.ocr-navigation-files');
    const item=ctrl.querySelector('.ts-control .item');
    const q=bar.querySelector('.quote-indent-tools');
    const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};
    return {pane:r(src),bar:r(bar),control:r(ctrl),controlContent:r(ctrl.querySelector('.ts-control')),item:r(item),itemText:item.textContent,itemTextClipped:item.scrollWidth>item.clientWidth+1,buttons:r(q),viewport:[innerWidth,innerHeight]};
  });
  if(!process.env.OCR_SKIP_SCREENSHOTS)await page.screenshot({path:`${screenshotDir}/file-nav-${name}-before.png`,animations:'disabled'});
  await nav.click();
  const popup=page.locator('body>.ocr-navigation-popup-files:visible');
  await popup.waitFor({state:'visible',timeout:9000});
  const open=await page.evaluate(()=>{
    const pop=document.querySelector('body>.ocr-navigation-popup-files:not([style*="display: none"])');
    const b=pop.getBoundingClientRect();
    return {popup:{x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom,inlineWidth:pop.style.width,inlineLeft:pop.style.left},tomOpen:document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.ocrNavigationSelect?.tom?.isOpen,
      labels:[...pop.querySelectorAll('.optgroup-header')].map(x=>x.textContent),
      values:[...pop.querySelectorAll('[data-selectable]')].slice(0,8).map(x=>x.textContent.trim())};
  });
  if(!process.env.OCR_SKIP_SCREENSHOTS)await page.screenshot({path:`${screenshotDir}/file-nav-${name}-opened.png`,animations:'disabled'});
  console.log('FILE_NAV_VISIBILITY',name,JSON.stringify({before,open}));
  assert(before.control.x>=0&&before.control.right<=before.viewport[0]+1,'file control clipped by viewport');
  assert(before.control.x>=before.bar.x-1&&before.control.right<=before.bar.right+1,'file control outside toolbar');
  assert(before.buttons.x>=before.control.right-1,'quote buttons overlap nav');
  assert(open.popup.x>=7&&open.popup.right<=before.viewport[0]-7,'file dropdown clipped horizontally');
  assert(open.popup.y>=0&&open.popup.bottom<=before.viewport[1]+1,'file dropdown clipped vertically');
  if(!process.env.OCR_CAPTURE_ONLY){
    assert(before.control.w>=Math.min(500,before.bar.w-100)-10,'file control unnecessarily narrow');
    assert(open.popup.w>=Math.min(540,before.viewport[0]-16)-3,'file dropdown popup too narrow for chapter names');
    assert(before.control.h<=before.bar.h+2&&before.control.y>=before.bar.y-2&&before.control.bottom<=before.bar.bottom+2,
      'file control not inside toolbar');
  }
  // Select a REAL chapter from the enlarged menu and verify native business
  // navigation still updates without hiding/repainting the dropdown control.
  const item=popup.locator('[data-selectable][data-value^="virtual:"]').nth(4);
  const chosen=await item.getAttribute('data-value');
  await item.click({timeout:14000});
  await page.waitForFunction(v=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===v,
    chosen,{timeout:20000});
  const navigated=await nav.boundingBox();
  assert(navigated&&navigated.x>=0&&navigated.x+navigated.width<=before.viewport[0]+1,
    'file navigator escaped viewport after chapter selection');
  assert.deepEqual(errors,[]);
  console.log('FILE_NAV_VISIBILITY_PASS',name,JSON.stringify({selected:chosen,popupWidth:open.popup.w,navWidth:before.control.w}));
 }finally{await browser.close();}
}
