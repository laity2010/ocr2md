/** New parent drop option "after": actual PDF gesture + ID/geometry and reload.
 * Tests an independent A moved after B, without swapping B or shifting A's
 * PDF rectangle. Works on same or different physical PDF pages.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDInsertPBSParentAfter,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const scenarios=[
  {name:'same-page',A:'p1b5',B:'p1b6',newId:'p1b7',shift:'p1b8',oldShift:'p1b7',
    page:2},
  {name:'cross-page',A:'p1b5',B:'p2b0',newId:'p2b1',shift:'p2b2',oldShift:'p2b1',
    page:2},
];
const docDir=mkdtempSync(join(tmpdir(),'ocr2md-pbs-insert-after-'));
const doc=join(docDir,'document.md'),token=join(docDir,'token');
const port=await new Promise((ok,fail)=>{const sock=createServer();sock.once('error',fail);
  sock.listen(0,'127.0.0.1',()=>{const p=sock.address().port;sock.close(e=>e?fail(e):ok(p));});});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(docDir,'settings.json'),
  V6_TOKEN_PATH:token},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=box=>({clientX:box.x+box.width/2,clientY:box.y+box.height/2});
const geometry=el=>({left:el.style.left,top:el.style.top,width:el.style.width,
  height:el.style.height,pdfPage:el.dataset.pdfPage});
const tag=(page,id)=>page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
const cover=(page,id)=>page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"]`);
try{
  let ready=false;
  for(let i=0;i<190;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await sleep(160);}
  assert(ready,'disposable OCR2MD server not ready');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      for(const test of scenarios){
        if(process.env.ONE_SCENARIO&&test.name!==process.env.ONE_SCENARIO)continue;
        writeFileSync(doc,original);
        const plan=planCMDInsertPBSParentAfter(original,test.A,test.B);
        assert.equal(plan.newId,test.newId);
        const expected=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
          assert.equal(s.slice(e.from,e.to),e.expected);return s.slice(0,e.from)+e.insert+s.slice(e.to);
        },original);
        const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
          viewport:{width:1032,height:900}});
        page.setDefaultTimeout(28000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        try{
          assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000})).status(),200);
          await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
            null,{timeout:90000});
          await page.locator('#module-select').evaluate(el=>{el.value='text-block';
            el.dispatchEvent(new Event('change',{bubbles:true}));});
          await page.waitForFunction(n=>document.querySelector('#status')?.textContent?.includes('PBS '+n),
            readCMDBlockChains(original).atoms.length,{timeout:65000});
          await selectPreview(page,'pdf');
          const from=tag(page,test.A),to=tag(page,test.B);
          await from.waitFor({state:'attached',timeout:55000});
          await from.scrollIntoViewIfNeeded({timeout:35000});
          const a=await from.boundingBox();assert(a);
          const before=await cover(page,test.A).evaluate(geometry);
          const targetBefore=await cover(page,test.B).evaluate(geometry);
          assert.equal(before.pdfPage,String(test.page));
          const touch={bubbles:true,pointerId:345,pointerType:'touch',button:0,isPrimary:true};
          await from.dispatchEvent('pointerdown',{...touch,...center(a)});
          await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:7500});
          if(test.name==='cross-page'){
            const scroll=page.locator('.ocr-pdf-scroller'),pane=await scroll.boundingBox();assert(pane);
            const scrollBefore=await scroll.evaluate(el=>el.scrollTop);
            await page.locator('body').dispatchEvent('pointermove',{
              ...touch,clientX:pane.x+pane.width/2,clientY:pane.y+pane.height-6});
            await page.waitForFunction(old=>document.querySelector('.ocr-pdf-scroller')?.scrollTop>old+15,
              scrollBefore,{timeout:12000});
            await page.locator('body').dispatchEvent('pointermove',{
              ...touch,clientX:pane.x+pane.width/2,clientY:pane.y+pane.height/2});
          }
          await to.scrollIntoViewIfNeeded({timeout:35000});
          const b=await to.boundingBox();assert(b);
          const targetCover=cover(page,test.B),bbox=await targetCover.boundingBox();assert(bbox);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(bbox)});
          assert.equal(await targetCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),true,
            'Cover bbox, not outboard label, must be highlighted');
          assert.equal(await targetCover.evaluate(el=>getComputedStyle(el).outlineWidth),'3px');
          // Outside the PDF pane there is no hovered bbox: clear highlight
          // and menu rather than keeping a stale target, then reacquire B.
          await page.locator('body').dispatchEvent('pointermove',{...touch,clientX:0,clientY:0});
          assert.equal(await targetCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),
            false,'leaving PDF coverage must clear the target highlight');
          assert.equal(await page.locator('.ocr-pdf-block-drop-guide').count(),0);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(bbox)});
          assert.equal(await targetCover.evaluate(el=>el.classList.contains('ocr-pdf-block-drop-target')),true);
          const rail=page.locator('.ocr-pdf-block-drop-guide');
          await rail.waitFor({state:'attached',timeout:7500});
          assert.deepEqual(await rail.locator('[data-placement]').evaluateAll(nodes=>
            nodes.map(n=>n.dataset.placement)),['before','child','after'],
            'Parent landing must offer before, child, after');
          assert((await page.locator('.ocr-pdf-status').textContent()).includes(test.B));
          const spot=await rail.locator('[data-placement="after"]').boundingBox();assert(spot);
          if(process.env.OCR_PBS_HOVER_CAPTURE)
            await page.screenshot({path:process.env.OCR_PBS_HOVER_CAPTURE.replace(/\.png$/,
              `-${name}-${test.name}.png`),animations:'disabled'});
          // Simulate a real finger travelling through the gap from coverage
          // rectangle to external rail, rather than teleporting to a button.
          const start=center(bbox),finish=center(spot);
          const stableGuide=await rail.boundingBox(),stableScroll=await page.locator('.ocr-pdf-scroller')
            .evaluate(el=>el.scrollTop);
          for(let step=1;step<=14;step++){
            const t=step/14;
            await page.locator('body').dispatchEvent('pointermove',{...touch,
              clientX:start.clientX+(finish.clientX-start.clientX)*t,
              clientY:start.clientY+(finish.clientY-start.clientY)*t});
            assert.equal(await rail.count(),1,'target rail lost during pointer handoff');
            const currentGuide=await rail.boundingBox();assert(currentGuide);
            assert(Math.abs(currentGuide.y-stableGuide.y)<6,
              'selected landing guide must not drift during cover-to-menu handoff');
            const currentScroll=await page.locator('.ocr-pdf-scroller').evaluate(el=>el.scrollTop);
            assert(Math.abs(currentScroll-stableScroll)<6,
              'PDF auto-scroll must pause while moving to selected landing rail');
          }
          console.log('AFTER_DROP_AIM',name,test.name,
            await page.locator('.ocr-pdf-status').textContent(),
            await rail.getAttribute('data-placement'));
          await page.locator('body').dispatchEvent('pointerup',{...touch,...center(spot)});
          await page.waitForTimeout(1700);
          console.log('AFTER_DROP_STATUS',name,test.name,{
            pdf:await page.locator('.ocr-pdf-status').textContent(),
            global:await page.locator('#status').textContent(),
            ids:await page.locator('.ocr-pdf-block-cover[data-block-id^="p1b"]').count(),
            new:await cover(page,test.newId).count(),original:await cover(page,test.A).count(),
            shifted:await cover(page,test.shift).count()});
          await page.waitForFunction(([A,newId,shift,B])=>{
            const find=id=>document.querySelector(`.ocr-pdf-block-cover[data-block-id="${id}"]`);
            return !find(A)&&find(newId)&&find(shift)&&find(B);
          },[test.A,test.newId,test.shift,test.B],{timeout:80000});
          const moved=cover(page,test.newId);
          assert.equal(await moved.getAttribute('data-origin-id'),test.A);
          assert.deepEqual(await moved.evaluate(geometry),before,'Original A PDF bbox must NOT move');
          assert.deepEqual(await cover(page,test.B).evaluate(geometry),targetBefore,'B PDF bbox must NOT move');
          assert.equal(await tag(page,test.B).locator('span').textContent(),test.B);
          assert.equal(await tag(page,test.newId).locator('span').textContent(),test.newId);
          assert.equal(await tag(page,test.shift).locator('span').textContent(),test.shift);
          assert.equal(await cover(page,test.shift).getAttribute('data-origin-id'),test.oldShift);
          assert.equal(readFileSync(doc,'utf8'),original,'gesture must not autosave');
          console.log('AFTER_PDF_LABELS',name,test.name,{A:test.newId,B:test.B,
            shifted:test.shift,origin:test.A,page:before.pdfPage});
          if(process.env.OCR_PBS_VISUAL_CAPTURE){
            await moved.scrollIntoViewIfNeeded();
            await page.screenshot({path:process.env.OCR_PBS_VISUAL_CAPTURE.replace(/\.png$/,
              `-${name}-${test.name}.png`),animations:'disabled'});
          }
          await page.locator('#undo').evaluate(el=>el.click());
          await page.waitForFunction(([A,newId,oldShift])=>{
            const original=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${A}"]`);
            const following=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${newId}"]`);
            // "newId" is a PRE-EXISTING ID in most cases; after Undo it
            // must point back to its own original physical PDF frame.
            return original?.dataset.originId===A&&
              (!following||following.dataset.originId!==A);
          },[test.A,test.newId,test.oldShift],{timeout:70000});
          await page.locator('#redo').evaluate(el=>el.click());
          await page.waitForFunction(([A,newId])=>{
            const old=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${A}"]`);
            const current=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${newId}"]`);
            return !old&&current?.dataset.originId===A;
          },[test.A,test.newId],{timeout:70000});
          assert.equal(await tag(page,test.B).locator('span').textContent(),test.B);
          await page.locator('#save').evaluate(el=>el.click());
          await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open,
            null,{timeout:18000});
          await page.locator('#unlock-code').fill(readFileSync(token,'utf8').trim().slice(0,12));
          await page.locator('#unlock-form button[type=submit]').click();
          await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
            null,{timeout:40000});
          assert.equal(readFileSync(doc,'utf8'),expected,'Saved file must equal precise CMD plan');
          await page.reload({waitUntil:'domcontentloaded',timeout:75000});
          await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
            null,{timeout:95000});
          await page.locator('#module-select').evaluate(el=>{el.value='text-block';
            el.dispatchEvent(new Event('change',{bubbles:true}));});
          await selectPreview(page,'pdf');
          await cover(page,test.newId).waitFor({state:'attached',timeout:65000});
          assert.deepEqual(await cover(page,test.newId).evaluate(geometry),before,
            'Physical bbox and page must survive saved reload');
          assert.equal(await tag(page,test.B).locator('span').textContent(),test.B);
          assert.equal(await tag(page,test.newId).locator('span').textContent(),test.newId);
          assert.equal(await tag(page,test.shift).locator('span').textContent(),test.shift);
          assert(!await cover(page,test.A).count());
          assert.deepEqual(errors,[]);
          console.log('PBS_PARENT_AFTER_BROWSER_PASS',name,test.name,
            {newId:test.newId,BUnchanged:true,shifted:test.shift,bboxUnchanged:true,
              undo:true,redo:true,saveExact:true,reload:true});
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(docDir,{recursive:true,force:true});}
