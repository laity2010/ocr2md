/** Lab-only: a new build immediately reloads even with dirty CM6 source.
 * Probe uses a synthetic healthz build change; never writes any document.
 * Production root code and actual release-version.json are untouched.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4408/labs/cm-html/';
const cases=[
 ['Chrome',chromium,{viewport:{width:1300,height:850}}],
 ['iPad WebKit',webkit,{viewport:{width:1040,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
].filter(([name])=>!process.env.OCR_TEST_BROWSER||name===process.env.OCR_TEST_BROWSER);
for(const [name,engine,device] of cases){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(device);
  const errors=[],writes=[],dialogs=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{dialogs.push(d.type());await d.dismiss();});
  page.on('request',r=>{
    const path=new URL(r.url()).pathname;
    if(r.method()!=='GET'&&r.method()!=='HEAD'&&path.includes('/api/')) writes.push(`${r.method()} ${path}`);
    if(path.includes('/labs/cm-html/api/document')&&r.method()==='GET')requests.push(path);
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('.cm-content').first().waitFor({state:'visible',timeout:26000});
  const build=await page.locator('#build-version').getAttribute('title');
  assert(build?.includes('v6-lab'),'Test target must be Lab');
  const token='LAB_UNSAVED_REFRESH_261026';
  await page.locator('.cm-content').first().click();
  await page.keyboard.insertText(token);
  await page.waitForFunction(t=>document.querySelector('.cm-content')?.textContent.includes(t),token,{timeout:13000});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'),null,{timeout:13000});
  let served=false;
  await page.route('**/labs/cm-html/healthz',async route=>{
    if(!served){
      served=true;
      await route.fulfill({status:200,contentType:'application/json',
        headers:{'Cache-Control':'no-store'},body:JSON.stringify({version:'synthetic-next-lab-build'})});
    }else await route.continue();
  });
  const reloaded=page.waitForEvent('framenavigated',{predicate:frame=>frame===page.mainFrame(),timeout:13500});
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await reloaded;
  await page.locator('.cm-content').first().waitFor({state:'visible',timeout:base.startsWith('https://')?85000:23000});
  await page.waitForFunction(t=>!document.querySelector('.cm-content')?.textContent.includes(t),token,{timeout:10000});
  assert(served,'Synthetic new build was never seen');
  assert.equal(dialogs.length,0,'Lab blocked auto refresh with an unsaved warning');
  assert.equal(writes.length,0,'Lab refresh must not save dirty CM6 via any API');
  if(errors.length)console.log('LAB_REFRESH_PAGE_ERRORS',name,JSON.stringify(errors));
  assert.equal(errors.length,0,'Lab refresh script raised page errors');
  console.log('LAB_FAST_REFRESH_PASS',name,JSON.stringify({dirtyDiscarded:true,promptCount:dialogs.length,
    apiWrites:writes.length,buildBefore:build,htmlReloaded:true,readRequests:requests.length}));
 }finally{await browser.close();}
}
