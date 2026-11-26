import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
import {importSnapshot} from "../ui/sentence/snapshot.js";
import {splitSnapshot} from "../ui/sentence/split.js";
import {boundaryDisplay,isDisputed,reviewProjection} from "../ui/sentence/display.js";
const fixture=JSON.parse(execFileSync("python3",["-c","import sys,tempfile,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_v2_owned_edit import prepare_owned_book; tmp=tempfile.TemporaryDirectory(prefix='sentence-fixture-'); print(json.dumps(prepare_owned_book(Path(tmp.name)),ensure_ascii=False))","../lab-ocr-v2/tests"],{encoding:"utf8",maxBuffer:32*1024*1024}));
const sourceSnapshot=await importSnapshot(fixture),expected=splitSnapshot(sourceSnapshot);
const url="http://127.0.0.1:5399/labs/lab-sentence/";
const server=spawn("node",["node_modules/vite/bin/vite.js","preview","--config","labs/lab-sentence/vite.config.mjs","--host","127.0.0.1","--port","5399","--strictPort"],{stdio:["ignore","ignore","inherit"]});
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error("preview unavailable");await sleep(200);}
 for(const [name,engine] of [["Chromium",chromium],["iPad-WebKit",webkit]]){
  const b=await engine.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1100,height:800}});
   await page.route("**/labs/lab-frame/api/workspace-io/session",r=>r.fulfill({json:{authorized:true}}));
   await page.route("**/labs/lab-frame/api/workspace-io/roots",r=>r.fulfill({json:{allowedRoots:["/fixture"]}}));
   await page.route("**/labs/lab-frame/api/workspace-io/probe",r=>r.fulfill({json:{verified:true,readable:true,writable:true}}));
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/markdown?*",r=>{assert.equal(r.request().method(),"GET");assert.equal(new URL(r.request().url()).searchParams.get("workspace"),"/fixture");return r.fulfill({json:fixture});});
   await page.addInitScript(()=>localStorage.setItem("ocr2md.lab-sentence.settings.json.v1",JSON.stringify({settings:{"workspace.dataDirectory":{key:"dataDirectory",category1:"工作区",category2:"目录",comment:"资料目录绑定",value:"/fixture",range:{kind:"server-directory"}}}})));
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await page.locator("#settings-workspace .ocr-source-file-select").waitFor({state:"attached",timeout:25000});
   assert.equal(await page.locator(".frame-brand").textContent(),"OCR2MD lab-sentence");
   assert.equal(await page.locator("#workspace .dv-content-container").count(),4);
   const metadata=await (await page.request.get(url+"release-version.json")).json();
   assert.equal(metadata.name,"lab-sentence");
   assert.match(metadata.commit,/^[0-9a-f]{40}$/);
   assert.equal(await page.locator("#workspace").isVisible(),true);
   await page.waitForFunction(n=>document.querySelector("#status")?.textContent.includes("V2 已保存逻辑表 · "+n+" 块"),fixture.rowCount,{timeout:30000});
   const readDoc=()=>page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.doc.toString());
   await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes('三引擎分句 '+n+'/'+n),fixture.rowCount*3,{timeout:60000});
   const all=page.getByRole('checkbox',{name:'全部',exact:true});
   assert.equal(await all.isChecked(),false);
   const pending=reviewProjection(sourceSnapshot,expected,false,new Map()).snapshot;
   assert(pending.blocks.length>0&&pending.blocks.length<sourceSnapshot.blocks.length);
   const expectDocs=async text=>{
    await page.waitForFunction(text=>[...document.querySelectorAll('#workspace .cm-content')].every(e=>e.cmTile.root.view.state.doc.toString()===text),text);
   };
   await expectDocs(pending.markdown);
   const first=pending.blocks[0],adopt=page.getByRole('checkbox',{name:'采用 Intl',exact:true});
   await adopt.click();
   const chosen=new Map([[first.logicalId,'intl']]);
   await expectDocs(reviewProjection(sourceSnapshot,expected,false,chosen).snapshot.markdown);
   await all.check();await expectDocs(fixture.markdown);
   const select=pos=>page.locator('#editor .cm-content').evaluate((e,pos)=>e.cmTile.root.view.dispatch({selection:{anchor:pos},scrollIntoView:true}),pos);
   await select(first.sourceFrom);
   await page.waitForFunction(()=>document.querySelector('[data-sentence-pane="intl"] input[type="checkbox"]').checked);
   const splitter=page.getByRole('checkbox',{name:'采用 Sentence Splitter',exact:true});
   await splitter.check();assert.equal(await adopt.isChecked(),false);
   await splitter.uncheck();
   await all.uncheck();await expectDocs(pending.markdown);
   await all.check();await expectDocs(fixture.markdown);
   assert.equal(await page.locator('#workspace select.ocr-navigation-native option[value="frame"]').evaluate(e=>e.parentElement.label),'SQL');
   assert.equal(await page.locator('#workspace .ocr-navigation-select .item').textContent(),'逻辑表 · logical_block');
   assert.equal(await page.locator('#editor .cm-content').getAttribute('contenteditable'),'false');
   await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({changes:{from:0,insert:'SHOULD NOT WRITE'}}));
   assert.equal(await readDoc(),fixture.markdown);
   await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes('三引擎分句 '+n+'/'+n),fixture.rowCount*3,{timeout:60000});
   assert.equal(await readDoc(),fixture.markdown);
   const projection=boundaryDisplay(sourceSnapshot,expected);
   const right=page.locator('#workspace [data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content');
   const expectFull=async()=>{
    assert.deepEqual(await right.evaluateAll(es=>es.map(e=>e.cmTile.root.view.state.doc.toString())),Array(3).fill(fixture.markdown));
    assert.equal(await readDoc(),fixture.markdown);
   };
   await expectFull();
   const selectSource=pos=>page.locator('#editor .cm-content').evaluate((e,pos)=>{const v=e.cmTile.root.view;v.dispatch({selection:{anchor:pos},scrollIntoView:true});},pos);
   const expectFocus=async pos=>{
    await page.waitForFunction(pos=>[...document.querySelectorAll('#workspace .cm-content')].every(el=>el.cmTile.root.view.state.selection.main.head===pos),pos);
    for(const id of ['editor','sentence-editor-intl','sentence-editor-splitter','sentence-editor-wink']){
     await page.locator('#'+id+' .ocr-sb-active-line').first().waitFor({state:'visible'});
    }
   };
   // Exercise both marker types at actual source coordinates in all four views.
   for(const style of ['ocr-sb-agreed','ocr-sb-split']){
    const mark=projection.source.marks.find(m=>m.style===style&&m.pos>100);
    assert(mark,'missing fixture boundary '+style);
    await selectSource(mark.pos);
    await expectFocus(mark.pos);
    const left=page.locator('#editor .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
    await left.waitFor({state:'visible'});
    assert.equal(await left.textContent(),mark.label);
    assert(await left.evaluate((e,style)=>e.classList.contains(style),style));
    for(const [pane,id] of [['intl','intl'],['splitter','sentence-splitter'],['wink','wink-nlp']]){
     const el=page.locator('#sentence-editor-'+pane);
     const expectedMark=projection[id].marks.find(m=>m.pos===mark.pos&&m.title===mark.title);
     const widget=el.locator('.ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
     if(expectedMark){await widget.waitFor({state:'visible'});assert.equal(await widget.textContent(),'│');assert(await widget.evaluate((e,style)=>e.classList.contains(style),style));}
     else assert.equal(await widget.count(),0);
     assert.equal(await el.locator('.cm-content').getAttribute('contenteditable'),'false');
    }
   }
   const pos=sourceSnapshot.blocks.find(b=>b.from>20000&&b.text.length>100).from;
   await page.locator('#sentence-editor-splitter .cm-content').evaluate((e,pos)=>e.cmTile.root.view.dispatch({selection:{anchor:pos}}),pos);
   await expectFocus(pos);await expectFull();
   // Native wheel gesture followed by scrolling, on the short right pane.
   const oldTop=await page.locator('#editor .cm-scroller').evaluate(e=>e.scrollTop);
   await page.locator('#sentence-editor-wink .cm-scroller').evaluate(el=>{
    el.dispatchEvent(new WheelEvent('wheel',{deltaY:900}));el.scrollTop+=900;
   });
   await page.waitForFunction(old=>Math.abs(document.querySelector('#editor .cm-scroller').scrollTop-old)>150,oldTop);
   await expectFull();
   assert.equal(await page.locator('#workspace .sentence-unit-even,#workspace .sentence-unit-odd').count(),0);
   console.log("SENTENCE_REVIEW_VISUAL_PASS",name,fixture.rowCount,fixture.markdown.length,"full source, agreed/disputed widgets, block focus, bidirectional position and scroll");
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
