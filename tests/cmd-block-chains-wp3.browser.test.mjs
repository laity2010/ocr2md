/** WP3: cross-chapter CMD BC scope, exact optimistic concurrency, history,
 * malformed marker refusal and PDF predecessor projection. No user files. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const temp=mkdtempSync(join(tmpdir(),'ocr2md-wp3-browser-'));
const doc=join(temp,'current.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const x=s.address().port;s.close(e=>e?fail(e):ok(x));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(temp,'missing.pdf')},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await delay(200);}
 assert(ready,'isolated WP3 Vite unavailable');
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__v6cm6?.cm?.readSource()?.includes('<!-- cmd:block:v1 id="p4b0s1" -->'),null,{timeout:105000});
   const evaluated=await page.evaluate(async()=>{
    const cm=window.__v6cm6.cm;
    const {createCMDTransactionPort}=await import('/wcp-cmd-element-transactions.js');
    const {currentVirtualChapter,setVirtualChapter}=await import('/wcp-cm-virtual-view.js');
    const port=createCMDTransactionPort(cm),original=cm.readSource();
    const chapter=port.getIndex().chapters[1];
    if(!chapter)throw Error('need a second CMD chapter');
    setVirtualChapter(cm.view,{id:chapter.id,from:chapter.from,to:chapter.to});
    const before=currentVirtualChapter(cm.view.state);
    const outside=original.indexOf('<!-- cmd:block:v1 id="p4b0s0" -->')<chapter.from||
      original.indexOf('<!-- cmd:block:v1 id="p4b0s0" -->')>=chapter.to;
    // Restrict arbitrary source writes, but allow a registered BC operation
    // spanning chapters. Its original child PBS IDs remain fixed.
    let unscopedRejected=false;
    try{port.replaceRanges([{from:original.indexOf('<!-- cmd:block:v1 id="p4b0s0" -->'),
      to:original.indexOf('<!-- cmd:block:v1 id="p4b0s0" -->'),expected:'',insert:'X'}]);}
    catch{unscopedRejected=true;}
    const merged=port.mergeBlockChains('p0b0','p8b0',{expectedSource:original});
    const linked=cm.readSource(),model=port.queryBlockChains();
    const changed=model.chains.find(c=>c.members.includes('p0b0'));
    const analysis=await cm.queryBlockAnalysis();
    const pdfRow=analysis.inventory.rows.find(r=>r.id==='p8b0');
    let staleRejected=false,invalidRejected=false;
    try{port.moveBlockChainMember('p8b0','p0b0','before',{expectedSource:original});}
    catch{staleRejected=true;}
    const token=linked.indexOf('<!-- cmd:block:v1 id="p6b7" -->');
    if(token<0)throw Error('missing test PBS anchor');
    // A regular editor edit into evidence must not slip past CMD port;
    // malicious/duplicate labels must not silently be accepted as a new BC.
    const forged=linked.replace('<!-- cmd:block:v1 id="p6b7" -->',
      '<!-- cmd:block:v1 id="p6b7" bc="bc-broken" seq="7" -->');
    setVirtualChapter(cm.view,null);
    cm.loadMarkdown(forged);
    try{port.mergeBlockChains('p8b0','p6b7');}catch{invalidRejected=true;}
    cm.loadMarkdown(linked);
    const refreshed=port.getIndex().chapters.find(x=>x.id===chapter.id);
    setVirtualChapter(cm.view,refreshed?{id:refreshed.id,from:refreshed.from,to:refreshed.to}:null);
    return {merged:merged.changed,chain:changed.members,pdfPrevious:pdfRow?.joinPrev,
      pdfChain:pdfRow?.chainId,hasScope:currentVirtualChapter(cm.view.state)?.id===chapter.id,
      outside,unscopedRejected,staleRejected,invalidRejected,beforeId:before.id,
      linked,original};
   });
   assert(evaluated.merged>=2);
   assert.deepEqual(evaluated.chain,['p0b0','p8b0']);
   assert.equal(evaluated.pdfPrevious,'p0b0');
   assert.equal(evaluated.pdfChain,'bc-0001');
   assert(evaluated.hasScope&&evaluated.outside&&evaluated.unscopedRejected&&evaluated.staleRejected&&evaluated.invalidRejected,JSON.stringify({...evaluated,linked:'[omitted]',original:'[omitted]'}));
   // Undo during a chapter scope must undo exactly the last all-document BC
   // operation. All unrelated source and OCR evidence remain identical.
   // LoadMarkdown in the negative-case test resets CM6 history, so the
   // dedicated history scenario below starts from a clean document.
   const result=await page.evaluate(async()=>{
     const {cm}=window.__v6cm6;
     const {setVirtualChapter,currentVirtualChapter}=await import('/wcp-cm-virtual-view.js');
     const {createCMDTransactionPort}=await import('/wcp-cmd-element-transactions.js');
     setVirtualChapter(cm.view,null);
     cm.loadMarkdown(window.__v6cm6.view.state.doc.toString());
     const port=createCMDTransactionPort(cm);
     const original=cm.readSource(),chapter=port.getIndex().chapters[1];
     setVirtualChapter(cm.view,{id:chapter.id,from:chapter.from,to:chapter.to});
     const merge=port.mergeBlockChains('p2b1','p8b8',{expectedSource:original});
     const linked=cm.readSource();
     return {merge:merge.changed,original,linked,scopeId:chapter.id,
       preserved:currentVirtualChapter(cm.view.state)?.id===chapter.id};
   });
   assert(result.merge>=2&&result.preserved);
   await page.locator('#undo').click();
   const undone=await page.evaluate(()=>({source:window.__v6cm6.cm.readSource(),
     scope:null}));
   assert.equal(undone.source,result.original,`${name} undo outside chapter scope must restore original`);
   await page.locator('#redo').click();
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),result.linked,
     `${name} redo must restore cross-chapter BC without rebuilding other source`);
   assert.deepEqual(errors,[]);
   assert.equal(readFileSync(doc,'utf8'),source,'no test may silently save user source');
   console.log('CMD_BC_WP3_BROWSER_PASS',name,{acrossChapter:true,stale:true,invalid:true,history:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
