/** Experimental AG toolbar: move existing export controls without duplicating handlers. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1320,height:830}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}],
]){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...options});
    const errors=[],unscoped=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{if(/^\/(api|media)\//.test(new URL(r.url()).pathname))unscoped.push(r.url());});
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const bar=page.locator('.ocr-outline-pane > .ocr-lab-ag-toolbar');
    await bar.waitFor({state:'visible',timeout:25000});
    assert.equal(await page.locator('#export-chapters').count(),1,'Export control duplicated');
    assert.equal(await page.locator('#chapter-start-number').count(),1,'Start number duplicated');
    assert.equal(await page.locator('.module-controls #export-chapters').count(),0,'Export remains in global toolbar');
    assert.equal(await bar.locator('#export-chapters').textContent(),'导出章节');
    assert.equal(await bar.locator('label[for="chapter-start-number"]').textContent(),'起始编号');
    assert.equal(await bar.locator('#chapter-start-number').inputValue(),'000');
    assert.equal(await page.locator('.ocr-outline-pane > .ocr-outline-grid').count(),1);
    const box=await bar.boundingBox(),grid=await page.locator('.ocr-outline-pane > .ocr-outline-grid').boundingBox();
    assert(box&&grid&&box.y+box.height<=grid.y+1.5,'Toolbar is not above the AG grid');
    // The moved original button must still invoke the mainline export handler.
    // On a fresh unauthenticated lab session it must open the save-unlock dialog.
    await bar.locator('#export-chapters').click();
    await page.locator('#unlock-dialog').waitFor({state:'visible',timeout:5000});
    await page.locator('#unlock-cancel').click();
    const input=bar.locator('#chapter-start-number');
    await input.fill('012');await input.dispatchEvent('input');
    assert.equal(await input.getAttribute('aria-invalid'),'false');
    await input.fill('invalid');await input.dispatchEvent('input');
    assert.equal(await input.getAttribute('aria-invalid'),'true');
    await input.blur();
    assert.equal(await input.inputValue(),'012','Existing input blur rollback missing');
    // The original module select remains available to the app, but the
    // mother-file AG toolbar exposes only its chapter-boundary action group.
    assert.equal(await bar.locator('.ocr-lab-element-select').isVisible(),false);
    assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
    assert.equal(await bar.locator('#media-refresh').isVisible(),false);
    assert.equal(await bar.locator('#latex-refresh').isVisible(),false);
    await page.locator('.ocr-source-pane .ocr-lab-file-select').selectOption('settings');
    assert.equal(await page.locator('#module-select').inputValue(),'settings');
    assert.equal(await bar.isVisible(),false,'Settings should not show a chapter toolbar');
    const settings=page.locator('#settings-workspace .ocr-lab-file-select');
    await settings.waitFor({state:'visible',timeout:20000});
    await settings.selectOption('document');
    assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
    assert.equal(await bar.isVisible(),true);
    assert.equal(await input.inputValue(),'012','Module navigation reset start number');
    await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="chapter:"]').length>=2,null,{timeout:14000});
    const chapterIds=await page.locator('.ocr-source-pane .ocr-lab-file-select option[value^="chapter:"]').evaluateAll(items=>items.map(i=>i.value));
    const sourceMenu=page.locator('.ocr-source-pane .ocr-lab-file-select');
    await sourceMenu.selectOption(chapterIds[0]);
    await page.waitForURL(u=>u.searchParams.has('chapter'),{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary',null,{timeout:12000});
    assert.equal(await bar.isVisible(),true);
    assert.equal(await bar.locator('#export-chapters').isVisible(),false,'Chapter must not offer re-export');
    assert.equal(await bar.locator('#chapter-start-number').isVisible(),false);
    assert.equal(await bar.locator('.ocr-lab-element-select').isVisible(),true,'Chapter element dropdown missing');
    assert.equal(await bar.locator('#module-select').isVisible(),false,'Original module router must remain internal');
    assert.equal(await bar.locator('#media-refresh').isVisible(),false);
    assert.equal(await page.locator('.ocr-outline-pane .ocr-outline-grid').isVisible(),true);
    await bar.locator('.ocr-lab-element-select').selectOption('media');
    assert.equal(await bar.locator('#media-refresh').isVisible(),true);
    assert.equal(await bar.locator('#media-download-all').isVisible(),true);
    assert.equal(await page.locator('.ocr-outline-pane .ocr-media-pane').isVisible(),true);
    assert.equal(await sourceMenu.isVisible(),true,'File menu must remain accessible within Media');
    const choices=await bar.locator('.ocr-lab-element-select option').allTextContents();
    assert.deepEqual(choices,['标题','媒体','LaTeX'],'Chapter picker must physically contain only 3 options');
    assert.equal(await bar.locator('.ocr-lab-element-select option[value=settings]').count(),0,'Global Settings leaked into iPad-native picker');
    await bar.locator('.ocr-lab-element-select').selectOption('latex');
    assert.equal(await bar.locator('#latex-refresh').isVisible(),true);
    assert.equal(await bar.locator('#latex-normalize').isVisible(),true);
    assert.equal(await bar.locator('#media-refresh').isVisible(),false);
    assert.equal(await page.locator('.ocr-outline-pane .ocr-latex-pane').isVisible(),true);
    assert.equal(await sourceMenu.isVisible(),true,'File menu must remain accessible within LaTeX');
    await bar.locator('.ocr-lab-element-select').selectOption('chapter-boundary');
    assert.equal(await bar.locator('.ocr-lab-element-select option[value="chapter-boundary"]').textContent(),'标题');
    assert.equal(await page.locator('.ocr-outline-pane .ocr-outline-grid').isVisible(),true);
    assert.equal(await bar.locator('#export-chapters').isVisible(),false);
    await bar.locator('.ocr-lab-element-select').selectOption('latex');
    // Element category is one workspace-level view, not per-file default.
    // Enter a NEW chapter while LaTeX is active: remain on LaTeX.
    await sourceMenu.selectOption(chapterIds[1]);
    await page.waitForURL(u=>u.searchParams.get('chapter')===chapterIds[1].slice(8),{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='latex',null,{timeout:12000});
    assert.equal(await bar.locator('.ocr-lab-element-select').inputValue(),'latex');
    assert.equal(await page.locator('.ocr-outline-pane .ocr-latex-pane').isVisible(),true);
    // Change category in chapter 001 and retain it going back to 000.
    await bar.locator('.ocr-lab-element-select').selectOption('media');
    await sourceMenu.selectOption(chapterIds[0]);
    await page.waitForURL(u=>u.searchParams.get('chapter')===chapterIds[0].slice(8),{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='media',null,{timeout:12000});
    assert.equal(await bar.locator('.ocr-lab-element-select').inputValue(),'media');
    assert.equal(await page.locator('.ocr-outline-pane .ocr-media-pane').isVisible(),true);
    // Opening the mother document displays Chapter Boundary without
    // overwriting the selected element category for subsequent chapter work.
    await sourceMenu.selectOption('document');
    await page.waitForURL(u=>!u.searchParams.has('chapter'),{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary',null,{timeout:12000});
    assert.equal(await bar.locator('.ocr-lab-element-select').isVisible(),false);
    assert.equal(await bar.locator('#export-chapters').isVisible(),true);
    await sourceMenu.selectOption(chapterIds[1]);
    await page.waitForURL(u=>u.searchParams.get('chapter')===chapterIds[1].slice(8),{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='media',null,{timeout:12000});
    assert.equal(await bar.locator('.ocr-lab-element-select').inputValue(),'media');
    // The Title selection likewise remains active across a chapter switch.
    await bar.locator('.ocr-lab-element-select').selectOption('chapter-boundary');
    await sourceMenu.selectOption(chapterIds[0]);
    await page.waitForURL(u=>u.searchParams.get('chapter')===chapterIds[0].slice(8),{timeout:15000});
    assert.equal(await bar.locator('.ocr-lab-element-select').inputValue(),'chapter-boundary');
    assert.equal(await page.locator('.ocr-outline-pane .ocr-outline-grid').isVisible(),true);
    await sourceMenu.selectOption('document');
    await page.waitForURL(u=>!u.searchParams.has('chapter'),{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary',null,{timeout:12000});
    assert.equal(await bar.locator('.ocr-lab-element-select').isVisible(),false);
    assert.equal(await bar.locator('#export-chapters').isVisible(),true);
    assert.equal(await bar.locator('#module-select option[value="chapter-boundary"]').textContent(),'章节定界');
    assert.equal(await input.inputValue(),'012');
    assert.deepEqual(errors,[]);
    assert.deepEqual(unscoped,[]);
    console.log('LAB_AG_FILE_MODE_TOOLBAR_PASS',name,JSON.stringify({mother:'chapter-boundary',chapter:['title','media','latex'],sharedElementMode:true,unscopedRequests:0}));
  }finally{await browser.close();}
}
