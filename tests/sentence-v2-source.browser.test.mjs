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
   let failRead=false;
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/markdown?*",r=>{assert.equal(r.request().method(),"GET");assert.equal(new URL(r.request().url()).searchParams.get("workspace"),"/fixture");return failRead?r.fulfill({status:404,json:{error:"missing table"}}):r.fulfill({json:fixture});});
   await page.addInitScript(()=>localStorage.setItem("ocr2md.lab-sentence.settings.json.v1",JSON.stringify({settings:{"globalUi.font.family":{key:"family",category1:"全局 UI",category2:"字体",comment:"Sarasa",value:"Sarasa",range:{kind:"readonly"}},"globalUi.font.size":{key:"size",category1:"全局 UI",category2:"字体",comment:"字号",value:16,range:{min:8,max:32,step:1}},"workspace.dataDirectory":{key:"dataDirectory",category1:"工作区",category2:"目录",comment:"资料目录绑定",value:"/fixture",range:{kind:"server-directory"}}}})));
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
    await page.waitForFunction(text=>document.querySelector('#editor .cm-content').cmTile.root.view.state.doc.toString()===text,text);
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
   const engines=[['intl','intl'],['splitter','sentence-splitter'],['wink','wink-nlp']];
   const expectBlocks=async(block)=>{
    const row=expected.blocks.find(r=>r.logicalId===block.logicalId);
    for(const [pane,id] of engines){
     const c=row.candidates.find(c=>c.engine===id);
     const text=c.error?'':block.text;
     const host=page.locator('#sentence-editor-'+pane+' .cm-content');
     await page.waitForFunction(({pane,text})=>document.querySelector('#sentence-editor-'+pane+' .cm-content').cmTile.root.view.state.doc.toString()===text,{pane,text});
     assert.equal(await host.getAttribute('contenteditable'),'false');
     const marks=projection[id].marks.filter(m=>m.pos>block.from&&m.pos<=block.to);
     for(const mark of marks){
      await host.evaluate((e,pos)=>e.cmTile.root.view.dispatch({selection:{anchor:pos},scrollIntoView:true}),mark.pos-block.from);
      const widget=page.locator('#sentence-editor-'+pane+' .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
      await widget.waitFor({state:'visible'});
      assert.equal(await widget.textContent(),'│');
      assert(await widget.evaluate((e,style)=>e.classList.contains(style),mark.style));
     }
    }
    assert.equal(await readDoc(),fixture.markdown);
   };
   const block=sourceSnapshot.blocks.find(b=>{
    const row=expected.blocks.find(r=>r.logicalId===b.logicalId);
    return row.candidates.every(c=>c.units.length>1)&&isDisputed(row);
   });
   assert(block,'expected multi-sentence disagreement');
   const row=expected.blocks.find(r=>r.logicalId===block.logicalId);
   const points=[block.from+row.candidates[0].units[0].sourceRanges[0].from,block.from+row.candidates[0].units[1].sourceRanges[0].from];
   await select(points[0]);await expectBlocks(block);
   await page.locator('#editor .ocr-sb-active-line').first().waitFor({state:'visible'});
   await page.evaluate(()=>{window.__sentenceBlockStates=Array.from(document.querySelectorAll('[data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content'),e=>e.cmTile.root.view.state);});
   await select(points[1]);
   await page.waitForFunction(pos=>document.querySelector('#editor .cm-content').cmTile.root.view.state.selection.main.head===pos,points[1]);
   assert(await page.evaluate(()=>Array.from(document.querySelectorAll('[data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content'),e=>e.cmTile.root.view.state).every((state,i)=>state===window.__sentenceBlockStates[i])));
   const next=sourceSnapshot.blocks.find(b=>b.logicalId!==block.logicalId&&b.text!==block.text&&b.text.length>0);
   assert(next);await select(next.from);await expectBlocks(next);
   await select(points[0]);await expectBlocks(block);
   const before=await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.selection.main.head);
   await page.locator('#sentence-editor-intl .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({selection:{anchor:1}}));
   assert.equal(await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.selection.main.head),before);
   for(const style of ['ocr-sb-agreed','ocr-sb-split']){
    const mark=projection.source.marks.find(m=>m.style===style&&m.pos>100);
    assert(mark);await select(mark.pos);
    const widget=page.locator('#editor .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
    await widget.waitFor({state:'visible'});assert.equal(await widget.textContent(),mark.label);
   }
   console.log("SENTENCE_BLOCK_FOCUS_PASS",name,fixture.rowCount,fixture.markdown.length,"right full source, engine-specific complete logical blocks, stable same-block states and cross-block switch, adoption/filter, readonly");
   // Both native menus and the actual Tom Select dropdown must reflect the
   // successfully loaded table. Then force the existing GET to fail.
   assert.equal(await page.locator('select.ocr-navigation-native optgroup[label="SQL"]').count(),2);
   failRead=true;
   await page.locator('#workspace .ocr-navigation-select .ts-control').click();
   await page.locator('.ocr-navigation-popup:visible [data-value="settings"]').click();
   await page.locator('#settings-workspace').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelectorAll('select.ocr-navigation-native optgroup[label="SQL"]').length===0);
   assert.deepEqual(await page.locator('#workspace .cm-content').evaluateAll(es=>es.map(e=>e.cmTile.root.view.state.doc.toString())),['','','','']);
   await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
   assert.equal(await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').count(),0);
   console.log("SENTENCE_NAV_FAILURE_CLEAR_PASS",name);

  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
