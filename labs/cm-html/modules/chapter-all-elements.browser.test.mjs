/** Only saved chapter data is scanned; aggregation never writes cross-file CMD.
 * Chrome + iPad WebKit single-chapter/whole-chapter mode and drill-down.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4410/labs/cm-html/';
const chooseNative=(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,context] of [
  ['Chrome',chromium,{viewport:{width:1300,height:825}}],
  ['iPad WebKit',webkit,{viewport:{width:1032,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
].filter(([name])=>!process.env.OCR_WEBKIT_ONLY||name==='iPad WebKit')){
  const browser=await engine.launch({headless:true});
  try{
    const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...context});
    const errors=[],badRequests=[];
    let docLoads=0;
    page.on('pageerror',e=>errors.push(e.message));
    page.on('request',r=>{
      const u=new URL(r.url());
      if(r.resourceType()==='document')docLoads++;
      if(/^\/(api|media)\//.test(u.pathname))badRequests.push(u.pathname);
      if(!['GET','HEAD'].includes(r.method())&&u.pathname.startsWith(new URL(base).pathname+'api/'))badRequests.push(r.method()+' '+u.pathname);
    });
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    const checkbox=page.locator('input[type="checkbox"][aria-label="章节所有"]');
    await checkbox.waitFor({state:'attached',timeout:30000});
    assert.equal(await checkbox.isVisible(),false,'Mother file must not show all-chapters toggle');
    const sourceNav=page.locator('.ocr-source-pane select.ocr-lab-file-select');
    await sourceNav.locator('option[value^="chapter:"]').first().waitFor({state:'attached',timeout:18000});
    const chapters=await sourceNav.locator('option[value^="chapter:"]').evaluateAll(xs=>xs.map(x=>x.value.slice(8)));
    assert(chapters.length>=3);
    await chooseNative(sourceNav,'chapter:'+chapters[0]);
    await checkbox.waitFor({state:'visible',timeout:22000});
    assert.equal(await checkbox.isChecked(),false);
    const grid=page.locator('.ocr-all-chapters-grid');
    assert.equal(await grid.isVisible(),false);
    await checkbox.check();
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes('项 · 已保存'),null,{timeout:20000});
    assert.equal(await grid.isVisible(),true);
    assert.equal(await page.locator('.ocr-outline-pane>.ocr-outline-grid').isVisible(),false);
    assert.equal(await page.locator('#latex-normalize').isVisible(),false);
    assert.equal(await page.locator('#media-download-all').isVisible(),false);
    assert((await grid.locator('.ag-row').count())>=chapters.length,'Missing aggregated title records');
    assert((await grid.locator('.ag-header-cell').allTextContents()).join('').includes('章节'));
    const titleStatus=await page.locator('.ocr-all-chapters-status').textContent();
    const type=page.locator('.ocr-lab-element-select');
    await chooseNative(type,'media');
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-grid .ag-header-cell')?.textContent?.includes('章节')&&
      [...document.querySelectorAll('.ocr-all-chapters-grid .ag-header-cell')].some(x=>x.textContent.includes('链接')),
      null,{timeout:11000});
    const mediaStatus=await page.locator('.ocr-all-chapters-status').textContent();
    assert((await checkbox.isChecked()),'Changing element type reset all chapters');
    await chooseNative(type,'latex');
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes('项 · 已保存')&&
      [...document.querySelectorAll('.ocr-all-chapters-grid .ag-header-cell')].some(x=>x.textContent.includes('审阅')),
      null,{timeout:12000});
    const latexCount=Number((await page.locator('.ocr-all-chapters-status').textContent()).match(/· (\d+)项/)?.[1]);
    assert(latexCount>1,'All chapters missing LaTeX rows');
    assert.equal(await checkbox.isChecked(),true);
    // Return to the mother document: aggregate must auto-disable even though
    // its checkbox is no longer visible in the chapter-boundary toolbar.
    await chooseNative(sourceNav,'document');
    await page.waitForFunction(()=>!new URLSearchParams(location.search).has('chapter')&&
      !document.querySelector('.ocr-outline-pane')?.classList.contains('ocr-all-chapters-mode'),
      null,{timeout:16000});
    assert.equal(await checkbox.isVisible(),false);
    assert.equal(await grid.isVisible(),false);
    await chooseNative(sourceNav,'chapter:'+chapters[0]);
    await checkbox.waitFor({state:'visible',timeout:16000});
    assert.equal(await checkbox.isChecked(),false);
    await checkbox.check();
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes('项 · 已保存'),
      null,{timeout:20000});
    // Clicking a record opens the owning chapter for normal CMD-safe editing,
    // clears the aggregate toggle and locates the saved source line.
    const record=page.locator('.ocr-all-chapters-grid .ag-row[row-index="0"]');
    const firstName=await record.locator('[col-id="chapter"]').textContent();
    const firstLine=Number((await record.locator('[col-id="line"]').textContent()).trim());
    await record.locator('[col-id="line"]').click();
    await page.waitForFunction(expected=>new URLSearchParams(location.search).get('chapter')===expected,
      firstName.slice('chapter/'.length),{timeout:18000});
    await page.waitForFunction(()=>!document.querySelector('.ocr-all-chapters-mode')&&
      document.querySelector('.ocr-latex-grid .ag-row-selected'),null,{timeout:19000});
    assert.equal(await checkbox.isChecked(),false);
    assert.equal(await page.locator('.ocr-latex-pane').isVisible(),true);
    assert(Number.isInteger(firstLine)&&firstLine>=1);
    await checkbox.check();
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-status')?.textContent.includes('项 · 已保存'),null,{timeout:20000});
    await checkbox.uncheck();
    assert.equal(await grid.isVisible(),false);
    assert.equal(await page.locator('.ocr-latex-pane').isVisible(),true);
    assert.equal(await page.locator('#latex-normalize').isVisible(),true);
    assert.equal(docLoads,1,'Cross-chapter navigation performed page reload');
    assert.deepEqual(errors,[]);
    assert.deepEqual(badRequests,[]);
    console.log('CHAPTER_ALL_PASS',name,JSON.stringify({chapters:chapters.length,titleStatus,mediaStatus,latexCount,drillDown:true,docLoads}));
  }finally{await browser.close();}
}
