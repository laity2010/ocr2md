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
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const cases=[
  {parent:'p4b0',source:'p4b0s2',target:'p4b0s0',placement:'before',physical:2,newId:'p4b0s0'},
  {parent:'p4b1',source:'p4b1s0',target:'p4b1s2',placement:'after',physical:0,newId:'p4b1s2'}
];
const tmp=mkdtempSync(join(tmpdir(),'ocr2md-sibling-drag-'));
const doc=join(tmp,'document.md');writeFileSync(doc,original);
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
        if(process.env.ONE_SCENARIO&&spec.parent!==process.env.ONE_SCENARIO)continue;
        writeFileSync(doc,original);
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
          const from=page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${spec.source}"] > .ocr-pdf-subblock-chip`);
          const target=page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${spec.target}"]`);
          await from.waitFor({state:'attached',timeout:50000});
          await target.scrollIntoViewIfNeeded({timeout:35000});
          const fr=await from.boundingBox(),bbox=await target.boundingBox();
          assert(fr&&bbox,'child label and physical target bbox visible');
          const physicalNode=page.locator(`.ocr-pdf-block-cover[data-block-id="${spec.parent}"] > .ocr-pdf-block-fragment`)
            .filter({has:page.locator(`.ocr-pdf-subblock-chip[data-part-index="${spec.physical}"]`)});
          const physicalBefore=await physicalNode.evaluate(el=>({
            style:el.getAttribute('style'),part:el.querySelector('.ocr-pdf-subblock-chip')?.dataset.partIndex}));
          const touch={bubbles:true,pointerType:'touch',button:0,isPrimary:true,pointerId:787};
          await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
          await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:8000});
          await page.locator('body').dispatchEvent('pointermove',{...touch,...center(bbox)});
          const guide=page.locator('.ocr-pdf-block-drop-guide');
          await guide.waitFor({state:'attached',timeout:8000});
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
          await page.waitForFunction(({parent,physical,newId})=>{
            const node=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${parent}"]`);
            return [...(node?.querySelectorAll('.ocr-pdf-block-fragment')||[])].some(el=>
              el.querySelector('.ocr-pdf-subblock-chip')?.dataset.partIndex===String(physical)&&
              el.dataset.subblockId===newId);
          },spec,{timeout:25000});
          assert.equal(await page.locator('.ocr-pdf-block-drop-guide').count(),0);
          assert.equal(await page.locator('.ocr-pdf-block-drag-arrow').count(),0);
          assert.equal(readFileSync(doc,'utf8'),original,'source only changes in CM6 until global Save');
          const physicalAfter=await physicalNode.evaluate(el=>({
            style:el.getAttribute('style'),part:el.querySelector('.ocr-pdf-subblock-chip')?.dataset.partIndex}));
          assert.deepEqual(physicalAfter,physicalBefore,'original physical PDF child bbox immutable');
          const status=await page.locator('#status').textContent();
          assert(status.includes('子块')&&status.includes(spec.newId),
            'single global status reports applied child drop: '+status.slice(0,280));
          console.log('CHILD_DRAG_APPLIED',name,spec.source,spec.placement,spec.target,spec.newId);
          // The entire child-scope + mapping footer is one CM6 Undo.
          await page.locator('#editor .cm-content').focus();
          await page.keyboard.press('Meta+z');
          await page.waitForFunction(({parent,physical,source})=>{
            const node=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${parent}"]`);
            return [...(node?.querySelectorAll('.ocr-pdf-block-fragment')||[])].some(el=>
              el.querySelector('.ocr-pdf-subblock-chip')?.dataset.partIndex===String(physical)&&
              el.dataset.subblockId===source);
          },spec,{timeout:25000});
          assert.deepEqual(errors,[]);
          console.log('CHILD_DRAG_UNDO_PASS',name,spec.placement);
        }finally{await page.close();}
      }
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(tmp,{recursive:true,force:true});}
