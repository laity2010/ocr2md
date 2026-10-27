/** Media AG preview must retain image DOM between element-module switches.
 * Independent temporary Markdown/settings and read-only fixtures; no prod writes.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const tiny=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/kBQAAAAASUVORK5CYII=','base64');
const temp=mkdtempSync(join(tmpdir(),'ocr-media-switch-'));
const book=join(temp,'book.md'),settings=join(temp,'settings.json');
writeFileSync(book,fixture);
const port=5932,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 env:{...process.env,V6_DOCUMENT_PATH:book,V6_SETTINGS_PATH:settings},stdio:'ignore',cwd:process.cwd()});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;
 for(let t=0;t<120;t++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await sleep(120)}
 assert(ready,'isolated Vite dev server unavailable');
 for(const [name,engine] of [['Chrome',chromium],['WebKit',webkit]]){
  if(process.env.OCR_TEST_BROWSER&&process.env.OCR_TEST_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1365,height:840}});
   const writes=[],errors=[];
   page.on('request',req=>{if(req.url().startsWith(base)&&!['GET','HEAD'].includes(req.method()))writes.push(req.method()+' '+req.url())});
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
      const req=route.request();
      if(req.url().startsWith(base))return route.continue();
      if(req.resourceType()==='image')return route.fulfill({status:200,contentType:'image/png',body:tiny});
      return route.abort();
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
   await page.waitForFunction(()=>window.__v6cm6?.view&&document.querySelector('.ocr-media-grid'),null,{timeout:55000});
   await page.evaluate(()=>{
    const el=document.querySelector('.ocr-media-grid');
    window.__mediaStable={events:[],ids:new WeakMap(),next:1};
    const s=window.__mediaStable;
    const query=node=>{
      if(node.nodeType!==1)return [];
      if(node.matches?.('.ocr-media-thumb'))return [node];
      return [...node.querySelectorAll?.('.ocr-media-thumb')||[]];
    };
    new MutationObserver(records=>{
      for(const r of records){
        if(r.type!=='childList')continue;
        for(const node of r.addedNodes)for(const img of query(node))s.events.push({action:'add',time:performance.now(),src:img.getAttribute('src')||''});
        for(const node of r.removedNodes)for(const img of query(node))s.events.push({action:'remove',time:performance.now(),src:img.getAttribute('src')||''});
      }
    }).observe(el,{childList:true,subtree:true});
   });
   const probe=()=>page.evaluate(()=>{
    const s=window.__mediaStable;
    const images=[...document.querySelectorAll('.ocr-media-grid .ocr-media-thumb')];
    const visible=images.filter(e=>!!e.getClientRects().length);
    const first=visible[0]||images[0];
    const identifier=img=>{if(!img)return null;if(!s.ids.has(img))s.ids.set(img,s.next++);return s.ids.get(img)};
    return {count:images.length,visible:visible.length,firstId:identifier(first),firstSrc:first?.getAttribute('src'),complete:first?.complete,naturalWidth:first?.naturalWidth,
      adds:s.events.filter(e=>e.action==='add').length,removes:s.events.filter(e=>e.action==='remove').length,events:s.events.slice(-12)};
   });
   const samples=[];
   for(let i=0;i<3;i++){
    await page.locator('#module-select').selectOption('media');
    await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ocr-media-thumb[src]').length>0,null,{timeout:25000});
    await page.waitForTimeout(800);
    samples.push({stage:'media-'+i,...await probe()});
    if(i===0)await page.screenshot({path:`.v6/evidence/media-switch-${name}-first.png`,timeout:35000});
    await page.locator('#module-select').selectOption('chapter-boundary');
    await page.waitForTimeout(180);
    samples.push({stage:'hidden-'+i,...await probe()});
   }
   await page.locator('#module-select').selectOption('media');await page.waitForTimeout(250);
   samples.push({stage:'final',...await probe()});
   await page.screenshot({path:`.v6/evidence/media-switch-${name}-final.png`,timeout:35000});
   console.log('MEDIA_SWITCH_PROBE',name,JSON.stringify(samples.map(({events,firstSrc,...sample})=>sample)));
   assert.deepEqual(errors,[], 'Browser pageerrors');assert.deepEqual(writes,[],'Unexpected business API writes');
   if(process.env.OCR_BASELINE!=='1'){
     const ons=samples.filter(s=>s.stage.startsWith('media-'));
     assert(ons[0].visible>0);
     assert(ons.every(x=>x.firstId===ons[0].firstId),'Preview image DOM identity was lost across module switches');
     assert(ons.every(x=>x.naturalWidth>0),'Preview image load regressed');
     assert(ons[2].removes===ons[0].removes,'Media AG thumbnails removed on re-activation');
     console.log('MEDIA_SWITCH_STABLE_PASS',name);
   }
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM');assert.equal(readFileSync(book,'utf8'),fixture,'test wrote the fixture');}
