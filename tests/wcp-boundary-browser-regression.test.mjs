/** User-visible WCP & Lab regression; uses isolated localhost Lab fixture.
 * Never asks for raw AG/Grid/EditorView/CMD objects.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL;
if(!/^https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/labs\/cm-html\/$/.test(base||''))
  throw Error('Require isolated localhost OCR_LAB_TEST_URL');
const choose=(el,value)=>el.evaluate((node,next)=>{
  node.value=next;node.dispatchEvent(new Event('change',{bubbles:true}));
},value);
const host=type=>type==='chapter-boundary'?'.ocr-outline-grid':
  type==='media'?'.ocr-media-grid':'.ocr-latex-grid';
async function checkCount(page,type,total){
  const selector=host(type)+' [role="grid"]';
  await page.waitForFunction(({selector,total})=>
    Number(document.querySelector(selector)?.getAttribute('aria-rowcount'))===total+1,
    {selector,total},{timeout:18000});
  assert.equal(await page.locator(selector).getAttribute('aria-rowcount'),String(total+1));
}
const sourceRead=page=>page.evaluate(async()=>{
  const result=await fetch('/labs/cm-html/api/document',{cache:'no-store'});
  if(!result.ok)throw Error('Fixture source GET failed');
  return result.text();
});
for(const [name,engine,device] of [
 ['Chromium',chromium,{viewport:{width:1350,height:880}}],
 ['iPad WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(device),errors=[],escaped=[],physical=[],writes=[],documents=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{
    const u=new URL(r.url());
    if(r.resourceType()==='document')documents.push(u.pathname);
    if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/media/'))escaped.push(u.pathname);
    if(u.pathname.endsWith('/api/document')&&u.searchParams.has('chapter'))physical.push(u.pathname);
    if(!['GET','HEAD'].includes(r.method())&&u.pathname.includes('/api/'))writes.push(u.pathname);
  });
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>{
    window.__boundedWCPPort=e.detail;
  }));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForSelector('#editor .cm-editor',{timeout:30000});
  const file=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const element=page.locator('.ocr-lab-element-select');
  const all=page.locator('input[aria-label="章节所有"]');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select optgroup:nth-child(2) option').length===6,null,{timeout:30000});
  const values=await file.locator('optgroup:nth-child(2) option').evaluateAll(xs=>xs.map(x=>x.value));
  assert.deepEqual(await page.evaluate(()=>Object.keys(window.__boundedWCPPort||{}).sort()),
    ['applyChapterQuery','getChapterIndex','getStartNumber']);
  await page.locator('#editor .cm-editor').evaluate(el=>window.__savedEditorIdentity=el);
  const initial=await sourceRead(page);
  await checkCount(page,'chapter-boundary',19);
  assert.equal(await page.locator('.ocr-all-chapters-grid').count(),0);
  await choose(file,values[1]);
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section').length>0,null,{timeout:18000});
  await choose(element,'latex');
  await all.check();
  await checkCount(page,'latex',42);
  // AG virtualizes horizontally off-screen columns on iPad WebKit. Scroll
  // the actual user scrollbar to expose and verify the far-right chapter col.
  await page.locator('.ocr-latex-grid .ag-body-horizontal-scroll-viewport').evaluate(el=>{
    el.scrollLeft=el.scrollWidth;el.dispatchEvent(new Event('scroll',{bubbles:true}));
  });
  await page.locator('.ocr-latex-grid [col-id="virtualChapter"]').first().waitFor({state:'attached',timeout:10000});
  assert((await page.locator('.ocr-latex-grid [col-id="virtualChapter"]').count())>0);
  await all.uncheck();
  await checkCount(page,'latex',25);
  // Return to the review/status column after verifying the far-right column;
  // AG virtualizes horizontal cells in both Chrome and iPad WebKit.
  await page.locator('.ocr-latex-grid .ag-body-horizontal-scroll-viewport').evaluate(el=>{
    el.scrollLeft=0;el.dispatchEvent(new Event('scroll',{bubbles:true}));
  });
  // Reviewing a LaTeX annotation changes the unsaved mother CM6 source but
  // must not reset the same virtual chapter's Markdown preview or remount AG.
  const review=page.locator('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select').first();
  await review.waitFor({state:'visible',timeout:15000});
  const reviewBefore=await review.inputValue();
  const choices=await review.locator('option').evaluateAll(xs=>xs.map(x=>x.value));
  const reviewNext=choices.find(x=>x!==reviewBefore);
  assert(reviewNext,'LaTeX review control must offer another state');
  const previewScroll=page.locator('.ocr-preview-md-scroll');
  const beforeScroll=await previewScroll.evaluate(el=>{
    el.scrollTop=Math.min(340,Math.max(0,el.scrollHeight-el.clientHeight));
    return el.scrollTop;
  });
  assert(beforeScroll>100,'Review regression needs scrollable Markdown');
  await review.selectOption(reviewNext);
  await page.waitForFunction(({value})=>
    document.querySelector('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select')?.value===value
      && document.querySelector('#undo')?.disabled===false,
    {value:reviewNext},{timeout:16000});
  assert.equal(await review.inputValue(),reviewNext,'LaTeX changed selection was remounted');
  const afterScroll=await previewScroll.evaluate(el=>el.scrollTop);
  assert(Math.abs(afterScroll-beforeScroll)<120,
    'LaTeX review jumped Markdown preview to chapter start');
  await page.locator('#undo').click();
  await page.waitForFunction(v=>
    document.querySelector('.ocr-latex-grid .ag-row[row-index="1"] .ocr-latex-review-select')?.value===v,
    reviewBefore,{timeout:16000});
  await choose(element,'media');
  await checkCount(page,'media',5);
  await all.check();
  await checkCount(page,'media',11);
  await choose(element,'chapter-boundary');
  await checkCount(page,'chapter-boundary',19);
  await all.uncheck();
  await checkCount(page,'chapter-boundary',10);
  await choose(file,values[0]);
  await choose(element,'latex');
  await checkCount(page,'latex',0);
  await choose(element,'media');
  await checkCount(page,'media',6);
  await choose(file,values[1]);
  await checkCount(page,'media',5);
  await choose(file,values[3]);
  await checkCount(page,'media',0);

  // Real AG row click, from ALL -> another virtual chapter, must synchronize
  // source navigator and Markdown highlight without any raw Grid API.
  await all.check();
  await checkCount(page,'media',11);
  const target=await page.evaluate(()=>{
    const index=window.__boundedWCPPort.getChapterIndex();
    for(const row of document.querySelectorAll('.ocr-media-grid .ag-row')){
      const line=Number(row.querySelector('[col-id="line"]')?.textContent.trim());
      const chapter=index.chapters.find(c=>c.startLine<=line&&line<c.endLine);
      if(chapter&&chapter.id!==index.chapters[3].id)
        return {i:row.getAttribute('row-index'),line,chapter:chapter.id};
    }
    return null;
  });
  assert(target,'Need visible Media row from another chapter');
  await page.locator('.ocr-media-grid .ag-row[row-index="'+target.i+'"] [col-id="line"]')
    .filter({hasText:new RegExp('^'+target.line+'$')}).first().click();
  await page.waitForFunction(id=>
    document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value==='virtual:'+id,
    target.chapter,{timeout:20000});
  assert(await all.isChecked());
  assert.equal(await element.inputValue(),'media');
  await page.waitForFunction(line=>[...document.querySelectorAll('.ocr-markdown .ocr-outline-focused-element')].some(el=>
    Number(el.dataset.sourceStart)<=line&&line<Number(el.dataset.sourceEnd)),
    target.line,{timeout:20000});

  // Settings is a second pane, not a second CM6 mother document.
  await choose(file,'settings');
  await page.waitForFunction(()=>document.querySelector('#settings-workspace')?.hidden===false,null,{timeout:14000});
  await choose(page.locator('#settings-workspace .ocr-lab-file-select'),'document');
  await page.waitForFunction(()=>document.querySelector('#workspace')?.hidden===false,null,{timeout:14000});
  assert.equal(await page.locator('#editor .cm-editor').evaluate(el=>el===window.__savedEditorIdentity),true);

  // Unsaved CM6 text survives chapter navigation; no implicit server PUT.
  await choose(file,'document');
  const marker='NO_SAVE_WCP_REGRESSION_'+name;
  const editor=page.locator('#editor .cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.insertText(marker+' ');
  await page.waitForFunction(x=>document.querySelector('#editor .cm-content')?.textContent.includes(x),marker,{timeout:9000});
  await choose(file,values[1]);
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-wp4-hidden-section').length>0,null,{timeout:18000});
  await choose(file,'document');
  // CM6 virtualizes distant source lines: physically navigate the caret back
  // to the top before inspecting a marker entered at document start.
  await page.locator('#editor .cm-content').click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.waitForFunction(x=>document.querySelector('#editor .cm-content')?.textContent.includes(x),marker,{timeout:15000});
  assert.equal(await page.locator('#editor .cm-editor').evaluate(el=>el===window.__savedEditorIdentity),true);
  assert.equal(await sourceRead(page),initial);
  assert.deepEqual(errors,[],'Browser page exceptions');
  assert.deepEqual(escaped,[],'Escaped API/media root namespace');
  assert.deepEqual(physical,[],'Physical chapter document load');
  assert.deepEqual(writes,[],'Unexpected API mutation');
  assert.equal(documents.length,1,'Unexpected reload');
  console.log('WCP_BOUNDARY_BROWSER_PASS',name,JSON.stringify({
   chapters:values.length,all:{heading:19,media:11,latex:42},
   chapter001:{heading:10,media:5,latex:25},emptyMedia:true,
   crossChapterFocus:target.line,settingsEditorIdentity:true,
   unsavedDraftRetained:true,rootEscapes:escaped.length,apiWrites:writes.length
  }));
 } finally {await browser.close();}
}
