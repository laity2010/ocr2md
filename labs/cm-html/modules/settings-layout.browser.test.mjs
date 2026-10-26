/** The Settings Dockview shares sash geometry with the chapter workbench.
 * Includes a no-ETag read regression. No SAVE/PUT, no user data mutation.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [name,engine,context] of [
  ['Chrome',chromium,{viewport:{width:1290,height:840}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...context});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/settings',async route=>{
    if(route.request().method()!=='GET')return route.continue();
    const response=await route.fetch();
    const headers={...response.headers()};delete headers.etag;
    await route.fulfill({response,headers});
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const file=page.locator('.ocr-source-pane .ocr-source-file-select');
  await file.waitFor({state:'visible',timeout:30000});
  const ratios=()=>page.evaluate(()=>{
    const source=document.querySelector('#settings-workspace:not([hidden])')?'#settings-workspace':'#workspace';
    const r=q=>document.querySelector(source+' '+q)?.getBoundingClientRect();
    const a=r(source==='#workspace'?'.ocr-outline-pane':'.ocr-settings-ag-pane');
    const b=r(source==='#workspace'?'.ocr-source-pane':'.ocr-settings-source');
    const c=r(source==='#workspace'?'.ocr-preview-pane':'.ocr-settings-pane:not(.ocr-settings-source):not(.ocr-settings-ag-pane)');
    if(!a||!b||!c)throw Error('Missing Dockview panes');
    return {ag:a.width/(a.width+b.width),source:b.height/(b.height+c.height),width:a.width+b.width,
      height:b.height+c.height,settings:source!=='#workspace'};
  });
  const initial=await ratios();
  const nav=page.locator('.ocr-source-pane .ocr-source-file-select');
  await nav.selectOption('settings');
  await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-settings-source .cm-editor')&&
    document.querySelector('#status')?.textContent?.includes('全局设置已加载'),null,{timeout:25000});
  const settings1=await ratios();
  assert(Math.abs(settings1.ag-initial.ag)<0.06,`Settings AG sash reset: ${JSON.stringify({initial,settings1})}`);
  assert(Math.abs(settings1.source-initial.source)<0.06,`Settings source sash reset: ${JSON.stringify({initial,settings1})}`);
  const settingsPicker=page.locator('#settings-workspace .ocr-lab-file-select');
  await settingsPicker.selectOption('document');
  await page.waitForFunction(()=>!document.querySelector('#workspace').hidden,null,{timeout:12000});
  await page.waitForTimeout(170);
  const restored=await ratios();
  assert(Math.abs(restored.ag-settings1.ag)<0.06);
  assert(Math.abs(restored.source-settings1.source)<0.06);
  // A second Settings entrance must retain the previously selected sash ratios.
  await nav.selectOption('settings');
  await page.waitForFunction(()=>!document.querySelector('#settings-workspace').hidden,null,{timeout:12000});
  const settings2=await ratios();
  assert(Math.abs(settings2.ag-restored.ag)<0.06);
  assert(Math.abs(settings2.source-restored.source)<0.06);
  assert.equal(await page.locator('.ocr-settings-ag-pane').count(),1);
  assert.equal(await page.locator('#settings-workspace .ocr-settings-source .cm-editor').count(),1);
  assert.equal(await page.locator('.ocr-settings-control input[type=range]').count(),1);
  assert.deepEqual(errors,[]);
  assert.match(await page.locator('#build-version').textContent(),/^lab-\d{6}-\d{4}$/);
  console.log('SETTINGS_SPLIT_CONTINUITY_PASS',name,JSON.stringify({initial,settings1,restored,settings2,etagOmitted:true}));
 }finally{await browser.close();}
}
