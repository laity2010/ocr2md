/** WCP text-block recognition-only baseline (06b2901 semantics).
 * Real original PDF and disposable CMD document; no user document writes.
 * AG inventory, PDF p/b/s overlays and click focus must remain functional.
 * Long press, triple tap and every structure-edit control must be absent.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {TEXT_BLOCKS_READ_ONLY,rejectTextBlockEdit} from '../ui/text-block-readonly.js';
assert.equal(TEXT_BLOCKS_READ_ONLY,true);
await assert.rejects(rejectTextBlockEdit(),/允许同页父块归入其他父块/);
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
assert.equal((source.match(/<!-- cmd:block:v1 id=/g)||[]).length,267);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-cmd-readonly-'));
const doc=join(dir,'document.md');
writeFileSync(doc,source);
const port=await new Promise((ok,fail)=>{
  const sock=createServer();sock.once('error',fail);
  sock.listen(0,'127.0.0.1',()=>{const p=sock.address().port;sock.close(e=>e?fail(e):ok(p));});
});
const base='http://127.0.0.1:'+port+'/';
const server=spawn('python3',['scripts/v6_serve.py'],{
  cwd:process.cwd(),env:{...process.env,
    V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
    V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
    V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
    V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const center=rect=>({clientX:rect.x+rect.width/2,clientY:rect.y+rect.height/2});
try{
  let serverReady=false;
  for(let attempt=0;attempt<200;attempt++){
    try{if((await fetch(base+'healthz')).ok){serverReady=true;break;}}catch{}
    await sleep(170);
  }
  assert(serverReady,'disposable service not available');
  for(const [name,engine,path] of [
    ['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]
  ]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(path?{executablePath:path}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:900}});
      try{
        page.setDefaultTimeout(28000);
        const errors=[];page.on('pageerror',e=>errors.push(e.message));
        const resp=await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000});
        assert.equal(resp.status(),200);
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪'&&
          document.querySelector('.ocr-pdf-scroller .page canvas')?.width>0,
          null,{timeout:90000});
        await page.locator('#module-select').evaluate(el=>{
          el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('PBS 267')&&
          document.querySelector('#status')?.textContent.includes('文本块只读标定'),
          null,{timeout:70000});
        await selectPreview(page,'pdf');
        const root=page.locator('.ocr-pdf-block-cover[data-block-id="p1b3"]');
        const child=page.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]');
        const label=root.locator(':scope > .ocr-pdf-block-ctrl');
        await label.waitFor({state:'attached',timeout:55000});
        await child.waitFor({state:'attached',timeout:55000});
        await label.scrollIntoViewIfNeeded();
        const controls=await page.evaluate(()=>({
          agButtons:[...document.querySelectorAll(
            '#ag-functions-menu [data-module="text-block"] button')]
            .map(el=>el.textContent.trim()),
          agDrag:document.querySelectorAll('.ocr-pbs-drag-handle').length,
          readOnly:!!document.querySelector('.ocr-pdf-pane.ocr-pdf-readonly'),
          extractHidden:!!document.querySelector('.ocr-pdf-extract-text')?.hidden,
          promoteHidden:!!document.querySelector('.ocr-pdf-promote-child')?.hidden,
          checkboxDisplay:getComputedStyle(
            document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"] input')).display,
          hasDragArrow:!!document.querySelector('.ocr-pdf-block-drag-arrow')
        }));
        assert.equal(controls.readOnly,true);
        assert.equal(controls.agDrag,0);
        assert.equal(controls.checkboxDisplay,'none');
        assert.equal(controls.extractHidden,true);
        assert.equal(controls.promoteHidden,true);
        assert.equal(controls.hasDragArrow,false);
        for(const namePart of ['并入','拆链','合并','移动','独立成链','坐标','迁移旧标签',
          '确认续接','否决续接','标定原始子块'])
          assert(!controls.agButtons.some(label=>label.includes(namePart)),name+' exposed '+namePart);
        await label.evaluate(el=>el.click());
        assert.equal(await root.evaluate(el=>el.classList.contains('ocr-pdf-block-group-active')),true);
        assert.equal(await child.evaluate(el=>el.classList.contains('ocr-pdf-block-group-child')),true);
        // Child chips remain navigation-only. All parent labels now share the
        // same drag-to-parent operation, validated in separate browser tests.
        const other=page.locator('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"] > .ocr-pdf-subblock-chip');
        const rect=await other.boundingBox();assert(rect);
        const touch={bubbles:true,pointerId:99,pointerType:'touch',button:0,isPrimary:true};
        await other.dispatchEvent('pointerdown',{...touch,...center(rect)});
        await sleep(510);
        const dest=page.locator('.ocr-pdf-block-cover[data-block-id="p1b5"] > .ocr-pdf-block-ctrl');
        const target=await dest.boundingBox();assert(target);
        await page.locator('body').dispatchEvent('pointermove',{...touch,...center(target)});
        await page.locator('body').dispatchEvent('pointerup',{...touch,...center(target)});
        await label.evaluate(el=>{el.click();el.click();el.click();});
        const unchanged=await page.evaluate(()=>({
          p1b3:!!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b3"]'),
          p1b5:!!document.querySelector('.ocr-pdf-block-cover[data-block-id="p1b5"]'),
          sub:!!document.querySelector('.ocr-pdf-block-fragment[data-subblock-id="p1b3s0"]'),
          arrow:!!document.querySelector('.ocr-pdf-block-drag-arrow'),
          drop:!!document.querySelector('.ocr-pdf-block-drop-guide'),
          sourceColumn:[...document.querySelectorAll('.ocr-text-block-grid .ag-header-cell-text')]
            .map(x=>x.textContent).includes('源码行')
        }));
        assert(unchanged.p1b3&&unchanged.p1b5&&unchanged.sub);
        assert(!unchanged.arrow&&!unchanged.drop);
        assert(unchanged.sourceColumn,'AG inventory must retain source-line navigation');
        assert.equal(readFileSync(doc,'utf8'),source,'read-only UI wrote the CMD document');
        assert.equal(errors.length,0,errors.join(';'));
        console.log('CMD_TEXT_BLOCK_READ_ONLY_BROWSER_PASS',name,
          {pdfReady:true,atoms:267,groupHighlight:true,agNavigation:true,
            controlsRemoved:true,noArrow:true,noWrites:true});
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});
}
