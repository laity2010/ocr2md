import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
const fixture=JSON.parse(execFileSync("python3",["-c","import sys,tempfile,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_v2_owned_edit import prepare_owned_book; tmp=tempfile.TemporaryDirectory(prefix='sentence-fixture-'); print(json.dumps(prepare_owned_book(Path(tmp.name)),ensure_ascii=False))","../lab-ocr-v2/tests"],{encoding:"utf8",maxBuffer:32*1024*1024}));
const url="http://127.0.0.1:5399/labs/lab-sentence/";
const server=spawn("node",["node_modules/vite/bin/vite.js","preview","--config","labs/lab-sentence/vite.config.mjs","--host","127.0.0.1","--port","5399","--strictPort"],{stdio:["ignore","ignore","inherit"]});
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error("preview unavailable");await sleep(200);}
 for(const [name,engine] of [["Chromium",chromium],["iPad-WebKit",webkit]]){
  const b=await engine.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1100,height:800},...(name==='iPad-WebKit'?{hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   const reads=[];let fail=false;
   await page.route("**/labs/lab-frame/api/workspace-io/session",r=>r.fulfill({json:{authorized:true}}));
   await page.route("**/labs/lab-frame/api/workspace-io/roots",r=>r.fulfill({json:{allowedRoots:["/fixture"]}}));
   await page.route("**/labs/lab-frame/api/workspace-io/probe",r=>r.fulfill({json:{verified:true,readable:true,writable:true}}));
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/markdown?*",r=>{
    assert.equal(r.request().method(),"GET");
    const path=new URL(r.request().url()).searchParams.get("workspace");assert(["/fixture","/fixture-next"].includes(path));reads.push(path);
    return fail?r.fulfill({status:404,json:{error:"missing logical table"}}):r.fulfill({json:fixture});
   });
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
   const expectSource=async()=>{
    assert.equal(await readDoc(),fixture.markdown);
    assert.equal(await page.locator('#workspace select.ocr-navigation-native option[value="frame"]').evaluate(e=>e.parentElement.label),'SQL');
    assert.equal(await page.locator('#workspace .ocr-navigation-select .item').textContent(),'逻辑表 · logical_block');
   };
   await expectSource();
   assert.deepEqual(await page.locator('#workspace [data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content').evaluateAll(es=>es.map(e=>e.cmTile.root.view.state.doc.toString())),['','','']);
   assert.equal(await page.locator('#editor .cm-content').getAttribute('contenteditable'),'false');
   await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({changes:{from:0,insert:'SHOULD NOT WRITE'}}));
   await expectSource();
   const openSettings=async()=>{
    await page.locator('#workspace .ocr-navigation-select .ts-control').click();
    await page.locator('.ocr-navigation-popup:visible [data-value="settings"]').click();
    await page.locator('#settings-workspace').waitFor({state:'visible'});
   };
   const returnSource=async()=>{
    await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
    await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').click();
    await page.locator('#workspace').waitFor({state:'visible'});
   };
   await openSettings();
   await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes('V2 已保存逻辑表 · '+n+' 块'),fixture.rowCount);
   const before=reads.length;
   await page.locator('#settings-workspace .ocr-settings-source .cm-content').evaluate(e=>{
    const v=e.cmTile.root.view;const data=JSON.parse(v.state.doc.toString());
    data.settings['workspace.dataDirectory'].value='/fixture-next';
    v.dispatch({changes:{from:0,to:v.state.doc.length,insert:JSON.stringify(data,null,2)}});
   });
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('目录设置尚未保存'));
   assert.equal(reads.length,before);
   await returnSource();await expectSource();
   await openSettings();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('目录设置尚未保存'));
   assert.equal(reads.length,before);
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('V2 已保存逻辑表'));
   assert.equal(reads.at(-1),'/fixture-next');
   await returnSource();await expectSource();
   fail=true;await openSettings();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('分句快照读取失败'));
   await returnSource();
   assert.equal(await readDoc(),'');
   assert.equal(await page.locator('#workspace select.ocr-navigation-native option[value="frame"]').evaluate(e=>e.parentElement.label),'工作台');
   console.log("SENTENCE_V2_SOURCE_PASS",name,fixture.rowCount,fixture.markdown.length,"exact readonly; navigation; unsaved; saved switch; failure clear");
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
