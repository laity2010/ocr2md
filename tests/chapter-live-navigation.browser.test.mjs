/** A heading checkbox must synchronously change the visible, enhanced
 * source-file chapter navigator. An isolated Vite fixture protects user data.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const root=mkdtempSync(join(tmpdir(),'ocr2md-chapter-nav-'));
const file=join(root,'isolated.md');writeFileSync(file,original);
const port=5987,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:file}});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;
  for(let i=0;i<190;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(120);
  }
  assert(ready,'isolated Vite server did not start');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER && process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:740},isMobile:mobile,hasTouch:mobile});
      const errors=[],markerEvents=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.waitForFunction(()=>document.querySelectorAll(
        '.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===21,
        null,{timeout:45000});
      await page.evaluate(()=>{window.__chapterEvents=[];
        document.addEventListener('ocr2md:chapter-boundary-changed',e=>window.__chapterEvents.push(e.detail));
      });
      const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
      const chapters=source.locator('option[value^="virtual:"]');
      const header=page.locator('.ocr-outline-grid .ag-header-cell[col-id="independent"]');
      assert.match(await header.innerText(),/章节/);
      assert.doesNotMatch(await header.innerText(),/独立成章/);
      const checkbox=page.locator('.ocr-outline-grid .ag-row[row-index="1"] .ocr-outline-checkbox');
      assert(await checkbox.isEnabled());
      assert.match(await checkbox.getAttribute('aria-label'),/章节$/);
      const visibleMenu=async()=>{
        const control=page.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
        await control.evaluate(el=>el.click());
        const options=page.locator('body>.ocr-navigation-popup-files:visible [data-value^="virtual:"]');
        const actual=await options.count();
        await page.evaluate(()=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')
          ?.ocrNavigationSelect?.tom.close());
        return actual;
      };
      assert.equal(await visibleMenu(),21,'enhanced source menu must show initial chapters');
      // A click changes CMD and both the native and visible menu synchronously.
      await checkbox.uncheck();
      assert.equal(await chapters.count(),20,'CM6 checkbox must immediately remove a chapter option');
      assert.equal(await visibleMenu(),20,'TomSelect must immediately remove chapter option');
      assert.deepEqual(await page.evaluate(()=>window.__chapterEvents.map(x=>x.independent)),[false]);
      await checkbox.check();
      assert.equal(await chapters.count(),21,'checking again must instantly recreate chapter');
      assert.equal(await visibleMenu(),21,'visible menu must recreate chapter without reload');
      assert.deepEqual(await page.evaluate(()=>window.__chapterEvents.map(x=>x.independent)),[false,true]);
      await checkbox.uncheck();
      assert.equal(await chapters.count(),20);
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelectorAll(
        '.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===21,
        null,{timeout:17000});
      assert.equal(await visibleMenu(),21,'Undo must update visible chapter list');
      await page.locator('#redo').click();
      await page.waitForFunction(()=>document.querySelectorAll(
        '.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===20,
        null,{timeout:17000});
      assert.equal(await visibleMenu(),20,'Redo must update visible chapter list');
      assert.deepEqual(errors,[],name+' browser errors');
      assert.deepEqual(readFileSync(file),original,'chapter checkbox changes must remain unsaved CM6 drafts');
      console.log('CHAPTER_NAV_LIVE_PASS',name,{initial:21,afterUncheck:20,
        afterCheck:21,undoRedo:true,visibleNavigation:true,events:markerEvents.length});
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(root,{recursive:true,force:true});}
