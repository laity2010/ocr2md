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
   const panes=page.locator('#workspace [data-sentence-pane]');
   await panes.first().waitFor();
   assert.equal(await panes.count(),4);
   const rects=await panes.evaluateAll(es=>Object.fromEntries(es.map(e=>{const r=e.getBoundingClientRect();return [e.dataset.sentencePane,{x:r.x,y:r.y,w:r.width,h:r.height}]})));
   const {source,intl,splitter,wink}=rects;
   assert(Math.abs(source.w/(source.w+intl.w)-.4)<.055,JSON.stringify(rects));
   assert(source.x>intl.x+intl.w-3,JSON.stringify(rects));
   assert.equal(await page.locator('#workspace [data-sentence-pane="source"] #undo').count(),1);
   assert.equal(await page.locator('#workspace [data-sentence-pane="source"] #redo').count(),1);
   assert.equal(await page.getByRole('checkbox',{name:'全部',exact:true}).isChecked(),false);
   for(const r of [intl,splitter,wink]){
    assert(Math.abs(r.x-intl.x)<3&&Math.abs(r.w-intl.w)<3,JSON.stringify(rects));
    assert(Math.abs(r.h/source.h-1/3)<.065,JSON.stringify(rects));
   }
   assert(intl.y<splitter.y&&splitter.y<wink.y);
   assert(Math.abs(source.y-intl.y)<3&&Math.abs(source.y+source.h-wink.y-wink.h)<3,JSON.stringify(rects));
   assert.equal(await page.locator('#workspace .ocr-outline-grid,#workspace .ocr-preview-pane,#workspace .ocr-detached-pdf-pane').count(),0);
   const styles=await page.locator('#workspace .cm-editor').evaluateAll(es=>es.map(e=>({background:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).fontFamily,readOnly:e.querySelector('.cm-content').getAttribute('contenteditable'),lines:!!e.querySelector('.cm-lineNumbers'),wrap:!!e.querySelector('.cm-lineWrapping')})));
   assert.equal(styles.length,4);assert(styles.every(v=>v.background==='rgb(47, 56, 62)'&&v.font.includes('Sarasa')&&v.readOnly==='false'&&v.lines&&v.wrap),JSON.stringify(styles));
   assert.equal(await page.locator('select.ocr-navigation-native optgroup[label="SQL"]').count(),0);
   await page.locator('#workspace .ocr-navigation-select .ts-control').click();
   assert.equal(await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').count(),0);
   await page.locator('.ocr-navigation-popup:visible [data-value="settings"]').click();
   await page.locator('#settings-workspace').waitFor({state:'visible'});
   await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
   assert.equal(await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').count(),0);
   assert.deepEqual(await page.locator('#settings-workspace select.ocr-navigation-native').evaluate(e=>Object.keys(e.ocrNavigationSelect.tom.options)),['settings']);
   assert.equal(await page.locator('#settings-workspace .ocr-navigation-select .item').textContent(),'settings.json');
   console.log("SENTENCE_FRAME_PASS",name);
  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
