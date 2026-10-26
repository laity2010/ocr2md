/** Regress iPad toolbar border clipping and registered Tom Select font setting.
 * Writes only transient CM6 settings (no Save/PUT). */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
for(const [name,browserType,context] of [
 ['Chrome',chromium,{viewport:{width:1300,height:840}}],
 ['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage(context),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.includes('/api/'))writes.push(r.method()+' '+r.url());});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
  const ctrl=page.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
  await ctrl.waitFor({state:'visible',timeout:30000});
  const geometry=()=>page.evaluate(()=>{
    const bar=document.querySelector('.ocr-source-file-toolbar'),wrapper=bar?.querySelector('.ocr-navigation-files'),control=wrapper?.querySelector('.ts-control');
    const item=control?.querySelector('.item');
    const b=e=>{const x=e.getBoundingClientRect();return {top:x.top,bottom:x.bottom,left:x.left,right:x.right,height:x.height,width:x.width};};
    const s=window.getComputedStyle(control),w=window.getComputedStyle(wrapper);
    return {bar:b(bar),wrapper:b(wrapper),control:b(control),text:item?.textContent,css:{minHeight:s.minHeight,height:s.height,fontSize:s.fontSize,lineHeight:s.lineHeight,marginTop:s.marginTop,marginBottom:s.marginBottom,padding:s.padding,wrapperHeight:w.height,wrapperMinHeight:w.minHeight},fontVar:document.documentElement.style.getPropertyValue('--ocr-navigation-font-size')};
  });
  const before=await geometry();
  console.log('NAV_BORDER_BASELINE',name,JSON.stringify(before));
  if(process.env.OCR_BASELINE==='1')continue;
  assert(before.wrapper.top>=before.bar.top-0.25,'navigation wrapper clipped above toolbar');
  assert(before.wrapper.bottom<=before.bar.bottom+0.25,'navigation wrapper clipped below toolbar');
  assert(before.control.top>=before.bar.top-0.25,'navigation control top border clipped');
  assert(before.control.bottom<=before.bar.bottom+0.25,'navigation control bottom border clipped');
  const nav=page.locator('.ocr-source-pane .ocr-lab-file-select');
  await nav.evaluate(el=>{el.value='settings';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>document.querySelector('#settings-workspace:not([hidden]) .ocr-settings-control input[type=range]'),null,{timeout:25000});
  const settingKey='globalUi.navigation.dropdownFontSize';
  const source=page.locator('#settings-workspace .cm-content');
  await page.waitForFunction(key=>document.querySelector('#settings-workspace .cm-content')?.textContent.includes(key),settingKey,{timeout:13000});
  const row=page.locator('#settings-workspace .ocr-settings-ag-pane .ag-row').filter({hasText:'dropdownFontSize'});
  await row.click();
  const slider=page.locator('#settings-font-slider');
  await slider.waitFor({state:'visible'});
  const beforeVal=Number(await slider.inputValue());
  const changed=beforeVal===12?13:12;
  await slider.evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},changed);
  await page.waitForFunction(expected=>document.documentElement.style.getPropertyValue('--ocr-navigation-font-size').trim()===expected,changed+'pt',{timeout:12000});
  const value=await page.evaluate(()=>{
    const wrapper=document.querySelector('#settings-workspace .ocr-navigation-files');
    return {cssSize:getComputedStyle(wrapper.querySelector('.ts-control')).fontSize,
      popupSize:getComputedStyle(document.querySelector('.ocr-navigation-popup-files')).fontSize,
      setting:getComputedStyle(document.documentElement).getPropertyValue('--ocr-navigation-font-size').trim()};
  });
  await page.locator('#settings-workspace .ocr-lab-file-select').evaluate(el=>{el.value='document';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await ctrl.waitFor({state:'visible',timeout:10000});
  const after=await geometry();
  await page.screenshot({path:`audit-reports/screenshots/nav-border-${name}-after.png`,animations:'disabled',timeout:25000});
  console.log('NAV_BORDER_AND_FONT',name,JSON.stringify({before,after,setting:value,from:beforeVal,to:changed}));
  assert(after.control.top>=after.bar.top-0.25&&after.control.bottom<=after.bar.bottom+0.25);
  assert(after.wrapper.top>=after.bar.top-0.25&&after.wrapper.bottom<=after.bar.bottom+0.25);
  assert.notEqual(before.css.fontSize,after.css.fontSize);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log('NAV_BORDER_FONT_PASS',name);
 }finally{await browser.close();}
}
