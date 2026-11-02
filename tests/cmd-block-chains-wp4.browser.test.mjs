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
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
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
   for(const header of ['所属父块','链成员','链前驱','审阅备注','当前源码内容','原始 OCR 摘要'])
     assert(headers.includes(header),`${name} missing column ${header}: ${headers.join(',')}`);
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
   const button=label=>page.locator('#ag-functions-menu [data-module="text-block"]').getByRole('button',{name:label});
   const doAction=async label=>{await page.locator('#ag-functions-toggle').click();await button(label).click();};
   await doAction('将当前 PBS 设为目标链');
   await row('p0b1').click();
   await doAction('把当前 PBS 所在块链并入目标链');
   await page.waitForFunction(()=>/BC 266 链/.test(document.querySelector('#status')?.textContent||''),null,{timeout:60000});
   let state=await page.evaluate(()=>window.__v6cm6.cm.queryBlockChains());
   let merged=state.chains.find(c=>c.members.includes('p0b0'));
   assert.deepEqual(merged.members,['p0b0','p0b1']);
   assert.equal(state.invalid.length,0);
   await doAction('切换文本块链分组展示');
   await page.evaluate(async()=>{const scroll=document.querySelector('.ocr-text-block-grid .ag-body-horizontal-scroll-viewport');
     if(scroll)scroll.scrollLeft=0;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
   await page.locator('.ocr-text-block-grid .ocr-text-block-group').first().waitFor({timeout:9000});
   const groupButton=page.locator('.ocr-text-block-grid .ocr-text-block-group').first();
   assert.match(await groupButton.innerText(),/bc-0001/);
   await groupButton.click();
   await page.waitForFunction(()=>!document.querySelector('.ocr-text-block-grid .ag-row[row-id="p0b0"]'),null,{timeout:12000});
   await groupButton.click();
   await row('p0b1').waitFor({timeout:12000});
   await row('p0b1').click();
   await doAction('在当前 PBS 之前拆分块链');
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().summary.chains===267,null,{timeout:30000});
   await page.waitForFunction(()=>/BC 267 链/.test(document.querySelector('#status')?.textContent||''),null,{timeout:30000});
   state=await page.evaluate(()=>window.__v6cm6.cm.queryBlockChains());
   assert.equal(state.chains.find(c=>c.members.includes('p0b0')).members.length,1);
   assert.equal(state.chains.find(c=>c.members.includes('p0b1')).members.length,1);
   const afterSplit=await page.evaluate(()=>window.__v6cm6.cm.readSource());
   await page.locator('#undo').click();
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().summary.chains===266,null,{timeout:25000});
   await page.locator('#redo').click();
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().summary.chains===267,null,{timeout:25000});
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.readSource()),afterSplit,'native CM6 Undo/Redo must be byte exact');
   assert.deepEqual(errors,[]);
   assert.equal(readFileSync(doc,'utf8'),source,'WP4 UI actions must remain unsaved until global Save');
   console.log('CMD_PBS_BC_WP4_UI_PASS',name,{pbs:267,children:43,merge:true,groupCollapse:true,split:true,unsaved:true});
  }finally{await browser.close();}
 }
}finally{processHost.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
