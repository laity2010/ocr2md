/** WP2 independent release gate. All OCR2MD assets are served from readonly
 * on-disk snapshots; WCP loader and actual components are NOT mocked.
 * Never touches user books or the published directory.
 */
import {chromium,webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import {createHash} from 'node:crypto';
const stable=resolve(process.env.WP2_STABLE??'ui-spikes/v2/v4-directory');
const candidate=resolve(process.env.WP2_CANDIDATE??'ui-spikes/v4-directory');
const old=JSON.parse(await readFile(join(stable,'build-info.json'),'utf8'));
const next=JSON.parse(await readFile(join(candidate,'build-info.json'),'utf8'));
assert.match(next.id,/^v4-\d{6}-\d{4}$/);
assert.ok(next.id>old.id,`Must test a new version ${old.id} -> ${next.id}`);
for(const [file,sha] of Object.entries(next.assets)){
 const data=await readFile(join(candidate,file));
 assert.equal(createHash('sha256').update(data).digest('hex'),sha,`mixed candidate asset ${file}`);
}
const origin='https://ocr2md.laity.bid';
const assetsMime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.png':'image/png'};
const results=[];
function report(scenario,engine,success,info={}){
 results.push({scenario,engine,success,...info});
 console.log('WP2_GATE',JSON.stringify({scenario,engine,success,...info}));
}
async function run(engine,browserType,scenario){
 const browser=await browserType.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  let selected='old',loaderFail=scenario==='loader-failure',registryFail=scenario==='registry-failure';
  let mixed=scenario==='half-published',requestErrors=[];
  page.on('pageerror',e=>requestErrors.push({kind:'page',error:e.name}));
  page.on('requestfailed',r=>requestErrors.push({kind:'network',origin:new URL(r.url()).origin,category:r.resourceType()}));
  if(loaderFail)await page.route('https://wcp.laity.bid/components/v1/loader.js*',r=>loaderFail?r.abort('failed'):r.continue());
  // New local-first releases use the SAME WCP loader bytes from the candidate
  // package; test failure of both local and upstream fallbacks.
  if(loaderFail)await page.route(origin+'/v4-directory/vendor/wcp/components/v1/loader.js*',
   r=>loaderFail?r.abort('failed'):r.continue());
  await page.route('https://ocr2md.laity.bid/__v3/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"isolated-no-vault"}'}));
  await page.route('https://ocr2md.laity.bid/v4-directory/**',async route=>{
   const url=new URL(route.request().url());
   const rel=decodeURIComponent(url.pathname.slice('/v4-directory/'.length))||'index.html';
   if(rel.includes('..')||rel.startsWith('/'))return route.abort('blockedbyclient');
   if(loaderFail&&rel==='vendor/wcp/components/v1/loader.js')return route.abort('failed');
   if(registryFail&&rel==='plugins/registry.generated.js')return route.abort('failed');
   const source=(mixed&&url.searchParams.has('release-check'))?'old':selected;
   const root=source==='old'?stable:candidate;
   try{
    const body=await readFile(join(root,rel));
    return route.fulfill({status:200,contentType:assetsMime[extname(rel)]??'application/octet-stream',body});
   }catch{return route.fulfill({status:404,body:'missing'})}
  });
  try{
   if(scenario==='loader-failure'||scenario==='registry-failure')selected='new';
   const response=await page.goto(origin+'/v4-directory/',{waitUntil:'domcontentloaded',timeout:32000});
   assert.equal(response.status(),200);
   if(scenario.endsWith('-failure')){
    await page.waitForFunction(()=>window.__v4Startup?.state()?.phase==='error',null,{timeout:25000});
    assert.equal(await page.getByTestId('v4-startup-failure').isVisible(),true);
    assert.equal(await page.locator('[role=grid],[role=treegrid]').count(),0);
    const state=await page.evaluate(()=>window.__v4Startup.state());
    assert.equal(state.build,next.id);
    assert.equal(state.errorCode,'DEPENDENCY_LOAD_FAILED');
    assert.equal(state.phase,'error');
    assert.equal(await page.getByTestId('v4-startup-diagnostic').textContent().then(t=>t.includes('DEPENDENCY_LOAD_FAILED')),true);
    // A marked-unsaved module must be protected even in an incomplete startup.
    await page.evaluate(()=>{
     const draft=document.createElement('div');draft.dataset.unsaved='true';draft.id='wp2-unsaved-guard';
     document.querySelector('#v4-module-mount').append(draft);
    });
    await page.getByTestId('v4-startup-retry').click();
    assert.ok(!new URL(page.url()).searchParams.has('recover'),'recovery may not navigate while dirty');
    await page.evaluate(()=>document.querySelector('#wp2-unsaved-guard').remove());
    if(loaderFail){
     loaderFail=false;
     await page.getByTestId('v4-startup-retry').click();
     await page.waitForURL(u=>u.searchParams.has('recover'),{timeout:15000});
     await page.waitForFunction(()=>window.__v4Startup?.state()?.phase==='ready',null,{timeout:26000});
     assert.equal(await page.getByTestId('v4-startup-failure').isHidden(),true);
     assert.ok(await page.locator('#v4-tabs button').count()>0);
     report(scenario,engine,true,{detected:state.errorCode,retryRecovered:true});
    }else report(scenario,engine,true,{detected:state.errorCode,dirtyProtected:true});
   }else{
    await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:30000});
    await page.waitForFunction(()=>Boolean(document.querySelector('[role=grid],[role=treegrid]')),null,{timeout:22000});
    const initial=await page.evaluate(()=>({phase:window.__ocr2mdV4.phase,version:document.querySelector('#v4-build-label').textContent,
     ag:Boolean(document.querySelector('[role=grid],[role=treegrid]')),
     tabs:document.querySelectorAll('#v4-tabs button').length}));
    assert.equal(initial.version,old.id);assert.ok(initial.ag&&initial.tabs>0,'real WCP components must render');
    selected='new';
    if(scenario==='half-published'){
     await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
     await page.getByTestId('v4-update-ready').waitFor({state:'visible',timeout:15000});
     assert.equal(await page.getByTestId('v4-update-ready').isDisabled(),true);
     assert.ok((await page.getByTestId('v4-update-ready').textContent()).includes('等待资源同步'));
     assert.equal(await page.locator('#v4-build-label').textContent(),old.id);
     report(scenario,engine,true,{stayedOn:old.id,blockedMixedRelease:true});
    }else{
     await page.evaluate(()=>{
      document.querySelector('#v4-framework-status').dataset.level='dirty';
      document.dispatchEvent(new Event('visibilitychange'));
     });
     await page.getByTestId('v4-update-ready').waitFor({state:'visible',timeout:15000});
     assert.equal(await page.getByTestId('v4-update-ready').isDisabled(),true);
     assert.equal(await page.locator('#v4-build-label').textContent(),old.id);
     await page.evaluate(()=>{
      document.querySelector('#v4-framework-status').dataset.level='ready';
      document.dispatchEvent(new Event('visibilitychange'));
     });
     await page.waitForURL(u=>u.searchParams.get('build')===next.id,{timeout:18000});
     await page.waitForFunction(()=>window.__v4Startup?.state()?.phase==='ready',null,{timeout:31000});
     await page.waitForFunction(()=>Boolean(document.querySelector('[role=grid],[role=treegrid]')),null,{timeout:22000});
     const upgraded=await page.evaluate(()=>({build:document.querySelector('#v4-build-label')?.textContent,
      phase:window.__v4Startup.state().phase,appPhase:window.__ocr2mdV4.phase,
      wcpVersion:window.__ocr2mdV4.version,
      ag:Boolean(document.querySelector('[role=grid],[role=treegrid]')),
      tabs:document.querySelectorAll('#v4-tabs button').length,
      bodyLength:document.body?.innerText?.length||0}));
     assert.equal(upgraded.build,next.id);assert.equal(upgraded.appPhase,'ready');
     assert.ok(upgraded.ag&&upgraded.tabs>0&&upgraded.bodyLength>65,JSON.stringify(upgraded));
     report(scenario,engine,true,{from:old.id,to:next.id,wcpMounted:true,ag:true,dirtyProtected:true});
    }
   }
  }catch(e){
   const state=await page.evaluate(()=>({phase:window.__v4Startup?.state()?.phase,appPhase:window.__ocr2mdV4?.phase,
    label:document.querySelector('#v4-build-label')?.textContent,indicator:document.querySelector('#status')?.textContent,
    rootChildren:document.querySelector('#v4-module-mount')?.childElementCount})).catch(()=>({}));
   report(scenario,engine,false,{error:String(e).slice(0,300),state,networkErrors:requestErrors.slice(0,5)});
  }finally{await page.close()}
 }finally{await browser.close()}
}
for(const [engine,driver] of [['webkit',webkit],['chromium',chromium]]){
 for(const scenario of engine==='webkit'?['full-upgrade','loader-failure','registry-failure','half-published']:['full-upgrade','loader-failure'])
  await run(engine,driver,scenario);
}
const outcome={stable:old.id,candidate:next.id,results,passed:results.length===6&&results.every(x=>x.success)};
if(process.env.WP2_REPORT)await writeFile(process.env.WP2_REPORT,JSON.stringify(outcome,null,2)+'\n');
console.log('WP2_FULL_GATE_RESULT',JSON.stringify({passed:outcome.passed,cases:results.length,stable:old.id,candidate:next.id}));
if(!outcome.passed)process.exitCode=1;
