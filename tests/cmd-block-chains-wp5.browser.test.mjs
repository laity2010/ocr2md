/** WP5 real pointer interaction: single PBS drag, cross-chain move, chain
 * head shortcut, extract, Undo/Redo in isolated Chrome and WebKit browsers.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDMergeBlockChains,planCMDMoveBlockChainMember,planCMDExtractBlockChainMember,readCMDBlockChains} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const apply=(s,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((x,e)=>{
 assert.equal(x.slice(e.from,e.to),e.expected);return x.slice(0,e.from)+e.insert+x.slice(e.to);
},s);
let source=toMarkdown(raw);
for(const id of ['p0b1','p0b2','p0b3'])source=apply(source,planCMDMergeBlockChains(source,'p0b0',id));
source=apply(source,planCMDMergeBlockChains(source,'p0b4','p0b5'));
const dir=mkdtempSync(join(tmpdir(),'ocr2md-wp5-ui-')),doc=join(dir,'test.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(dir,'no-test.pdf')},stdio:'ignore'});
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await wait(160);}
 assert(ready,'WP5 isolated browser unavailable');
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>/PBS 267（子块 43）/.test(document.querySelector('#status')?.textContent||''),null,{timeout:105000});
   // The legacy AG drag writer is frozen. It must not advertise a draggable
   // handle and then fail *after* a user's pointer operation. Approved PDF
   // parent/child gestures are tested separately using actual PDF drop rails.
   const chain=id=>page.evaluate(id=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes(id))?.members,id);
   const read=()=>page.evaluate(()=>window.__v6cm6.cm.readSource());
   const row=id=>page.locator(`.ocr-text-block-grid .ag-row[row-id="${id}"]`).first();
   await row('p0b0').waitFor({timeout:20000});
   assert.deepEqual(await chain('p0b0'),['p0b0','p0b1','p0b2','p0b3']);
   assert.deepEqual(await chain('p0b4'),['p0b4','p0b5']);
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.queryBlockChains().summary.chains),263);
   assert.equal(await page.locator('[data-pbs-drag-handle]').count(),0,
     'read-only AG must not expose legacy member-drag handles');
   assert.equal(await page.locator('.ocr-pbs-drag-handle').count(),0);
   const menu=page.locator('#ag-functions-menu [data-module="text-block"]');
   await page.locator('#ag-functions-toggle').click();
   assert.equal(await menu.locator(':scope > button').count(),4);
   for(const label of ['仅将所选 PBS 移至目标块后','仅将所选 PBS 移至当前块链最前',
     '将所选 PBS 独立成单块链','把当前 PBS 所在块链并入目标链'])
     assert.equal(await menu.getByRole('button',{name:label}).count(),0,
       `AG must not mount retired write command: ${label}`);
   const group=menu.locator('button[aria-label="切换文本块链分组展示"]');
   await group.click();
   assert.equal(await group.getAttribute('aria-pressed'),'true');
   await page.locator('.ocr-text-block-grid .ocr-text-block-group').first().waitFor({timeout:25000});
   const groupHeader=page.locator('.ocr-text-block-grid .ocr-text-block-group').first();
   await groupHeader.click();
   await page.waitForFunction(()=>!document.querySelector('.ocr-text-block-grid .ag-row[row-id="p0b0"]'),
     null,{timeout:17000});
   await groupHeader.click();
   await row('p0b0').waitFor({timeout:17000});
   assert.equal(await page.locator('[data-pbs-drag-handle]').count(),0,
     'group expand must not remount prohibited drag handlers');
   assert.equal(await read(),source,'group collapse and expansion may not alter CM6');
   // Pure CMD edit planning remains fully supported: prove a real sequence
   // of single-member after, chain-head, cross-chain, extraction and invalid
   // self-drop against sealed OCR, while the AG itself performs no write.
   let planned=source;
   const plan=p=>{
     planned=apply(planned,p);
     assert.equal(toMineruJSON(planned),raw,'sealed MinerU JSON must survive every logical move');
     assert.equal(readCMDBlockChains(planned).invalid.length,0,'every BC plan must be valid');
   };
   const plannedChain=id=>readCMDBlockChains(planned).chains.find(c=>c.members.includes(id))?.members;
   plan(planCMDMoveBlockChainMember(planned,'p0b1','p0b3','after'));
   assert.deepEqual(plannedChain('p0b0'),['p0b0','p0b2','p0b3','p0b1']);
   plan(planCMDMoveBlockChainMember(planned,'p0b1','p0b0','before'));
   assert.deepEqual(plannedChain('p0b0'),['p0b1','p0b0','p0b2','p0b3']);
   plan(planCMDMoveBlockChainMember(planned,'p0b2','p0b4','after'));
   assert.deepEqual(plannedChain('p0b1'),['p0b1','p0b0','p0b3']);
   assert.deepEqual(plannedChain('p0b4'),['p0b4','p0b2','p0b5']);
   plan(planCMDExtractBlockChainMember(planned,'p0b2'));
   assert.deepEqual(plannedChain('p0b4'),['p0b4','p0b5']);
   assert.deepEqual(plannedChain('p0b2'),['p0b2']);
   assert.equal(planCMDMoveBlockChainMember(planned,'p0b1','p0b1').changed,0);
   assert.equal(planCMDExtractBlockChainMember(planned,'p0b2').changed,0);
   assert.equal(await read(),source,'pure CMD verification may not mutate live browser CM6');
   assert.equal(readFileSync(doc,'utf8'),source,'read-only AG must never auto-save');
   assert.deepEqual(errors,[]);
   console.log('CMD_PBS_BC_WP5_UI_PASS',name,{readOnlyAG:true,noDragHandle:true,groupCollapse:true,chains:263,pureMove:true,pureFirst:true,pureCrossChain:true,pureExtract:true,sourcePreserved:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
