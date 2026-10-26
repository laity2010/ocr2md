/** Virtual chapters occupy the existing source navigation, never physical
 * chapter sessions. Check instant filename projection and preserved CM6 state.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
const choose=async(el,value)=>el.evaluate((select,next)=>{
  select.value=next;select.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,device] of [
 ['Chrome',chromium,{viewport:{width:1300,height:850}}],
 ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(device),errors=[],fileReads=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    const u=new URL(r.url());
    if(u.pathname.endsWith('/api/document')&&u.searchParams.has('chapter'))fileReads.push(u.href);
    if(!['GET','HEAD'].includes(r.method())&&u.pathname.includes('/api/'))writes.push(r.method()+' '+u.pathname);
  });
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>window.__navTest=e.detail));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:48000});
  const select=page.locator('.ocr-source-pane .ocr-lab-file-select');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length===6,null,{timeout:26000});
  const chapters=()=>select.locator('optgroup:nth-child(2) option');
  const initial=await chapters().allTextContents();
  assert(initial[0].startsWith('章节chapter/000-'));
  assert(initial[1].startsWith('章节chapter/001-'));
  assert.equal(await select.inputValue(),'document');
  assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
  assert.equal(await page.locator('#export-chapters').isVisible(),false);
  assert.equal(await page.locator('.ocr-outline-checkbox').count()>0,true,'Boundary checkbox missing');
  const original=await page.evaluate(()=>window.__navTest.getMarkdown());
  const second=await chapters().nth(1).getAttribute('value');
  const third=await chapters().nth(2).getAttribute('value');
  await choose(select,second);
  await page.waitForFunction(v=>
    document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===v&&
    document.querySelectorAll('.ocr-wp4-hidden-section').length>0 &&
    !document.querySelector('.ocr-lab-element-select')?.hidden,
    second,{timeout:22000});
  assert.equal(await page.locator('#editor .cm-editor').count(),1);
  assert.equal(await page.evaluate(()=>window.__navTest.getMarkdown()),original);
  await choose(page.locator('.ocr-lab-element-select'),'media');
  assert.equal(await page.locator('#module-select').inputValue(),'media');
  await choose(select,third);
  assert.equal(await page.locator('#module-select').inputValue(),'media','Element module should persist between virtual chapters');
  assert.equal(await page.evaluate(()=>window.__navTest.getMarkdown()),original);
  // Chapter-boundary menu returns to original 5-column H1/H2 marking table.
  await choose(select,'document');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section').length===0,
    null,{timeout:20000});
  assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
  await page.evaluate(()=>window.__navTest.views.outline.api.ensureIndexVisible(1,'top'));
  const independent=page.locator('.ocr-outline-checkbox[aria-label="Buffett’s Alpha 独立章节"]');
  await independent.uncheck();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length===5,
    null,{timeout:12000});
  assert((await chapters().nth(1).textContent()).includes('Appendix-A'),'Merged chapter still in menu');
  await page.evaluate(()=>window.__navTest.views.outline.api.ensureIndexVisible(1,'top'));
  await page.locator('.ocr-outline-checkbox[aria-label="Buffett’s Alpha 独立章节"]').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length===6,
    null,{timeout:12000});
  assert.deepEqual(await chapters().allTextContents(),initial);
  // Start number / zero padding is the existing outline's own projection.
  const start=page.locator('#chapter-start-number');
  await start.fill('012');
  await start.dispatchEvent('input');
  await page.waitForFunction(()=>document.querySelector('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option')?.textContent.includes('012-'),
    null,{timeout:10000});
  await start.fill('000');await start.dispatchEvent('input');
  await page.waitForFunction(()=>document.querySelector('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option')?.textContent.includes('000-'),
    null,{timeout:10000});
  await choose(select,'settings');
  assert.equal(await page.locator('#module-select').inputValue(),'settings');
  await choose(page.locator('#settings-workspace .ocr-lab-file-select'),'document');
  assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
  assert.deepEqual(errors,[]);
  assert.deepEqual(fileReads,[]);
  assert.deepEqual(writes,[]);
  console.log('VIRTUAL_CHAPTER_NAVIGATION_PASS',name,JSON.stringify({
    chapters:initial.length,liveMerge:true,undoMerge:true,namesFollowStartNumber:true,
    editorReused:true,elementModulePersisted:true,noExportButton:true,
    noPhysicalChapterReads:true,noApiWrites:true,
  }));
 }finally{await browser.close();}
}
