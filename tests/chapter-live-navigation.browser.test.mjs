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
      const visibleMenu=async expected=>{
        // The native select and Tom Select's option table must change in the
        // same CMD transaction. Verify that separately from WebKit's next
        // layout paint; Playwright :visible can transiently report 0 for a
        // correctly opened, nonzero-size portal during that paint.
        const mirrored=await page.evaluate(()=>{
          const native=document.querySelector('.ocr-source-pane .ocr-lab-file-select');
          const tom=native?.ocrNavigationSelect?.tom;
          return {native:[...(native?.options||[])].filter(x=>x.value.startsWith('virtual:')).length,
            proxy:Object.keys(tom?.options||{}).filter(x=>x.startsWith('virtual:')).length};
        });
        assert.deepEqual(mirrored,{native:expected,proxy:expected},
          'native and TomSelect chapter inventories must update synchronously');
        const control=page.locator('.ocr-source-pane .ocr-navigation-files .ts-control');
        await control.evaluate(el=>el.click());
        const options=page.locator('body>.ocr-navigation-popup-files:visible [data-value^="virtual:"]');
        // Observe the first genuinely visible option, not a zero count in the
        // same WebKit layout tick as the portal opening. Exact count remains
        // mandatory: no missing, stale, or duplicate chapter can pass.
        await options.first().waitFor({state:'visible',timeout:2400});
        const actual=await options.count();
        if(actual===0){
          const debug=await page.evaluate(()=>{
            const native=document.querySelector('.ocr-source-pane .ocr-lab-file-select');
            const tom=native?.ocrNavigationSelect?.tom;
            return {nativeChapters:[...(native?.options||[])].filter(x=>x.value.startsWith('virtual:')).length,
              proxyChapters:[...(tom?.input?.options||[])].filter(x=>x.value.startsWith('virtual:')).length,
              tomOptionKeys:Object.keys(tom?.options||{}).filter(x=>x.startsWith('virtual:')).length,
              isOpen:tom?.isOpen,dropdownConnected:tom?.dropdown?.isConnected,
              dropdownDisplay:tom?.dropdown?getComputedStyle(tom.dropdown).display:null,
              visibleRows:document.querySelectorAll('body>.ocr-navigation-popup-files [data-value^="virtual:"]').length,
              dropdowns:[...document.querySelectorAll('body>.ocr-navigation-popup-files')].map(d=>{
                const rect=d.getBoundingClientRect();const cs=getComputedStyle(d);
                return {id:d.id,classes:d.className,open:!!d.classList.contains('dropdown-active'),
                  rect:[rect.x,rect.y,rect.width,rect.height],display:cs.display,visibility:cs.visibility,
                  opacity:cs.opacity,hidden:d.hidden,offsetParent:!!d.offsetParent,
                  contentHeight:d.querySelector('.ts-dropdown-content')?.getBoundingClientRect().height,
                  rowCount:d.querySelectorAll('[data-value^="virtual:"]').length};
              })};
          });
          console.error('CHAPTER_NAV_MIRROR_DIAGNOSTIC',name,JSON.stringify(debug));
        }
        await page.evaluate(()=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')
          ?.ocrNavigationSelect?.tom.close());
        return actual;
      };
      assert.equal(await visibleMenu(21),21,'enhanced source menu must show initial chapters');
      // A click changes CMD and both the native and visible menu synchronously.
      await checkbox.uncheck();
      assert.equal(await chapters.count(),20,'CM6 checkbox must immediately remove a chapter option');
      assert.equal(await visibleMenu(20),20,'TomSelect must immediately remove chapter option');
      assert.deepEqual(await page.evaluate(()=>window.__chapterEvents.map(x=>x.independent)),[false]);
      await checkbox.check();
      assert.equal(await chapters.count(),21,'checking again must instantly recreate chapter');
      assert.equal(await visibleMenu(21),21,'visible menu must recreate chapter without reload');
      assert.deepEqual(await page.evaluate(()=>window.__chapterEvents.map(x=>x.independent)),[false,true]);
      await checkbox.uncheck();
      assert.equal(await chapters.count(),20);
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelectorAll(
        '.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===21,
        null,{timeout:17000});
      assert.equal(await visibleMenu(21),21,'Undo must update visible chapter list');
      await page.locator('#redo').click();
      await page.waitForFunction(()=>document.querySelectorAll(
        '.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===20,
        null,{timeout:17000});
      assert.equal(await visibleMenu(20),20,'Redo must update visible chapter list');
      assert.deepEqual(errors,[],name+' browser errors');
      assert.deepEqual(readFileSync(file),original,'chapter checkbox changes must remain unsaved CM6 drafts');
      console.log('CHAPTER_NAV_LIVE_PASS',name,{initial:21,afterUncheck:20,
        afterCheck:21,undoRedo:true,visibleNavigation:true,events:markerEvents.length});
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(root,{recursive:true,force:true});}
