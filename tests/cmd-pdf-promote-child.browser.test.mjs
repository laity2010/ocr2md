/** Real MinerU PDF: click native p1b3s0 -> promote to page-end p1b14.
 * Scratch document only, no changes to source PDF or user book. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';import {tmpdir} from 'node:os';
import {createServer} from 'node:net';import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS} from '../ui/cmd-block-chains.js';
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
let src=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
if(process.env.REVIEWED_CHILD==='1'){
  const p=planCMDReparentPBS(src,'p1b5','p1b3s0');
  src=[...p.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>text.slice(0,e.from)+e.insert+text.slice(e.to),src);
}
const dir=mkdtempSync(join(tmpdir(),'ocr2md-child-promote-'));
const doc=join(dir,'test.md');writeFileSync(doc,src);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
 V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist'),
 V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}await sleep(170);}
 assert(ready,'scratch PDF server unavailable');
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
   ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:68000});
   assert.equal(response.status(),200);console.log('PDF_CHILD_PROMOTE_STEP',name,'page');
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
     document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,null,{timeout:70000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('PBS 267'),null,{timeout:65000});
   await selectPreview(page,'pdf');
   const promote=page.locator('.ocr-pdf-promote-child');
   assert.equal(await promote.isDisabled(),true,'promotion starts disabled');
   assert.deepEqual(await page.locator('.ocr-pdf-tools').evaluate(node=>[
     node.querySelector('.ocr-pdf-extract-text')?.nextElementSibling?.className,
     node.querySelectorAll('.ocr-pdf-bbox-edit,.ocr-pdf-bbox-reset,.ocr-pdf-mark-subblocks').length
   ]),['ocr-pdf-promote-child',0]);
   const reviewed=process.env.REVIEWED_CHILD==='1';
   const selectedId=reviewed?'p1b3s1':'p1b3s0';
   const chip=reviewed?page.locator('.ocr-pdf-block-cover[data-block-id="p1b3s1"] > .ocr-pdf-block-ctrl'):
     page.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] .ocr-pdf-subblock-chip');
   await chip.waitFor({state:'attached',timeout:60000});
   await chip.scrollIntoViewIfNeeded({timeout:30000});
   const physical=await (reviewed?page.locator('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'):
     page.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]')).evaluate(el=>{
     const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
   if(process.env.TOUCH_MODE==='1'){
     if(process.env.TITLE_MODE==='1'){
       await page.locator('#module-select').evaluate(el=>{el.value='chapter-boundary';el.dispatchEvent(new Event('change',{bubbles:true}));});
     }
     await page.evaluate(()=>{window.__pdfTouchEvents=[];
       for(const type of ['pointerdown','pointerup','click','touchstart','touchend']){
         document.addEventListener(type,e=>window.__pdfTouchEvents.push({type,
           target:e.target?.className?.baseVal||e.target?.className,
           near:e.target?.closest?.('.ocr-pdf-block-ctrl,.ocr-pdf-subblock-chip')?.textContent?.slice(0,50),
           status:document.querySelector('.ocr-pdf-status')?.textContent?.slice(0,80),
           disabled:document.querySelector('.ocr-pdf-promote-child')?.disabled}),true);
       }
     });
     const target=process.env.BODY_TAP==='1'&&reviewed?
       await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3s1"]').boundingBox():
       await chip.boundingBox();
     assert(target,'target PDF label or body visible');
     const x=target.x+target.width/2,y=target.y+target.height/2;
     console.log('PDF_TOUCH_HIT',name,JSON.stringify(await page.evaluate(({x,y})=>({
       target:document.elementFromPoint(x,y)?.tagName,
       closest:document.elementFromPoint(x,y)?.closest('.ocr-pdf-block-ctrl,.ocr-pdf-subblock-chip')?.textContent||null,
       x,y}),{x,y})));
     await page.touchscreen.tap(x,y);
     await page.waitForTimeout(700);
     console.log('PDF_REAL_TOUCH_DIAG',name,JSON.stringify(await page.evaluate(()=>({events:window.__pdfTouchEvents,
       selectedStatus:document.querySelector('.ocr-pdf-status')?.textContent,
       toolbarDisabled:document.querySelector('.ocr-pdf-promote-child')?.disabled,
       toolbarTitle:document.querySelector('.ocr-pdf-promote-child')?.title,
       module:document.querySelector('#module-select')?.value}))));
   }else await chip.evaluate(el=>el.click());
   await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-promote-child')?.disabled,null,{timeout:13000});
   assert((await promote.getAttribute('title')).includes(selectedId));
   console.log('PDF_CHILD_PROMOTE_STEP',name,'enabled');
   await promote.evaluate(el=>el.click());
   await page.waitForTimeout(1200);
   console.log('PDF_CHILD_PROMOTE_ACTION',name,JSON.stringify(await page.evaluate(()=>({
     status:document.querySelector('.ocr-pdf-status')?.textContent,
     global:document.querySelector('#status')?.textContent?.slice(0,320),
     promote:document.querySelector('.ocr-pdf-promote-child')?.disabled,
     cover:!!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]')
   }))));
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('p1b14'),null,{timeout:15000});
   await page.waitForFunction(reviewed=>{
     const promoted=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]');
     if(!promoted)return false;
     return reviewed?!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'):
       document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]')?.hidden;
   },reviewed,{timeout:40000});
   const result=await page.evaluate(()=>{
     const cover=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]');
     const old=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]');
     const r=cover?.getBoundingClientRect();
     return {id:cover?.dataset.blockId,origin:cover?.dataset.originId,
       parent:cover?.querySelector('.ocr-pdf-block-ctrl span')?.textContent,
       badgeIsParent:!cover?.classList.contains('ocr-pdf-block-is-child'),
       oldHidden:old?.hidden,newBox:r?{x:r.x,y:r.y,w:r.width,h:r.height}:null,
       status:document.querySelector('.ocr-pdf-status')?.textContent};
   });
   assert.deepEqual([result.id,result.origin,result.parent,result.badgeIsParent],
     ['p1b14',reviewed?'p1b5':'p1b3s0','p1b14',true],JSON.stringify(result));
   if(!reviewed)assert.equal(result.oldHidden,true);
   assert(Math.abs(result.newBox.y-physical.y)<3,'new parent uses original native child y');
   assert.equal(await promote.isDisabled(),true,'re-promotion disabled');
   assert.equal(readFileSync(doc,'utf8'),src,'no implicit disk save');
   await page.locator('#undo').evaluate(el=>el.click());
   await page.waitForFunction(reviewed=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]')&&
     (reviewed?!!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'):
      !!document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]:not([hidden])')),
      reviewed,{timeout:38000});
   await page.locator('#redo').evaluate(el=>el.click());
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]'),null,{timeout:38000});
   assert.deepEqual(errors,[]);
   console.log('PDF_CHILD_PROMOTION_BROWSER_PASS',name,{source:selectedId,parent:'p1b14',
     originRetained:true,pdfLabelUpdated:true,noDuplicateChild:true,undoRedo:true,noSave:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
