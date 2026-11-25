import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
import {importSnapshot} from "../ui/sentence/snapshot.js";
import {splitSnapshot} from "../ui/sentence/split.js";
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
   await page.waitForFunction(text=>document.querySelector('#editor .cm-content')?.cmTile?.root?.view?.state.doc.toString()===text,fixture.markdown);
   assert.equal(await readDoc(),fixture.markdown);
   assert.equal(await page.locator('#workspace select.ocr-navigation-native option[value="frame"]').evaluate(e=>e.parentElement.label),'SQL');
   assert.equal(await page.locator('#workspace .ocr-navigation-select .item').textContent(),'逻辑表 · logical_block');
   assert.equal(await page.locator('#editor .cm-content').getAttribute('contenteditable'),'false');
   await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({changes:{from:0,insert:'SHOULD NOT WRITE'}}));
   assert.equal(await readDoc(),fixture.markdown);
   await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes('三引擎分句 '+n+'/'+n),fixture.rowCount*3,{timeout:60000});
   assert.equal(await readDoc(),fixture.markdown);
   const right=page.locator('#workspace [data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content');
   const first=sourceSnapshot.blocks[0];
   const waitBlock=async(block)=>{
    await page.waitForFunction(text=>[...document.querySelectorAll('#workspace [data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content')].every(el=>el.cmTile.root.view.state.doc.toString()===text),block.text);
    assert.deepEqual(await right.evaluateAll(es=>es.map(e=>e.cmTile.root.view.state.doc.toString())),[block.text,block.text,block.text]);
   };
   await waitBlock(first);
   // Choose a short real multi-sentence block so both colors are visible in all panes.
   const index=expected.blocks.findIndex((r,i)=>i>0&&sourceSnapshot.blocks[i].text.length<450&&r.candidates.every(c=>!c.error&&c.units.length>=2&&c.units[1].sourceRanges.length));
   assert(index>0);
   const block=sourceSnapshot.blocks[index],row=expected.blocks[index];
   await page.locator('#editor .cm-content').evaluate((e,pos)=>{const v=e.cmTile.root.view;v.dispatch({selection:{anchor:pos},scrollIntoView:true});},block.from);
   await waitBlock(block);
   for(const [pane,id] of [['intl','intl'],['splitter','sentence-splitter'],['wink','wink-nlp']]){
    const el=page.locator('#sentence-editor-'+pane);
    await el.locator('.sentence-unit-even').first().waitFor();
    await el.locator('.sentence-unit-odd').first().waitFor();
    assert.equal(await el.locator('.cm-content').getAttribute('contenteditable'),'false');
    if(id!=='intl')assert.equal(await page.locator('[data-sentence-pane="'+pane+'"] .sentence-engine-label').textContent(),(pane==='splitter'?'Sentence Splitter':'Wink NLP')+' · '+row.candidates.find(c=>c.engine===id).units.length+' 句');
   }
   const pos=row.candidates.find(c=>c.engine==='sentence-splitter').units[1].sourceRanges[0].from;
   await page.locator('#sentence-editor-splitter .cm-content').evaluate((e,pos)=>e.cmTile.root.view.dispatch({selection:{anchor:pos}}),pos);
   await page.waitForFunction(pos=>document.querySelector('#editor .cm-content').cmTile.root.view.state.selection.main.head===pos,block.from+pos);
   await waitBlock(block);assert.equal(await readDoc(),fixture.markdown);
   console.log("SENTENCE_V2_DISPLAY_PASS",name,fixture.rowCount,fixture.markdown.length,fixture.rowCount*3,"exact blocks; alternating colors; bidirectional positioning");
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
