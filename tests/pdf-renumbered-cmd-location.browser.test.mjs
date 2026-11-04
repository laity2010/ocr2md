/** Native PDF labels after CMD insert-after / parent absorption / child
 * promotion must focus the CURRENT same-named source tag, never old OCR ID.
 * Disposable document, separate read-only PDF and no save/working data edits.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {seededRenumberedSource} from './pdf-renumbered-cmd-location.test.mjs';
import {mapCMDVisibleLabelSources} from '../ui/cmd-block-labels.js';
const {source,promotedId}=seededRenumberedSource();
const labels=mapCMDVisibleLabelSources(source);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-cmd-pdf-label-focus-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const badge=(page,id)=>page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
const fragment=(page,id)=>page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${id}"] > .ocr-pdf-subblock-chip`);
const focus=page=>page.evaluate(async()=>{
  const {viewStore}=await import('/view-store.js');
  const latest=viewStore.getState().focusTarget;
  const view=window.__v6cm6?.view;
  return {sourceLine:latest?.sourceLine,elementId:latest?.elementId,origin:latest?.origin,
    cmLine:view?.state.doc.lineAt(view.state.selection.main.head).number};
});
async function verify(page,id,origin,locator){
  const expected=labels.get(id);assert(expected,`Missing CMD current label ${id}`);
  await locator.waitFor({state:'attached',timeout:42000});
  await locator.scrollIntoViewIfNeeded({timeout:32000});
  await locator.evaluate(el=>el.click());
  const targetLine=expected.contentLine??expected.sourceLine;
  await page.waitForFunction(expected=>{
    const status=document.querySelector('.ocr-pdf-status')?.textContent||'';
    return status.includes(expected.id)&&status.includes(`第 ${expected.line} 行`);
  },{id,line:targetLine},{timeout:19000});
  await page.waitForFunction(async expected=>{
    const {viewStore}=await import('/view-store.js');
    return viewStore.getState().focusTarget?.sourceLine===expected.line&&
      viewStore.getState().focusTarget?.elementId===expected.id;
  },{id,line:targetLine},{timeout:20000});
  const actual=await focus(page);
  assert.equal(actual.sourceLine,targetLine);
  assert.equal(actual.elementId,id);
  assert.equal(actual.origin,'pdf');
  if(origin){
    const physical=locator.locator('xpath=ancestor::*[contains(@class,"ocr-pdf-block-cover")]').first();
    assert.equal(await physical.getAttribute('data-origin-id'),origin,
      'label must keep its original physical OCR bbox identity');
  }
  console.log('PDF_RENUMBER_FOCUS_OK',id,origin||'-',JSON.stringify(actual));
}
try{
  let live=false;for(let i=0;i<280;i++){
    try{if((await fetch(url+'/healthz')).ok){live=true;break;}}catch{}await sleep(130);
  }
  assert(live,'disposable source focus server failed');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b7"][data-origin-id="p1b5"]'),null,{timeout:50000});
        await selectPreview(page,'pdf');
        await verify(page,'p1b7','p1b5',badge(page,'p1b7'));
        await verify(page,'p1b8','p1b7',badge(page,'p1b8'));
        await verify(page,'p6b6s1','p6b7',badge(page,'p6b6s1'));
        await verify(page,promotedId,'p9b1',badge(page,promotedId));
        await verify(page,'p3b0',null,badge(page,'p3b0'));
        // Canvas hits have only native physical geometry; these too must
        // resolve the moved parent's current logical label.
        const physical=page.locator('.ocr-pdf-block-cover[data-block-id="p1b7"]');
        await physical.scrollIntoViewIfNeeded();
        const point=await physical.evaluate(node=>{
          const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};
        });
        await physical.evaluate((node,{x,y})=>node.closest('.page').querySelector('canvas')
          .dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y})),point);
        await page.waitForFunction(async expected=>{
          const {viewStore}=await import('/view-store.js');
          return viewStore.getState().focusTarget?.elementId===expected.id&&
            viewStore.getState().focusTarget?.sourceLine===expected.line;
        },{id:'p1b7',line:labels.get('p1b7').contentLine??labels.get('p1b7').sourceLine},{timeout:17000});
        assert.equal(readFileSync(doc,'utf8'),source,'navigation must never rewrite CMD document');
        assert.deepEqual(errors,[]);
        console.log('PDF_RENUMBER_SOURCE_FOCUS_BROWSER_PASS',name,'after/reparent/promote/original/canvas');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
