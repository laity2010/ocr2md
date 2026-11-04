/** Verify B-table cross-page initialization in actual PDF/CM6 UI.
 * This test uses only a disposable CMD document generated from the real
 * sealed MinerU fixture. Never edits the user or repo fixture documents.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {mapCMDVisibleLabelSources} from '../ui/cmd-block-labels.js';
import {selectPreview} from './navigation-ui.test-helper.mjs';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),labelLocations=mapCMDVisibleLabelSources(source);
assert.equal(toMineruJSON(source),raw);
const runRoot=mkdtempSync(join(tmpdir(),'ocr2md-crosspage-btables-'));
const doc=join(runRoot,'document.md');writeFileSync(doc,source);
const port=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?bad(e):ok(n));});});
const url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(runRoot,'settings.json'),
  V6_TOKEN_PATH:join(runRoot,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
 let live=false;for(let n=0;n<260;n++){
  try{if((await fetch(url+'/healthz')).ok){live=true;break;}}catch{}await sleep(130);
 }
 assert(live,'isolated V6 server not ready');
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
   ['iPad-WebKit',webkit,webkit.executablePath()]]){
  if(process.env.ONE_BROWSER&&name!==process.env.ONE_BROWSER)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1280,height:950}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:70000});
    await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
    await page.locator('#module-select').evaluate(el=>{el.value='text-block';
      el.dispatchEvent(new Event('change',{bubbles:true}));});
    await selectPreview(page,'pdf');
    const orderedIDs=['p4b0','p4b0s0','p4b0s1','p4b0s2','p4b1','p4b1s0','p4b1s1','p4b1s2'];
    const positions=orderedIDs.map(id=>labelLocations.get(id)?.sourceLine);
    assert(positions.every(Number.isInteger)&&positions.every((value,i)=>i===0||positions[i-1]<value),
      'CMD source lines must be monotonic in native numeric PBS order');
    for(const [id,expectedRowCount,expectedPhysicalPage,distinctRow] of [
      ['p3b1s0',9,4,'Information ratio of equity mutual funds'],
      ['p4b0s1',9,5,'Information ratio of common stocks']]){
      const location=labelLocations.get(id);
      assert(location?.contentLine,`no CMD source content for ${id}`);
      const text=source.split('\n')[location.contentLine-1];
      assert.equal((text.match(/<tr>/g)||[]).length,expectedRowCount);
      assert(text.includes(distinctRow));
      const badge=page.locator(`.ocr-pdf-block-fragment[data-subblock-id="${id}"] > .ocr-pdf-subblock-chip`);
      await badge.waitFor({state:'attached',timeout:55000});
      await badge.scrollIntoViewIfNeeded({timeout:28000});
      await badge.evaluate(el=>el.click());
      await page.waitForFunction(value=>{
        const focus=document.querySelector('#editor .cm-outline-focused-line')?.textContent?.trim();
        return focus===value;
      },text.trim(),{timeout:30000});
      assert.equal(await page.locator('.ocr-pdf-page').inputValue(),String(expectedPhysicalPage));
      if(id==='p4b0s1'){
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-page')?.value==='5');
        const agIDs=await page.locator('.ocr-text-block-grid .ag-center-cols-container .ag-row')
          .evaluateAll(rows=>rows.map(row=>row.getAttribute('row-id')));
        const visible=agIDs.filter(x=>orderedIDs.includes(x));
        assert.deepEqual(visible,orderedIDs.filter(x=>visible.includes(x)),
          'AG must show visible parent/child rows in numeric PBS order');
      }
      assert.equal(await page.locator('.ocr-pdf-block-fragment[data-subblock-id="'+id+'"]')
        .count(),1);
      console.log('CROSS_PAGE_B_TABLE_PDF_SOURCE_OK',name,id,'PDF',expectedPhysicalPage,
        'rows',expectedRowCount,'sourceLine',location.contentLine);
      if(process.env.CROSSPAGE_SCREENSHOT_DIR){
        mkdirSync(process.env.CROSSPAGE_SCREENSHOT_DIR,{recursive:true});
        const target=resolve(process.env.CROSSPAGE_SCREENSHOT_DIR,`crosspage-${id}-${name}.png`);
        await page.screenshot({path:target,animations:'disabled'});
        console.log('SCREENSHOT',target);
      }
    }
    assert.equal(readFileSync(doc,'utf8'),source,'PDF navigation never mutates CMD data');
    assert.deepEqual(errors,[]);
    console.log('CROSS_PAGE_B_TABLE_BROWSER_PASS',name);
   }finally{await page.close();}
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');rmSync(runRoot,{recursive:true,force:true});}
