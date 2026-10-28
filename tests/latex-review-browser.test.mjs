/** LaTeX review = CM6 Markdown comments, no separate document persistence.
 * Tests fenced and undelimited inline formulas, Undo/Redo, save/reload.
 */
import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers,planReviewEdit,planReviewAnnotations} from '../ui/latex-review-markers.js';
import {scanAnnotations} from '../ui/cmd-annotations.js';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const first=findLatex(fixture)[0];
assert.equal(first.kind,'独立');
// One HTML annotation followed by native math delimiters; no closing comment.
const original={...first,raw:fixture.slice(first.from,first.to)};
const intended=planReviewAnnotations(fixture,original,'latex','0123456789abcdef');
assert.deepEqual(intended.map(x=>x.action),['insert','text']);
assert.equal(intended[0].tag,'ocr2md:latex');
assert(!intended.some(op=>op.tag==='/ocr2md:latex'));

const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
mkdirSync('.v6/evidence',{recursive:true});
for(const [index,[name,engine,options]] of engines.filter(x=>!process.env.OCR_WEBKIT_ONLY||x[0]==='WebKit').entries()){
 const root=resolve(`.v6/tests/latex-cm-review-${process.pid}-${index}`);
 mkdirSync(root,{recursive:true});
 const doc=resolve(root,'book.md'),token=resolve(root,'auth');
 const key=`local-latex-cm-review-${index}`;
 writeFileSync(doc,fixture);writeFileSync(token,key);
 const port=5660+index,base=`http://127.0.0.1:${port}`;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_TOKEN_PATH:token,
   V6_SETTINGS_PATH:resolve(root,'settings.json'),V6_STATIC_ROOT:resolve('dist')}});
 let browser;
 try{
  let ready=false;
  for(let i=0;i<120;i++){
   try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}
   await pause(110);
  }
  assert(ready,'isolated test service unavailable');
  assert.equal((await fetch(base+'/api/latex/reviews')).status,404);
  assert.equal((await fetch(base+'/api/latex/review',{method:'POST'})).status,404);
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  // Establish edit authorization before the page's initial /api/session check;
  // CMD caches that permission until the next unlock probe.
  await page.context().addCookies([{name:'v6edit',value:key,domain:'127.0.0.1',path:'/'}]);
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await selectModule(page,'latex');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-review-select').length>1,
    null,{timeout:23000});
  const display=page.locator('.ocr-latex-grid .ag-row:not(.ag-opacity-zero)[row-index="0"] .ocr-latex-review-select').first();
  const inline=page.locator('.ocr-latex-grid .ag-row:not(.ag-opacity-zero)[row-index="1"] .ocr-latex-review-select').first();
  assert.deepEqual(await display.locator('option').allTextContents(),['待复核','latex','忽略']);
  assert.equal(await display.inputValue(),'待复核');
  // Reverse focus contract: real clicks in the CM6 source and Markdown
  // preview must select and reveal the corresponding existing LaTeX AG row.
  const rowSelected=idx=>page.locator(`.ocr-latex-grid .ag-row[row-index="${idx}"].ag-row-selected`).count();
  await page.locator('.ocr-latex-grid .ag-row[row-index="1"] [col-id="line"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-latex-grid .ag-row[row-index="1"].ag-row-selected'),
    null,{timeout:11000});
  await page.locator('.cm-line').filter({hasText:'L _ {t} ='}).first().click();
  await page.waitForFunction(()=>document.querySelector('.ocr-latex-grid .ag-row[row-index="0"].ag-row-selected'),
    null,{timeout:12000});
  assert.equal(await rowSelected(0),1,'Source click did not focus LaTeX AG first formula');
  await page.locator('.ocr-latex-grid .ag-row[row-index="3"] [col-id="line"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-latex-grid .ag-row[row-index="3"].ag-row-selected'),
    null,{timeout:10000});
  await page.locator('.ocr-markdown .ocr-math[data-source-start="231"]').first().click();
  await page.waitForFunction(()=>document.querySelector('.ocr-latex-grid .ag-row[row-index="0"].ag-row-selected'),
    null,{timeout:12000});
  assert.equal(await rowSelected(0),1,'Preview formula click did not focus LaTeX AG');
  // CMD prepends metadata and shifts every following scanner offset. The AG
  // projection must keep unrelated review controls mounted, not replace the
  // entire rowData on each review/Undo/Redo.
  await page.evaluate(()=>{
    window.__latexUnchangedReview=document.querySelector(
      '.ocr-latex-grid .ag-row:not(.ag-opacity-zero)[row-index="1"] .ocr-latex-review-select');
  });
  await display.selectOption('latex');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1'),
    null,{timeout:10000});
  assert.equal(await page.evaluate(()=>window.__latexUnchangedReview===document.querySelector(
    '.ocr-latex-grid .ag-row:not(.ag-opacity-zero)[row-index="1"] .ocr-latex-review-select')),
    true,'Unrelated LaTeX review control was remounted after marking another formula');
  assert.equal(await inline.inputValue(),'待复核');
  // Confirmed standalone formula uses Obsidian's own-line $$ delimiters;
  // inline math keeps its original $...$ convention.
  let current=await page.evaluate(async()=> (await fetch('/api/document')).text());
  assert.equal(current,fixture,'no implicit server write before global CMD Save');
  await page.locator('#undo').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 0'),
    null,{timeout:10000});
  assert.equal(await display.inputValue(),'待复核');
  await page.locator('#redo').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1'),
    null,{timeout:10000});
  // Confirming an undelimited inline formula must render actual KaTeX in
  // the MD projection, without altering the TeX body or neighboring prose.
  await inline.selectOption('latex');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 2'),
    null,{timeout:10000});
  // Source line shifts when the display formula is formatted into multiple
  // physical lines. Read the real AG source coordinate, never hardcode -2.
  const inlineLine=Number(await page.locator('.ocr-latex-grid .ag-row[row-index="1"] [col-id="line"]').first().textContent());
  assert(Number.isFinite(inlineLine)&&inlineLine>=0);
  await page.waitForFunction(line=>[...document.querySelectorAll('.ocr-markdown [data-source-start][data-source-end]')]
    .some(el=>Number(el.dataset.sourceStart)<=line&&line<Number(el.dataset.sourceEnd)&&
      el.querySelector('.ocr-reviewed-inline-latex .katex')&&el.textContent.includes('is total assets')),
    inlineLine,{timeout:12000});
  assert.equal(await page.locator('.ocr-markdown .ocr-reviewed-inline-latex .katex').count(),1);
  await inline.selectOption('忽略');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('忽略 1'),
    null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-markdown .ocr-reviewed-inline-latex .katex').length===0,
    null,{timeout:12000});
  assert.equal(await page.locator('.ocr-markdown .ocr-reviewed-inline-latex .katex').count(),0,
    'ignored formula must revert to ordinary prose');
  // The read-only preview must retain the whole inline formula paragraph after
  // CMD inserts a single HTML comment, and retain its source-line anchor.
  await page.waitForFunction(line=>[...document.querySelectorAll('.ocr-markdown [data-source-start][data-source-end]')]
    .some(el=>Number(el.dataset.sourceStart)<=line && line<Number(el.dataset.sourceEnd)
      && el.textContent?.trim().length>25),inlineLine,{timeout:11000});
  await page.locator('.ocr-latex-grid .ag-row:not(.ag-opacity-zero)[row-index="1"] [col-id="line"]').first().click();
  await page.waitForFunction(line=>[...document.querySelectorAll('.ocr-markdown .ocr-outline-focused-element')]
    .some(el=>Number(el.dataset.sourceStart)<=line&&line<Number(el.dataset.sourceEnd)),
    inlineLine,{timeout:12000});
  // Inspect live source by selecting the CMS-visible source, not a parallel model.
  assert.equal(await inline.inputValue(),'忽略');
  const chosen=await page.locator('#status').textContent();
  assert(chosen.includes('latex 1')&&chosen.includes('忽略 1'));
  await page.screenshot({path:`.v6/evidence/latex-cm-review-${name.toLowerCase()}.png`});
  // Only global CMD Save persists the inline/standalone audit markers.
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
    null,{timeout:18000});
  const saved=readFileSync(doc,'utf8');
  const savedAnnotations=scanAnnotations(saved).filter(x=>x.tag==='ocr2md:latex');
  assert.equal(savedAnnotations.length,2);
  assert(savedAnnotations.some(x=>x.attributes.review==='latex')&&
    savedAnnotations.some(x=>x.attributes.review==='忽略'));
  assert(savedAnnotations.every(x=>x.raw.includes('id="')),
    'new LaTeX reviews must be serialized by CMD');
  assert.equal(findLatex(saved).length,42,'source scanner should still find all formulas');
  const marked=findLatex(saved).map(x=>({...x,raw:saved.slice(x.from,x.to)}));
  findReviewMarkers(saved,marked);
  assert.equal(marked.filter(x=>x.status==='latex').length,1);
  assert.equal(marked.filter(x=>x.status==='忽略').length,1);
  assert.equal(marked[0].content,findLatex(fixture)[0].content,'standalone formula unchanged');
  assert.equal(marked[1].content,findLatex(fixture)[1].content,'inline formula unchanged');
  // Muse Ubuntu audit (38ea47d) exposed a startup race: if the module is
  // selected while the reloaded document is still fetching, generic 'loaded'
  // status overwrites the plugin's restored review counts. Delay ONLY the
  // reload's /api/document response to deterministically exercise that race.
  await page.route('**/api/document',async route=>{
    await pause(2400);
    await route.continue();
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await selectModule(page,'latex');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-review-select').length>=2,
    null,{timeout:28000});
  // Stored values and the status channel must both be restored. A Mac run of
  // the unfixed 38ea47d restored values while displaying only '✓ 已加载'.
  assert.equal(await display.inputValue(),'latex','reloaded formula review was lost');
  assert.equal(await inline.inputValue(),'忽略','reloaded inline review was lost');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1 / 忽略 1'),
    null,{timeout:25000});
  assert.equal(await display.inputValue(),'latex');
  assert.equal(await inline.inputValue(),'忽略');
  await inline.selectOption('待复核');
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('latex 1 / 忽略 0'),
    null,{timeout:10000});
  assert.equal(readFileSync(doc,'utf8'),saved,'reset remains unsaved until global Save');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
    null,{timeout:18000});
  assert.equal(findReviewMarkers(readFileSync(doc,'utf8'),findLatex(readFileSync(doc,'utf8')))
    .filter(x=>x.status==='忽略').length,0);
  assert.deepEqual(errors,[],name+' page errors');
  console.log('LATEX_CM_REVIEW_PASS',name,JSON.stringify({inline:true,standalone:true,undoRedo:true,
    saveReload:true,inlineKatex:true,ignoredPlain:true,cmdAnnotations:true,deltaApiRemoved:true,sourceSingle:true}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
