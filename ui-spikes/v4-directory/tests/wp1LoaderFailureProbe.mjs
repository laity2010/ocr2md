/** WP1 fault injection: simulate WCP CDN being unavailable just as v4 starts.
 * Using failed 0838 bytes in an isolated browser: no live deployment.
 */
import {webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {extname,join,resolve} from 'node:path';
const failed=resolve('ui-spikes/v2/.v4-public-failed-v4-261014-0838-60e26e80-be31-42b5-ac09-b1e011182d4b');
const browser=await webkit.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const logs=[];
 page.on('pageerror',e=>logs.push('PAGE_ERROR '+String(e).slice(0,220)));
 page.on('requestfailed',r=>logs.push('FAILED '+r.url().slice(0,140)));
 await page.route('https://wcp.laity.bid/components/v1/loader.js*',r=>r.abort('failed'));
 await page.route('https://ocr2md.laity.bid/__v3/**',r=>r.fulfill({status:401,body:'{"error":"no-vault"}',contentType:'application/json'}));
 await page.route('https://ocr2md.laity.bid/v4-directory/**',async route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname.slice('/v4-directory/'.length))||'index.html';
  if(name.startsWith('/')||name.includes('..'))return route.abort('blockedbyclient');
  try{
   const file=await readFile(join(failed,name));
   const ct={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'}[extname(name)]??'application/octet-stream';
   return route.fulfill({status:200,contentType:ct,body:file});
  }catch{return route.fulfill({status:404,body:'not found'})}
 });
 const response=await page.goto('https://ocr2md.laity.bid/v4-directory/?build=v4-261014-0838',{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForTimeout(2500);
 const state=await page.evaluate(()=>({build:document.getElementById('v4-build-label')?.textContent,phase:window.__ocr2mdV4?.phase??'not_started',agGrid:!!document.querySelector('.ag-root-wrapper'),mountText:document.getElementById('v4-module-mount')?.textContent?.slice(0,150),url:location.href}));
 const expected=state.build==='v4-261014-0838'&&state.phase==='not_started'&&!state.agGrid;
 console.log('WP1_WCP_IMPORT_FAILURE_SIGNATURE',JSON.stringify({expected,HTTP:response.status(),state,errors:logs.slice(0,12)}));
 if(!expected)process.exitCode=1;
}finally{await browser.close()}
