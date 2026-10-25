import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const pdfHash=hash(readFileSync(pdf));
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
 ['WebKit',webkit,{executablePath:webkit.executablePath()}]];
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<engines.length;i++){
 const [name,engine,options]=engines[i];
 const port=4680+i,url=`http://127.0.0.1:${port}/`;
 const document=resolve(`.v6/tests/shared-preview-${name.toLowerCase()}-${process.pid}.md`);
 writeFileSync(document,fixture);
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
   env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:document,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser;
 try{
  let ready=false;for(let x=0;x<110;x++){
    try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{} await sleep(130);
  }
  assert(ready,'isolated server unavailable');
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const pdfTransport=[];
  page.on('response',response=>{
    if(new URL(response.url()).pathname==='/api/pdf')
      pdfTransport.push(response.status());
  });
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  // Hold the actual PDF metadata request so the UI can be checked during
  // background warm-up rather than relying on a timing-sensitive delay.
  let releasePdfMap;
  const pdfMapGate=new Promise(resolve=>{releasePdfMap=resolve;});
  await page.route('**/api/pdf-map',async route=>{
    await pdfMapGate;
    await route.continue();
  });
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelector('.ocr-preview-mode option[value="pdf"]')?.disabled&&
    document.querySelector('.ocr-preview-split-toggle input')?.disabled,
    null,{timeout:25000});
  const beforeWarm=await page.evaluate(()=>{
    const choice=document.querySelector('.ocr-preview-mode');
    const pdf=choice.querySelector('option[value="pdf"]');
    const split=document.querySelector('.ocr-preview-split-toggle input');
    const controls=document.querySelector('.ocr-preview-mode-tools[data-mode="pdf"]');
    const early={choice:choice.value,disabled:pdf.disabled,splitDisabled:split.disabled,
      toolbarDisplay:getComputedStyle(controls).display,
      label:pdf.textContent,groups:document.querySelectorAll('.dv-groupview').length};
    // A scripted change event must not circumvent the disabled PDF option or
    // the disabled split button (mobile select behavior can vary).
    choice.value='pdf';choice.dispatchEvent(new Event('change',{bubbles:true}));
    split.checked=true;split.dispatchEvent(new Event('change',{bubbles:true}));
    return {...early,choiceAfter:choice.value,splitAfter:split.checked,
      modeAfter:document.querySelector('.ocr-preview-pane').dataset.previewMode,
      groupsAfter:document.querySelectorAll('.dv-groupview').length};
  });
  assert.deepEqual(beforeWarm,{choice:'md',disabled:true,splitDisabled:true,
    toolbarDisplay:'none',label:'PDF 原文（预热中）',groups:3,
    choiceAfter:'md',splitAfter:false,modeAfter:'md',groupsAfter:3},
    `${name} PDF warm-up gate failed`);
  releasePdfMap();
  await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===3&&
    document.querySelectorAll('.ocr-outline-checkbox').length===21&&
    document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
    document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,
    null,{timeout:55000});
  assert(pdfTransport.length<=2 && pdfTransport.every(code=>code===200),
    `${name} PDF warm-up used redundant range requests: ${JSON.stringify(pdfTransport)}`);
  const initial=await page.evaluate(()=>({
    selectable:!document.querySelector('.ocr-preview-mode option[value="pdf"]').disabled,
    splitEnabled:!document.querySelector('.ocr-preview-split-toggle input').disabled,
    toolsDisplay:getComputedStyle(document.querySelector('.ocr-preview-mode-tools[data-mode="pdf"]')).display,
    groups:document.querySelectorAll('.dv-groupview').length,
    panels:['outline','source','preview'].filter(id=>document.querySelector(id==='outline'?'.ocr-outline-pane':id==='source'?'.ocr-source-pane':'.ocr-preview-pane')), 
    mode:document.querySelector('.ocr-preview-mode').value,
    tabs:[...document.querySelectorAll('.dv-tabs-and-actions-container')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.textContent.trim()),
    pdfState:document.querySelector('.pdfViewer')?.tagName,
    mdVisibility:getComputedStyle(document.querySelector('.ocr-preview-md-scroll')).visibility,
    pdfVisibility:getComputedStyle(document.querySelector('.ocr-preview-pdf-host')).visibility,
    pdfTools:document.querySelector('.ocr-pdf-tools').parentElement.dataset.mode,
  }));
  assert.deepEqual(initial.panels.sort(),['outline','source','preview'].sort());
  assert.deepEqual(initial.tabs,[]);assert.equal(initial.mode,'md');
  assert(initial.selectable&&initial.splitEnabled&&initial.toolsDisplay==='none',
    `${name} PDF not unlocked after first-page render or toolbar visible on MD`);
  assert.equal(initial.mdVisibility,'visible');assert.equal(initial.pdfVisibility,'hidden');
  assert.equal(initial.pdfTools,'pdf');
  await page.evaluate(()=>window.__testPdfViewer=document.querySelector('.pdfViewer'));
  // Selection changes while PDF is hidden. The hidden PDF view must track
  // the new block, not the old visible Markdown state.
  await page.locator('.ag-row[row-index="4"] [col-id="title"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]'),null,{timeout:16000});
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.waitForFunction(()=>{
    const el=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]');
    const scroller=document.querySelector('.ocr-pdf-scroller');
    if(!el||!scroller)return false;
    const r=el.getBoundingClientRect(),c=scroller.getBoundingClientRect();
    return r.width>2&&r.height>2&&r.top>=c.top-3&&r.bottom<=c.bottom+3;
  },null,{timeout:18000});
  await page.screenshot({path:`.v6/evidence/shared-preview-pdf-${name.toLowerCase()}.png`,timeout:16000});
  const page3=await page.evaluate(()=>({
    mode:document.querySelector('.ocr-preview-mode').value,
    view:document.querySelector('.pdfViewer')===window.__testPdfViewer,
    selected:document.querySelector('.ocr-pdf-region-overlay')?.dataset.blockIndex,
    toolbar:getComputedStyle(document.querySelector('.ocr-preview-mode-tools[data-mode="pdf"]')).visibility,
  }));
  assert.equal(await page.evaluate(()=>document.querySelector('.pdfViewer')===window.__testPdfViewer),true);
  assert.equal(page3.toolbar,'visible');
  await page.locator('.ocr-pdf-plus').click();
  const scale=await page.locator('.ocr-pdf-zoom').textContent();
  await page.locator('.ocr-preview-mode').selectOption('md');
  const hiddenToolbar=await page.evaluate(()=>{
    const tools=document.querySelector('.ocr-preview-mode-tools[data-mode="pdf"]');
    const controls=document.querySelector('.ocr-pdf-tools');
    return {hidden:tools.hidden,display:getComputedStyle(tools).display,
      width:tools.getBoundingClientRect().width,
      buttons:controls.querySelectorAll('button').length,
      parent:controls.parentElement===tools};
  });
  assert(hiddenToolbar.hidden&&hiddenToolbar.display==='none'&&hiddenToolbar.width===0&&
    hiddenToolbar.buttons===3&&hiddenToolbar.parent,
    `${name} PDF buttons not retracted on Markdown: ${JSON.stringify(hiddenToolbar)}`);
  await page.screenshot({path:`.v6/evidence/shared-preview-md-${name.toLowerCase()}.png`,timeout:16000});
  assert.equal(await page.locator('.ocr-preview-md-scroll').evaluate(el=>getComputedStyle(el).visibility),'visible');
  assert.equal(await page.locator('.ocr-preview-pdf-host').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await page.locator('.ag-row[row-index="5"] [col-id="title"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]')?.dataset.blockIndex==='6',null,{timeout:16000});
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.waitForFunction(()=>{
    const el=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]');
    const scroller=document.querySelector('.ocr-pdf-scroller');
    if(!el||!scroller)return false;
    const r=el.getBoundingClientRect(),c=scroller.getBoundingClientRect();
    return r.width>1&&r.top>=c.top-3&&r.bottom<=c.bottom+3;
  },null,{timeout:19000});
  assert.equal(await page.locator('.ocr-pdf-zoom').textContent(),scale,
    'PDF zoom should persist when switching preview modes');
  // Change the active source to a distant page while the PDF is hidden.
  await page.locator('.ocr-preview-mode').selectOption('md');
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.locator('.ocr-pdf-page').fill('8');
  await page.locator('.ocr-pdf-page').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="8"]'),null,{timeout:20000});
  await page.locator('.ocr-preview-mode').selectOption('md');
  await page.waitForFunction(()=>document.querySelectorAll('.ag-row[aria-selected="true"]').length===1,null,{timeout:16000});
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.waitForFunction(()=>{
    const el=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="8"]');
    const scroller=document.querySelector('.ocr-pdf-scroller');
    if(!el||!scroller)return false;
    const r=el.getBoundingClientRect(),c=scroller.getBoundingClientRect();
    // Oversized OCR regions cannot physically fit; their center must remain
    // visible. Smaller regions must be fully within the PDF viewport.
    const fitsHeight=r.height<=c.height-28, fitsWidth=r.width<=c.width-28;
    const visibleY=fitsHeight?(r.top>=c.top-4&&r.bottom<=c.bottom+4)
      :((r.top+r.bottom)/2>=c.top&&(r.top+r.bottom)/2<=c.bottom);
    const visibleX=fitsWidth?(r.left>=c.left-4&&r.right<=c.right+4)
      :((r.left+r.right)/2>=c.left&&(r.left+r.right)/2<=c.right);
    return visibleY&&visibleX;
  },null,{timeout:16000});
  // If warm-up fails, Markdown remains usable and neither PDF entry point
  // can become selectable. Verify the asynchronous false readiness result.
  const failed=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  try{
    await failed.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
    await failed.route('**/api/pdf-map',route=>route.fulfill({status:503,body:'unavailable'}));
    await failed.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await failed.waitForFunction(()=>document.querySelector('.ocr-preview-mode option[value="pdf"]')?.textContent===
      'PDF 原文（加载失败）',null,{timeout:35000});
    const failureState=await failed.evaluate(()=>({
      mode:document.querySelector('.ocr-preview-mode').value,
      disabled:document.querySelector('.ocr-preview-mode option[value="pdf"]').disabled,
      splitDisabled:document.querySelector('.ocr-preview-split-toggle input').disabled,
      mdVisible:getComputedStyle(document.querySelector('.ocr-preview-md-scroll')).visibility,
      toolsHidden:document.querySelector('.ocr-preview-mode-tools[data-mode="pdf"]').hidden
    }));
    assert.deepEqual(failureState,{mode:'md',disabled:true,splitDisabled:true,
      mdVisible:'visible',toolsHidden:true},`${name} PDF failure should not unlock preview`);
  }finally{await failed.close()}
  assert.deepEqual(errors,[],name+' browser errors');
  assert.equal(hash(readFileSync(document)),hash(fixture));
  console.log('SHARED_PREVIEW_PASS',name,JSON.stringify({panes:initial.panels,modeDefault:initial.mode,
    modes:'md↔pdf',warmupGuard:beforeWarm.disabled,toolsRetracted:hiddenToolbar.hidden,
    pdfTransport,page3,scale,page8Highlight:true,errors:errors.length}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
assert.equal(hash(readFileSync(pdf)),pdfHash);
console.log('SHARED_PREVIEW_READONLY_PASS');
