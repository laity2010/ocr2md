/** Independent checks for AM rows previously lacking direct observable tests.
 * Runs a real isolated V6 page, no writes to the user's workspace.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
mkdirSync('.v6/tests',{recursive:true});
const path=resolve(`.v6/tests/am-contracts-${process.pid}.md`);
writeFileSync(path,fixture);
const port=5296,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
 '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:path},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['iPad WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
try{
  let ready=false;for(let i=0;i<160;i++){try{if((await fetch(url)).ok){ready=true;break}}catch{}await sleep(140)}
  assert(ready,'isolated Vite server unavailable');
  for(const [name,engine,launch] of engines){
    const browser=await engine.launch({headless:true,...launch});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      await page.waitForFunction(()=>window.__v6cm6?.outline?.rows?.length===21&&window.__v6cm6?.pdf?.ready,
        null,{timeout:80000});
      const result=await page.evaluate(async()=>{
        const {CMDocument}=await import('/cm-document.js');
        const {createOutlineGrid}=await import('/outline-grid.js');
        const {PdfPreview}=await import('/pdf-preview.js');
        const {viewStore,setScrollSyncEnabled}=await import('/view-store.js');
        const original=window.__v6cm6.cm.markdown;
        const tiny='<!-- minerujson:block:v1:0:0 -->\n# Demo';
        const host=document.createElement('div');host.style.width='500px';host.style.height='200px';
        document.body.append(host);
        const tmp=new CMDocument({parent:host,markdown:'before',convertMineruJson:async value=>
          value==='bad'?Promise.reject(Error('converter failure')):tiny});
        const history=[];
        let failed=false;
        try{await tmp.loadMineruJson('bad')}catch(e){failed=e.message==='converter failure'}
        history.push({failed,unchanged:tmp.getMarkdown()==='before'});
        await tmp.loadMineruJson('good');
        history.push({converted:tmp.getMarkdown()===tiny,doc:tmp.doc.length===tiny.length});
        const oldView=tmp.view;
        tmp.destroy();
        history.push({destroyed:Boolean(oldView.destroyed),hostEmpty:host.children.length===0});
        host.remove();
        // Separate AG instance: invoke its real dispose and ensure DOM/unsubscribe cleanup.
        const agHost=document.createElement('div');agHost.style.width='500px';agHost.style.height='250px';
        document.body.append(agHost);
        const ag=createOutlineGrid(agHost,()=>original,()=>window.__v6cm6.view);
        const agMounted=Boolean(ag.api)&&agHost.querySelectorAll('.ag-root-wrapper').length>0;
        ag.refresh();
        const agRows=ag.rows.length;
        ag.dispose();
        const agDestroyed=agHost.childNodes.length===0;
        agHost.remove();
        // Actual PDF preview: clear an OCR overlay and destroy a secondary viewer.
        const mainPdf=window.__v6cm6.pdf;
        mainPdf.selected={pageIndex:0,blockIndex:0};
        await mainPdf.drawOverlay();
        const hadSelection=Boolean(mainPdf.selected);
        mainPdf.clearHighlight();
        const cleared=!mainPdf.selected && !mainPdf.scroller.querySelector('.ocr-pdf-region-overlay');
        const pdfHost=document.createElement('div');pdfHost.style.width='450px';pdfHost.style.height='300px';
        document.body.append(pdfHost);
        const secondary=new PdfPreview(pdfHost,()=>original);
        await secondary.loading;
        const secondaryWasReady=secondary.ready;
        secondary.dispose();
        const secondaryDisposed=secondary.disposed;
        pdfHost.remove();
        // Actual Layout publishes the active panel on activation; no business listener is currently registered.
        const stateBefore=viewStore.getState().activePanel;
        const dv=window.__v6cm6.dockview;
        const target=dv.getPanel('outline');
        target.api.setActive();
        const activeAfter=viewStore.getState().activePanel;
        // Actual DOM message subscriber in main is checked by the global status output.
        const errorMessage='AM_CASE_E08_FIXED_ERROR_20261022';
        document.dispatchEvent(new CustomEvent('ocr2md:chapter-error',{detail:errorMessage}));
        const errorStatus=document.querySelector('#status')?.textContent||'';
        // Test Zustand selector subscription + status recipient for scrollSyncEnabled.
        const countBefore=viewStore.getState().documentRevision;
        setScrollSyncEnabled(false);
        const syncOff=document.querySelector('#status')?.textContent.includes('独立滚动');
        setScrollSyncEnabled(true);
        const syncOn=document.querySelector('#status')?.textContent.includes('滚动同步');
        const revisionStable=viewStore.getState().documentRevision===countBefore;
        // Trigger the REAL AG error publisher: retain an old checkbox renderer
        // while changing the one and only CM6 document so the row no longer exists.
        const staleCheckbox=document.querySelector('.ag-row[row-index="1"] input.ocr-outline-checkbox');
        const seenErrors=[];
        document.addEventListener('ocr2md:chapter-error',event=>seenErrors.push(event.detail),{once:true});
        window.__v6cm6.cm.loadMarkdown('ordinary paragraph');
        staleCheckbox.checked=!staleCheckbox.checked;
        staleCheckbox.dispatchEvent(new Event('change',{bubbles:true}));
        const realAgError=seenErrors.some(msg=>msg.includes('章节已变化'))&&
          document.querySelector('#status').textContent.includes('章节已变化');
        window.__v6cm6.cm.loadMarkdown(original);
        return {history,agMounted,agRows,agDestroyed,hadSelection,cleared,secondaryWasReady,
          secondaryDisposed,stateBefore,activeAfter,activeSet:activeAfter==='outline',
          errorStatus:errorStatus.includes(errorMessage),realAgError,syncOff,syncOn,
          sourcePreserved:window.__v6cm6.cm.markdown===original,revisionStable};
      });
      assert(result.history[0].failed&&result.history[0].unchanged,`${name} invalid conversion modified source`);
      assert(result.history[1].converted&&result.history[1].doc,`${name} conversion not committed`);
      assert(result.history[2].destroyed,`${name} CMD did not mark view destroyed`);
      assert(result.agMounted&&result.agRows===21&&result.agDestroyed,`${name} AG dispose failed`);
      assert(result.hadSelection&&result.cleared,`${name} PDF highlight clear failed`);
      assert(result.secondaryWasReady&&result.secondaryDisposed,`${name} PDF dispose failed`);
      assert(result.activeSet&&result.errorStatus&&result.realAgError&&result.syncOff&&result.syncOn,`${name} event routes failed`);
      assert(result.sourcePreserved&&result.revisionStable,`${name} business doc edited by tests`);
      assert.deepEqual(errors,[],`${name} console exceptions`);
      console.log('AM_MISSING_CONTRACTS_PASS',name,JSON.stringify(result));
    }finally{await browser.close()}
  }
  assert.deepEqual(readFileSync(path),fixture,'isolated test file changed unexpectedly');
}finally{server.kill('SIGTERM');unlinkSync(path)}
