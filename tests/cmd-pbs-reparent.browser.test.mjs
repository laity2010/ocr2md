/** Real AG pointer-to-child structural reparent: p1b5 -> p1b3s1 (origin p1b5).
 * Isolated temp source file; never save or alter any active user workspace. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createServer} from 'node:net';import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {chromeExecutable} from './platform.test-helper.mjs';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),temp=mkdtempSync(join(tmpdir(),'ocr2md-pbs-reparent-'));
const doc=join(temp,'test.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(temp,'no-pdf.pdf')},stdio:'ignore'});
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
try {
 let started=false;for(let i=0;i<180;i++){try{if((await fetch(url)).ok){started=true;break;}}catch{}await delay(170);}
 assert(started,'isolated Vite server failed');
 for(const [name,engine,path] of [['Chrome',chromium,chromeExecutable()],
   ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true,...(path?{executablePath:path}:{})});
  try {
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:1000}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
   await page.locator('#module-select').waitFor({state:'attached',timeout:90000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>/PBS 267（子块 43）/.test(document.querySelector('#status')?.textContent||''),null,{timeout:105000});
   const row=id=>page.locator(`.ocr-text-block-grid .ag-row[row-id="${id}"]`).first();
   // AG virtual rows do not exist outside its viewport; scroll the real
   // grid before resolving either pointer endpoint.
   await page.evaluate(async()=>{
     const viewport=document.querySelector('.ocr-text-block-grid .ag-body-vertical-scroll-viewport')||
       document.querySelector('.ocr-text-block-grid .ag-center-cols-viewport');
     if(!viewport)throw Error('AG viewport unavailable: '+[...document.querySelectorAll('.ocr-text-block-grid [class*=viewport]')].map(x=>x.className).slice(0,12));
     for(let top=300;top<=850;top+=55){
       viewport.scrollTop=top;
       await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
       if(document.querySelector('.ocr-text-block-grid [row-id="p1b5"]')&&
          document.querySelector('.ocr-text-block-grid [row-id="p1b3s0"]'))return;
     }
     throw Error('AG rows p1b5/p1b3s0 not simultaneously visible');
   });
   console.log('REPAR_BROWSER_STEP',name,'rows-visible');
   const handle=page.locator('[data-pbs-drag-handle="p1b5"]');
   await handle.waitFor({state:'visible',timeout:25000});
   const a=await handle.boundingBox(),b=await row('p1b3s0').boundingBox();
   assert(a&&b,`${name} native drag endpoints visible`);
   const start={x:a.x+a.width/2,y:a.y+a.height/2},end={x:b.x+Math.min(115,b.width-18),y:b.y+b.height/2};
   console.log('REPAR_BROWSER_STEP',name,'pointer-drag');
   await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:9});await page.mouse.up();
   console.log('REPAR_BROWSER_STEP',name,'pointer-released');
   console.log('REPAR_DROP_DIAG',JSON.stringify(await page.evaluate(({x,y})=>({
      pointed:document.elementFromPoint(x,y)?.closest('[row-id]')?.getAttribute('row-id'),
      element:document.elementFromPoint(x,y)?.outerHTML?.slice(0,250),
      current:window.__v6cm6.cm.readSource().match(/<!-- cmd:block:v1 id=\"p1b3s1\"[^\n]*/)?.[0],
      source:window.__v6cm6.cm.queryBlockChains().atoms.find(a=>a.id==='p1b5'),
      status:document.querySelector('#status')?.textContent,
      target:document.querySelector('.ocr-text-block-grid [row-id="p1b3s0"]')?.getBoundingClientRect().toJSON()
   }),end)));
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().atoms.some(a=>a.id==='p1b3s1'&&a.origin==='p1b5'),null,{timeout:45000});
   const after=await page.evaluate(()=>window.__v6cm6.cm.readSource());
   assert(after.includes('<!-- cmd:block:v1 id="p1b3s1" origin="p1b5" -->'));
   assert(!after.includes('<!-- cmd:block:v1 id="p1b5" -->'));
   assert(after.indexOf('id="p1b3s0"')<after.indexOf('id="p1b3s1"')&&
     after.indexOf('id="p1b3s1"')<after.indexOf('id="p1b4"'),
     `${name} entire source block must move immediately after native child`);
   assert(after.indexOf('id="p1b3s1"')<after.indexOf('Top Award')&&
     after.indexOf('Top Award')<after.indexOf('id="p1b4"'),
     `${name} Top Award text must move with the source annotation`);
   assert.equal(toMineruJSON(after),raw);
   await row('p1b3s1').waitFor({state:'attached',timeout:35000});
   // AG replaces virtual rows asynchronously after CM6 source commit;
   // only a completed UI update establishes absence of the old ID.
   await page.waitForFunction(()=>{
     const host=document.querySelector('.ocr-text-block-grid');
     return host?.querySelector('[row-id="p1b3s1"]')&&
       !host?.querySelector('[row-id="p1b5"]');
   },null,{timeout:28000});
   const ag=await page.evaluate(()=>{
     const r=document.querySelector('.ocr-text-block-grid .ag-row[row-id="p1b3s1"]');
     const grid=document.querySelector('.ocr-text-block-grid');
     const html=r?.innerText||'';
     const pdf=window.__v6cm6.pdf;
     const overlay=pdf?.blockCoverageRows?.find(x=>x.id==='p1b3s1');
     return {row:!!r,html,legacy:!!grid.querySelector('.ag-row[row-id="p1b5"]'),
       overlay:overlay||null,pdfCount:pdf?.blockCoverageRows?.length||0};
   });
   assert(ag.row&&!ag.legacy,`${name} AG must use new PBS ID: ${JSON.stringify(ag)}`);
   assert(ag.html.includes('Top Award'),`${name} moved OCR text must stay visible`);
   const neighbors=await page.evaluate(()=>{
     const host=document.querySelector('.ocr-text-block-grid');
     const first=host?.querySelector('[row-id="p1b3s0"]');
     const second=host?.querySelector('[row-id="p1b3s1"]');
     return {native:Number(first?.getAttribute('row-index')),
       added:Number(second?.getAttribute('row-index')),
       originTip:second?.querySelector('[title*="p1b5"]')?.getAttribute('title')};
   });
   assert.equal(neighbors.added,neighbors.native+1,
     `${name} child p1b3s1 must appear immediately after p1b3s0 in AG`);
   assert(neighbors.originTip?.includes('p1b5'),'AG should reveal original OCR origin');
   assert.equal(ag.overlay?.blockIndex,5,`${name} PDF label must use original physical bbox`);
   assert.equal(ag.overlay?.pageIndex,1);
   assert.equal(readFileSync(doc,'utf8'),source,'no auto-save');
   await page.locator('#undo').evaluate(el=>el.click());
   await page.waitForFunction(src=>window.__v6cm6.cm.readSource()===src,source,{timeout:30000});
   await page.locator('#redo').evaluate(el=>el.click());
   console.log('REPAR_BROWSER_STEP',name,'pointer-released');
   console.log('REPAR_DROP_DIAG',JSON.stringify(await page.evaluate(({x,y})=>({
      pointed:document.elementFromPoint(x,y)?.closest('[row-id]')?.getAttribute('row-id'),
      element:document.elementFromPoint(x,y)?.outerHTML?.slice(0,250),
      current:window.__v6cm6.cm.readSource().match(/<!-- cmd:block:v1 id=\"p1b3s1\"[^\n]*/)?.[0],
      source:window.__v6cm6.cm.queryBlockChains().atoms.find(a=>a.id==='p1b5'),
      status:document.querySelector('#status')?.textContent,
      target:document.querySelector('.ocr-text-block-grid [row-id="p1b3s0"]')?.getBoundingClientRect().toJSON()
   }),end)));
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().atoms.some(a=>a.id==='p1b3s1'),null,{timeout:30000});
   assert.deepEqual(errors,[]);
   console.log('PBS_AG_REPARENT_BROWSER_PASS',name,{from:'p1b5',to:'p1b3s1',
     sourceOrigin:true,agProjection:true,pdfOriginalBox:true,undoRedo:true,noSave:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
