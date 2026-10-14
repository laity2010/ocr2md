/** Header UIC: module switching may reveal workflow navigation but must not
 * move the shared top tabs or global actions, nor grow the top-row box.
 * Uses actual V4 HTML, CSS, WCP and modules; Vault is READ-ONLY stubbed.
 */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const source=resolve(process.env.V4_HEADER_ROOT??'ui-spikes/v4-directory');
const base='https://ocr2md.laity.bid/v4-wp3-candidate/';
const rows=['workbench','workspace','settings'];
const mime={'.js':'text/javascript','.html':'text/html','.json':'application/json','.css':'text/css','.woff2':'font/woff2'};
const epsilon=.65;
for(const [browserName,engine] of [['webkit',webkit],['chromium',chromium]]){
 const browser=await engine.launch(browserName==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
 try{
 for(const width of [810,1024]){
  const page=await browser.newPage({viewport:{width,height:970},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('https://ocr2md.laity.bid/__v3/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"header-test-isolated"}'}));
  await page.route(base+'**',async r=>{
   const rel=decodeURIComponent(new URL(r.request().url()).pathname.slice('/v4-wp3-candidate/'.length))||'index.html';
   if(rel.startsWith('/')||rel.split('/').includes('..'))return r.abort('blockedbyclient');
   try{await r.fulfill({status:200,contentType:mime[extname(rel)]??'application/octet-stream',body:await readFile(join(source,rel))})}
   catch{await r.fulfill({status:404,body:'not found'})}
  });
  const snap=()=>page.evaluate(()=>{
   const box=selector=>{const element=document.querySelector(selector);const r=element.getBoundingClientRect();return {y:+r.y.toFixed(2),h:+r.height.toFixed(2)}};
   return {active:document.body.dataset.v4ActiveModule,brand:box('h1.v3-brand'),bar:box('.v3-top-row'),tabs:box('#v4-tabs'),global:box('#v4-global-actions'),toolbar:box('#v4-module-toolbar'),nav:box('#v4-workflow-controls'),navVisible:!document.querySelector('#v4-workflow-controls').hidden};
  });
  try{
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:28000});
   const before=await snap();assert.equal(before.active,'workspace');
   await page.locator('#tab-chapter-boundary').click();
   await page.waitForFunction(()=>document.body.dataset.v4ActiveModule==='chapter-boundary',null,{timeout:20000});
   const after=await snap();assert.equal(after.navVisible,true);
   const context=JSON.stringify({browserName,width,before,after,errors});
   for(const what of ['bar','tabs','global']){
    assert.ok(Math.abs(before[what].y-after[what].y)<=epsilon,what+' top moved: '+context);
   }
   assert.ok(Math.abs(before.bar.h-after.bar.h)<=epsilon,'top row changed height: '+context);
   await page.waitForFunction(()=>!document.querySelector('#tab-settings')?.disabled,null,{timeout:26000});
   await page.locator('#tab-settings').click();
   await page.waitForFunction(()=>document.body.dataset.v4ActiveModule==='settings',null,{timeout:20000});
   const settings=await snap();
   assert.ok(Math.abs(before.tabs.y-settings.tabs.y)<=epsilon,'settings tab moved '+JSON.stringify({before,settings}));
   assert.deepEqual(errors,[]);
   console.log('V4_TOP_BAR_GEOMETRY_STABLE_PASS',JSON.stringify({browserName,width,before,after,settings}));
  }finally{await page.close()}
 }
 }finally{await browser.close()}
}
