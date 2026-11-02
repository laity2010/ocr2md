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
import {planCMDMergeBlockChains} from '../ui/cmd-block-chains.js';
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
   const chain=id=>page.evaluate(id=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes(id))?.members,id);
   const read=()=>page.evaluate(()=>window.__v6cm6.cm.readSource());
   const menu=label=>page.locator('#ag-functions-menu [data-module="text-block"]').getByRole('button',{name:label});
   const act=async label=>{await page.locator('#ag-functions-toggle').click();await menu(label).click();};
   const row=id=>page.locator(`.ocr-text-block-grid .ag-row[row-id="${id}"]`).first();
   const drag=async (from,to)=>{
     const handle=page.locator(`[data-pbs-drag-handle="${from}"]`);
     await row(from).scrollIntoViewIfNeeded();await row(to).scrollIntoViewIfNeeded();
     await handle.waitFor({state:'visible',timeout:15000});
     const a=await handle.boundingBox(),b=await row(to).boundingBox();
     assert(a&&b,`drag needs visible ${from} and ${to}`);
     const start={x:a.x+a.width/2,y:a.y+a.height/2};
     const end={x:b.x+Math.min(110,b.width-20),y:b.y+b.height/2};
     await page.mouse.move(start.x,start.y);await page.mouse.down();
     await page.mouse.move(end.x,end.y,{steps:9});await page.mouse.up();
   };
   assert.deepEqual(await chain('p0b0'),['p0b0','p0b1','p0b2','p0b3']);
   const original=await read();
   assert.equal(await page.locator('[data-pbs-drag-handle="p0b1"]').count(),1);
   // A -> B follows B, with no pair swap and other relative order unchanged.
   await drag('p0b1','p0b3');
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b0'))?.members.join()===
     'p0b0,p0b2,p0b3,p0b1',null,{timeout:35000});
   assert.deepEqual(await chain('p0b0'),['p0b0','p0b2','p0b3','p0b1']);
   // Move to head using the same CMD operation; one atom, not renumbering.
   await row('p0b1').click();
   await act('仅将所选 PBS 移至当前块链最前');
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b0'))?.members[0]==='p0b1',null,{timeout:35000});
   assert.deepEqual(await chain('p0b0'),['p0b1','p0b0','p0b2','p0b3']);
   // Cross-chain move: only selected p0b2 enters the target p0b4,p0b5 chain.
   await row('p0b4').click();await act('将当前 PBS 设为目标链');
   await row('p0b2').click();await act('仅将所选 PBS 移至目标块后');
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b4'))?.members.join()==='p0b4,p0b2,p0b5',null,{timeout:35000});
   assert.deepEqual(await chain('p0b1'),['p0b1','p0b0','p0b3']);
   assert.deepEqual(await chain('p0b4'),['p0b4','p0b2','p0b5']);
   await row('p0b2').click();await act('将所选 PBS 独立成单块链');
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b2'))?.members.length===1,null,{timeout:35000});
   const after=await read();
   assert.deepEqual(await chain('p0b4'),['p0b4','p0b5']);
   assert.equal(toMineruJSON(after),raw);
   assert.equal(readFileSync(doc,'utf8'),source,'WP5 edits must remain unsaved');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b4'))?.members.length===3,null,{timeout:25000});
   await page.locator('#redo').click();
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b2'))?.members.length===1,null,{timeout:25000});
   assert.equal(await read(),after);
   // Invalid drop: source onto itself, no edit and no phantom transaction.
   await page.waitForTimeout(950);
   await drag('p0b1','p0b1');
   assert.equal(await read(),after,'self-drop must not edit CMD');
   // Exercise the touch pointer branch with a deterministic synthetic touch
   // sequence. This verifies our pointer handling but is NOT physical iPad.
   await row('p0b0').scrollIntoViewIfNeeded();await row('p0b5').scrollIntoViewIfNeeded();
   const touch=await page.evaluate(()=>{
     const handle=document.querySelector('[data-pbs-drag-handle="p0b0"]');
     const target=document.querySelector('.ocr-text-block-grid [row-id="p0b5"]');
     if(!handle||!target)throw Error('Touch fixture rows not visible');
     const anchor=target.querySelector('[col-id="sourceLine"]')||target.querySelector('[col-id="pbsDrag"]');
     if(!anchor)throw Error('No visible pinned drop anchor');
     const a=handle.getBoundingClientRect(),b=anchor.getBoundingClientRect();
     const sx=a.left+a.width/2,sy=a.top+a.height/2;
     const tx=b.left+b.width/2,ty=b.top+b.height/2;
     const fire=(type,x,y)=>handle.dispatchEvent(new PointerEvent(type,{
       bubbles:true,cancelable:true,pointerType:'touch',pointerId:91,
       isPrimary:true,button:0,clientX:x,clientY:y}));
     fire('pointerdown',sx,sy);fire('pointermove',(sx+tx)/2,(sy+ty)/2);
     fire('pointermove',tx,ty);fire('pointerup',tx,ty);
     return {target:document.elementFromPoint(tx,ty)?.closest('[row-id]')?.getAttribute('row-id'),
       pointed:document.elementFromPoint(tx,ty)?.outerHTML?.slice(0,200),
       xy:[tx,ty],rect:[b.left,b.top,b.width,b.height]};
   });
   assert.equal(touch.target,'p0b5',JSON.stringify(touch));
   await page.waitForFunction(()=>window.__v6cm6.cm.queryBlockChains().chains.find(c=>c.members.includes('p0b4'))?.members.join()===
     'p0b4,p0b5,p0b0',null,{timeout:35000});
   assert.deepEqual(await chain('p0b1'),['p0b1','p0b3']);
   assert.equal(toMineruJSON(await read()),raw);
   assert.deepEqual(errors,[]);
   console.log('CMD_PBS_BC_WP5_UI_PASS',name,{drag:true,first:true,crossChain:true,extract:true,undoRedo:true,syntheticTouch:true,sourcePreserved:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
