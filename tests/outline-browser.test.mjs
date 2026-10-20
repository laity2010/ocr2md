import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {buildOutline} from '../ui/outline-index.js';

const fixture='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const original=readFileSync(fixture);
const reference=buildOutline(original.toString());
assert.equal(reference.length,21);
assert.deepEqual(reference.slice(0,4).map(x=>x.pdfPage),[1,1,2,2]);
assert.deepEqual(reference.slice(0,4).map(x=>x.level),[2,2,1,1]);

mkdirSync('.v6/tests',{recursive:true});
mkdirSync('.v6/evidence',{recursive:true});
const testPath='.v6/tests/outline-browser-fixture.md';
writeFileSync(testPath,original);
const port=5204,url='http://127.0.0.1:'+port+'/';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
    env:{...process.env,V6_DOCUMENT_PATH:process.cwd()+'/'+testPath},
    stdio:'ignore',
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const engines=[
  ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
];

try{
  let ready=false;
  for(let i=0;i<160;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(100);}
  assert(ready,'isolated Vite server did not start');
  for(const [name,engine,launch] of engines){
    if(process.env.V6_ONLY_CHROME && name!=='Chrome')continue;
    if(process.env.V6_ONLY_WEBKIT && name!=='WebKit')continue;
    const browser=await engine.launch({headless:true,...launch});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642}});
      // No network dependence on third-party MinerU images.
      await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:'+port)
        ?route.continue():route.abort());
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
      await page.waitForFunction(()=>window.__v6cm6?.outline?.rows?.length===21
        &&document.querySelectorAll('.ocr-markdown [data-source-start]').length>150,
        null,{timeout:60000});
      const initial=await page.evaluate(()=>{
        const rect=selector=>{
          const r=document.querySelector(selector)?.getBoundingClientRect();
          return r&&{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};
        };
        return {
          groups:document.querySelectorAll('.dv-groupview').length,
          ag:rect('.ocr-outline-pane'),source:rect('.ocr-source-pane'),
          preview:rect('.ocr-preview-pane'),
          filters:[...document.querySelectorAll('select[data-outline-filter]')]
            .map(x=>({name:x.dataset.outlineFilter,value:x.value,
              first:x.options[0]?.value,count:x.options.length})),
          pdfPages:window.__v6cm6.outline.rows.slice(0,4).map(x=>x.pdfPage),
          levels:window.__v6cm6.outline.rows.slice(0,4).map(x=>x.level),
          exported:window.__v6cm6.outline.rows.some(x=>x.chapterFile),
          status:document.querySelector('#status')?.textContent,
          font:getComputedStyle(document.querySelector('.ocr-outline-title')).fontFamily,
        };
      });
      assert.equal(initial.groups,3);
      assert(initial.ag.height>initial.source.height*1.7);
      assert(initial.source.x>initial.ag.x+initial.ag.width-5);
      assert(initial.preview.y>initial.source.y+80);
      assert(Math.abs(initial.preview.x-initial.source.x)<3);
      assert.equal(initial.filters.length,5);
      assert(initial.filters.every(x=>x.value==='all'&&x.first==='all'&&x.count>=2));
      assert.deepEqual(initial.pdfPages,[1,1,2,2]);
      assert.deepEqual(initial.levels,[2,2,1,1]);
      assert.equal(initial.exported,false);
      assert.match(initial.font,/OCR2MD Sarasa/);
      console.log('OUTLINE_LAYOUT_OK',name,JSON.stringify(initial));

      const selectFilter=async(field,value)=>{
        await page.locator(`select[data-outline-filter="${field}"]`).selectOption(value);
        await page.waitForTimeout(80);
        return page.evaluate(()=>window.__v6cm6.outline.api.getDisplayedRowCount());
      };
      assert.equal(await selectFilter('level','H1'),2);
      assert.equal(await selectFilter('level','all'),21);
      assert.equal(await selectFilter('pdfPage','2'),2);
      assert.equal(await selectFilter('pdfPage','all'),21);
      assert.equal(await selectFilter('title','Data Sources'),1);
      assert.equal(await selectFilter('title','all'),21);
      assert.equal(await selectFilter('independent','是'),21);
      assert.equal(await selectFilter('independent','all'),21);
      assert.equal(await selectFilter('chapterFile','未导出'),21);
      assert.equal(await selectFilter('chapterFile','all'),21);

      // First heading cannot be unchecked. Others are UI-only drafts.
      const checkBefore=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
      await page.evaluate(()=>window.__v6cm6.outline.api.ensureIndexVisible(0,'top'));
      const firstCheckbox=page.locator('.ag-row[row-index="0"] .ocr-outline-checkbox');
      assert(await firstCheckbox.isDisabled());
      await page.evaluate(()=>window.__v6cm6.outline.api.ensureIndexVisible(1,'top'));
      await page.locator('.ag-row[row-index="1"] .ocr-outline-checkbox').uncheck();
      assert.equal(await selectFilter('independent','否'),1);
      assert.equal(await selectFilter('independent','all'),21);
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows[1].independent),false);
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),checkBefore);

      // AG → other two panes. Locate Data Sources by immutable MinerU identity.
      await page.evaluate(()=>{
        const outline=window.__v6cm6.outline;
        const row=outline.rows.find(x=>x.sourceLine===213);
        outline.api.ensureNodeVisible(outline.api.getRowNode(row.id));
      });
      await page.locator('[data-heading-source-line="213"]').click();
      await page.waitForFunction(()=>window.__v6cm6.scrollState.focusTarget?.sourceLine===213,
        null,{timeout:16000});
      await page.waitForFunction(()=>!!document.querySelector('.ocr-markdown h2.ocr-outline-focused-element')
        &&!!document.querySelector('.cm-outline-focused-line'),null,{timeout:18000});
      const firstNavigation=await page.evaluate(()=>({
        origin:window.__v6cm6.scrollState.focusTarget.origin,
        title:window.__v6cm6.outline.api.getSelectedRows()[0]?.title,
        source:window.__v6cm6.scrollSync.currentSource,
        preview:window.__v6cm6.scrollSync.currentPreview,
      }));
      assert.equal(firstNavigation.origin,'outline');
      assert.equal(firstNavigation.title,'Data Sources');
      assert(Math.abs(firstNavigation.source.sourceLine-213)<10);
      assert(Math.abs(firstNavigation.preview.sourceLine-213)<10);
      console.log('AG_NAV_OK',name,JSON.stringify(firstNavigation));

      // Preview → AG + CM6, with the outline containing the active heading.
      await page.locator('.ocr-markdown h2[data-source-start="225"]').click();
      await page.waitForFunction(()=>window.__v6cm6.scrollState.focusTarget?.origin==='preview'
        &&window.__v6cm6.scrollState.focusTarget?.sourceLine===225,
        null,{timeout:18000});
      await page.waitForTimeout(800);
      console.log('PREVIEW_AG_DIAGNOSTIC',name,JSON.stringify(await page.evaluate(()=>({
        focus:window.__v6cm6.scrollState.focusTarget,
        scroll:window.__v6cm6.scrollState.scrollTarget,
        selected:window.__v6cm6.outline.api.getSelectedRows().map(x=>({line:x.sourceLine,id:x.id})),
        source:window.__v6cm6.scrollSync.currentSource,
        preview:window.__v6cm6.scrollSync.currentPreview,
      }))));
      await page.waitForFunction(()=>window.__v6cm6.outline.api.getSelectedRows()[0]?.sourceLine===225,
        null,{timeout:18000});
      const reverse=await page.evaluate(()=>({
        selected:window.__v6cm6.outline.api.getSelectedRows()[0]?.sourceLine,
        source:window.__v6cm6.scrollSync.currentSource,
        preview:window.__v6cm6.scrollSync.currentPreview,
      }));
      assert(Math.abs(reverse.source.sourceLine-225)<12);
      console.log('PREVIEW_NAV_OK',name,JSON.stringify(reverse));

      // CM6 → AG + preview; only selection movement, no file edits.
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        view.dispatch({selection:{anchor:view.state.doc.line(321).from}});
      });
      await page.waitForFunction(()=>window.__v6cm6.scrollState.focusTarget?.origin==='cm6'
        &&window.__v6cm6.scrollState.focusTarget.sourceLine===321,
        null,{timeout:18000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.api.getSelectedRows()[0]?.sourceLine),321);
      assert.equal(await page.locator('.ocr-markdown [data-source-start="321"].ocr-outline-focused-element').count(),1);

      // Outline is rebuilt, not cached, after a document transaction.
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        const line=view.state.doc.line(213);
        view.dispatch({changes:{from:line.from,to:line.to,insert:'## Data Sources REVISED'}});
      });
      await page.waitForFunction(()=>window.__v6cm6.outline.rows.some(x=>x.title==='Data Sources REVISED'),
        null,{timeout:22000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows.length),21);
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows.find(x=>x.sourceLine===213)?.pdfPage),3);
      await page.locator('#undo').click();
      await page.waitForFunction(()=>window.__v6cm6.outline.rows.some(x=>x.title==='Data Sources'),
        null,{timeout:22000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),checkBefore);
      assert.deepEqual(errors,[],name+' page errors');
      await page.screenshot({path:`.v6/evidence/three-pane-outline-${name.toLowerCase()}.png`});
      console.log('THREE_PANE_PASS',name,JSON.stringify({
        headings:21,columns:5,filters:'all+values',layout:'left-full/right-top-bottom',
        agToViews:true,previewToAg:true,cm6ToAg:true,
        editorPreserved:true,documentUnmodified:true,
        chapterDraftNotPersisted:true,errors:errors.length,
      }));
    }finally{await Promise.race([browser.close(),sleep(9000)]);}
  }
  assert.deepEqual(readFileSync(fixture),original);
}finally{server.kill('SIGTERM');}
