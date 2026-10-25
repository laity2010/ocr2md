/** Prevent delayed follower CM6 layout scrolls from stealing preview scroll leadership. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
// Generate only a throwaway audit document; never depend on live user edits.
const original=Buffer.from(toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8')));
const doc=resolve(`.v6/tests/scroll-leadership-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});writeFileSync(doc,original);
const port=5274,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:doc},stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
 ['iPad WebKit',webkit,{executablePath:webkit.executablePath()}]];
try {
 let up=false;for(let i=0;i<160;i++){try{if((await fetch(url)).ok){up=true;break}}catch{}await pause(120)}
 assert(up,'isolated test server unavailable');
 for(const [name,engine,launch] of engines){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
   await page.waitForFunction(()=>window.__v6cm6?.scrollSync?.anchorCount>190&&
    document.querySelector('.ocr-preview-md-scroll')?.scrollHeight>2000&&
    document.querySelector('#editor .cm-foldPlaceholder'),null,{timeout:85000});
   const result=await page.evaluate(async()=>{
    const sync=window.__v6cm6.scrollSync;
    const preview=document.querySelector('.ocr-preview-md-scroll');
    const source=window.__v6cm6.view.scrollDOM;
    preview.dispatchEvent(new WheelEvent('wheel',{deltaY:220,bubbles:true}));
    preview.scrollTop=.33*(preview.scrollHeight-preview.clientHeight);
    await new Promise(r=>setTimeout(r,1100));
    const before={driver:sync.lastDriver,sourceY:source.scrollTop,previewY:preview.scrollTop,maxPreviewY:preview.scrollHeight-preview.clientHeight,
      line:sync.currentPreview?.sourceLine};
    // A late CM6 layout correction, NOT a source user gesture: the source
    // follower must not feed its own programmatic movement back to the preview.
    source.scrollTop+=75;
    await new Promise(r=>setTimeout(r,200));
    const after={driver:sync.lastDriver,sourceY:source.scrollTop,previewY:preview.scrollTop};
    // Explicit user input on the source pane is still allowed to take over.
    source.dispatchEvent(new WheelEvent('wheel',{deltaY:160,bubbles:true}));
    source.scrollTop+=170;
    await new Promise(r=>setTimeout(r,350));
    const sourceDriven={driver:sync.lastDriver,sourceY:source.scrollTop,previewY:preview.scrollTop};
    return {before,after,sourceDriven,dirty:window.__v6cm6.dirty};
   });
   console.log('LEADERSHIP_TRACE',name,JSON.stringify(result));
   assert.equal(result.before.driver,'preview','preview input did not acquire leadership');
   assert.equal(result.after.driver,'preview','late source correction stole preview leadership');
   assert(Math.abs(result.after.previewY-result.before.previewY)<3,'programmatic source correction moved preview');
   assert.equal(result.sourceDriven.driver,'cm6','real source gesture cannot acquire leadership');
   assert.equal(result.dirty,false,'scrolling dirtied document');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:`.v6/evidence/scroll-leadership-${name.toLowerCase().replaceAll(' ','-')}.png`});
   console.log('SCROLL_LEADERSHIP_PASS',name);
  }finally{await browser.close()}
 }
 assert.deepEqual(readFileSync(doc),original,'isolated document modified');
}finally{server.kill('SIGTERM');unlinkSync(doc)}
