/** PDF navigation is click-only, never driven by Markdown scroll/caret/preview switch. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
const sha=b=>createHash('sha256').update(b).digest('hex');
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const pdfHash=sha(readFileSync(pdf));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
for(let i=0;i<engines.length;i++){
 const [name,engine,options]=engines[i],port=4710+i;
 const url=`http://127.0.0.1:${port}/`;
 const document=resolve(`.v6/tests/pdf-click-only-${name.toLowerCase()}-${process.pid}.md`);
 writeFileSync(document,fixture);
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:document,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser;
 try{
  let ok=false;for(let j=0;j<100;j++){try{if((await fetch(url+'healthz')).ok){ok=true;break;}}catch{}await sleep(120);}
  assert(ok,`isolated PDF server ${name} unavailable`);
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
    document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0&&
    document.querySelectorAll('.ocr-outline-checkbox').length===21,null,{timeout:65000});
  const pdfSnapshot=()=>page.evaluate(()=>({
    top:document.querySelector('.ocr-pdf-scroller').scrollTop,
    page:document.querySelector('.ocr-pdf-page').value,
    overlays:[...document.querySelectorAll('.ocr-pdf-region-overlay')].map(e=>[e.dataset.pdfPage,e.dataset.blockIndex]),
  }));
  const stable=async()=>{await page.waitForTimeout(700);return pdfSnapshot()};
  // Select a chapter by explicit AG click and reveal it in PDF preview.
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.locator('.ag-row[row-index="4"] [col-id="title"]').click();
  await page.waitForFunction(()=>{
    const e=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]');
    const s=document.querySelector('.ocr-pdf-scroller');
    if(!e||!s)return false;
    const a=e.getBoundingClientRect(),b=s.getBoundingClientRect();
    return a.width>1&&a.height>1&&a.top>=b.top-4&&a.bottom<=b.bottom+4;
  },null,{timeout:18500});
  const chosen=await stable();
  assert.equal(chosen.page,'3');

  // Merely switching preview modes must not use the last MD scroll anchor.
  await page.locator('.ocr-preview-mode').selectOption('md');
  await page.locator('.cm-scroller').evaluate(el=>{el.scrollTop+=12500;});
  await page.locator('.ocr-preview-md-scroll').evaluate(el=>{el.scrollTop+=9500;});
  await page.waitForTimeout(1100);
  const afterScroll=await stable();
  assert.equal(afterScroll.page,chosen.page,'PDF page followed MD scroll while hidden');
  assert.deepEqual(afterScroll.overlays,chosen.overlays,'PDF highlighted block followed MD scroll');
  assert(Math.abs(afterScroll.top-chosen.top)<5,
    `PDF scrolled due to Markdown continuous scroll ${JSON.stringify({chosen,afterScroll})}`);
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  const afterToggle=await stable();
  assert.equal(afterToggle.page,chosen.page,'Mode switch navigated PDF by MD position');
  assert.deepEqual(afterToggle.overlays,chosen.overlays);
  assert(Math.abs(afterToggle.top-chosen.top)<5,
    'Switching to PDF incorrectly scrolls to current MD location');

  // Explicit click at a distant chapter is still a real PDF navigation.
  await page.locator('.ag-row[row-index="10"] [col-id="title"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="13"]') ||
    document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="16"]'),null,{timeout:18000});
  const next=await stable();
  assert.notEqual(next.page,'3');

  // PDF reading scroll must not move the source/AG selection or force back
  // the old highlight into view when the user is freely reading.
  const beforeReading=await page.evaluate(()=>({
    source:document.querySelector('.cm-scroller').scrollTop,
    selected:document.querySelector('.ag-row[aria-selected="true"]')?.getAttribute('row-index'),
  }));
  await page.locator('.ocr-pdf-scroller').evaluate(el=>{el.scrollTop+=2100;});
  await page.waitForTimeout(1250);
  const afterReading=await page.evaluate(()=>({
    source:document.querySelector('.cm-scroller').scrollTop,
    selected:document.querySelector('.ag-row[aria-selected="true"]')?.getAttribute('row-index'),
  }));
  assert.equal(afterReading.selected,beforeReading.selected,'PDF wheel reading selected another AG row');
  assert(Math.abs(afterReading.source-beforeReading.source)<5,'PDF scroll moved CM6 without click');

  await page.locator('.ocr-preview-mode').selectOption('md');
  await page.screenshot({path:`.v6/evidence/pdf-click-only-${name.toLowerCase()}.png`,timeout:15000});
  assert.deepEqual(errors,[],name+' browser errors');
  assert.equal(sha(readFileSync(document)),sha(fixture));
  console.log('PDF_CLICK_ONLY_PASS',name,JSON.stringify({before:chosen,afterScroll,afterToggle,
    clickedPage:next.page,manualReadingNoReverseSync:true}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
assert.equal(sha(readFileSync(pdf)),pdfHash);
console.log('PDF_CLICK_ONLY_ISOLATION_PASS');
