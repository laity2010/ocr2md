/** AG editable review choices persist as CMD comments only. Full Chrome and
 * iPad-WebKit single-source/undo/save/reload test on disposable Buffett OCR. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS} from '../ui/cmd-block-chains.js';
import {ILLEGAL_BREAK_REVIEW_TAG} from '../ui/cmd-illegal-break-review.js';
const baseDoc=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const plan=planCMDReparentPBS(baseDoc,'p6b7','p6b6');
const seeded=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);
  return s.slice(0,e.from)+e.insert+s.slice(e.to);
},baseDoc);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-break-review-'));
const doc=join(dir,'document.md'),tokenFile=join(dir,'token');
writeFileSync(doc,seeded);writeFileSync(tokenFile,'review-test-token');
const port=await new Promise((resolve,reject)=>{const s=createServer();s.once('error',reject);
  s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(e=>e?reject(e):resolve(n));});});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:tokenFile},stdio:'ignore'});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
const commentCount=()=>readFileSync(doc,'utf8').split(`<!--${ILLEGAL_BREAK_REVIEW_TAG}`).length-1;
const rowFor=(page,joined)=>page.locator('.ocr-illegal-break-grid .ag-row').filter({
  has:page.locator(`.ag-cell[col-id="joined"]:text-is("${joined}")`)});
const selectFor=(page,joined)=>rowFor(page,joined).locator('.ocr-illegal-break-review-select');
async function filterP6B6(page){
  await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="blockId"] .ag-header-cell-filter-button').click();
  const filter=page.locator('.ocr-enum-filter[aria-label="当前块 筛选"]:visible');
  await filter.waitFor();
  await filter.locator('[data-filter-value="all"] input').uncheck();
  await filter.locator('[data-filter-value="p6b6s0"] input').check();
  await filter.locator('[data-filter-value="p6b6s1"] input').check();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-illegal-break-grid .ag-row').length===3,
    null,{timeout:25000});
  await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="line"]').click();
}
const waitDecision=async(page,joined,choice)=>{
  await page.waitForFunction(([joined,choice])=>[...document.querySelectorAll('.ocr-illegal-break-grid .ag-row')]
    .some(r=>r.querySelector('.ag-cell[col-id="joined"]')?.textContent.trim()===joined&&
      r.querySelector('.ocr-illegal-break-review-select')?.value===choice),
  [joined,choice],{timeout:85000});
};
try{
  let ready=false;for(let i=0;i<230;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await sleep(150);
  }
  assert(ready,'isolated server unavailable');
  for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,webkit.executablePath()]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    writeFileSync(doc,seeded);
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1280,height:950}});
      page.setDefaultTimeout(34000);
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      // Count real dictionary rescans; choosing an annotation-only review
      // value must not enqueue any Worker task.
      await page.addInitScript(()=>{
        window.__reviewScanPosts=0;
        const NativeWorker=window.Worker;
        window.Worker=class extends NativeWorker{
          postMessage(data,...args){
            if(data?.kind==='linebreak')window.__reviewScanPosts++;
            return super.postMessage(data,...args);
          }
        };
      });
      try{
        await page.context().addCookies([{name:'v6edit',value:'review-test-token',domain:'127.0.0.1',path:'/'}]);
        assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:85000})).status(),200);
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:80000});
        const activate=()=>page.locator('#module-select').evaluate(el=>{
          el.value='illegal-break';el.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await activate();
        await page.waitForFunction(()=>document.querySelector('.ocr-illegal-break-state')?.textContent.includes('待定'),
          null,{timeout:90000});
        await filterP6B6(page);
        assert.equal(await selectFor(page,'about 3').inputValue(),'待定');
        assert.equal(await selectFor(page,'leverage').inputValue(),'待定');
        assert.equal(await selectFor(page,'insurance').inputValue(),'待定');
        assert.equal(await page.locator('.ocr-illegal-break-grid .ag-header-cell[col-id="reviewDecision"]')
          .getAttribute('aria-colindex')!==null,true);
        // Preserve the exact native select and the AG row node through each
        // review edit, not merely the eventual value after a full rerender.
        const baseline=await page.evaluate(()=>{
          const items=[...document.querySelectorAll('.ocr-illegal-break-grid .ag-row')];
          const lookup=label=>items.find(r=>r.querySelector('.ag-cell[col-id="joined"]')
            ?.textContent.trim()===label);
          window.__reviewStable={
            selects:new Map(['about 3','leverage','insurance'].map(k=>[k,lookup(k)?.querySelector('select')])),
            rows:new Map(['about 3','leverage','insurance'].map(k=>[k,lookup(k)])),
            scans:window.__reviewScanPosts,
            top:document.querySelector('.ocr-illegal-break-grid .ag-body-viewport')?.scrollTop||0,
          };
          return {scans:window.__reviewScanPosts,rowCount:items.length};
        });
        assert.equal(baseline.rowCount,3);
        const assertStable=async()=>{
          const state=await page.evaluate(()=>{
            const grid=document.querySelector('.ocr-illegal-break-grid');
            return {stable:[...window.__reviewStable.rows].every(([key,row])=>{
              const select=window.__reviewStable.selects.get(key);
              return row?.isConnected&&select?.isConnected&&row.querySelector('select')===select;
            }),scans:window.__reviewScanPosts,
              rowCount:grid.querySelectorAll('.ag-row').length,
              top:grid.querySelector('.ag-body-viewport')?.scrollTop||0};
          });
          assert.equal(state.stable,true,'review values must preserve all select DOM and AG row identities');
          assert.equal(state.scans,baseline.scans,'review annotation cannot trigger dictionary Worker rescan');
          assert.equal(state.rowCount,3,'review must not clear/recreate AG rows');
          assert.equal(state.top,0,'review must not alter AG vertical scroll');
        };
        await selectFor(page,'about 3').selectOption({label:'断行合并'});
        await waitDecision(page,'about 3','断行合并');
        await assertStable();
        await selectFor(page,'leverage').selectOption({label:'忽略'});
        await waitDecision(page,'leverage','忽略');
        await assertStable();
        assert.equal(readFileSync(doc,'utf8'),seeded,'decisions modify CM6 only until manual save');
        // The last transaction is 'ignore', it should be one independent Undo.
        await page.locator('#undo').click();
        await waitDecision(page,'leverage','待定');
        await assertStable();
        await waitDecision(page,'about 3','断行合并');
        await page.locator('#redo').click();
        await waitDecision(page,'leverage','忽略');
        await assertStable();
        // '待定' removes the merge comment without touching any actual text.
        await selectFor(page,'about 3').selectOption({label:'待定'});
        await waitDecision(page,'about 3','待定');
        await assertStable();
        await selectFor(page,'about 3').selectOption({label:'断行合并'});
        await waitDecision(page,'about 3','断行合并');
        await assertStable();
        assert.equal(await selectFor(page,'insurance').inputValue(),'待定');
        if(process.env.OCR_BREAK_REVIEW_SCREENSHOTS){
          mkdirSync(process.env.OCR_BREAK_REVIEW_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.OCR_BREAK_REVIEW_SCREENSHOTS,
            `illegal-break-review-${name}.png`),animations:'disabled'});
        }
        await page.locator('#save').click();
        for(let i=0;i<100&&!(readFileSync(doc,'utf8').includes(' lb="m"')&&commentCount()===1);i++)
          await sleep(130);
        const saved=readFileSync(doc,'utf8');
        assert.equal(commentCount(),1,'only the within-block scar retains a standalone marker');
        assert(saved.includes('id="p6b6s1" lb="m"')&&saved.includes('decision="ignore"'));
        assert(!saved.includes('decision="merge"'),
          'cross-block merge is B.lb, not an extra long annotation');
        assert.equal(saved.replace(/ lb="[mi]"/g,'')
          .replace(/<!--ocr2md:illegal-break-review[^\n]*-->\n/g,''),seeded,
          'block property and within-block review comment are the ONLY source edits');
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:80000});
        await activate();
        await page.waitForFunction(()=>document.querySelector('.ocr-illegal-break-state')?.textContent.includes('待定'),
          null,{timeout:85000});
        await filterP6B6(page);
        await waitDecision(page,'about 3','断行合并');
        await waitDecision(page,'leverage','忽略');
        await waitDecision(page,'insurance','待定');
        assert.equal(commentCount(),1);
        assert.deepEqual(errors,[]);
        console.log('ILLEGAL_BREAK_REVIEW_BROWSER_PASS',name,
          'merge / ignore / pending dropdown, one-step Undo/Redo, save/reload, no block merge');
      }finally{await page.close();}
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
