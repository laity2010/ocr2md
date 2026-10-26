/** Real-click settings navigation must mark exactly one option as selected
 * AND active; this is independent of the hidden document host's own select.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const url=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [name,engine,device] of [['Chrome',chromium,{viewport:{width:1408,height:900}}],['iPad-WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]]){
 if(process.env.OCR_TEST_BROWSER&&process.env.OCR_TEST_BROWSER!==name)continue;
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({...device,ignoreHTTPSErrors:true});
  const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.includes('/api/'))writes.push(r.url());});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
  const fileNav=page.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
  await fileNav.waitFor({state:'visible',timeout:35000});
  await fileNav.click();
  await page.locator('body>.ocr-navigation-popup-files:visible [data-selectable][data-value="settings"]').click();
  const nav=page.locator('#settings-workspace .ocr-navigation-files .ts-control');
  await nav.waitFor({state:'visible',timeout:25000});
  await nav.click();
  const state=async()=>page.evaluate(()=>{
    const native=document.querySelector('#settings-workspace .ocr-lab-file-select');
    const target=native.ocrNavigationSelect.tom;
    const popup=target.dropdown;
    return {module:document.querySelector('#module-select').value,native:native.value,
      proxy:target.getValue(),activeOption:target.activeOption?.dataset.value||null,
      workbenchHidden:document.querySelector('#workspace').hidden,
      visiblePopup:popup.getBoundingClientRect().height>0,
      options:[...popup.querySelectorAll('[data-selectable][data-value]')].filter(o=>['document','settings'].includes(o.dataset.value)).map(el=>({text:el.textContent.trim(),value:el.dataset.value,cls:el.className,
      selected:el.classList.contains('selected'),active:el.classList.contains('active'),aria:el.getAttribute('aria-selected')}))};
  });
  // Simulate TomSelect reindex giving the old chapter row stale focus, then
  // exercise the production navigation refresh contract (reused in WP3).
  await page.evaluate(()=>{
    const e=document.querySelector('#settings-workspace .ocr-lab-file-select');
    const tom=e.ocrNavigationSelect.tom;
    tom.setActiveOption(tom.getOption('document'));
    e.ocrNavigationSelect.refresh();
  });
  await page.waitForTimeout(80);
  const before=await state();
  console.log('SETTINGS_NAV_SELECTION',name,JSON.stringify(before));
  await page.screenshot({path:`audit-reports/screenshots/settings-navigation-${name}-before.png`,animations:'disabled'});
  if(process.env.OCR_BASELINE!=='1'){
    assert.equal(before.module,'settings');assert.equal(before.native,'settings');
    assert.equal(before.proxy,'settings');
    assert.equal(await page.locator('.ocr-source-pane .ocr-lab-file-select').inputValue(),
      'settings','hidden source navigator retains a competing selection');
    assert.deepEqual(before.options.filter(o=>o.selected).map(o=>o.value),['settings']);
    assert.deepEqual(before.options.filter(o=>o.active).map(o=>o.value),['settings'],'Active row is not current selection');
    assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log('SETTINGS_NAV_SINGLE_SELECTION_PASS',name);
  }
 }finally{await browser.close();}
}
