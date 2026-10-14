/** V4 release stamp: exercise the real built HTML in Chromium and WebKit.
 * Only a loopback static server. Never writes a book, user key, or Vault.
 */
import {chromium,webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {setTimeout as sleep} from 'node:timers/promises';
import {resolve} from 'node:path';

const root=resolve(process.env.V4_TEST_STATIC_ROOT??'ui-spikes/v2');
const book=JSON.parse(await readFile(resolve(root,'v4-directory/build-info.json'),'utf8'));
assert.match(book.id,/^v4-\d{6}-\d{4}$/);
assert.match(book.builtAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
const id=book.id;
const port=await new Promise((ok,no)=>{
 const s=createServer();s.on('error',no);s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>ok(port))});
});
const host=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
try{
 let up=false;
 for(let tries=0;tries<35;tries++){
  try{if((await fetch(host+'/v4-directory/')).ok){up=true;break}}catch{}
  await sleep(150);
 }
 assert.ok(up,'built static server did not start');
 const served=await (await fetch(host+'/v4-directory/build-info.json')).json();
 const liveHtml=await (await fetch(host+'/v4-directory/index.html')).text();
 assert.deepEqual(served,book,'served build metadata differs from installed build');
 for(const [file,expected] of Object.entries(book.assets)){
  const response=await fetch(host+'/v4-directory/'+file);
  assert.ok(response.ok,'build asset unavailable: '+file);
  const sha=createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(sha,expected,'serving mixed-version artifact: '+file);
 }
 for(const [engine,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
  try{
   for(const width of [1024,768]){
    const page=await browser.newPage({viewport:{width,height:760}});
    try{
     // Isolate the real V4 shell/update watcher from external WCP networking.
     // Mount a minimal contract-conformant WCP host without access to the Vault.
     await page.route('https://wcp.laity.bid/components/v1/loader.js*',route=>route.fulfill({
       status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},
       body:`export const loaderVersion='fixture';export async function mountWcp(root){root.append(Object.assign(document.createElement('div'),{textContent:'Fixture mounted'}));return {version:'fixture',selectModule:async()=>{},getComponents:()=>[]}};`
     }));
     await page.route('**/v4-directory/plugins/registry.generated.js?*',route=>route.fulfill({
       status:200,contentType:'text/javascript',body:`export const plugins=[{manifest:{id:'ocr2md:workspace',kind:'ui',tab:'工作目录',home:true,order:1,actions:[]},modules:[{id:'ocr2md:workspace',name:'工作目录'}],contracts:[]}];`
     }));
     await page.goto(host+'/v4-directory/',{waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',{timeout:15000});
     const result=await page.evaluate(()=>{
      const badge=document.querySelector('#v4-build-label');
      const brand=document.querySelector('.v3-brand-name');
      const status=document.querySelector('#v4-framework-status');
      const build=document.querySelector('#workbench-build');
      const btn=document.querySelector('#v4-version-trigger');
      const b=badge.getBoundingClientRect(),s=status.getBoundingClientRect();
      return {badge:badge.textContent,attribute:badge.dataset.buildId,brand:brand.textContent,
        details:build.textContent,detailsId:build.dataset.buildId,
        resource:new URL(document.querySelector('#v4-bootstrap').dataset.entry,location.href).searchParams.get('build'),
        buttonVisible:btn.getBoundingClientRect().width>0,
        statusVisible:s.width>0&&s.height>0,
        sameLine:Math.abs(b.top-s.top)<22,
        fits:b.right<=innerWidth&&s.right<=innerWidth};
     });
     assert.equal(result.badge,id);
     assert.equal(result.attribute,id);
     assert.equal(result.detailsId,id);
     assert.equal(result.brand,'ocr2md');
     assert.equal(await page.evaluate(()=>window.__v4Startup?.state()?.phase),'ready');
     assert.ok(result.details.includes(book.preciseBuildTime));
     assert.equal(result.resource,id);
     assert.ok(result.buttonVisible&&result.statusVisible&&result.sameLine&&result.fits,JSON.stringify(result));
     // Component dialog uses the same stamped build ID; no independent counter.
     await page.locator('#v4-version-trigger').click();
     await page.waitForFunction(()=>document.getElementById('v4-component-dialog')?.open,{timeout:15000});
     const popup=await page.locator('#workbench-build').textContent();
     assert.ok(popup.includes(id),popup);
     const endpoint=await page.locator('#v4-access-route').textContent();
     assert.ok(endpoint.includes('局域网/本机'),endpoint);
     if(engine==='webkit'&&width===768){
       const next='v4-991231-2359';
       await page.route(/\/v4-directory\/build-info\.json\?t=/,route=>route.fulfill({
         status:200,contentType:'application/json',body:JSON.stringify({...book,id:next})}));
       await page.route(/\/v4-directory\/\?release-check=/,route=>route.fulfill({
         status:200,contentType:'text/html',body:liveHtml.replaceAll(id,next)}));
       await page.evaluate(()=>{
         document.querySelector('#v4-framework-status').dataset.level='dirty';
         document.dispatchEvent(new Event('visibilitychange'));
       });
       await page.waitForFunction(()=>document.querySelector('#v4-update-ready')?.textContent.includes('v4-991231-2359'),null,{timeout:10000});
       assert.equal(await page.locator('#v4-update-ready').isDisabled(),true,'dirty draft must block automatic reload');
       assert.ok(!new URL(page.url()).searchParams.has('build'),'no navigation while dirty');
       await page.evaluate(()=>{
         document.querySelector('#v4-framework-status').dataset.level='ready';
         document.dispatchEvent(new Event('visibilitychange'));
       });
       await page.waitForURL(url=>url.searchParams.get('build')===next,{timeout:15000});
       console.log('OCR2MD_IPAD_SAFE_RELOAD_PASS',JSON.stringify({engine,id,next,dirtyBlocked:true,cleanReload:true}));
     }
     console.log('OCR2MD_BUILD_BADGE_BROWSER_PASS',JSON.stringify({engine,width,id,precise:book.preciseBuildTime,dialog:true}));
    }finally{await page.close()}
   }
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM')}
