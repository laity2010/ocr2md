/** Exercise 0816's actual auto-upgrade code against the live new release.
 * Only the initial old HTML/JS are intercepted. New build-info/HTML/assets are
 * fetched from the REAL existing 4176 HTTP server. WCP is a network-free stub.
 */
import {webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
const previous=process.env.OCR2MD_PREVIOUS_RELEASE;
if(!previous)throw Error('OCR2MD_PREVIOUS_RELEASE_REQUIRED');
const from='v4-261014-0816';
const oldHtml=await readFile(resolve(previous,'index.html'),'utf8');
const oldApp=await readFile(resolve(previous,'app.js'),'utf8');
const oldInfo=JSON.parse(await readFile(resolve(previous,'build-info.json'),'utf8'));
assert.ok(oldHtml.includes('data-build-id="'+from+'"'));
const origin='http://127.0.0.1:4176/v4-directory/';
const newRelease=await (await fetch(origin+'build-info.json',{cache:'no-store'})).json();
assert.ok(newRelease.id>from);
const browser=await webkit.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:800}});
 let oldHtmlCalls=0;
 let allowUpgrade=false;
 await page.route('**/v4-directory/build-info.json*',route=>allowUpgrade?route.continue():route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(oldInfo)}));
 await page.route('https://wcp.laity.bid/components/v1/loader.js*',route=>route.fulfill({
  status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},
  body:`export const loaderVersion='fixture';export async function mountWcp(){return {version:'fixture',selectModule:async()=>{},getComponents:()=>[]}};`
 }));
 await page.route('**/v4-directory/plugins/registry.generated.js?*',route=>route.fulfill({
  status:200,contentType:'text/javascript',body:`export const plugins=[{manifest:{id:'ocr2md:workspace',kind:'ui',tab:'工作目录',home:true,order:1,actions:[]},modules:[{id:'ocr2md:workspace',name:'工作目录'}],contracts:[]}];`
 }));
 await page.route('**/v4-directory/app.js?build='+from,route=>route.fulfill({status:200,contentType:'text/javascript',body:oldApp}));
 await page.route('**/v4-directory/',route=>{
  oldHtmlCalls++;
  return route.fulfill({status:200,contentType:'text/html',body:oldHtml});
 });
 await page.goto(origin,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready');
 assert.equal(await page.locator('#v4-build-label').textContent(),from);
 await page.evaluate(()=>{
  document.querySelector('#v4-framework-status').dataset.level='dirty';
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await page.waitForTimeout(1200); // let the first same-version probe finish
 allowUpgrade=true;
 for(let attempt=0;attempt<8;attempt++){
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(900);
  if(await page.getByTestId('v4-update-ready').isVisible())break;
 }
 await page.getByTestId('v4-update-ready').waitFor({state:'visible',timeout:3500});
 assert.equal(await page.getByTestId('v4-update-ready').isDisabled(),true);
 assert.equal(new URL(page.url()).searchParams.get('build'),null);
 await page.evaluate(()=>{document.querySelector('#v4-framework-status').dataset.level='ready'});
 for(let attempt=0;attempt<6;attempt++){
  if(new URL(page.url()).searchParams.get('build')===newRelease.id)break;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(700);
 }
 await page.waitForURL(u=>u.searchParams.get('build')===newRelease.id,{timeout:15000});
 await page.waitForFunction(id=>document.querySelector('#v4-build-label')?.textContent===id,newRelease.id,{timeout:15000});
 assert.equal(oldHtmlCalls,1,'new HTML must come from live server');
 console.log('OCR2MD_OLD_TO_LIVE_AUTO_UPGRADE_PASS',JSON.stringify({from,to:newRelease.id,
  dirtyBlocked:true,cleanAutoUpgrade:true,newHtmlFromLiveServer:true,engine:'webkit'}));
}finally{await browser.close()}
