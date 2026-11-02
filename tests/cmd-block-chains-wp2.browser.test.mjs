/** WP2 real CM6 one-transaction BC merge/split/reorder/migration & undo.
 * Fresh temporary document and port; all live user documents untouched.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const legacy=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const modern=toMarkdown(raw);
const temp=mkdtempSync(join(tmpdir(),'ocr2md-bc-wp2-browser-'));
const documentPath=join(temp,'work.md');writeFileSync(documentPath,modern);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,
    V6_DOCUMENT_PATH:documentPath,V6_PDF_PATH:join(temp,'no-pdf.pdf')},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<240;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await delay(140);}
 assert(ready,'isolated WP2 browser Vite unavailable');
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__v6cm6?.cm?.readSource()?.includes('<!-- cmd:block:v1 p="4" b="0" s="1" -->'),null,{timeout:100000});
   const result=await page.evaluate(async(legacyText)=>{
     const cm=window.__v6cm6.cm,source=cm.readSource(),doc=cm.doc;
     const {createCMDTransactionPort}=await import('/wcp-cmd-element-transactions.js');
     const port=createCMDTransactionPort(cm);
     const originalCount=port.queryBlockChains().summary.chains;
     const join=port.mergeBlockChains('p4b0s0','p4b0s1');
     const linked=cm.readSource();
     const linkedModel=port.queryBlockChains();
     const moved=port.moveBlockChainMember('p4b0s0','p4b0s1','after');
     const reordered=port.queryBlockChains().chains.find(c=>c.members.includes('p4b0s1'));
     const split=port.splitBlockChainAt('p4b0s0');
     const afterSplit=port.queryBlockChains().summary.chains;
     // Editor owns history; verify from the app's real Undo UI outside.
     const operations={join:join.changed,move:moved.changed,split:split.changed,
       chainId:linkedModel.chains.find(c=>c.members.includes('p4b0s0')).id,
       originally:originalCount,linked:linkedModel.summary.chains,
       reordered:reordered.members,afterSplit};
     window.__wp2={port,cm,source,linked,operations,doc};
     return operations;
   },legacy);
   assert.equal(result.join,2);assert.equal(result.move,2);
   assert.equal(result.split,2);assert.equal(result.originally,267);
   assert.equal(result.linked,266);assert.equal(result.afterSplit,267);
   assert.deepEqual(result.reordered,['p4b0s1','p4b0s0']);
   assert.equal(result.chainId,'bc-0001');
   await page.locator('#undo').click();
   // Further Undo must recover the exact original snapshot, and Redo must
   // restore BC membership without creating a second storage representation.
   await page.locator('#undo').click();await page.locator('#undo').click();
   const returned=await page.evaluate(()=>window.__wp2.cm.readSource()===window.__wp2.source);
   assert(returned,`${name} 3 Undo must return original source exactly`);
   await page.locator('#redo').click();
   const redo=await page.evaluate(()=>window.__wp2.cm.readSource()===window.__wp2.linked);
   assert(redo,`${name} Redo must restore the first BC merge transaction`);
   // PDF's existing toggle is a compatibility command: for canonical PBS
   // it MUST edit BC only (no old block-join comment) and the PDF checkbox
   // must read the predecessor from the CMD projection, not stale AG state.
   const pdfToggle=await page.evaluate(async()=>{
     const {cm,port,linked}=window.__wp2;
     const on=await port.setBlockJoin('p6b7',true);
     const analysis=await cm.queryBlockAnalysis();
     const row=analysis.inventory.rows.find(r=>r.id==='p6b7');
     const hasOldTag=cm.readSource().includes('ocr2md:block-join:v1');
     const off=await port.setBlockJoin('p6b7',false);
     return {on:on.changed,off:off.changed,previous:row.joinPrev,
       hasOldTag,reverted:cm.readSource()===linked};
   });
   assert.deepEqual(pdfToggle,{on:1,off:1,previous:'p6b6',hasOldTag:false,reverted:true});
   // Load an old file explicitly in local CM6 (never save), then request
   // one controlled conversion of the anchor style, not auto-migrate on load.
   const legacyResult=await page.evaluate(text=>{
     const {cm,port}=window.__wp2;
     cm.loadMarkdown(text);
     const before=cm.readSource(),report=port.queryBlockChains();
     const plan=port.migrateLegacyBlockChains();
     return {beforeBytes:before.length,legacyAtoms:report.atoms.length,
       migrated:plan.migrated,now:port.queryBlockChains().atoms.length,
       hasOld:cm.readSource().includes('minerujson:block:v1:'),after:cm.readSource()};
   },legacy);
   assert.equal(legacyResult.migrated,224);
   assert.equal(legacyResult.now,224);
   assert.equal(legacyResult.hasOld,false);
   await page.locator('#undo').click();
   assert.equal(await page.evaluate(()=>window.__wp2.cm.readSource()),legacy,
     `${name} migration is exactly one Undo step`);
   assert.deepEqual(errors,[]);
   assert.equal(readFileSync(documentPath,'utf8'),modern,'browser never saved the on-disk document');
   console.log('CMD_BC_WP2_BROWSER_PASS',name,{atoms:267,mergeUndoRedo:true,
     legacyMigrationUndo:true,originalBytes:modern.length});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
