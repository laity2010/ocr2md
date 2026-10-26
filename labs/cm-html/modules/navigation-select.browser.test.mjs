/** Real Tom Select interactions, iPad Safari/WebKit, no user data writes.
 * File select is grouped/searchable and native select stays sole event API.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [name,engine,ctx] of [
 ['Chrome',chromium,{viewport:{width:1290,height:840}}],
 ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...ctx});
  const errors=[];let documentLoads=0;let escapedApi=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const url=new URL(r.url());if(r.resourceType()==='document')documentLoads++;
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/media/'))escapedApi++;
  });
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const nav=page.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
  await nav.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-source-file-select option[value^="chapter:"]').length>=3,null,{timeout:18000});
  const filePopup=page.locator('body>.ocr-navigation-popup-files');
  await nav.click();
  await filePopup.waitFor({state:'visible',timeout:9000});
  await page.waitForFunction(()=>document.querySelectorAll('body>.ocr-navigation-popup-files .optgroup-header').length===2,null,{timeout:9000});
  assert.equal(await filePopup.locator('.optgroup-header').allTextContents().then(xs=>xs.join('|')),'工作区|章节文件');
  assert.equal(await filePopup.locator('[data-value^="chapter:"]').count()>=3,true);
  await nav.locator('input').fill('002');
  const chapter002=filePopup.locator('[data-selectable][data-value^="chapter:002-"]').first();
  await chapter002.waitFor({state:'visible',timeout:6000});
  const target=await chapter002.getAttribute('data-value');
  const popRect=await filePopup.boundingBox();
  assert(popRect&&popRect.x>=0&&popRect.x+popRect.width<=ctx.viewport.width+3,'Popover clipped by Dockview/viewport');
  await chapter002.click();
  await page.waitForURL(u=>u.searchParams.get('chapter')===target.slice(8),{timeout:14000});
  assert.equal(await page.locator('.ocr-source-pane .ocr-source-file-select').inputValue(),target);
  await page.waitForFunction(()=>document.querySelector('.ocr-navigation-elements')?.getBoundingClientRect().width>90,null,{timeout:12000});
  const elementControl=page.locator('.ocr-navigation-elements .ts-control');
  await elementControl.click();
  const agPopup=page.locator('body>.ocr-navigation-popup-elements');
  await agPopup.waitFor({state:'visible',timeout:8000});
  await page.waitForFunction(()=>document.querySelectorAll('body>.ocr-navigation-popup-elements [data-selectable]').length===3,null,{timeout:8000});
  assert.deepEqual(await agPopup.locator('[data-selectable]').allTextContents(),['标题','媒体','LaTeX']);
  assert(!((await agPopup.textContent())||'').includes('全局设置'));
  await agPopup.locator('[data-selectable][data-value="media"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-lab-element-select')?.value==='media',null,{timeout:9000});
  await nav.click();
  await nav.locator('input').fill('001');
  await filePopup.locator('[data-selectable][data-value^="chapter:001-"]').first().click();
  await page.waitForURL(u=>u.searchParams.get('chapter')?.startsWith('001-'),{timeout:14000});
  assert.equal(await page.locator('.ocr-lab-element-select').inputValue(),'media','AG module should persist across chapter switches');
  const preview=page.locator('.ocr-navigation-preview .ts-control');
  await preview.click();
  const pvPopup=page.locator('body>.ocr-navigation-popup-preview');
  await pvPopup.waitFor({state:'visible',timeout:8000});
  assert((await pvPopup.locator('[data-selectable]').count())>=1);
  assert((await pvPopup.textContent()).includes('Markdown'));
  await page.waitForFunction(()=>!document.querySelector('select.ocr-preview-mode option[value="pdf"]')?.disabled,
    null,{timeout:20000});
  // Dynamic PDF preheat updates the mirrored options; selecting through Tom
  // still dispatches the native PreviewPanel change event.
  await pvPopup.locator('[data-selectable][data-value="pdf"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='pdf',
    null,{timeout:12000});
  await preview.click();
  await pvPopup.locator('[data-selectable][data-value="md"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-preview-pane')?.dataset.previewMode==='md',
    null,{timeout:12000});
  // Check source navigation is still clickable while PDF toolbar shares space.
  await nav.click();
  await nav.locator('input').fill('全局设置');
  await filePopup.locator('[data-selectable][data-value="settings"]').click();
  await page.waitForFunction(()=>!document.querySelector('#settings-workspace').hidden,null,{timeout:16000});
  await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-navigation-files .ts-control'),null,{timeout:19000});
  const settingsNav=page.locator('#settings-workspace .ocr-navigation-files .ts-control');
  await settingsNav.click();
  await page.locator('body>.ocr-navigation-popup-files:visible [data-selectable][data-value="document"]').click();
  await page.waitForFunction(()=>!document.querySelector('#workspace').hidden,null,{timeout:18000});
  assert.equal(documentLoads,1,'In-place file navigation triggered full reload');
  assert.equal(escapedApi,0,'Unscoped API/media request');
  assert.deepEqual(errors,[]);
  console.log('NAVIGATION_SELECT_PASS',name,JSON.stringify({searchable:true,grouped:true,agThreeOptions:true,
    agSelectionRetained:true,settingsNavigator:true,popupBody:true,previewModesVerified:true,documentLoads,escapedApi}));
 }finally{await browser.close();}
}
