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
// Source line numbers shift when migrating away from paired end markers.
// Resolve regression targets by stable heading identity, never historic lines.
const dataRow=reference.find(row=>row.title==='Data Sources');
const previewRow=reference.find(row=>row.sourceLine>dataRow.sourceLine);
const sourceRow=reference.find(row=>row.sourceLine>previewRow.sourceLine);
assert(dataRow&&previewRow&&sourceRow);

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
          filters:window.__v6cm6.outline.api.getFilterModel(),
          filterColumns:['title','level','pdfPage','independent','chapterFile']
            .map(field=>({field,enabled:window.__v6cm6.outline.api.getColumn(field).isFilterAllowed()})),
          customHeaderCount:document.querySelectorAll('select[data-outline-filter]').length,
          pdfPages:window.__v6cm6.outline.rows.slice(0,4).map(x=>x.pdfPage),
          levels:window.__v6cm6.outline.rows.slice(0,4).map(x=>x.level),
          exported:window.__v6cm6.outline.rows.some(x=>x.chapterFile),
          status:document.querySelector('#status')?.textContent,
          font:getComputedStyle(document.querySelector('.ocr-outline-title')).fontFamily,
          pdfPinned:window.__v6cm6.outline.api.getColumn('pdfPage').getPinned(),
          titlePinned:window.__v6cm6.outline.api.getColumn('title').getPinned(),
          visualColumns:window.__v6cm6.outline.api.getAllDisplayedColumns().map(c=>c.getColId()),
          titleLayout:(()=>{
            const title=document.querySelector('.ocr-outline-title');
            const style=getComputedStyle(title);
            return {whiteSpace:style.whiteSpace,textOverflow:style.textOverflow,
              overflow:style.overflow,scrollHeight:title.scrollHeight,
              clientHeight:title.clientHeight};
          })(),
        };
      });
      assert.equal(initial.groups,3);
      assert(initial.ag.height>initial.source.height*1.7);
      assert(initial.source.x>initial.ag.x+initial.ag.width-5);
      assert(initial.preview.y>initial.source.y+80);
      assert(Math.abs(initial.preview.x-initial.source.x)<3);
      assert.deepEqual(initial.filters,{},'all five AG Grid filter models must default to All');
      assert.equal(initial.filterColumns.length,5);
      assert(initial.filterColumns.every(x=>x.enabled),'all five columns have native AG filter API');
      assert.equal(initial.customHeaderCount,0,'old custom header selects must be removed');
      assert.deepEqual(initial.pdfPages,[1,1,2,2]);
      assert.deepEqual(initial.levels,[2,2,1,1]);
      assert.equal(initial.exported,true,'chapter filenames are planned before export');
      assert.match(initial.font,/OCR2MD Sarasa/);
      assert.equal(initial.pdfPinned,null);
      assert.equal(initial.titlePinned,'left');
      assert.deepEqual(initial.visualColumns,['title','level','pdfPage','independent','chapterFile']);
      assert.equal(initial.titleLayout.whiteSpace,'nowrap');
      assert.equal(initial.titleLayout.textOverflow,'ellipsis');
      assert.equal(initial.titleLayout.overflow,'hidden');
      console.log('OUTLINE_LAYOUT_OK',name,JSON.stringify(initial));

      // Regression: an existing heading retains its title and MinerU row ID
      // when only the Markdown heading marker changes. AG Grid must repaint
      // the Everforest title class even if the 'title' field is unchanged.
      const relevelLine=reference.find(row=>row.level===1).sourceLine;
      const originalHeading=await page.evaluate(line=>window.__v6cm6.view.state.doc.line(line).text,relevelLine);
      const assertRelevel=async level=>{
        await page.evaluate(({line,level})=>{
          const view=window.__v6cm6.view;
          const current=view.state.doc.line(line);
          view.dispatch({changes:{from:current.from,to:current.to,
            insert:'#'.repeat(level)+current.text.replace(/^#{1,6}/,'')}});
        },{line:relevelLine,level});
        await page.waitForFunction(({line,level})=>
          window.__v6cm6.outline.rows.find(row=>row.sourceLine===line)?.level===level,
        {line:relevelLine,level},{timeout:12000});
        await page.evaluate(line=>{
          const outline=window.__v6cm6.outline;
          const row=outline.rows.find(r=>r.sourceLine===line);
          outline.api.ensureNodeVisible(outline.api.getRowNode(row.id));
        },relevelLine);
        const observed=await page.locator(`[data-heading-source-line="${relevelLine}"]`)
          .evaluate(node=>({className:node.className,fontSize:getComputedStyle(node).fontSize,text:node.textContent}));
        assert(observed.className.includes('ocr-outline-h'+level),
          `${name}: H${level} outline cell kept stale style: ${JSON.stringify(observed)}`);
        return observed;
      };
      for(const level of [2,3,4,5,6,1]){
        const observation=await assertRelevel(level);
        console.log('HEADING_LEVEL_LIVE_OK',name,level,observation.fontSize);
      }
      assert.equal(await page.evaluate(line=>window.__v6cm6.view.state.doc.line(line).text,relevelLine),originalHeading);

      // A real header tap/click must open the AG-owned filter popup, not just
      // a programmatic API call (important on the simulated iPad viewport).
      await page.locator('.ag-header-cell[col-id="level"] .ag-header-cell-filter-button').click();
      const headerPopup=page.locator('.ocr-enum-filter[aria-label="层级 筛选"]:visible');
      await headerPopup.waitFor({timeout:10000});
      assert(await headerPopup.locator('[data-filter-value="all"] input').isChecked());
      await page.evaluate(()=>window.__v6cm6.outline.api.hideColumnFilter());

      // The AG Grid filter button owns the popup. Verify the actual
      // IFilterComp GUI, its all checkbox, and multiple-choice behavior.
      for(const field of ['pdfPage','level','title','independent','chapterFile']){
        await page.evaluate(field=>window.__v6cm6.outline.api.showColumnFilter(field),field);
        const label={pdfPage:'PDF页码',level:'层级',title:'标题',
          independent:'独立成章',chapterFile:'章节文件'}[field];
        const popup=page.locator(`.ocr-enum-filter[aria-label="${label} 筛选"]:visible`);
        await popup.waitFor({timeout:10000});
        assert(await popup.locator('[data-filter-value="all"] input').isChecked(),field+' default all');
        assert((await popup.locator('.ocr-enum-filter-option').count())>=2,field+' distinct values');
        await page.evaluate(()=>window.__v6cm6.outline.api.hideColumnFilter());
      }
      await page.evaluate(()=>window.__v6cm6.outline.api.showColumnFilter('level'));
      const levelPopup=page.locator('.ocr-enum-filter[aria-label="层级 筛选"]:visible');
      await levelPopup.waitFor();
      await levelPopup.locator('[data-filter-value="all"] input').uncheck();
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.api.getDisplayedRowCount()),0);
      await levelPopup.locator('[data-filter-value="H1"] input').check();
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.api.getDisplayedRowCount()),2);
      await levelPopup.locator('[data-filter-value="H2"] input').check();
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.api.getDisplayedRowCount()),21);
      assert.deepEqual(await page.evaluate(()=>window.__v6cm6.outline.api.getFilterModel()),{},
        'selecting all values must reset to an inactive AG Grid filter');
      await page.evaluate(()=>window.__v6cm6.outline.api.hideColumnFilter());

      const selectFilter=async(field,value)=>{
        await page.evaluate(async ({field,value})=>{
          const api=window.__v6cm6.outline.api;
          await api.setColumnFilterModel(field,value==='all'?null:{values:[value]});
          api.onFilterChanged();
        },{field,value});
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
      assert.equal(await selectFilter('chapterFile','000-Bufett-s-Alpha.md'),1);
      assert.equal(await selectFilter('chapterFile','all'),21);

      // First heading cannot be unchecked. Others write into CM6 as HTML.
      const checkBefore=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
      await page.evaluate(()=>window.__v6cm6.outline.api.ensureIndexVisible(0,'top'));
      const firstCheckbox=page.locator('.ag-row[row-index="0"] .ocr-outline-checkbox');
      assert(await firstCheckbox.isDisabled());
      await page.evaluate(()=>window.__v6cm6.outline.api.ensureIndexVisible(1,'top'));
      await page.locator('.ag-row[row-index="1"] .ocr-outline-checkbox').uncheck();
      await page.evaluate(()=>window.__v6cm6.outline.api.showColumnFilter('independent'));
      await page.locator('.ocr-enum-filter[aria-label="独立成章 筛选"]:visible [data-filter-value="否"]').waitFor();
      await page.evaluate(()=>window.__v6cm6.outline.api.hideColumnFilter());
      assert.equal(await selectFilter('independent','否'),1);
      assert.equal(await selectFilter('independent','all'),21);
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows[1].independent),false);
      const annotated=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
      assert.notEqual(annotated,checkBefore);
      assert(annotated.includes('<!-- ocr2md:chapter:v1'));
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows[1].chapterFile),
        await page.evaluate(()=>window.__v6cm6.outline.rows[0].chapterFile));
      await page.locator('#undo').click();
      await page.waitForFunction(()=>window.__v6cm6.outline.rows[1].independent &&
        !window.__v6cm6.view.state.doc.toString().includes('ocr2md:chapter:v1'),
        null,{timeout:15000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),checkBefore);

      // AG → other two panes. Locate Data Sources by immutable MinerU identity.
      await page.evaluate(id=>{
        const outline=window.__v6cm6.outline;
        outline.api.ensureNodeVisible(outline.api.getRowNode(id));
      },dataRow.id);
      await page.locator(`[data-heading-source-line="${dataRow.sourceLine}"]`).click();
      await page.waitForFunction(line=>window.__v6cm6.scrollState.focusTarget?.sourceLine===line,
        dataRow.sourceLine,{timeout:16000});
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
      assert(Math.abs(firstNavigation.source.sourceLine-dataRow.sourceLine)<10);
      assert(Math.abs(firstNavigation.preview.sourceLine-dataRow.sourceLine)<10);
      console.log('AG_NAV_OK',name,JSON.stringify(firstNavigation));

      // Preview → AG + CM6, with the outline containing the active heading.
      await page.locator(`.ocr-markdown h2[data-source-start="${previewRow.sourceLine}"]`).click();
      await page.waitForFunction(line=>window.__v6cm6.scrollState.focusTarget?.origin==='preview'
        &&window.__v6cm6.scrollState.focusTarget?.sourceLine===line,
        previewRow.sourceLine,{timeout:18000});
      await page.waitForTimeout(800);
      console.log('PREVIEW_AG_DIAGNOSTIC',name,JSON.stringify(await page.evaluate(()=>({
        focus:window.__v6cm6.scrollState.focusTarget,
        scroll:window.__v6cm6.scrollState.scrollTarget,
        selected:window.__v6cm6.outline.api.getSelectedRows().map(x=>({line:x.sourceLine,id:x.id})),
        source:window.__v6cm6.scrollSync.currentSource,
        preview:window.__v6cm6.scrollSync.currentPreview,
      }))));
      await page.waitForFunction(line=>window.__v6cm6.outline.api.getSelectedRows()[0]?.sourceLine===line,
        previewRow.sourceLine,{timeout:18000});
      const reverse=await page.evaluate(()=>({
        selected:window.__v6cm6.outline.api.getSelectedRows()[0]?.sourceLine,
        source:window.__v6cm6.scrollSync.currentSource,
        preview:window.__v6cm6.scrollSync.currentPreview,
      }));
      assert(Math.abs(reverse.source.sourceLine-previewRow.sourceLine)<12);
      console.log('PREVIEW_NAV_OK',name,JSON.stringify(reverse));

      // CM6 → AG + preview; only selection movement, no file edits.
      await page.evaluate(line=>{
        const view=window.__v6cm6.view;
        view.dispatch({selection:{anchor:view.state.doc.line(line).from}});
      },sourceRow.sourceLine);
      await page.waitForFunction(line=>window.__v6cm6.scrollState.focusTarget?.origin==='cm6'
        &&window.__v6cm6.scrollState.focusTarget.sourceLine===line,
        sourceRow.sourceLine,{timeout:18000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.api.getSelectedRows()[0]?.sourceLine),sourceRow.sourceLine);
      assert.equal(await page.locator(`.ocr-markdown [data-source-start="${sourceRow.sourceLine}"].ocr-outline-focused-element`).count(),1);

      // Outline is rebuilt, not cached, after a document transaction.
      await page.evaluate(lineNumber=>{
        const view=window.__v6cm6.view;
        const line=view.state.doc.line(lineNumber);
        view.dispatch({changes:{from:line.from,to:line.to,insert:'## Data Sources REVISED'}});
      },dataRow.sourceLine);
      await page.waitForFunction(()=>window.__v6cm6.outline.rows.some(x=>x.title==='Data Sources REVISED'),
        null,{timeout:22000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows.length),21);
      assert.equal(await page.evaluate(()=>window.__v6cm6.outline.rows.find(x=>x.title==='Data Sources REVISED')?.pdfPage),3);
      await page.locator('#undo').click();
      await page.waitForFunction(()=>window.__v6cm6.outline.rows.some(x=>x.title==='Data Sources'),
        null,{timeout:22000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),checkBefore);
      assert.deepEqual(errors,[],name+' page errors');
      await page.screenshot({path:`.v6/evidence/three-pane-outline-${name.toLowerCase()}.png`});
      console.log('FOUR_PANE_AG_PASS',name,JSON.stringify({
        headings:21,columns:5,filters:'all+values',layout:'left-full/right-top-bottom',
        agToViews:true,previewToAg:true,cm6ToAg:true,
        editorPreserved:true,documentUnmodified:true,
        chapterMarkerCM6Undoable:true,errors:errors.length,
      }));
    }finally{await Promise.race([browser.close(),sleep(9000)]);}
  }
  assert.deepEqual(readFileSync(fixture),original);
}finally{server.kill('SIGTERM');}
