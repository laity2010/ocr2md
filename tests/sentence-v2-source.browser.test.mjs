import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
import {importSnapshot} from "../ui/sentence/snapshot.js";
import {splitSnapshot} from "../ui/sentence/split.js";
import {boundaryDisplay,isDisputed,reviewProjection,sentenceAtOffset} from "../ui/sentence/display.js";
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
   const expectSentences=async(block,pos)=>{
    const row=expected.blocks.find(r=>r.logicalId===block.logicalId);
    for(const [pane,id] of engines){
     const c=row.candidates.find(c=>c.engine===id),local=pos-block.from;
     const unit=c.units.find(u=>u.sourceRanges.at(-1).to>local)??c.units.at(-1);
     const text=unit?block.text.slice(unit.sourceRanges[0].from,unit.sourceRanges.at(-1).to):'';
     const host=page.locator('#sentence-editor-'+pane+' .cm-content');
     await page.waitForFunction(({pane,text})=>document.querySelector('#sentence-editor-'+pane+' .cm-content').cmTile.root.view.state.doc.toString()===text,{pane,text});
     assert.equal(await host.getAttribute('contenteditable'),'false');
     if(unit){
      const end=block.from+unit.sourceRanges.at(-1).to;
      const mark=projection[id].marks.find(m=>m.pos===end);
      if(mark)assert.equal(await page.locator('#sentence-editor-'+pane+' .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']').count(),1);
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
   for(const pos of points){
    await select(pos);await expectSentences(block,pos);
    await page.locator('#editor .ocr-sb-active-line').first().waitFor({state:'visible'});
   }
   const before=await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.selection.main.head);
   await page.locator('#sentence-editor-intl .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({selection:{anchor:1}}));
   assert.equal(await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.selection.main.head),before);
   for(const style of ['ocr-sb-agreed','ocr-sb-split']){
    const mark=projection.source.marks.find(m=>m.style===style&&m.pos>100);
    assert(mark);await select(mark.pos);
    const widget=page.locator('#editor .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
    await widget.waitFor({state:'visible'});assert.equal(await widget.textContent(),mark.label);
   }
   console.log("SENTENCE_CURRENT_FOCUS_PASS",name,fixture.rowCount,fixture.markdown.length,"right full source, engine-specific single sentences, adoption/filter, readonly");
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
