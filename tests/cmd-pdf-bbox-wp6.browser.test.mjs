/** WP6: actual AG controls -> Shell -> CMD footer, Undo/Redo and clean reload. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),dir=mkdtempSync(join(tmpdir(),'ocr2md-wp6-ui-'));
const doc=join(dir,'original.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const host=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(dir,'absent.pdf')},stdio:'ignore'});
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
 let ready=false;for(let i=0;i<175;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await wait(160);}
 assert(ready,'isolated WP6 browser unavailable');
 for(const [name,engine,path] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkitExecutable()]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(path?{executablePath:path}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>/PBS 267（子块 43）/.test(document.querySelector('#status')?.textContent||''),null,{timeout:90000});
   const get=()=>page.evaluate(()=>window.__v6cm6.cm.readSource());
   const baseline=await get();assert.equal(baseline,source);
   const bbox=await page.evaluate(async()=>{
     const layout=await window.__v6cm6.cm.queryLayout();return layout.pages[0].regions[0].bbox;
   });
   const row=page.locator('.ocr-text-block-grid .ag-row[row-id="p0b0"]');await row.click();
   await page.locator('#ag-functions-toggle').click();
   const menu=page.locator('#ag-functions-menu [data-module="text-block"]');
   const inputs=menu.locator('.ocr-pbs-bbox-editor input');
   assert.equal(await inputs.count(),4);
   assert.deepEqual((await inputs.evaluateAll(nodes=>nodes.map(n=>Number(n.value)))),bbox);
   assert.equal(await menu.getByRole('button',{name:'清除所选 PBS 的人工 PDF 框修正'}).isDisabled(),true);
   const proposed=[bbox[0]+.5,bbox[1]+.5,bbox[2],bbox[3]];
   await inputs.nth(0).fill(String(proposed[0]));await inputs.nth(1).fill(String(proposed[1]));
   await menu.getByRole('button',{name:'应用选中 PBS 的 PDF 覆盖框四坐标'}).click();
   await page.waitForFunction(()=>window.__v6cm6.cm.readSource().includes('<!-- cmd:pdf-bbox:v1 '),null,{timeout:30000});
   const changed=await get();
   assert.equal(changed.slice(changed.indexOf('<!-- minerujson:source:v1:')),source.slice(source.indexOf('<!-- minerujson:source:v1:')));
   assert.equal(toMineruJSON(changed),raw);
   await page.waitForFunction(async()=>{
     const b=(await window.__v6cm6.cm.queryLayout()).pages[0].regions[0].bbox;
     return b[0]!==undefined&&b[0]!==null&&b[0]>0;
   },null,{timeout:30000});
   const effective=await page.evaluate(async()=> (await window.__v6cm6.cm.queryLayout()).pages[0].regions[0].bbox);
   assert.deepEqual(effective,proposed);
   assert.equal(readFileSync(doc,'utf8'),source,'CMD footer must not auto-save');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>!window.__v6cm6.cm.readSource().includes('cmd:pdf-bbox:v1'),null,{timeout:20000});
   assert.equal(await get(),baseline);
   await page.locator('#redo').click();
   await page.waitForFunction(()=>window.__v6cm6.cm.readSource().includes('cmd:pdf-bbox:v1'),null,{timeout:20000});
   assert.equal(await get(),changed);
   await page.waitForFunction(()=>/PDF bbox/.test(document.querySelector('.ocr-text-block-grid .ag-header')?.textContent||'')||
     document.querySelector('.ocr-text-block-grid .ag-row[row-id="p0b0"]'),null,{timeout:30000});
   await row.click();await page.locator('#ag-functions-toggle').click();
   await menu.getByRole('button',{name:'清除所选 PBS 的人工 PDF 框修正'}).click();
   await page.waitForFunction(()=>!window.__v6cm6.cm.readSource().includes('cmd:pdf-bbox:v1'),null,{timeout:30000});
   assert.equal(await get(),baseline,'last override removal restores byte-exact CMD');
   assert.equal(readFileSync(doc,'utf8'),source);
   // Synthetic PDF page DOM checks the actual PDF-owned pointer editor logic.
   // No claim that the original user PDF or hardware iPad was exercised.
   const gesture=await page.evaluate(async()=>{
     const {PdfPreview}=await import('/pdf-preview.js');
     const root=document.createElement('div'),paper=document.createElement('div');
     root.style.position='fixed';root.style.left='15px';root.style.top='15px';
     root.style.width='400px';root.style.height='800px';root.style.zIndex='2';
     paper.className='page';paper.style.position='relative';paper.style.width='400px';
     paper.style.height='800px';root.append(paper);document.body.append(root);
     let saved=[];
     const mounted=createPDFBBoxGesture(paper,{id:'p0b0',bbox:[20,30,50,80],pageSize:[100,200]},
       {readSource:()=> 'expected CMD source',commit:async(...args)=>{saved.push(args);return {changed:1};}});
     try{
       const handle=root.querySelector('.ocr-pdf-bbox-move');
       if(!handle)throw Error('PDF editor failed to create pointer handles');
       const r=handle.getBoundingClientRect(),sx=r.left+r.width/2,sy=r.top+r.height/2;
       const send=(kind,x,y)=>handle.dispatchEvent(new PointerEvent(kind,{bubbles:true,
         cancelable:true,pointerId:81,pointerType:'touch',button:0,clientX:x,clientY:y}));
       send('pointerdown',sx,sy);send('pointermove',sx+20,sy+24);
       send('pointerup',sx+20,sy+24);
       await Promise.resolve();await Promise.resolve();
       if(saved.length!==1)throw Error('one pointer release must commit exactly once');
       const first=saved[0];
       const handles=root.querySelectorAll('.ocr-pdf-bbox-handle').length;
       return {move:first,handles};
     }finally{mounted.dispose();root.remove();}
   });
   assert.deepEqual(gesture.move,['p0b0',[25,36,55,86],'expected CMD source']);
   assert.equal(gesture.handles,5);
   assert.deepEqual(errors,[]);
   console.log('CMD_PDF_BBOX_WP6_UI_PASS',name,{footer:true,undoRedo:true,originalJSON:true,noAutoSave:true,reset:true,syntheticPDFPointer:true});
  }finally{await browser.close();}
 }
}finally{host.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
