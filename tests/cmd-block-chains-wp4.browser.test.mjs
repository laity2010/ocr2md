/** WP4 UI: full PBS inventory, group and semantic CMD edits in Chrome/WebKit.
 * Synthetic temporary document, never a user workspace or production endpoint.
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
import {readCMDBlockChains,planCMDMergeBlockChains,planCMDSplitBlockChain} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const temp=mkdtempSync(join(tmpdir(),'ocr2md-wp4-ui-'));
const doc=join(temp,'test.md');writeFileSync(doc,source);
const port=await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);
 s.listen(0,'127.0.0.1',()=>{const v=s.address().port;s.close(e=>e?reject(e):resolve(v));});});
const url=`http://127.0.0.1:${port}/`;
const processHost=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(temp,'absent.pdf')},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await delay(180);}
 assert(ready,'isolated WP4 server unavailable');
 for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__v6cm6?.cm?.queryBlockChains,null,{timeout:100000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>/PBS 267（子块 43） · BC 267 链/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
   const headers=await page.evaluate(async()=>{
     const viewport=document.querySelector('.ocr-text-block-grid .ag-body-horizontal-scroll-viewport');
     const found=new Set();
     for(let x=0;x<5000;x+=120){
       if(viewport)viewport.scrollLeft=x;
       await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
       document.querySelectorAll('.ocr-text-block-grid .ag-header-cell-text').forEach(el=>found.add(el.textContent));
     }
     if(viewport)viewport.scrollLeft=0;
     return [...found];
   });
   for(const header of ['PBS / BC','类型','源码','所属父块','链成员','链前驱','审阅备注','原始 OCR 摘要'])
     assert(headers.includes(header),`${name} missing column ${header}: ${headers.join(',')}`);
   const pbsAt=headers.indexOf('PBS / BC');
   assert(pbsAt>=0&&headers[pbsAt+1]==='类型'&&headers[pbsAt+2]==='源码',
     `${name} AG order must be PBS → 类型 → 源码; actual: ${headers.join(' / ')}`);
   const before=await page.evaluate(async()=>{
     const cm=window.__v6cm6.cm;
     const {inventory}=await cm.queryBlockAnalysis();
     const target=inventory.atoms.rows.find(r=>r.id==='p4b0s1');
     return {count:inventory.atoms.rows.length,children:inventory.atoms.summary.children,
       parent:target.parentId,chain:target.chainId,dirty:window.__v6cm6.dirty};
   });
   assert.deepEqual([before.count,before.children,before.parent,before.chain],
     [267,43,'p4b0','implicit:p4b0s1']);assert.equal(before.dirty,false);
   const row=id=>page.locator(`.ocr-text-block-grid .ag-row[row-id="${id}"]`).first();
   await row('p0b0').waitFor({timeout:16000});
   await row('p0b0').click();
   await page.locator('#ag-functions-toggle').click();
   const menu=page.locator('#ag-functions-menu [data-module="text-block"]');
   assert.equal(await menu.locator(':scope > button').count(),4,
     'current read-only milestone mounts precisely four safe functions');
   for(const label of ['将当前 PBS 设为目标链','把当前 PBS 所在块链并入目标链',
     '在当前 PBS 之前拆分块链','仅将所选 PBS 移至目标块后',
     '清除所选 PBS 的人工 PDF 框修正'])
     assert.equal(await menu.getByRole('button',{name:label}).count(),0,
       `retired structural writer must not be mounted: ${label}`);
   // The Shell automatically hides the action menu after a click. A
   // role-locator excludes the *hidden* button from the post-click check;
   // keep the same original DOM button and inspect aria-pressed directly.
   const grouping=menu.locator('button[aria-label="切换文本块链分组展示"]');
   await grouping.click();
   assert.equal(await grouping.getAttribute('aria-pressed'),'true',
     'read-only grouping still changes AG presentation');
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.queryBlockChains().summary.chains),267,
     'grouping must not synthesize or delete chains');
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),source,
     'AG grouping must not edit CMD');
   await page.locator('#ag-functions-toggle').click();
   await menu.getByRole('button',{name:'查看跨页跨栏接续候选'}).click();
   await page.waitForFunction(()=>/候选 5 组 · 跨栏 4 · 跨页 1/.test(
     document.querySelector('#status')?.textContent||''),null,{timeout:30000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-text-block-grid .ag-row').length===5,
     null,{timeout:16000});
   const candidateIds=await page.locator('.ocr-text-block-grid .ag-row[row-id]')
     .evaluateAll(nodes=>nodes.map(n=>n.getAttribute('row-id')));
   assert.equal(new Set(candidateIds).size,5,'all five review-only continuations must be present');
   assert(candidateIds.includes('p6b6--p6b7'),'cross-column candidate must survive read-only transition');
   assert(candidateIds.includes('p15b11--p16b0'),'cross-page candidate must survive read-only transition');
   assert.equal(await menu.getByRole('button',{name:'确认所选文本块续接'}).count(),0,
     'old mutable review command must not be reintroduced by the test');
   // Core CMD chain planning is still validated independently of the
   // currently disabled AG write buttons, with original sealed OCR intact.
   const apply=(text,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((cur,e)=>{
     assert.equal(cur.slice(e.from,e.to),e.expected);return cur.slice(0,e.from)+e.insert+cur.slice(e.to);
   },text);
   const merged=apply(source,planCMDMergeBlockChains(source,'p0b0','p0b1'));
   assert.deepEqual(readCMDBlockChains(merged).chains.find(chain=>
     chain.members.includes('p0b0'))?.members,['p0b0','p0b1']);
   assert.equal(readCMDBlockChains(merged).summary.chains,266);
   const split=apply(merged,planCMDSplitBlockChain(merged,'p0b1'));
   assert.equal(readCMDBlockChains(split).summary.chains,267);
   assert.equal(toMineruJSON(split),raw,'pure merge/split must not damage sealed MinerU JSON');
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),source,
     'pure planners must never bypass the unique CM6 source');
   assert.deepEqual(errors,[]);
   assert.equal(readFileSync(doc,'utf8'),source,'WP4 UI actions must remain unsaved until global Save');
   console.log('CMD_PBS_BC_WP4_UI_PASS',name,{pbs:267,children:43,readOnly:true,groupToggle:true,candidates:5,pureMergeSplit:true,sourcePreserved:true});
  }finally{await browser.close();}
 }
}finally{processHost.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
