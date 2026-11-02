/** WP1: browser acceptance of newly generated PBS source and CMD/AG read-only view.
 * Synthetic, isolated temp source; no workspace, account or persistent edits. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
assert.equal(toMineruJSON(source),raw);
const temp=mkdtempSync(join(tmpdir(),'ocr2md-pbs-browser-'));
const path=join(temp,'new-pbs.minerujson.md');writeFileSync(path,source);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(e=>e?fail(e):ok(value));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:path,V6_PDF_PATH:join(temp,'missing.pdf')},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
 let up=false;for(let i=0;i<180;i++){try{if((await fetch(url)).ok){up=true;break;}}catch{}await sleep(180);}
 assert(up,'isolated Vite preview unavailable');
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
   const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
   try {
     const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
     const errors=[];page.on('pageerror',error=>errors.push(error.message));
     await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
     await page.waitForFunction(()=>window.__v6cm6?.cm?.queryBlockChains &&
       window.__v6cm6?.view?.state?.doc?.toString().includes('<!-- cmd:block:v1 id="p0b0" -->'),
       null,{timeout:105000});
     const details=await page.evaluate(async()=>{
       const cm=window.__v6cm6.cm,original=cm.readSource();
       const bc=cm.queryBlockChains(),analysis=await cm.queryBlockAnalysis();
       const sourceLine=original.slice(0,original.indexOf('<!-- cmd:block:v1 id="p4b0s1" -->')).split('\n').length;
       const from=cm.view.state.doc.line(sourceLine).from;
       cm.view.dispatch({selection:{anchor:from},scrollIntoView:true});
       const select=document.getElementById('module-select');
       select.value='text-block';select.dispatchEvent(new Event('change',{bubbles:true}));
       return {anchors:bc.atoms.length,chains:bc.summary.chains,invalid:bc.invalid.length,
         parents:analysis.inventory.rows.length,matched:analysis.inventory.summary.matched,
         headings:window.__v6cm6.outline.rows.length,sourceLine,
         changed:cm.readSource()!==original,dirty:window.__v6cm6.dirty};
     });
     assert.deepEqual([details.anchors,details.chains,details.invalid,details.parents,details.matched],
       [267,267,0,224,224]);
     assert(details.headings>=19);
     assert.equal(details.changed,false);assert.equal(details.dirty,false);
     await page.waitForFunction(()=>[...document.querySelectorAll('.ag-header-cell-text')].some(x=>x.textContent.includes('块链 BC')),null,{timeout:60000});
     const visible=await page.evaluate(async()=>{
       const viewport=document.querySelector('.ocr-text-block-grid .ag-body-horizontal-scroll-viewport');
       const headers=new Set();
       for(let x=0;x<5000;x+=120){
         if(viewport)viewport.scrollLeft=x;
         await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
         document.querySelectorAll('.ocr-text-block-grid .ag-header-cell-text').forEach(el=>headers.add(el.textContent));
       }
       if(viewport)viewport.scrollLeft=0;
       return {column:[...headers].some(x=>x.includes('成员角色')),
         extraSourceGutter:document.querySelectorAll('.ocr-cmd-block-id-gutter').length};
     });
     assert(visible.column,JSON.stringify(visible));
     assert.equal(visible.extraSourceGutter,0,'do not repeat PBS as a separate line-number gutter');
     assert.deepEqual(errors,[]);
     console.log('CMD_PBS_BROWSER_PASS',name,JSON.stringify({...details,noDuplicateGutter:true}));
   }finally{await browser.close();}
 }
 assert.equal(readFileSync(path,'utf8'),source,'source file stayed byte identical');
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
