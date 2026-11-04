/** PDF text extraction remains available with PBS structure locked.
 * PDF/AG hints share Shell global #status and the unsaved CMD insertion
 * remains undoable. Operates only on a disposable fixture document.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-pdf-extract-status-'));
const doc=join(dir,'document.md');writeFileSync(doc,original);
const port=await new Promise((ok,bad)=>{const s=createServer();s.once('error',bad);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?bad(e):ok(n));});});
const url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
  let ready=false;for(let n=0;n<240;n++){try{if((await fetch(url+'/healthz')).ok){ready=true;break;}}catch{}await sleep(120);}
  assert(ready,'isolated OCR2MD HTTP server unavailable');
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
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('CMD ·'),
          null,{timeout:45000});
        await selectPreview(page,'pdf');
        const extract=page.locator('.ocr-pdf-extract-text');
        assert.equal(await extract.isVisible(),true,'提取文本 must be visible even in PBS readonly mode');
        assert.equal(await extract.isDisabled(),true,'no PDF block selected yet');
        assert.equal(await page.locator('.ocr-pdf-pane.ocr-pdf-readonly').count(),1);
        assert.equal(await page.locator('.ocr-pdf-promote-child').isVisible(),false,
          'read-only structural promotion remains protected');
        const firstLine=page.locator('#editor .cm-content .cm-line').first();
        await firstLine.waitFor();
        await firstLine.click();
        const before=await firstLine.textContent();
        const badge=page.locator('.ocr-pdf-block-cover[data-block-id="p1b9"] > .ocr-pdf-block-ctrl');
        await badge.waitFor({state:'attached',timeout:43000});
        await badge.scrollIntoViewIfNeeded({timeout:37000});
        await badge.evaluate(node=>node.click());
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-extract-text')?.disabled,
          null,{timeout:32000});
        assert.match(await extract.getAttribute('title'),/原文字层 .* 字符/);
        assert.equal(await page.locator('.ocr-pdf-status').evaluate(el=>getComputedStyle(el).display),'none');
        assert.equal(await page.locator('.ocr-global-ag-status').evaluate(el=>getComputedStyle(el).display),'none');
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('PDF · p1b9'),
          null,{timeout:16000});
        assert.equal((await page.locator('#status').textContent()).includes('CMD ·'),true,
          'AG count is now part of the one global status line');
        await extract.evaluate(el=>el.click());
        try{await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('PDF · 已提取'),
          null,{timeout:12000});}catch(error){
          const debug=await page.evaluate(()=>({
            global:document.querySelector('#status')?.textContent?.slice(0,650),
            pdf:document.querySelector('.ocr-pdf-status')?.textContent,
            button:{disabled:document.querySelector('.ocr-pdf-extract-text')?.disabled,
              title:document.querySelector('.ocr-pdf-extract-text')?.title},
            first:document.querySelector('#editor .cm-content .cm-line')?.textContent?.slice(0,320),
            modal:document.querySelector('#unlock-dialog')?.open
          }));
          console.error('PDF_EXTRACT_DIAG',name,JSON.stringify({debug,errors}));throw error;
        }
        assert.equal(readFileSync(doc,'utf8'),original,'PDF extraction must not save CMD on disk');
        await page.waitForFunction(previous=>document.querySelector('#editor .cm-content .cm-line')
          ?.textContent!==previous,before,{timeout:14000});
        const changed=await firstLine.textContent();assert.notEqual(changed,before);
        await page.locator('#undo').evaluate(el=>el.click());
        await page.waitForFunction(previous=>document.querySelector('#editor .cm-content .cm-line')
          ?.textContent===previous,before,{timeout:18000});
        assert.equal(readFileSync(doc,'utf8'),original);
        assert.deepEqual(errors,[]);
        console.log('PDF_EXTRACT_GLOBAL_STATUS_PASS',name,'button/caret/undo/AG status');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
