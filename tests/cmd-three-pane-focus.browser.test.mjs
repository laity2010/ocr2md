/** Exact cross-pane regression: source PBS p1b12 maps to PDF OCR p1b10,
 * AG p1b12 (never old p1b2) regardless of where focus originated.
 * Browser interacts with PDF chip, CM6 line, and AG row; all fixture writes
 * are confined to a disposable document, never the real WCP workspace. */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {makeThreePaneRenumberedDocument} from './cmd-three-pane-focus.test.mjs';
import {projectCMDAtomLocations} from '../ui/cmd-block-chains.js';
const {source}=makeThreePaneRenumberedDocument();
const target=projectCMDAtomLocations(source).find(x=>x.id==='p1b12');
assert(target&&target.origin==='p1b10');
const targetLineText=source.split('\n')[target.contentLine-1].trim();
const dir=mkdtempSync(join(tmpdir(),'ocr2md-three-pane-'));
const doc=join(dir,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const value=s.address().port;s.close(e=>e?fail(e):ok(value));});});
const url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const PDF=page=>page.locator('.ocr-pdf-region-overlay');
const selectedAG=page=>page.locator('.ocr-text-block-grid .ag-row-selected[row-id]');
const badge=(page,id)=>page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
const waitMatch=(page,{id='p1b12',physical=10,text=targetLineText}={})=>page.waitForFunction(x=>{
  const ag=document.querySelector('.ocr-text-block-grid .ag-row-selected[row-id]');
  const pdf=document.querySelector('.ocr-pdf-region-overlay');
  const line=document.querySelector('#editor .cm-outline-focused-line');
  return ag?.getAttribute('row-id')===x.id&&pdf?.dataset.pdfPage==='2'
     &&pdf?.dataset.blockIndex===String(x.physical)&&line?.textContent?.trim()===x.text;
},{id,physical,text},{timeout:24000});
try{
  let live=false;for(let i=0;i<250;i++){
    try{if((await fetch(url+'/healthz')).ok){live=true;break;}}catch{}await sleep(130);
  }
  assert(live,'disposable three-pane server unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(url,{waitUntil:'domcontentloaded',timeout:75000});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',
          null,{timeout:90000});
        await page.locator('#module-select').evaluate(el=>{el.value='text-block';
          el.dispatchEvent(new Event('change',{bubbles:true}));});
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b12"][data-origin-id="p1b10"]'),
          null,{timeout:55000});
        await selectPreview(page,'pdf');
        // PDF → source → AG: the displayed p1b12 chip is at the physical
        // p1b10 bbox; never pick unrelated p1b2 from display ordering.
        const chip=badge(page,'p1b12');
        await chip.scrollIntoViewIfNeeded({timeout:37000});
        await chip.evaluate(el=>el.click());
        await waitMatch(page);
        console.log('THREE_PANE_PDF_TO_ALL_OK',name,'p1b12→OCR b10→AG p1b12');
        // Source → PDF → AG: select a different PDF tag first, then click the
        // actual CM6 line of the renamed source block to trigger native
        // CM6 click focus, not programmatic viewStore injection.
        const neighbour=badge(page,'p1b11');
        await neighbour.scrollIntoViewIfNeeded();await neighbour.evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay')?.dataset.blockIndex==='11');
        const sourceLine=page.locator('#editor .cm-content .cm-line')
          .filter({hasText:targetLineText}).first();
        await sourceLine.waitFor({state:'visible',timeout:21000});
        await sourceLine.click();
        await waitMatch(page);
        console.log('THREE_PANE_CM6_TO_ALL_OK',name,'source p1b12→OCR b10→AG p1b12');
        // AG → source → PDF: activate a neighbour to change the physical
        // overlay, then click the real AG source-line navigation button.
        await neighbour.evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay')?.dataset.blockIndex==='11');
        const agRow=page.locator('.ocr-text-block-grid .ag-row[row-id="p1b12"]');
        await agRow.waitFor({state:'attached',timeout:23000});
        await agRow.locator('.ocr-text-block-jump').evaluate(el=>el.click());
        await waitMatch(page);
        console.log('THREE_PANE_AG_TO_ALL_OK',name,'AG p1b12→CM6 p1b12→OCR b10');
        // Raw canvas hit uses physical OCR bbox but must publish current ID.
        const physical=page.locator('.ocr-pdf-block-cover[data-origin-id="p1b10"][data-block-id="p1b12"]');
        const point=await physical.evaluate(node=>{
          const rect=node.getBoundingClientRect();return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
        });
        await physical.evaluate((node,{x,y})=>node.closest('.page').querySelector('canvas')
          .dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:x,clientY:y})),point);
        await waitMatch(page);
        assert.equal(readFileSync(doc,'utf8'),source,'navigation cannot rewrite user/source document');
        assert.deepEqual(errors,[]);
        console.log('THREE_PANE_CMD_SOURCE_PDF_AG_BROWSER_PASS',name);
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
