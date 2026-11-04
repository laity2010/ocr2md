/** Real PDF subblock chip -> same-parent sibling guide BEFORE/AFTER, undo.
 * Uses disposable CMD/server; no production user files are modified.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDAbsorbReviewedParent} from '../ui/cmd-block-chains.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const initial=original;
const absorb=planCMDAbsorbReviewedParent(initial,'p13b0','p13b1');
const current=[...absorb.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>
  text.slice(0,e.from)+e.insert+text.slice(e.to),initial);
const cases=[
  {parent:'p13b1',source:'p13b1s3',target:'p13b1s0',placement:'before',newId:'p13b1s0',coverId:'p13b1s0'},
  {parent:'p13b1',source:'p13b1s0',target:'p13b1s3',placement:'after',newId:'p13b1s3',coverId:'p13b1s2'}
];
const tmp=mkdtempSync(join(tmpdir(),'ocr2md-sibling-drag-'));
const doc=join(tmp,'document.md');writeFileSync(doc,current);
const port=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?bad(e):ok(n));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(tmp,'settings.json'),
  V6_TOKEN_PATH:join(tmp,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
try{
  let ready=false;for(let i=0;i<200;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await sleep(160);
  }
  assert(ready,'isolated server not ready');
  for(const [name,engine,executablePath] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true,...(executablePath?{executablePath}:{})});
    try{
      for(const spec of cases){
        if(process.env.ONE_SCENARIO&&spec.source!==process.env.ONE_SCENARIO)continue;
        writeFileSync(doc,current);
        const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
          viewport:{width:1280,height:950}});
        page.setDefaultTimeout(28000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        try{
          await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000});
          await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
            null,{timeout:100000});
          await page.locator('#module-select').evaluate(el=>{el.value='text-block';
            el.dispatchEvent(new Event('change',{bubbles:true}));});
          await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('PBS 267'),
            null,{timeout:65000});
          await selectPreview(page,'pdf');
          const childCover=page.locator('.ocr-pdf-block-cover.ocr-pdf-block-child-cover[data-origin-id="p13b0"]');
          await childCover.waitFor({state:'attached',timeout:50000});
          const from=spec.source==='p13b1s3'?childCover.locator(':scope > .ocr-pdf-block-ctrl'):
            page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${spec.source}"] > .ocr-pdf-subblock-chip`);
          const target=spec.target==='p13b1s3'?childCover:
            page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${spec.target}"]`);
          await from.waitFor({state:'attached',timeout:50000});
          await target.scrollIntoViewIfNeeded({timeout:35000});
          const fr=await from.boundingBox();
          assert(fr,'child label visible');
          const physicalBefore=await childCover.getAttribute('style');
          const touch={bubbles:true,pointerType:'touch',button:0,isPrimary:true,pointerId:787};
          await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
          await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:8000});
          const guide=page.locator('.ocr-pdf-block-drop-guide');
          // WebKit may finish PDF.js viewport layout during the long press.
          // Always re-hit the CURRENT real bbox, never a pre-press coordinate.
          for(let attempt=0;attempt<4&&!(await guide.count());attempt++){
            const rect=await target.boundingBox();assert(rect);
            await page.locator('body').dispatchEvent('pointermove',{...touch,...center(rect)});
            if(!(await guide.count()))await page.waitForTimeout(180);
          }
          try{await guide.waitFor({state:'attached',timeout:8000});}
          catch(error){
            console.log('CHILD_HIT_DIAG',name,spec,await page.evaluate(()=>({
              global:document.querySelector('#status')?.textContent,
              pdf:document.querySelector('.ocr-pdf-status')?.textContent,
              drag:document.querySelector('.ocr-pdf-block-drag-source')?.outerHTML.slice(0,180),
              cover:document.querySelector('.ocr-pdf-block-drop-target')?.dataset.subblockId
            })));
            throw error;
          }
          assert.deepEqual(await guide.locator('[data-placement]').evaluateAll(nodes=>nodes.map(n=>n.dataset.placement)),
            ['before','after'],'child sibling rail must offer only before and after');
          const zone=await guide.locator(`[data-placement="${spec.placement}"]`).boundingBox();assert(zone);
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zone)});
          assert.equal(await guide.getAttribute('data-placement'),spec.placement);
          if(process.env.OCR_CHILD_REORDER_SCREENSHOTS){
            mkdirSync(process.env.OCR_CHILD_REORDER_SCREENSHOTS,{recursive:true});
            await page.screenshot({path:resolve(process.env.OCR_CHILD_REORDER_SCREENSHOTS,
              `child-${name}-${spec.placement}-hover.png`),animations:'disabled'});
          }
          await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zone)});
          try{
            await page.waitForFunction(({coverId})=>document.querySelector(
              '.ocr-pdf-block-cover.ocr-pdf-block-child-cover[data-origin-id="p13b0"]')?.dataset.blockId===coverId,
              spec,{timeout:30000});
          }catch(error){
            console.log('ABSORBED_CHILD_DIAG',name,spec,
              await page.locator('#status').textContent());throw error;
          }
          assert.equal(await page.locator('.ocr-pdf-block-drop-guide').count(),0);
          assert.equal(await page.locator('.ocr-pdf-block-drag-arrow').count(),0);
          assert.equal(readFileSync(doc,'utf8'),current,'source only changes in CM6 until global Save');
          assert.equal(await childCover.getAttribute('style'),physicalBefore,
            'absorbed parent physical PDF bbox is unchanged');
          const status=await page.locator('#status').textContent();
          assert(status.includes('子块')&&status.includes(spec.newId),
            'single global status reports applied child drop: '+status.slice(0,280));
          console.log('CHILD_DRAG_APPLIED',name,spec.source,spec.placement,spec.target,spec.newId);
          // The entire child-scope + mapping footer is one CM6 Undo.
          await page.locator('#editor .cm-content').focus();
          await page.keyboard.press('Meta+z');
          await page.waitForFunction(()=>document.querySelector(
            '.ocr-pdf-block-cover.ocr-pdf-block-child-cover[data-origin-id="p13b0"]')?.dataset.blockId==='p13b1s3',
            null,{timeout:25000});
          assert.deepEqual(errors,[]);
          console.log('CHILD_DRAG_UNDO_PASS',name,spec.placement);
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(tmp,{recursive:true,force:true});}
