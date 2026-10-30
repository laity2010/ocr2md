import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
/** Regression: LaTeX AG click navigates all four visible peers (AG/CM6/MD/PDF).
 * Test copies source into isolation, never modifies a user's working document.
 */
import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
// Freeze source anchors and human review markers; never bind regression to the
// user's live Markdown or an iCloud-only PDF path.
// Deterministic gzip retains original OCR whitespace byte-for-byte, including
// significant trailing spaces that a source checkout must never normalize.
const markdown=gunzipSync(readFileSync(
  'tests/fixtures/buffetts-alpha-four-view-reviewed.md.gz')).toString('utf8');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const math=findLatex(markdown);
assert.equal(math.length,42);
assert.equal(math.filter(row=>row.kind==='独立').length,20);
assert.equal(math.filter(row=>row.detection==='inferred').length,0);
assert.equal(math[0].line,757);
const wait=ms=>new Promise(done=>setTimeout(done,ms));
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const engines=[['Chrome',chromium,{executablePath:chromeExecutable()}],
  ['WebKit',webkit,{executablePath:webkitExecutable()}]];
for(let i=0;i<engines.length;i++){
 const [name,engine,options]=engines[i];
 const document=resolve(`.v6/tests/latex-four-view-${process.pid}-${i}.md`);
 writeFileSync(document,markdown);
 const port=5640+i,base=`http://127.0.0.1:${port}/`;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',
   env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:document,
     V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist')}});
 let browser;
 try{
  let live=false;
  for(let k=0;k<120;k++){
   try{if((await fetch(base+'healthz')).ok){live=true;break;}}catch{}
   await wait(120);
  }
  assert(live,'isolated V6 server unavailable');
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await selectModule(page,'latex');
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪' &&
    !document.querySelector('.ocr-preview-split-toggle input')?.disabled,null,{timeout:65000});
  await page.locator('.ocr-preview-split-toggle input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===4&&
    document.querySelector('.ocr-detached-pdf-pane .pdfViewer'),null,{timeout:20000});
  const initial=await page.locator('.cm-scroller').evaluate(el=>el.scrollTop);
  await page.locator('.ocr-latex-grid .ag-row[row-index="0"] [col-id="line"]').click();
  await page.waitForFunction(firstLine=>{
    const source=document.querySelector('.cm-scroller');
    const matching=document.querySelector('.ocr-markdown .ocr-math.ocr-outline-focused-element');
    const overlay=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="6"][data-block-index="5"]');
    return source?.scrollTop>400 && matching?.dataset.sourceStart===String(firstLine) && overlay;
  },math[0].line,{timeout:25000});
  await page.waitForTimeout(450);
  const result=await page.evaluate(()=>{
    const s=document.querySelector('.cm-scroller'),m=document.querySelector('.ocr-preview-md-scroll');
    const focused=document.querySelector('.ocr-markdown .ocr-math.ocr-outline-focused-element');
    const overlay=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="6"][data-block-index="5"]');
    const viewport=document.querySelector('.ocr-pdf-scroller');
    const box=overlay?.getBoundingClientRect(),clip=viewport?.getBoundingClientRect();
    const previewBox=focused?.getBoundingClientRect(),previewClip=m?.getBoundingClientRect();
    return {sourceScroll:s?.scrollTop,previewScroll:m?.scrollTop,
      focusedLine:focused?.dataset.sourceStart,
      previewVisible:previewBox&&previewClip?previewBox.bottom>previewClip.top && previewBox.top<previewClip.bottom:false,
      pdfPage:overlay?.dataset.pdfPage,pdfBlock:overlay?.dataset.blockIndex,
      pdfVisible:box&&clip?box.bottom>clip.top&&box.top<clip.bottom:false,
      windows:document.querySelectorAll('.dv-groupview').length};
  });
  assert(result.sourceScroll>initial+200,'LaTeX AG click did not scroll CM6: '+JSON.stringify(result));
  assert.equal(result.focusedLine,String(math[0].line),'MD formula block not highlighted');
  assert(result.previewVisible,'MD formula not brought into visible preview: '+JSON.stringify(result));
  assert.equal(result.pdfPage,'6');assert.equal(result.pdfBlock,'5');
  assert(result.pdfVisible,'PDF OCR math block not visible: '+JSON.stringify(result));
  assert.equal(result.windows,4);
  await page.locator('.ocr-latex-grid .ag-row[row-index="1"] [col-id="line"]').click();
  await page.waitForFunction(secondLine=>{
    const focus=document.querySelector('.ocr-markdown .ocr-outline-focused-element');
    const start=Number(focus?.dataset.sourceStart),end=Number(focus?.dataset.sourceEnd);
    const overlay=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="6"][data-block-index="6"]');
    return start<=secondLine&&end>secondLine&&overlay;
  },math[1].line,{timeout:25000});
  const inline=await page.evaluate(()=>{
    const focus=document.querySelector('.ocr-markdown .ocr-outline-focused-element');
    const overlay=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="6"][data-block-index="6"]');
    const pane=document.querySelector('.ocr-pdf-scroller');
    const a=overlay?.getBoundingClientRect(),b=pane?.getBoundingClientRect();
    return {from:focus?.dataset.sourceStart,to:focus?.dataset.sourceEnd,
      pdfPage:overlay?.dataset.pdfPage,pdfBlock:overlay?.dataset.blockIndex,
      pdfVisible:a&&b?a.bottom>b.top&&a.top<b.bottom:false};
  });
  assert(inline.pdfVisible,'undelimited inline equation PDF region not visible: '+JSON.stringify(inline));
  await page.screenshot({path:`.v6/evidence/latex-four-view-${name.toLowerCase()}.png`,timeout:22000});
  assert.deepEqual(errors,[],name+' page exceptions');
  assert.equal(readFileSync(document,'utf8'),markdown,'review navigation cannot edit source');
  console.log('LATEX_FOUR_VIEW_PASS',name,JSON.stringify({...result,inline}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
