/** WP1/4: real WCP loader + production release snapshots; offline isolated book API.
 * No modifications to the active 0816 public release or any user's book.
 * OLD and NEW documents are served from preserved readonly filesystem snapshots.
 */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile,access,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const stable=resolve('ui-spikes/v2/v4-directory');
const failed=resolve('ui-spikes/v2/.v4-public-failed-v4-261014-0838-60e26e80-be31-42b5-ac09-b1e011182d4b');
const old=JSON.parse(await readFile(join(stable,'build-info.json'),'utf8'));
const next=JSON.parse(await readFile(join(failed,'build-info.json'),'utf8'));
assert.equal(old.id,'v4-261014-0816');assert.equal(next.id,'v4-261014-0838');
const origin='https://ocr2md.laity.bid';
const started=Date.now();
const results=[];
const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
for(const [engine,browserType] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await browserType.launch(engine==='chromium'?{channel:'chrome'}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  let servedVersion='old',afterUpgrade=false;
  const events=[];
  const push=(type,info)=>events.push({ms:Date.now()-started,type,...info});
  page.on('pageerror',e=>push('pageerror',{error:String(e)}));
  page.on('console',m=>{if(m.type()==='error')push('console',{text:m.text().slice(0,420)})});
  page.on('requestfailed',req=>push('requestfailed',{url:req.url().slice(0,190),failure:req.failure()?.errorText}));
  page.on('response',r=>{if(r.status()>=400)push('http',{status:r.status(),url:r.url().slice(0,190)})});
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())push('navigate',{url:frame.url()})});
  await page.route('https://ocr2md.laity.bid/__v3/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"ok":false,"error":"isolated-no-vault"}'}));
  await page.route('https://ocr2md.laity.bid/v4-directory/**',async route=>{
   const url=new URL(route.request().url());
   const rel=decodeURIComponent(url.pathname.slice('/v4-directory/'.length))||'index.html';
   if(rel.includes('..')||rel.startsWith('/'))return route.abort('blockedbyclient');
   const folder=servedVersion==='old'?stable:failed;
   const file=join(folder,rel);
   let content;
   try{content=await readFile(file)}catch{return route.fulfill({status:404,body:'not found'})}
   push('asset',{id:servedVersion,asset:rel,bytes:content.length});
   return route.fulfill({status:200,contentType:ct[extname(rel)]??'application/octet-stream',body:content});
  });
  async function snapshot(step){
   const report=await page.evaluate(()=>({
    url:location.href,version:document.getElementById('v4-build-label')?.textContent??null,
    phase:window.__ocr2mdV4?.phase??'not_started',
    appVersion:window.__ocr2mdV4?.version??null,
    message:document.getElementById('status')?.textContent?.slice(0,200)??null,
    bodyLength:document.body?.innerText?.length??0,
    navigation:(performance.getEntriesByType('navigation')[0]?.type||'unknown'),
    gridPresent:!!document.querySelector('.ag-root-wrapper'),
    codeMirrorPresent:!!document.querySelector('.cm-editor'),
    tabLabels:[...document.querySelectorAll('#v4-tabs button')].map(n=>n.textContent?.trim()).slice(0,5)
   })).catch(e=>({error:String(e)}));
   push('snapshot',{step,...report});
   return report;
  }
  try{
   await page.goto(origin+'/v4-directory/',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>['ready','error'].includes(window.__ocr2mdV4?.phase),{timeout:23000}).catch(()=>{});
   const initial=await snapshot('old-page-ready');
   if(initial.phase!=='ready')throw Error('OLD_BOOTSTRAP_NOT_READY '+JSON.stringify(initial));
   servedVersion='new';
   await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
   await page.waitForURL(u=>u.searchParams.get('build')==='v4-261014-0838',{timeout:18000});
   await page.waitForFunction(()=>['ready','error'].includes(window.__ocr2mdV4?.phase),{timeout:25000}).catch(()=>{});
   const upgraded=await snapshot('after-automatic-navigation');
   afterUpgrade=upgraded.version==='v4-261014-0838'&&upgraded.phase==='ready'&&upgraded.bodyLength>60&&upgraded.tabLabels.length>0;
   console.log('WP1_FULL_WCP_UPGRADE',JSON.stringify({engine,from:old.id,to:next.id,pass:afterUpgrade,upgraded,errors:events.filter(x=>['pageerror','console','requestfailed','http'].includes(x.type)).slice(0,12)}));
  }catch(e){console.log('WP1_FULL_WCP_UPGRADE_ERROR',JSON.stringify({engine,error:String(e),lastEvents:events.slice(-16)}));}
  results.push({engine,pass:afterUpgrade,eventCount:events.length,errors:events.filter(x=>['pageerror','console','requestfailed','http'].includes(x.type)),snapshots:events.filter(x=>x.type==='snapshot'),loaderRequests:events.filter(x=>x.type==='asset').length});
  await page.close();
 }finally{await browser.close()}
}
const dest=process.env.WP1_REPORT??'/tmp/ocr2md-wp1-upgrade-forensics.json';
await writeFile(dest,JSON.stringify({checkedAt:new Date().toISOString(),stable:old.id,failed:next.id,results},null,2)+'\n');
console.log('WP1_REPORT',dest,'TEST_PASS',results.every(x=>x.pass));
if(!results.every(x=>x.pass))process.exitCode=1;
