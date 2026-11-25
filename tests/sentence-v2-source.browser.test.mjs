import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
import {makePDF} from "./sentence-pdf-fixture.mjs";
const data=JSON.parse(execFileSync("python3",["-c","import sys,tempfile,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_v2_owned_edit import prepare_owned_book; tmp=tempfile.TemporaryDirectory(prefix='sentence-fixture-'); import v2_mineru_base as base; folder=Path(tmp.name); snapshot=prepare_owned_book(folder); print(json.dumps(dict(snapshot=snapshot,pdfMap=base.existing_pdf_map(folder)),ensure_ascii=False))","../lab-ocr-v2/tests"],{encoding:"utf8",maxBuffer:32*1024*1024}));
const fixture=data.snapshot,pdfMap=data.pdfMap,pdfBytes=makePDF(pdfMap.pageSizes);
const url="http://127.0.0.1:5399/labs/lab-sentence/";
const server=spawn("node",["node_modules/vite/bin/vite.js","preview","--config","labs/lab-sentence/vite.config.mjs","--host","127.0.0.1","--port","5399","--strictPort"],{stdio:["ignore","ignore","inherit"]});
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error("preview unavailable");await sleep(200);}
 for(const [name,engine] of [["Chromium",chromium],["iPad-WebKit",webkit]]){
  const b=await engine.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1250,height:900},hasTouch:true});
   const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.url().includes('/api/mineru-base/')&&r.method()!=='GET')writes.push(r.method()+' '+r.url());});
   await page.route('https://**/*',r=>r.abort());
   await page.route("**/labs/lab-frame/api/workspace-io/session",r=>r.fulfill({json:{authorized:true}}));
   await page.route("**/labs/lab-frame/api/workspace-io/roots",r=>r.fulfill({json:{allowedRoots:["/fixture"]}}));
   await page.route("**/labs/lab-frame/api/workspace-io/probe",r=>r.fulfill({json:{verified:true,readable:true,writable:true}}));
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/markdown?*",r=>{assert.equal(r.request().method(),"GET");assert.equal(new URL(r.request().url()).searchParams.get("workspace"),"/fixture");return r.fulfill({json:fixture});});
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/pdf-map?*",r=>r.fulfill({json:pdfMap}));
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/pdf?*",r=>r.fulfill({contentType:'application/pdf',body:pdfBytes}));
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/media-status?*",r=>r.fulfill({json:{state:'missing'}}));
   await page.addInitScript(()=>localStorage.setItem("ocr2md.lab-sentence.settings.json.v1",JSON.stringify({settings:{"workspace.dataDirectory":{key:"dataDirectory",category1:"工作区",category2:"目录",comment:"资料目录绑定",value:"/fixture",range:{kind:"server-directory"}}}})));
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await page.locator("#settings-workspace .ocr-source-file-select").waitFor({state:"attached",timeout:25000});
   assert.equal(await page.locator(".frame-brand").textContent(),"OCR2MD lab-sentence");
   assert.equal(await page.locator("#workspace .dv-content-container").count(),4);
   const metadata=await (await page.request.get(url+"release-version.json")).json();
   assert.equal(metadata.name,"lab-sentence");
   assert.match(metadata.commit,/^[0-9a-f]{40}$/);
   const grid=page.locator('#workspace .ocr-outline-grid'),source=page.locator('#workspace #editor');
   try{
    await page.waitForFunction(n=>{
     const w=document.querySelector('#workspace'),nav=w.querySelector('.ocr-source-file-select'),grid=w.querySelector('.ocr-outline-grid')?.sentenceGridPort;
     return !w.hidden&&document.querySelector('#settings-workspace').hidden&&nav.value==='sql:logical_block'&&nav.ocrNavigationSelect?.tom.getValue()==='sql:logical_block'&&grid?.getDisplayedRows().length===n;
    },fixture.rowCount,{timeout:40000});
    assert.equal(await page.locator('#workspace .ocr-ag-module-select').locator('option:checked').textContent(),'逻辑块审阅');
    assert.deepEqual(await grid.evaluate(el=>el.sentenceGridPort.getColumns().slice(0,3).map(c=>c.headerName)),['PBS','Type','MD Block']);
    assert.equal(await grid.evaluate(el=>el.sentenceGridPort.getColumns()[0].pinned),'left');
    assert.equal(await grid.evaluate(el=>el.sentenceGridPort.getColumns()[1].sortable),false);
    assert.equal(await source.evaluate(el=>el.v2SourcePort.getMarkdown()),fixture.markdown);
    assert.equal(await source.evaluate(el=>el.v2SourcePort.getState().readOnly),true);
    assert.equal(await source.locator('.cm-content').getAttribute('contenteditable'),'false');
    await source.evaluate(el=>el.v2SourcePort.getEditorView().dispatch({changes:{from:0,insert:'SHOULD NOT WRITE'}}));
    assert.equal(await source.evaluate(el=>el.v2SourcePort.getMarkdown()),fixture.markdown);
    assert.equal(await page.locator('#workspace #undo').isDisabled(),true);
    assert.equal(await page.locator('#workspace #redo').isDisabled(),true);
    const native=page.locator('#workspace .ocr-source-file-select');
    assert.equal(await native.locator('optgroup[label="SQL"] option').textContent(),'逻辑表 · logical_block');
    await page.locator('#workspace .ocr-navigation-select .ts-control').click();
    await page.locator('.ocr-navigation-popup:visible .optgroup-header').filter({hasText:'SQL'}).waitFor();
    await page.locator('.ocr-navigation-popup:visible [data-value="sql:logical_block"]').waitFor();
    await page.keyboard.press('Escape');
    console.log('WP01A_NAV_AND_READONLY_PASS',name,fixture.rowCount);
    const typeButton=grid.locator('.ag-header-cell[col-id="block_type"] .ag-header-cell-filter-button');
    await typeButton.click();
    const popup=page.locator('.ocr-enum-filter[aria-label="Type 筛选"]:visible');
    await popup.waitFor();
    const value=v=>popup.locator('[data-filter-value="'+v+'"] input');
    assert.equal(await value('all').isChecked(),true);
    await value('all').uncheck();
    await value('text').check();await value('title').check();
    const n=fixture.segments.filter(r=>['text','title'].includes(r.blockType)).length;
    await page.waitForFunction(n=>document.querySelector('#workspace .ocr-outline-grid').sentenceGridPort.getDisplayedRows().length===n,n);
    assert.deepEqual(await grid.evaluate(el=>[...new Set(el.sentenceGridPort.getDisplayedRows().map(r=>r.block_type))].sort()),['text','title']);
    await value('all').check();
    await page.waitForFunction(n=>document.querySelector('#workspace .ocr-outline-grid').sentenceGridPort.getDisplayedRows().length===n,fixture.rowCount);
    await page.keyboard.press('Escape');
    console.log('WP01A_NATIVE_FILTER_PASS',name);
    const target=fixture.segments[0];
    await grid.locator('.ag-row [col-id="pbs"]').first().click();
    await page.waitForFunction(id=>document.querySelector('#workspace #editor').v2SourcePort.getState().selectedId===id,target.logicalId);
    await page.waitForFunction(id=>document.querySelector('#workspace .ocr-preview-md-scroll').v2MarkdownPreviewPort?.getFocusedId()===id,target.logicalId);
    await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:45000});
    // Focus after the viewer has loaded so the PDF has the current selection.
    await grid.locator('.ag-row [col-id="pbs"]').first().click();
    await page.waitForFunction(id=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().selectedId===id,target.logicalId);
    assert.equal(await page.locator('.lab-ocr-pdf-extract-text').isVisible(),false);
    const target2=fixture.segments[1];
    await source.evaluate((el,pos)=>el.v2SourcePort.getEditorView().dispatch({selection:{anchor:pos}}),target2.startUtf16);
    await page.waitForFunction(id=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().selectedId===id,target2.logicalId);
    assert.equal(await source.evaluate(el=>el.v2SourcePort.getMarkdown()),fixture.markdown);
    assert.deepEqual(writes,[]);
    assert.deepEqual(errors,[]);
    console.log('WP01A_FOCUS_PDF_PASS',name,'read-only V2 reader');
    // Explicitly reenter Settings and choose SQL using the visible Tom Select.
    await native.evaluate(el=>{el.value='settings';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.waitForFunction(()=>!document.querySelector('#settings-workspace').hidden);
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('V2 已保存逻辑表'),null,{timeout:30000});
    assert.equal(await page.locator('#settings-workspace').isVisible(),true);
    await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
    await page.locator('.ocr-navigation-popup:visible [data-value="sql:logical_block"]').click();
    await page.waitForFunction(()=>!document.querySelector('#workspace').hidden);
    assert.equal(await source.evaluate(el=>el.v2SourcePort.getMarkdown()),fixture.markdown);
    assert.deepEqual(writes,[]);
    console.log('WP01A_MANUAL_NAV_PASS',name);
   }catch(e){
    console.error('WP01A_DIAG',name,await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,nav:document.querySelector('#workspace .ocr-source-file-select')?.value,hidden:document.querySelector('#workspace')?.hidden,pdf:document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState(),rows:document.querySelector('#workspace .ocr-outline-grid')?.sentenceGridPort?.getDisplayedRows().length})),errors);
    throw e;
   }
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
