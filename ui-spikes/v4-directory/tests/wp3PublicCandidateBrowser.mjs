/** WP3 public-candidate smoke: REAL CF hostname, REAL WCP & JS bundles,
 * real page bootstrap. Never send book or Vault credentials, never POST.
 * User's existing session/cookies are not imported into this test.
 */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const url=process.env.WP3_SMOKE_URL??'https://ocr2md.laity.bid/v4-wp3-candidate/';
const version=process.env.WP3_EXPECTED_VERSION??'v4-261014-0916';
for(const [engine,driver] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await driver.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];const net=[];const bad=[];
  page.on('pageerror',error=>errors.push(String(error).slice(0,250)));
  page.on('requestfailed',request=>net.push({url:request.url().slice(0,170),error:request.failure()?.errorText}));
  page.on('response',response=>{if(response.status()>=400)bad.push({status:response.status(),url:response.url().slice(0,170)})});
  let forbiddenPost=0;
  await page.route('https://ocr2md.laity.bid/__v3/**',route=>{
   if(route.request().method()!=='GET')forbiddenPost++;
   return route.fulfill({status:401,contentType:'application/json',body:'{"ok":false,"error":"wp3-readonly-public-smoke"}'});
  });
  const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  assert.equal(response.status(),200);
  await page.waitForFunction(()=>window.__v4Startup?.state()?.phase==='ready',null,{timeout:35000});
  await page.waitForFunction(()=>document.querySelector('[role=grid],[role=treegrid]')!==null,null,{timeout:25000});
  const state=await page.evaluate(()=>({
   build:document.querySelector('#v4-build-label')?.textContent,
   app:window.__ocr2mdV4?.phase,bootstrap:window.__v4Startup?.state()?.phase,
   grid:Boolean(document.querySelector('[role=grid],[role=treegrid]')),
   tabs:[...document.querySelectorAll('#v4-tabs button')].map(n=>n.textContent?.trim()),
   status:document.querySelector('#status')?.textContent?.slice(0,90),
   bootstrapDiagnostic:document.querySelector('#v4-startup-diagnostic')?.textContent?.slice(0,110),
   viewport:innerWidth,documentWidth:document.documentElement.scrollWidth
  }));
  assert.equal(state.build,version);assert.equal(state.app,'ready');
  assert.ok(state.grid&&state.tabs.includes('工作目录'));
  assert.equal(forbiddenPost,0,'No write methods to Vault are permitted in WP3 test');
  assert.deepEqual(errors,[],'Unexpected JS failures');
  assert.equal(net.length,0,'Unexpected failed network requests');
  assert.ok(bad.every(x=>x.url.includes('/__v3/')&&x.status===401),'unexpected non-Vault HTTP failures');
  console.log('WP3_PUBLIC_BROWSER_PASS',JSON.stringify({engine,url,version,state,expectedVault401:bad.length}));
  await page.close();
 }finally{await browser.close()}
}
