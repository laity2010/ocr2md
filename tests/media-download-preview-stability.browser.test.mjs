/** Downloader progress must not remount ANY unchanged AG image renderer.
 * Fake media API and in-memory image response: no user documents or media files
 * are ever modified. Chrome/iPad-WebKit use the same production Media module.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {selectModule} from './navigation-ui.test-helper.mjs';

const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const urls=[...original.matchAll(/!\[[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/g)].map(x=>x[1]);
assert(urls.length>=2);
const local='media/0123456789abcdef01234567.jpg';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kBQAAAAASUVORK5CYII=','base64');
const tmp=mkdtempSync(join(tmpdir(),'ocr2md-media-flicker-'));
const file=join(tmp,'isolated.md');writeFileSync(file,original);
const port=5957,origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:file,V6_SETTINGS_PATH:join(tmp,'settings.json')}});
const sleep=ms=>new Promise(done=>setTimeout(done,ms));
try{
 let ready=false;
 for(let i=0;i<180;i++){try{if((await fetch(origin)).ok){ready=true;break;}}catch{}await sleep(120)}
 assert(ready,'isolated Vite server unavailable');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true});
  try{
   let calls=0,releaseSecond,secondStarted;
   const secondEntered=new Promise(resolve=>secondStarted=resolve);
   const secondRelease=new Promise(resolve=>releaseSecond=resolve);
   const page=await browser.newPage({viewport:{width:1180,height:750},isMobile:mobile,hasTouch:mobile});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/api/media/inventory',route=>route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({files:[],chapterReferences:[]})}));
   await page.route('**/api/media/status?**',route=>route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify({state:'pending',bytes:0,total:null})}));
   await page.route('**/api/media/chunk',async route=>{
     calls++;
     if(calls===1)return route.fulfill({status:200,contentType:'application/json',
       body:JSON.stringify({state:'complete',bytes:256,total:256,path:local})});
     secondStarted();await secondRelease;
     return route.fulfill({status:403,contentType:'text/plain',body:'isolated test stops batch'});
   });
   await page.route('**/*',route=>{
     const href=route.request().url();
     if(href.startsWith(origin+'/api/media/'))return route.fallback();
     if(href.startsWith(origin+'/media/'))return route.fulfill({status:200,contentType:'image/png',body:png});
     if(href.startsWith(origin))return route.fallback(); // let specific mocked /api/media routes run
     if(route.request().resourceType()==='image')return route.fulfill({status:200,contentType:'image/png',body:png});
     return route.abort();
   });
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   await selectModule(page,'media');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ocr-media-thumb[src]').length>=8,
     null,{timeout:50000});
   await sleep(600); // settle initial AG projections and image loads
   await page.evaluate(()=>{
     const host=document.querySelector('.ocr-media-grid');
     const imgs=[...host.querySelectorAll('.ocr-media-preview-link .ocr-media-thumb')];
     window.__mediaNoFlicker={imgs,ids:imgs.map(el=>el.closest('.ocr-media-preview-link')?.dataset.mediaRowId),
       hrefs:imgs.map(el=>el.getAttribute('src')),removed:0,added:0};
     const tracker=window.__mediaNoFlicker;
     const count=(node)=>node.nodeType===1?Number(node.matches?.('.ocr-media-thumb')||false)+
       (node.querySelectorAll?.('.ocr-media-thumb').length||0):0;
     new MutationObserver(entries=>{
       for(const entry of entries){
         for(const node of entry.removedNodes)tracker.removed+=count(node);
         for(const node of entry.addedNodes)tracker.added+=count(node);
       }
     }).observe(host,{childList:true,subtree:true});
   });
   await page.locator('#ag-functions-toggle').evaluate(el=>el.click());
   await page.locator('#media-download-all').evaluate(el=>el.click());
   // The second request stalls. The first image has COMPLETED, and the UI has
   // had a chance to refresh status and preview for it, before any CMD edits.
   await Promise.race([secondEntered,new Promise((_,reject)=>setTimeout(()=>reject(Error('second chunk not requested')),30000))]);
   await page.waitForFunction(path=>[...document.querySelectorAll('.ocr-media-preview-link')]
     .some(el=>el.getAttribute('href')==='/'+path),local,{timeout:16000});
   await sleep(250);
   const result=await page.evaluate(()=>{
     const s=window.__mediaNoFlicker;
     return {count:s.imgs.length,removed:s.removed,added:s.added,
       connected:s.imgs.filter(img=>img.isConnected).length,
       changed:s.imgs.filter((img,i)=>img.getAttribute('src')!==s.hrefs[i])
         .map(img=>img.closest('.ocr-media-preview-link')?.dataset.mediaRowId),
       first:s.imgs[0]?.getAttribute('src'),rowCount:document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount')};
   });
   assert(result.count>=8,'fixture must mount at least 8 thumbnails');
   assert.equal(result.removed,0,'download progress destroyed preview images: '+JSON.stringify(result));
   assert.equal(result.added,0,'download progress created preview images: '+JSON.stringify(result));
   assert.equal(result.connected,result.count,'preview images were disconnected');
   assert(result.changed.length<=1,'more than downloaded image changed: '+JSON.stringify(result));
   assert.equal(readFileSync(file,'utf8'),original,'download may not auto-save');
   releaseSecond();
   await page.waitForFunction(()=>!document.querySelector('#media-download-all')?.disabled,
     null,{timeout:25000});
   assert.deepEqual(errors,[]);
   console.log('MEDIA_DOWNLOAD_PREVIEW_STABLE_PASS',name,JSON.stringify(result));
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM');rmSync(tmp,{recursive:true,force:true})}
