/** Regression: iPad Safari screen crop, click PDF highlight must be genuinely visible. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const hash=x=>createHash('sha256').update(x).digest('hex');
const sample=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const pdfSha=hash(readFileSync(pdf));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
for(const [i,[name,engine,launch]] of engines.entries()){
 const port=4800+i, url=`http://127.0.0.1:${port}/`;
 const doc=resolve(`.v6/tests/pdf-anchor-${name.toLowerCase()}-${process.pid}.md`);
 writeFileSync(doc,sample);
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser;
 try{
  let up=false;for(let n=0;n<120;n++){
   try{if((await fetch(url+'healthz')).ok){up=true;break;}}catch{}await delay(120);
  }assert(up,'test server unavailable');
  browser=await engine.launch({headless:true,...launch});
  // Larger iPad landscape Safari frame exposes the 34px scrollport-vs-screen crop.
  const page=await browser.newPage({viewport:{width:1408,height:1056},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
   document.querySelectorAll('.ag-row').length>10&&document.querySelector('.ocr-pdf-scroller .page'),
   null,{timeout:65000});
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.locator('.ag-row[row-index="4"] [col-id="title"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"][data-block-index="4"]'),null,{timeout:19000});
  await delay(1400);
  // The precise screenshot case: AG heading at source line 225, OCR page 3 block 6.
  await page.locator('.ag-row[row-index="5"] [col-id="title"]').click();
  const visible=()=>page.evaluate(()=>{
    const e=document.querySelector('.ocr-pdf-region-overlay');
    const s=document.querySelector('.ocr-pdf-scroller');
    if(!e||!s)return null;
    const b=e.getBoundingClientRect(),p=s.getBoundingClientRect(),vv=window.visualViewport;
    const top=Math.max(0,p.top,vv?.offsetTop??0);
    const bottom=Math.min(p.bottom,window.innerHeight,(vv?.offsetTop??0)+(vv?.height??window.innerHeight));
    const left=Math.max(0,p.left,vv?.offsetLeft??0);
    const right=Math.min(p.right,window.innerWidth,(vv?.offsetLeft??0)+(vv?.width??window.innerWidth));
    return {page:e.dataset.pdfPage,block:e.dataset.blockIndex,
      top:b.top,bottom:b.bottom,left:b.left,right:b.right,
      viewportTop:top,viewportBottom:bottom,viewportLeft:left,viewportRight:right,
      scrollerBottom:p.bottom,windowBottom:window.innerHeight,scrolled:s.scrollTop};
  });
  await page.waitForFunction(()=>{
    const e=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"][data-block-index="6"]');
    const s=document.querySelector('.ocr-pdf-scroller');
    if(!e||!s)return false;
    const a=e.getBoundingClientRect(),r=s.getBoundingClientRect(),vv=window.visualViewport;
    const clipTop=Math.max(0,r.top,vv?.offsetTop??0);
    const clipBottom=Math.min(r.bottom,window.innerHeight,(vv?.offsetTop??0)+(vv?.height??window.innerHeight));
    return a.top>=clipTop+12&&a.bottom<=clipBottom-12;
  },null,{timeout:25000});
  await delay(2400); // The original bug resurfaced after the async PDF layout settled.
  const located=await visible();
  assert.equal(located.page,'3');assert.equal(located.block,'6');
  assert(located.top>=located.viewportTop+12&&located.bottom<=located.viewportBottom-12,
    `PDF anchor scrolled outside physical screen: ${JSON.stringify(located)}`);
  assert(located.scrollerBottom>located.windowBottom,
    'test must exercise the original PDF scrollport cropped by screen');
  await page.screenshot({path:`.v6/evidence/pdf-anchor-visible-${name.toLowerCase()}.png`,timeout:18000});
  // Continuous Markdown scroll should never change PDF position.
  await page.locator('.ocr-preview-mode').selectOption('md');
  await page.locator('.cm-scroller').evaluate(e=>{e.scrollTop+=10000;});
  await delay(850);
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await delay(650);
  const unchanged=await visible();
  assert.equal(unchanged.page,'3');assert.equal(unchanged.block,'6');
  assert(Math.abs(unchanged.scrolled-located.scrolled)<5,'PDF followed Markdown scrolling');
  assert.deepEqual(errors,[]);
  assert.equal(hash(readFileSync(doc)),hash(sample),'isolated MD document changed');
  console.log('PDF_VISIBLE_ANCHOR_PASS',name,JSON.stringify({located,scrollIndependent:true,jsErrors:errors.length}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
assert.equal(hash(readFileSync(pdf)),pdfSha,'PDF evidence changed');
console.log('PDF_VISIBLE_ANCHOR_READONLY_PASS');
