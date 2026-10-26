/** Bounded chapter AG column contract, independent of Settings navigation.
 * A complete interaction check, including actual path and mother restoration.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4410/labs/cm-html/';
const response=await fetch(base+'api/chapters');
assert(response.ok, 'Cannot read manifest-backed chapter list');
const chapters=(await response.json()).files.map(f=>f.name);
assert(chapters.length>=2);
const choose=async(locator,value)=>locator.evaluate((el,next)=>{
  el.value=next;el.dispatchEvent(new Event('change',{bubbles:true}));
},value);
const engines=[['Chrome',chromium,{viewport:{width:1280,height:820}}],
 ['iPad WebKit',webkit,{viewport:{width:1032,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}]]
 .filter(([name])=>!process.env.OCR_WEBKIT_ONLY||name==='iPad WebKit');
for(const [name,engine,options] of engines){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:base.startsWith('https:'),...options});
  const errors=[];let documentLoads=0;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',req=>{if(req.resourceType()==='document')documentLoads++;});
  await page.goto(base+'?chapter='+encodeURIComponent(chapters[0]),{waitUntil:'domcontentloaded',timeout:60000});
  const grid=page.locator('.ocr-outline-pane>.ocr-outline-grid');
  const sourceMenu=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const hscroll=grid.locator('.ag-body-horizontal-scroll-viewport');
  await page.waitForFunction(()=>document.querySelector('#module-select')?.value==='chapter-boundary'&&
   document.querySelector('.ocr-outline-grid .ag-row'),null,{timeout:30000});
  async function assertBounded(expected){
   await hscroll.evaluate(el=>el.scrollLeft=el.scrollWidth);
   await page.waitForFunction(file=>[...document.querySelectorAll('.ocr-outline-grid .ag-cell[col-id="chapterFile"]')]
     .some(el=>el.textContent.trim()==='chapter/'+file),expected,{timeout:20000});
   assert.equal(await grid.locator('.ocr-outline-checkbox').count(),0);
   assert.equal(await grid.locator('[col-id="independent"]').count(),0);
   assert.equal(await grid.locator('.ag-header-cell[col-id="chapterFile"] .ag-header-cell-text').first().textContent(),'章节文件');
   assert.equal(await grid.locator('.ag-cell[col-id="chapterFile"] a').count(),0,'Chapter file is actual identity, not a re-export link');
  }
  await assertBounded(chapters[0]);
  // The AG may be ready before the manifest-backed navigation option fetch
  // completes over a remote tunnel. Never dispatch a value not in <select>.
  await sourceMenu.locator('option[value="chapter:'+chapters[1]+'"]')
    .waitFor({state:'attached',timeout:40000});
  await choose(sourceMenu,'chapter:'+chapters[1]);
  await page.waitForFunction(file=>new URLSearchParams(location.search).get('chapter')===file,chapters[1],{timeout:20000});
  await assertBounded(chapters[1]);
  await choose(sourceMenu,'document');
  await page.waitForFunction(()=>!new URLSearchParams(location.search).has('chapter'),null,{timeout:20000});
  await hscroll.evaluate(el=>el.scrollLeft=120);
  await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="independent"]')&&
    document.querySelector('.ocr-outline-grid .ocr-outline-checkbox'),null,{timeout:20000});
  assert.equal(await grid.locator('.ag-header-cell[col-id="independent"] .ag-header-cell-text').first().textContent(),'独立成章');
  await choose(sourceMenu,'chapter:'+chapters[0]);
  await page.waitForFunction(file=>new URLSearchParams(location.search).get('chapter')===file,chapters[0],{timeout:20000});
  await assertBounded(chapters[0]);
  assert.equal(documentLoads,1,'File switch unexpectedly reloaded the page');
  assert.deepEqual(errors,[]);
  console.log('BOUNDED_CHAPTER_COLUMNS_PASS',name,JSON.stringify({files:[chapters[0],chapters[1]],motherRestored:true,documentLoads}));
 }finally{await browser.close();}
}
