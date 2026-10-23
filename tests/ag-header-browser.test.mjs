/** AG header iPad-sized actual hit targets: pin/title/order, resize and filter. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
const sha=x=>createHash('sha256').update(x).digest('hex');
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
for(const [i,[name,engine,launch]] of engines.entries()){
 const port=5227+i, url=`http://127.0.0.1:${port}/`;
 const doc=resolve(`.v6/tests/ag-header-${name.toLowerCase()}-${process.pid}.md`);
 writeFileSync(doc,original);
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc},stdio:'ignore'});
 let browser;
 try{
  let up=false;for(let j=0;j<160;j++){
   try{if((await fetch(url)).ok){up=true;break;}}catch{}await wait(120);
  }assert(up,`Vite ${name} not ready`);
  browser=await engine.launch({headless:true,...launch});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
  // Layout mounts independent Media/LaTeX AG instances even while hidden.
  // Only the Chapter AG header count is part of this contract.
  await page.waitForFunction(()=>window.__v6cm6?.outline?.rows.length===21&&
   window.__v6cm6?.outline?.api?.getAllDisplayedColumns().length===5,null,{timeout:65000});
  const state=await page.evaluate(()=>{
    const api=window.__v6cm6.outline.api;
    return {fields:api.getAllDisplayedColumns().map(c=>c.getColId()),
      titlePinned:api.getColumn('title').getPinned(),pdfPinned:api.getColumn('pdfPage').getPinned(),
      titleWidth:api.getColumn('title').getActualWidth(),
      otherPinned:api.getColumn('level').getPinned()};
  });
  assert.deepEqual(state.fields,['title','level','pdfPage','independent','chapterFile']);
  assert.equal(state.titlePinned,'left');assert.equal(state.pdfPinned,null);
  assert.equal(state.otherPinned,null);
  const title=page.locator('.ag-header-cell[col-id="title"]');
  const geom=await page.evaluate(()=>[...document.querySelectorAll('.ocr-outline-grid .ag-header-cell')].map(cell=>{
    const rect=x=>x?.getBoundingClientRect();
    const f=rect(cell.querySelector('.ag-header-cell-filter-button'));
    const r=rect(cell.querySelector('.ag-header-cell-resize'));
    const c=rect(cell);
    return {col:cell.getAttribute('col-id'),width:c.width,filterRight:f?.right,
      resizeLeft:r?.left,resizeWidth:r?.width,gap:r.left-f.right,
      filterCenter:[f.left+f.width/2,f.top+f.height/2],
      resizeCenter:[r.left+r.width/2,r.top+r.height/2]};
  }));
  assert.equal(geom.length,5,'chapter AG must expose all five column hit areas');
  for(const g of geom){
    assert(g.resizeWidth>=14,`${name}/${g.col} resize hit area too small ${g.resizeWidth}`);
    assert(g.gap>=9,`${name}/${g.col} filter and resize overlap ${g.gap}`);
  }
  // Real touch: the title filter must open without accidentally initiating
  // native resize on the adjacent 16px handler.
  await title.locator('.ag-header-cell-filter-button').tap();
  await page.locator('.ocr-enum-filter[aria-label="标题 筛选"]:visible').waitFor({timeout:12000});
  await page.evaluate(()=>window.__v6cm6.outline.api.hideColumnFilter());
  // Native AG Grid resize via the actual handler, not by setting API width.
  const r=title.locator('.ag-header-cell-resize');
  const bound=await r.boundingBox();assert(bound);
  const start={x:bound.x+bound.width/2,y:bound.y+bound.height/2};
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(start.x+45,start.y,{steps:8});await page.mouse.up();
  await page.waitForFunction(old=>window.__v6cm6.outline.api.getColumn('title').getActualWidth()>old+25,
    state.titleWidth,{timeout:10000});
  const resizedWidth=await page.evaluate(()=>window.__v6cm6.outline.api.getColumn('title').getActualWidth());
  // Pinning survives sideways scroll of the unpinned columns.
  const before=await title.boundingBox();
  await page.evaluate(()=>window.__v6cm6.outline.api.ensureColumnVisible('chapterFile'));
  const after=await title.boundingBox();
  assert(Math.abs(before.x-after.x)<2,`${name} pinned title moved in horizontal scroll`);
  assert.equal(await page.evaluate(()=>window.__v6cm6.outline.api.getColumn('title').getPinned()),'left');
  await page.screenshot({path:`.v6/evidence/ag-header-${name.toLowerCase()}.png`,timeout:16000});
  assert.deepEqual(errors,[]);
  assert.equal(sha(readFileSync(doc)),sha(original));
  console.log('AG_HEADER_TOUCH_PASS',name,JSON.stringify({columns:state.fields,titlePinned:true,
    measured:geom.map(x=>({col:x.col,gap:x.gap,resizeWidth:x.resizeWidth})),
    beforeWidth:state.titleWidth,afterWidth:resizedWidth,tapFilter:true}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
console.log('AG_HEADER_ISOLATED_READONLY_PASS');
