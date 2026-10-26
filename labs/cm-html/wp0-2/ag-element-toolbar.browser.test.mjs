/** AG toolbar: [全部] [标题 | 媒体 | LaTeX]. Three original module AGs,
 * no mixed element table; All changes AG membership only, not CM6 viewport.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
const choose=(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,browserType,device] of [
 ['Chrome',chromium,{viewport:{width:1280,height:820}}],
 ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]
]){
 const browser=await browserType.launch({headless:true});
 try{
  const page=await browser.newPage(device);
  const errors=[],physical=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    const uri=new URL(request.url());
    if(uri.pathname.endsWith('/api/document')&&uri.searchParams.has('chapter'))physical.push(uri.toString());
    if(!['GET','HEAD'].includes(request.method())&&uri.pathname.includes('/api/'))
      writes.push(uri.pathname);
  });
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',event=>{
    window.__elementToolbar={
      views:event.detail.views,read:event.detail.getMarkdown,getCMD:event.detail.getCMD,
    };
  }));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>window.__elementToolbar?.getCMD?.()?.getIndex?.()?.chapters.length===6,
    null,{timeout:28000});
  const bar=page.locator('.ocr-outline-pane > .ocr-lab-ag-toolbar');
  const all=bar.locator('input[aria-label="章节所有"]');
  const label=bar.locator('.ocr-all-chapters-control');
  const element=bar.locator('.ocr-lab-element-select');
  const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const first=await source.locator('optgroup:nth-child(2) option').nth(1).getAttribute('value');
  const second=await source.locator('optgroup:nth-child(2) option').nth(2).getAttribute('value');
  assert.equal((await label.textContent()).trim(),'全部');
  assert(await label.isVisible());
  assert(await bar.locator('.ocr-navigation-elements').isVisible());
  assert.deepEqual(await element.locator('option').allTextContents(),['标题','媒体','LaTeX']);
  const positions=await bar.evaluate(el=>({
    all:el.querySelector('.ocr-all-chapters-control').getBoundingClientRect().right,
    select:el.querySelector('.ocr-navigation-elements').getBoundingClientRect().left,
  }));
  assert(positions.all<=positions.select,'All checkbox must be left of element dropdown');
  assert.equal(await all.isChecked(),true);
  assert.equal(await all.isDisabled(),true,'Whole mother has no selected chapter');
  assert.equal(await element.inputValue(),'chapter-boundary');
  assert.equal(await page.locator('#export-chapters').isVisible(),false);
  const original=await page.evaluate(()=>window.__elementToolbar.read());
  const count=(kind)=>page.evaluate(key=>window.__elementToolbar.views[key].api.getDisplayedRowCount(),kind);
  // Mother view supports switching to different real grids.
  await choose(element,'media');
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='media');
  assert.equal(await count('media'),11);
  await choose(element,'latex');
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='latex');
  assert.equal(await count('latex'),42);
  assert.equal(await page.locator('.ocr-all-chapters-grid').count(),0);
  assert.equal(await page.evaluate(()=>Object.keys(window.__elementToolbar.views).length),3);
  await choose(source,first);
  await page.waitForFunction(id=>
    document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===id&&
    document.querySelectorAll('.ocr-wp4-hidden-section').length>0,first,{timeout:20000});
  assert.equal(await all.isEnabled(),true);
  assert.equal(await all.isChecked(),false);
  assert.equal(await element.inputValue(),'latex');
  await page.waitForFunction(()=>window.__elementToolbar.views.latex.api.getDisplayedRowCount()===25,
    null,{timeout:15000});
  // iPad WebKit may still be displaying the previous preview frame right
  // after AG+CM6 have switched. Wait for the absolute source-line remap.
  await page.waitForFunction(()=>Number(document.querySelector(
    '.ocr-markdown [data-source-start]')?.dataset.sourceStart)>20,
    null,{timeout:17000});
  const scope=await page.evaluate(()=>({
    selected:document.querySelector('.ocr-source-pane .ocr-lab-file-select').value,
    editorNodes:document.querySelectorAll('#editor .cm-editor').length,
    mdFirst:Number(document.querySelector('.ocr-markdown [data-source-start]')?.dataset.sourceStart),
    hidden:document.querySelectorAll('.ocr-wp4-hidden-section').length,
  }));
  await all.check();
  await page.waitForFunction(()=>window.__elementToolbar.views.latex.api.getDisplayedRowCount()===42,
    null,{timeout:15000});
  assert.equal(await source.inputValue(),scope.selected);
  assert.equal(await page.locator('.ocr-wp4-hidden-section').count(),scope.hidden);
  assert.equal(await page.evaluate(()=>Number(document.querySelector('.ocr-markdown [data-source-start]')?.dataset.sourceStart)),scope.mdFirst);
  assert.equal(await page.evaluate(()=>window.__elementToolbar.read()),original);
  await choose(element,'media');
  await page.waitForFunction(()=>window.__elementToolbar.views.media.api.getDisplayedRowCount()===11,
    null,{timeout:15000});
  await all.uncheck();
  await page.waitForFunction(()=>window.__elementToolbar.views.media.api.getDisplayedRowCount()===5,
    null,{timeout:15000});
  await choose(source,second);
  await page.waitForFunction(id=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===id,
    second,{timeout:11000});
  assert.equal(await element.inputValue(),'media');
  assert.equal(await all.isChecked(),false);
  await choose(source,'document');
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary'&&
    document.querySelectorAll('.ocr-wp4-hidden-section').length===0,null,{timeout:19000});
  assert(await page.locator('.ocr-outline-checkbox').count()>0);
  assert.equal(await element.inputValue(),'chapter-boundary');
  assert(await all.isDisabled());
  assert.deepEqual(errors,[]);
  assert.deepEqual(physical,[]);
  assert.deepEqual(writes,[]);
  console.log('AG_SEPARATE_ELEMENT_TOOLBAR_PASS',name,JSON.stringify({
    controls:['全部','标题/媒体/LaTeX'],distinctAG:3,
    mother:{media:11,latex:42},chapter001:{latex:25,media:5},
    allMedia:11,scopeUnchangedByAll:true,chapterElementRetained:true,
    noPhysicalLoads:true,noApiWrites:true,sourceUnchanged:true,
  }));
 }finally{await browser.close();}
}
