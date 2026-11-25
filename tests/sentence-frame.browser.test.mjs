import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
const url="http://127.0.0.1:5399/labs/lab-sentence/";
const server=spawn("node",["node_modules/vite/bin/vite.js","preview","--config","labs/lab-sentence/vite.config.mjs","--host","127.0.0.1","--port","5399","--strictPort"],{stdio:["ignore","ignore","inherit"]});
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error("preview unavailable");await sleep(200);}
 for(const [name,engine] of [["Chromium",chromium],["iPad-WebKit",webkit]]){
  const b=await engine.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1100,height:800},...(name==='iPad-WebKit'?{hasTouch:true,userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**/*',r=>r.abort());
   await page.route("**/labs/lab-frame/api/workspace-io/session",r=>r.fulfill({json:{authorized:true}}));
   await page.route("**/labs/lab-frame/api/workspace-io/roots",r=>r.fulfill({json:{allowedRoots:[]}}));
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await page.locator("#settings-workspace .ocr-source-file-select").waitFor({state:"attached",timeout:25000});
   assert.equal(await page.locator(".frame-brand").textContent(),"OCR2MD lab-sentence");
   assert.equal(await page.locator("#workspace .dv-content-container").count(),4);
   const metadata=await (await page.request.get(url+"release-version.json")).json();
   assert.equal(metadata.name,"lab-sentence");
   assert.match(metadata.commit,/^[0-9a-f]{40}$/);
   assert.equal(await page.locator("#workspace").isVisible(),true);
   await page.waitForFunction(()=>document.querySelectorAll('#workspace .cm-editor').length===4&&document.querySelector('#workspace .ocr-source-file-select')?.ocrNavigationSelect?.tom.getValue()==='frame');
   const geometry=()=>page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#workspace [data-sentence-pane]')].map(el=>{const r=el.getBoundingClientRect();return [el.dataset.sentencePane,{x:r.x,y:r.y,w:r.width,h:r.height}]})));
   const g=await geometry(),l=g.source,rs=[g.intl,g.splitter,g.wink];
   assert.deepEqual(Object.keys(g).sort(),['intl','source','splitter','wink']);
   assert(Math.abs(l.w/(l.w+rs[0].w)-.4)<.055,JSON.stringify(g));
   for(const r of rs){assert(Math.abs(r.x-rs[0].x)<3&&Math.abs(r.w-rs[0].w)<3);assert(Math.abs(r.h/l.h-1/3)<.065,JSON.stringify(g));}
   assert(Math.abs(l.y-rs[0].y)<3&&Math.abs(l.y+l.h-rs[2].y-rs[2].h)<3);
   assert(rs[0].y<rs[1].y&&rs[1].y<rs[2].y);
   assert.equal(await page.locator('#workspace .ocr-outline-grid,#workspace .ocr-preview-pane,#workspace .ocr-detached-pdf-pane').count(),0);
   const styles=await page.locator('#workspace .cm-editor').evaluateAll(els=>els.map(el=>({bg:getComputedStyle(el).backgroundColor,font:getComputedStyle(el).fontFamily,size:getComputedStyle(el).fontSize,editable:el.querySelector('.cm-content').getAttribute('contenteditable'),gutter:!!el.querySelector('.cm-lineNumbers'),wrap:!!el.querySelector('.cm-lineWrapping')})));
   assert.equal(styles.length,4);assert(styles.every(s=>s.bg==='rgb(47, 56, 62)'&&s.font.includes('Sarasa')&&s.size==='16px'&&s.editable==='false'&&s.gutter&&s.wrap),JSON.stringify(styles));
   assert.equal(await page.locator('#workspace #undo').isDisabled(),true);
   assert.equal(await page.locator('#workspace #redo').isDisabled(),true);
   // Real Tom Select navigation in both directions.
   await page.locator('#workspace .ocr-navigation-select .ts-control').click();
   await page.locator('.ocr-navigation-popup:visible [data-value="settings"]').click();
   await page.locator('#settings-workspace').waitFor({state:'visible'});
   await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
   await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').click();
   await page.locator('#workspace').waitFor({state:'visible'});
   assert.equal(await page.locator('#workspace .cm-editor').count(),4);
   assert.deepEqual(errors,[]);
   console.log("SENTENCE_FRAME_PASS",name,JSON.stringify(g));
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
