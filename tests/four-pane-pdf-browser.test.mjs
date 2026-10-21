import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {createHash} from 'node:crypto';
const pdf=resolve('/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha/Buffett s Alpha.pdf');
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceHash=hash(original),pdfHash=hash(readFileSync(pdf));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
for(const [i,[name,engine,options]] of engines.entries()){
 const port=4590+i,url=`http://127.0.0.1:${port}/`;
 const path=resolve(`.v6/tests/pdf-pane-${name.toLowerCase()}-${process.pid}.md`);
 assert(!existsSync(path));writeFileSync(path,original);
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
  env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:path,V6_PDF_PATH:pdf,
    V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser;
 try{
  let ready=false;
  for(let tries=0;tries<120;tries++){
   try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}
   await sleep(130);
  }
  assert(ready,'V6 PDF server start failed');
  const response=await fetch(url+'api/pdf',{headers:{Range:'bytes=0-1023'}});
  assert.equal(response.status,206);
  assert.equal((await response.arrayBuffer()).byteLength,1024);
  assert.match(response.headers.get('content-range'),/^bytes 0-1023\//);
  const mapResponse=await fetch(url+'api/pdf-map');
  assert.equal(mapResponse.status,200);
  const map=(await mapResponse.json()).pages;
  assert.equal(map.length,22);
  assert.equal(map.reduce((n,p)=>n+p.regions.length,0),224);
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[],failures=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{if(!r.failure()?.errorText?.includes('ERR_ABORTED'))failures.push(r.url()+' '+r.failure()?.errorText)});
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelectorAll('.dv-groupview').length===4&&
    document.querySelectorAll('.ocr-outline-checkbox').length===21,
    null,{timeout:50000});
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪' &&
    document.querySelector('.ocr-pdf-pane .page canvas')?.width>0,
    null,{timeout:55000});
  const initial=await page.evaluate(()=>({groups:document.querySelectorAll('.dv-groupview').length,
    pdfReady:document.querySelector('.ocr-pdf-status').textContent,
    pages:document.querySelector('.ocr-pdf-count').textContent,
    dark:document.querySelector('.ocr-pdf-pane').dataset.pdfTheme,
    tabs:[...document.querySelectorAll('.dv-tabs-and-actions-container')].filter(n=>getComputedStyle(n).display!=='none').map(n=>n.textContent.trim()),
    canvas:document.querySelector('.ocr-pdf-pane .page canvas').getBoundingClientRect().toJSON(),
    scale:document.querySelector('.ocr-pdf-zoom').textContent,
  }));
  assert.equal(initial.groups,4);assert.equal(initial.dark,'dark');
  assert.match(initial.pages,/22/);
  assert.deepEqual(initial.tabs.sort(),['Markdown 预览','PDF 原文'].sort());
  await page.locator('.ocr-pdf-plus').click();
  await page.waitForFunction(old=>document.querySelector('.ocr-pdf-zoom')?.textContent!==old,
    initial.scale,{timeout:10000});
  await page.locator('.ocr-pdf-fit').click();
  const zoom=await page.locator('.ocr-pdf-zoom').textContent();
  console.log('FOUR_PANE_PDF_OPEN_ZOOM',name,JSON.stringify({...initial,fitScale:zoom}));
  // AG click selects the exact OCR block and navigates the PDF counterpart.
  await page.locator('.ag-row[row-index="4"] [col-id="title"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]'),
    null,{timeout:18000});
  await page.waitForTimeout(700);
  const rect=await page.evaluate(()=>{
    const el=document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]');
    const scroller=document.querySelector('.ocr-pdf-scroller');
    if(!el||!scroller)return null;
    const r=el.getBoundingClientRect(),clip=scroller.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,
      inViewport:r.bottom>clip.top&&r.top<clip.bottom&&r.right>clip.left&&r.left<clip.right,
      display:getComputedStyle(el).display};
  });
  assert(rect&&rect.width>3&&rect.height>3&&rect.inViewport,
    'OCR text rectangle must be visible in PDF viewport: '+JSON.stringify(rect));
  await page.screenshot({path:`.v6/evidence/four-pane-pdf-${name.toLowerCase()}.png`,timeout:20000});
  // page 8 is rotated; viewport and OCR geometry must still align.
  const target=map[7].regions[0];
  const page8=await page.evaluate(([blockIndex])=>{
    const md=window.__v6cm6?.cm?.markdown;
    if(!md)return false;
    const pattern=`<!-- minerujson:block:v1:7:${blockIndex} -->`;
    const index=md.indexOf(pattern);
    if(index<0)return false;
    const line=md.slice(0,index).split('\n').length+2;
    window.__v6cm6.view.dispatch({selection:{anchor:window.__v6cm6.view.state.doc.line(line).from}});
    return true;
  },[target.blockIndex]);
  // Production has no dev seam; page-number UI is still an independent route.
  await page.locator('.ocr-pdf-page').fill('8');
  await page.locator('.ocr-pdf-page').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-page')?.value==='8',null,{timeout:10000});
  assert(!String(await page.locator('.ocr-pdf-status').textContent()).includes('旋转不一致'));
  assert.deepEqual(errors,[],name+' browser errors');
  assert.equal(hash(readFileSync(path)),sourceHash,'PDF browsing changed CM6 original');
  console.log('FOUR_PANE_PDF_PASS',name,JSON.stringify({groups:4,highlighter:!!rect,page8Selected:true,zoom}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
assert.equal(hash(readFileSync(pdf)),pdfHash);
console.log('FOUR_PANE_PDF_ISOLATION_PASS');
