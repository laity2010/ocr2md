/** Source-initiated CMD PBS focus across CM6, AG and physical PDF geometry.
 * The default portable scenario uses a generated edited fixture. Optionally
 * pass FOCUS_SOURCE_PATH and FOCUS_PDF_PATH to audit an external live document
 * IN A DISPOSABLE COPY, never modifying the original user document/PDF.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {seededRenumberedSource} from './pdf-renumbered-cmd-location.test.mjs';
import {projectCMDAtomLocations} from '../ui/cmd-block-chains.js';
import {selectPreview} from './navigation-ui.test-helper.mjs';
const source=process.env.FOCUS_SOURCE_PATH?
  readFileSync(process.env.FOCUS_SOURCE_PATH,'utf8'):seededRenumberedSource().source;
const pdf=process.env.FOCUS_PDF_PATH||resolve('.v6/workspace/buffetts-alpha.original.pdf');
const id=process.env.FOCUS_ID||(process.env.FOCUS_SOURCE_PATH?'p1b12':'p1b7');
const atom=projectCMDAtomLocations(source).find(item=>item.id===id);
assert(atom&&atom.contentLine&&atom.origin!==id,`expected renumbered source: ${id}`);
const wrong=projectCMDAtomLocations(source).find(item=>item.origin===id);
assert(wrong&&wrong.id!==id,`expected old physical ID ${id} to be occupied by another CMD atom`);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-source-3pane-'));const doc=join(dir,'document.md');
writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?fail(e):ok(n));});});
const base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:pdf,V6_STATIC_ROOT:resolve('dist'),
  V6_SETTINGS_PATH:join(dir,'settings.json'),V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const physicalIndex=Number(/^p\d+b(\d+)/.exec(atom.origin)?.[1]);
const wrongPhysicalIndex=Number(/^p\d+b(\d+)/.exec(wrong.origin)?.[1]);
async function overlay(page,blockIndex){
 await page.waitForFunction(n=>{
   const el=document.querySelector('.ocr-pdf-region-overlay');
   return el?.dataset.blockIndex===String(n)&&el?.getBoundingClientRect().height>0;
 },blockIndex,{timeout:22000});
}
try{
 let live=false;for(let i=0;i<300;i++){try{if((await fetch(base+'/healthz')).ok){live=true;break;}}catch{}await sleep(120);}
 assert(live,'isolated source-focused test server not ready');
 for(const [browserName,engine,binary] of [['Chrome',chromium,chromeExecutable()],['iPad-WebKit',webkit,webkit.executablePath()]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==browserName)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1370,height:1000}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:75000});
    await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:90000});
    await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await selectPreview(page,'pdf');
    const chip=page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"] > .ocr-pdf-block-ctrl`);
    await chip.waitFor({state:'attached',timeout:50000});
    const targetBox=page.locator(`.ocr-pdf-block-cover[data-block-id="${id}"]`);
    assert.equal(await targetBox.getAttribute('data-origin-id'),atom.origin,
      'PDF chip owner must use current logical ID and immutable OCR origin');
    await chip.scrollIntoViewIfNeeded();await chip.evaluate(el=>el.click());
    await overlay(page,physicalIndex);
    const editor=page.locator('#editor .cm-scroller');
    const sourceScroll=await editor.evaluate(el=>el.scrollTop);
    // Deliberately navigate elsewhere so source-click verification cannot
    // pass solely because the prior PDF selection was already correct.
    const other=page.locator(`.ocr-pdf-block-cover[data-block-id="${wrong.id}"] > .ocr-pdf-block-ctrl`);
    await other.waitFor({state:'attached',timeout:30000});await other.scrollIntoViewIfNeeded();
    await other.evaluate(el=>el.click());
    await overlay(page,wrongPhysicalIndex);
    await editor.evaluate((el,value)=>{el.scrollTop=value;},sourceScroll);
    const content=source.split('\n')[atom.contentLine-1].trim();
    const sourceLine=page.locator('#editor .cm-line').filter({hasText:content.slice(0,22)}).first();
    await sourceLine.waitFor({state:'visible',timeout:23000});
    await sourceLine.click({position:{x:Math.min(80,await sourceLine.evaluate(el=>el.clientWidth/3)),y:12},timeout:27000});
    try{await overlay(page,physicalIndex);}catch(error){
      const debug=await page.evaluate(()=>({
        overlay:Object.assign({},document.querySelector('.ocr-pdf-region-overlay')?.dataset),
        activeLine:document.querySelector('#editor .cm-activeLine')?.textContent?.slice(0,110),
        highlighted:document.querySelector('#editor .cm-outline-focused-line')?.textContent?.slice(0,110),
        selected:document.querySelector('.ocr-text-block-grid .ag-row-selected')?.getAttribute('row-id'),
        pane:document.querySelector('.ocr-preview-pane')?.dataset.previewMode,
        pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
        global:document.querySelector('#status')?.textContent?.slice(0,240)
      }));console.error('SOURCE_PDF_FOCUS_DIAGNOSTIC',browserName,JSON.stringify(debug));
      if(process.env.FOCUS_SCREENSHOT_DIR){
        mkdirSync(process.env.FOCUS_SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:resolve(process.env.FOCUS_SCREENSHOT_DIR,`failed-${id}-${browserName}.png`)});
      }
      throw error;
    }
    await page.waitForFunction(identity=>{
      const selected=document.querySelector('.ocr-text-block-grid .ag-row-selected');
      return selected?.getAttribute('row-id')===identity;
    },id,{timeout:23000});
    const actual=await page.evaluate(()=>{
      const selected=document.querySelector('.ocr-text-block-grid .ag-row-selected');
      const over=document.querySelector('.ocr-pdf-region-overlay');
      const chip=document.querySelector(`.ocr-pdf-block-cover[data-block-id="${selected?.getAttribute('row-id')}"]`);
      const o=over?.getBoundingClientRect(),c=chip?.getBoundingClientRect();
      return {selected:selected?.getAttribute('row-id'),overlay:over?.dataset.blockIndex,
        physical:chip?.dataset.originId,overlap:o&&c?Math.max(0,Math.min(o.right,c.right)-Math.max(o.left,c.left))*
          Math.max(0,Math.min(o.bottom,c.bottom)-Math.max(o.top,c.top)):0,
        status:document.querySelector('#status')?.textContent?.slice(0,220)};
    });
    assert.equal(actual.selected,id);
    assert.equal(actual.overlay,String(physicalIndex));
    assert.equal(actual.physical,atom.origin);
    assert(actual.overlap>10,'yellow highlighted PDF bbox must intersect same-named logical chip');
    assert.equal(readFileSync(doc,'utf8'),source,'focus never saves user/source document');
    assert.deepEqual(errors,[]);
    if(process.env.FOCUS_SCREENSHOT_DIR){
      mkdirSync(process.env.FOCUS_SCREENSHOT_DIR,{recursive:true});
      const path=resolve(process.env.FOCUS_SCREENSHOT_DIR,`source-${id}-${browserName.toLowerCase()}.png`);
      await page.screenshot({path,animations:'disabled'});
      console.log('SCREENSHOT',path);
    }
    console.log('SOURCE_THREE_PANE_PASS',browserName,JSON.stringify({id,physical:atom.origin,actual}));
   }finally{await page.close();}
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
