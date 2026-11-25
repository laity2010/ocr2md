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
   console.log("SENTENCE_V2_SNAPSHOT_PASS",name,fixture.rowCount);
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
