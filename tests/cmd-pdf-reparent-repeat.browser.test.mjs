/** Real source-PDF gesture: long-press original p1b5 PDF parent label and
 * point to native image child p1b3s0 -> visible p1b3s1 origin=p1b5.
 * Test uses a temporary document; never writes to a user's book or PDF. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,planCMDPromotePBSChild} from '../ui/cmd-block-chains.js';
const hash=buf=>createHash('sha256').update(buf).digest('hex');
const pdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const originalPDF=readFileSync(pdf);
assert.equal(hash(originalPDF),'be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab');
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const initial=toMarkdown(raw);
const apply=(text,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from)
  .reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),text);
const reviewed=apply(initial,planCMDReparentPBS(initial,'p1b5','p1b3s0'));
const source=apply(reviewed,planCMDPromotePBSChild(reviewed,'p1b3s1'));
assert(source.includes('id="p1b14" origin="p1b5"'));
assert.equal(toMineruJSON(source),raw);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-reparent-repeat-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
 V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist'),
 V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));
try {
 let ready=false;for(let i=0;i<160;i++){try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}await delay(180);}
 assert(ready,'isolated original PDF service unavailable');
 const wk=process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath();
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,wk]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
   page.setDefaultTimeout(22000);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:70000});
   console.log('PDF_REPARENT_AGAIN_STEP',name,'page',response.status());
   await page.waitForTimeout(8000);
   console.log('PDF_REPARENT_AGAIN_DIAG',name,JSON.stringify(await page.evaluate(()=>({
     status:document.querySelector('.ocr-pdf-status')?.textContent,
     canvas:document.querySelector('.ocr-pdf-scroller .page canvas')?.width,
     pdfSelector:document.querySelector('.ocr-preview-mode')?.value,
     pdfDisabled:document.querySelector('.ocr-preview-mode option[value=pdf]')?.disabled,
     errors:document.querySelector('#status')?.textContent?.slice(0,240),
     hasModule:!!document.querySelector('#module-select')}))));
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
     document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,null,{timeout:55000});
   await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('PBS 267'),null,{timeout:55000});
   await selectPreview(page,'pdf');
   const sourceCtrl=page.locator('.ocr-pdf-block-cover[data-block-id="p1b14"] > .ocr-pdf-block-ctrl');
   const parentCtrl=page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"] > .ocr-pdf-block-ctrl');
   const targetChip=page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"] .ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] > .ocr-pdf-subblock-chip');
   await sourceCtrl.waitFor({state:'attached',timeout:60000});
   await parentCtrl.waitFor({state:'attached',timeout:60000});
   await targetChip.waitFor({state:'attached',timeout:60000});
   await targetChip.scrollIntoViewIfNeeded({timeout:35000});
   // Regression: moving parent p1b3 AFTER p1b4 renumbers its native child
   // from p1b3s0 -> p1b4s0. The physical PDF cover cannot move one pixel.
   const physical=page.locator('.ocr-pdf-block-cover[data-origin-id="p1b3"]');
   const originalRect=await physical.boundingBox();
   const afterCtrl=page.locator('.ocr-pdf-block-cover[data-block-id="p1b4"] > .ocr-pdf-block-ctrl');
   const src=await parentCtrl.boundingBox(),dst=await afterCtrl.boundingBox();
   assert(src&&dst&&originalRect,'physical p1b3 and logical p1b4 labels must exist');
   const pointerRenumber={bubbles:true,pointerId:91,pointerType:'touch',isPrimary:true,button:0};
   await parentCtrl.dispatchEvent('pointerdown',{...pointerRenumber,
     clientX:src.x+src.width/2,clientY:src.y+src.height/2});
   await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:5000});
   await page.locator('body').dispatchEvent('pointermove',{...pointerRenumber,
     clientX:dst.x+dst.width/2,clientY:dst.y+dst.height/2});
   const renumberRail=page.locator('.ocr-pdf-block-drop-guide[data-kind="parent"]');
   await renumberRail.waitFor({state:'attached',timeout:6000});
   const afterZone=await renumberRail.locator('[data-placement="after"]').boundingBox();
   assert(afterZone,'after landing on p1b4 must be visible');
   await page.locator('body').dispatchEvent('pointermove',{...pointerRenumber,
     clientX:afterZone.x+afterZone.width/2,clientY:afterZone.y+afterZone.height/2});
   await page.locator('body').dispatchEvent('pointerup',{...pointerRenumber,
     clientX:afterZone.x+afterZone.width/2,clientY:afterZone.y+afterZone.height/2});
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-origin-id="p1b3"]')
     ?.dataset.blockId==='p1b4'&&document.querySelector('.ocr-pdf-block-cover[data-origin-id="p1b3"]')
     ?.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b4s0"] .ocr-pdf-subblock-chip')
     ?.textContent==='p1b4s0',null,{timeout:50000});
   const movedPhysical=await physical.boundingBox();
   for(const key of ['x','y','width','height'])
     assert(Math.abs(originalRect[key]-movedPhysical[key])<2,
       name+' PDF OCR bbox must remain at original physical position: '+key);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-origin-id="p1b4"]').getAttribute('data-block-id'),'p1b3');
   await page.locator('#undo').evaluate(el=>el.click());
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-origin-id="p1b3"]')
     ?.dataset.blockId==='p1b3'&&document.querySelector('.ocr-pdf-block-cover[data-origin-id="p1b3"]')
     ?.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] .ocr-pdf-subblock-chip')
     ?.textContent==='p1b3s0',null,{timeout:45000});
   console.log('PDF_PARENT_CHILD_RENUMBER_PASS',name,'p1b3 -> p1b4 / p1b3s0 -> p1b4s0');
   // Explicit parent-label landing rail: before and after must move the
   // SOURCE p1b14, while the PDF bbox and original physical ID remain fixed.
   // Undo each move to restore the same initial fixture for the next gesture.
   for(const [placement,pointerId] of [['before',81],['after',82]]){
     const fromBox=await sourceCtrl.boundingBox(),targetBox=await parentCtrl.boundingBox();
     assert(fromBox&&targetBox, 'both fixed PDF labels must be rendered');
     const sx=fromBox.x+fromBox.width/2,sy=fromBox.y+fromBox.height/2;
     const tx=targetBox.x+targetBox.width/2,ty=targetBox.y+targetBox.height/2;
     const pointer={bubbles:true,pointerId,pointerType:'touch',isPrimary:true,button:0};
     await sourceCtrl.dispatchEvent('pointerdown',{...pointer,clientX:sx,clientY:sy});
     await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:5000});
     await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:tx,clientY:ty});
     const rail=page.locator('.ocr-pdf-block-drop-guide[data-kind="parent"]');
     await rail.waitFor({state:'attached',timeout:6500});
     const zone=rail.locator('span[data-placement="'+placement+'"]');
     const z=await zone.boundingBox();assert(z&&z.width>=30,'three landing zones must be finger-sized');
     const zx=z.x+z.width/2,zy=z.y+z.height/2;
     await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:zx,clientY:zy});
     assert.equal(await zone.evaluate(el=>el.classList.contains('active')),true,
       name+' exact '+placement+' zone is selected');
     await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:zx,clientY:zy});
     await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('已重排'),
       null,{timeout:40000});
     assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b14"]').count(),1);
     await page.locator('#undo').evaluate(el=>el.click());
     await page.waitForTimeout(650);
     console.log('PDF_THREE_LANDING_GESTURE_PASS',name,placement);
   }
   // A parent without native OCR children becomes a container on its FIRST
   // child. Its original body is virtual s0, the incoming OCR block is s1.
   // Clicking the unchanged parent ID must highlight BOTH fixed PDF bboxes.
   const emptyParent=page.locator('.ocr-pdf-block-cover[data-block-id="p1b4"]');
   const emptyCtrl=emptyParent.locator(':scope > .ocr-pdf-block-ctrl');
   await emptyCtrl.scrollIntoViewIfNeeded({timeout:35000});
   const parentBefore=await emptyParent.boundingBox();
   const srcBox=await sourceCtrl.boundingBox(),tarBox=await emptyCtrl.boundingBox();
   assert(srcBox&&tarBox&&parentBefore,name+' first body-s0 drag labels rendered');
   const touchBody={bubbles:true,pointerId:93,pointerType:'touch',isPrimary:true,button:0};
   await sourceCtrl.dispatchEvent('pointerdown',{...touchBody,
     clientX:srcBox.x+srcBox.width/2,clientY:srcBox.y+srcBox.height/2});
   await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:5000});
   await page.locator('body').dispatchEvent('pointermove',{...touchBody,
     clientX:tarBox.x+tarBox.width/2,clientY:tarBox.y+tarBox.height/2});
   const bodyRail=page.locator('.ocr-pdf-block-drop-guide[data-kind="parent"]');
   await bodyRail.waitFor({state:'attached',timeout:8000});
   const bodyZone=await bodyRail.locator('span[data-placement="child"]').boundingBox();
   assert(bodyZone);
   const bx=bodyZone.x+bodyZone.width/2,by=bodyZone.y+bodyZone.height/2;
   await page.locator('body').dispatchEvent('pointermove',{...touchBody,clientX:bx,clientY:by});
   await page.locator('body').dispatchEvent('pointerup',{...touchBody,clientX:bx,clientY:by});
   await page.waitForFunction(()=>Boolean(document.querySelector(
     '.ocr-pdf-block-cover[data-block-id="p1b4"] .ocr-pdf-block-fragment[data-subblock-id="p1b4s0"]')
     &&document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4s1"]')),null,{timeout:50000});
   const bodyChip=emptyParent.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b4s0"] .ocr-pdf-subblock-chip');
   assert.equal(await bodyChip.textContent(),'p1b4s0');
   const parentAfter=await emptyParent.boundingBox();
   for(const k of ['x','y','width','height'])
     assert(Math.abs(parentBefore[k]-parentAfter[k])<2,name+' unchanged PDF bbox '+k);
   await emptyCtrl.evaluate(el=>el.click());
   assert.equal(await emptyParent.evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b4s1"]')
     .evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true);
   assert.equal(await bodyChip.evaluate(el=>el.parentElement.classList.contains('ocr-pdf-block-group-child')),true);
   await page.locator('#undo').evaluate(el=>el.click());
   await page.waitForFunction(()=>Boolean(document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]')
     &&!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b4s1"]')),null,{timeout:45000});
   assert.equal(await page.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b4s0"]').count(),0);
   console.log('PDF_FIRST_BODY_AND_GROUP_HIGHLIGHT_PASS',name,'p1b4 -> p1b4s0 + p1b4s1');
   const from=await sourceCtrl.boundingBox(),to=await targetChip.boundingBox();
   assert(from&&to&&to.width>0&&to.height>0,`${name} real PDF tags visible`);
   const sx=from.x+from.width/2,sy=from.y+from.height/2;
   const tx=to.x+to.width/2,ty=to.y+to.height/2;
   const hit=await page.evaluate(({x,y})=>({
     hit:document.elementFromPoint(x,y)?.closest('.ocr-pdf-subblock-chip')?.textContent||null,
     within:!!document.elementFromPoint(x,y)?.closest('.ocr-pdf-scroller')
   }),{x:tx,y:ty});
   assert.equal(hit.hit,'p1b3s0',`${name} target native PDF child is clickable: ${JSON.stringify(hit)}`);
   console.log('PDF_REPARENT_AGAIN_STEP',name,'source_and_child',JSON.stringify({from:[sx,sy],to:[tx,ty]}));
   const pointer={bubbles:true,pointerId:72,pointerType:'touch',isPrimary:true,button:0};
   await sourceCtrl.dispatchEvent('pointerdown',{...pointer,clientX:sx,clientY:sy});
   await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:3500});
   await page.locator('body').dispatchEvent('pointermove',{...pointer,clientX:tx,clientY:ty});
   await page.locator('.ocr-pdf-subblock-chip.ocr-pdf-block-drop-target').waitFor({state:'attached',timeout:6000});
   // WebKit may clear transient toolbar text while the PDF controls repaint;
   // the actual highlighted native child chip is the stable drag target.
   assert.equal(await targetChip.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),true);
   console.log('PDF_REPARENT_AGAIN_STEP',name,'target-highlighted');
   await page.locator('body').dispatchEvent('pointerup',{...pointer,clientX:tx,clientY:ty});
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('p1b3s1'),
     null,{timeout:40000});
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]')&&
     !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]'),null,{timeout:45000});
   const pdfInfo=await page.evaluate(()=>{
     const cover=document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]');
     const target=document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] .ocr-pdf-subblock-chip');
     return {label:cover?.querySelector('.ocr-pdf-block-ctrl span')?.textContent,
       origin:cover?.dataset.originId,block:cover?.dataset.blockIndex,child:target?.textContent};
   });
   assert.deepEqual([pdfInfo.label,pdfInfo.origin,pdfInfo.block,pdfInfo.child],['p1b3s1','p1b5','5','p1b3s0']);
   const style=await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3s1"]').evaluate(el=>({
     blue:el.classList.contains('ocr-pdf-block-is-child'),
     chipBackground:getComputedStyle(el.querySelector('.ocr-pdf-block-ctrl')).backgroundColor,
     kind:el.querySelector('.ocr-pdf-block-ctrl')?.dataset.sourceKind,
     origin:el.dataset.originId,
     source:document.querySelector('.cm-content')?.textContent?.slice(0,200)
   }));
   assert(style.blue,`${name} reparented PBS must use native-child blue label`);
   assert.equal(style.kind,'content',`${name} Top Award has body: label must not be dashed`);
   const root=await page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"] .ocr-pdf-block-ctrl').evaluate(
     el=>el.dataset.sourceKind);
   assert.equal(root,'content',`${name} native image child counts as real parent content`);
   assert.equal(await page.locator('.ocr-pdf-block-cover[data-block-id="p1b14"]').count(),0);
   assert.equal(readFileSync(doc,'utf8'),source,'PDF drag must not auto-save');
   assert.equal(hash(readFileSync(pdf)),hash(originalPDF));
   await page.locator('#undo').evaluate(el=>el.click());
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b14"]')&&
     !document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'),null,{timeout:40000});
   await page.locator('#redo').evaluate(el=>el.click());
   await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3s1"]'),null,{timeout:40000});
   assert.deepEqual(errors,[]);
   console.log('PDF_REPARENT_AGAIN_PASS',name,{source:'p1b14',target:'p1b3s0',result:'p1b3s1',
     originRetained:true,pdfLabelUpdated:true,undoRedo:true,originalJSON:true,noAutoSave:true,
     realPdf:true,syntheticTouch:true});
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
