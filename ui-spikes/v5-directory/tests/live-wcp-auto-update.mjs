/** Actual WCP AppFrame on LAN, controlled fake next release over read-only
 * browser routes. Tests real assembled Shell refresh without publishing again.
 */
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(import.meta.dirname,'../../../../web-component-platform/node_modules/playwright'));
const origin='https://192.168.1.10:4443';
const live=await (await fetch(origin+'/release-info.json')).json();
const next=live.buildId.replace(/.$/,n=>String((Number(n)+1)%10));
const baseHtml=await (await fetch(origin+'/index.html')).text();
assert(baseHtml.includes('data-build-id="'+live.buildId+'"'));
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch(name==='chromium'?{channel:'chrome'}:{});
 try{
  const page=await browser.newPage({ignoreHTTPSErrors:true});const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__ocr2mdV5?.phase==='ready');
  await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.wcpLayout==='tripane',{timeout:35000});
  let infoCalls=0,htmlCalls=0;
  await page.route('**/release-info.json?releaseCheck=*',async route=>{
   infoCalls++;
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...live,buildId:next})});
  });
  await page.route('**/?releaseCheck=*',async route=>{
   htmlCalls++;
   await route.fulfill({status:200,contentType:'text/html',body:baseHtml.replaceAll(live.buildId,next)});
  });
  await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
  await page.waitForURL(url=>url.searchParams.get('build')===next,{timeout:16000});
  assert(infoCalls>0&&htmlCalls>0,{infoCalls,htmlCalls});
  assert.deepEqual(errors,[]);
  console.log('V5_REAL_WCP_AUTO_UPDATE_NAVIGATED',name,{from:live.buildId,to:next,manifestCalls:infoCalls,htmlCalls});
 }finally{await browser.close()}
}
