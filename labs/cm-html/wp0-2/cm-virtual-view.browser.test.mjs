/** WP4 real CM6 EditorState acceptance, two browser engines, isolated lab.
 * Native keyboard operations only; all reads are from original workbench.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1280,height:840}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage({...options,ignoreHTTPSErrors:true});
  let loads=0;const errors=[],physical=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    if(r.resourceType()==='document')loads++;
    const u=new URL(r.url());
    if(u.pathname.endsWith('/api/document')&&u.searchParams.has('chapter'))physical.push(u.toString());
    if(!['GET','HEAD'].includes(r.method())&&u.pathname.includes('/api/'))physical.push(r.method()+' '+u.pathname);
  });
  await page.addInitScript(()=>{
    document.addEventListener('ocr2md:wp3-ag-ready',e=>{window.__wp4Source=e.detail.getMarkdown;});
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
  const editor=page.locator('.cm-content');
  await editor.waitFor({state:'visible',timeout:30000});
  await page.waitForFunction(()=>typeof window.__wp4Source==='function',null,{timeout:18000});
  const original=await page.evaluate(()=>window.__wp4Source());
  const fullHeight=await page.locator('.cm-scroller').evaluate(el=>el.scrollHeight);
  const select=page.locator('.ocr-wp3-chapter-select');
  const index=page.locator('input[aria-label="CMD 虚拟索引"]');
  await index.check();
  const all=page.locator('input[aria-label="章节所有"]');
  await all.uncheck();
  const files=await select.locator('option').evaluateAll(x=>x.map(el=>el.value));
  assert(files.length>=6,'Not enough virtual chapter identities');
  await select.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},files[1]);
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section[data-hidden-section="before"]').length>0,
    null,{timeout:18000});
  const boundedHeight=await page.locator('.cm-scroller').evaluate(el=>el.scrollHeight);
  assert(boundedHeight<fullHeight*0.95,'CM6 viewport was not actually reduced by folding');
  const visible=await editor.textContent();
  assert(visible.includes('Buffett'), 'Selected chapter not visible in CM6');
  assert(!visible.includes('# Bufett’s Alpha'), 'Previous first-chapter heading leaked into scoped CM6');
  assert.equal(await page.evaluate(()=>window.__wp4Source()),original,'Switching view rewrote canonical CMD text');
  const chapters=await page.evaluate(()=>window.__wp4Source().length);
  assert(chapters>300000);
  const beforeCount=await page.locator('.ocr-wp4-hidden-section').count();
  const bodyLine=editor.locator('.cm-line').filter({hasText:/Warren Bufet/}).first();
  await bodyLine.click();
  const token='WP4_SAFE_EDIT_261026';
  await page.keyboard.type(token);
  await page.waitForFunction(key=>window.__wp4Source().includes(key),token,{timeout:18000});
  const edited=await page.evaluate(()=>window.__wp4Source());
  assert.equal(edited.length,original.length+token.length);
  assert.equal(edited.replace(token,''),original,'CM6 edit changed text outside selected chapter');
  assert((await page.locator('.ocr-wp4-hidden-section').count())>=beforeCount,
    'Regular body edit unexpectedly escaped the virtual view');
  const undo=page.locator('#undo'),redo=page.locator('#redo');
  await undo.click();
  await page.waitForFunction(source=>window.__wp4Source()===source,original,{timeout:18000});
  await redo.click();
  await page.waitForFunction(source=>window.__wp4Source()===source,edited,{timeout:18000});
  await undo.click();
  await page.waitForFunction(source=>window.__wp4Source()===source,original,{timeout:18000});
  await all.check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section').length===0,
    null,{timeout:18000});
  const restored=await page.locator('.cm-scroller').evaluate(el=>el.scrollHeight);
  assert(restored>boundedHeight,'All-chapters did not restore viewport');
  assert.equal(await page.evaluate(()=>window.__wp4Source()),original,'Full document restore changed text');
  assert.deepEqual(errors,[], 'Browser errors in chapter projection');
  assert.deepEqual(physical,[],'Unexpected physical chapter load/write');
  assert.equal(loads,1,'Physical chapter reload');
  console.log('WP4_VIRTUAL_CM6_PASS',name,JSON.stringify({
    files:files.length,sourceLength:original.length,fullHeight,boundedHeight,restored,
    editing:true,undoRedo:true,noPhysicalFileRead:true,onePageLoad:loads,
  }));
 }finally{await browser.close();}
}
