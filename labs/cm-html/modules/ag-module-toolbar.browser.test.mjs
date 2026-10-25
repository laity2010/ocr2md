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
    const input=bar.locator('#chapter-start-number');
    await input.fill('012');await input.dispatchEvent('input');
    assert.equal(await input.getAttribute('aria-invalid'),'false');
    await input.fill('invalid');await input.dispatchEvent('input');
    assert.equal(await input.getAttribute('aria-invalid'),'true');
    await input.blur();
    assert.equal(await input.inputValue(),'012','Existing input blur rollback missing');
    for(const mod of ['media','latex','settings']){
      await page.locator('#module-select').selectOption(mod);
      assert.equal(await bar.isVisible(),false,`AG toolbar should be hidden in ${mod}`);
    }
    await page.locator('#settings-workspace .ocr-lab-file-select').waitFor({state:'visible',timeout:20000});
    await page.locator('#settings-workspace .ocr-lab-file-select').selectOption('document');
    assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
    assert.equal(await bar.isVisible(),true);
    assert.equal(await input.inputValue(),'012','Module navigation reset start number');
    assert.deepEqual(errors,[]);
    assert.deepEqual(unscoped,[]);
    console.log('LAB_AG_TOOLBAR_PASS',name,JSON.stringify({tools:['导出章节','起始编号','012'],modesHidden:3,unscopedRequests:0}));
  }finally{await browser.close();}
}
