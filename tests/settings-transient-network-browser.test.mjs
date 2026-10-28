/** Settings needs to survive a temporary loss of GET /api/settings on iPad Safari. */
import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const url=process.env.V6_SETTINGS_TEST_URL||'https://192.168.1.10:4443/labs/cm-html/';
const engines=[['Chrome',chromium,{}],['iPad WebKit',webkit,{viewport:{width:1024,height:768},deviceScaleFactor:2,isMobile:true,hasTouch:true}]];
for(const [name,engine,contextOptions] of engines){
 const browser=await engine.launch({headless:true});
 try{
  // Both startup and first open may request Settings. Inject two failed GETs.
  const ctx=await browser.newContext({ignoreHTTPSErrors:true,...contextOptions});
  let failures=2,networkCalls=0;
  await ctx.route('**/labs/cm-html/api/settings',async route=>{
    if(route.request().method()!=='GET')return route.continue();
    networkCalls++;
    if(failures-->0)return route.abort('failed');
    return route.continue();
  });
  const page=await ctx.newPage();
  const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await selectModule(page,'settings');
  await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length>=2,null,{timeout:17000});
  assert(!page.url().includes('/api/'));
  assert.deepEqual(jsErrors,[]);
  console.log('SETTINGS_TRANSIENT_RECOVERY_PASS',name,{networkCalls});
  await ctx.close();

  // A sustained outage must not create a half-initialized grid. After it
  // clears, reselecting Settings has to work with exactly one settings grid.
  const ctx2=await browser.newContext({ignoreHTTPSErrors:true,...contextOptions});
  let offline=true,outageCalls=0;
  await ctx2.route('**/labs/cm-html/api/settings',route=>{
    if(offline&&route.request().method()==='GET'){outageCalls++;return route.abort('failed');}
    return route.continue();
  });
  const retryPage=await ctx2.newPage();
  await retryPage.goto(url,{waitUntil:'domcontentloaded'});
  await selectModule(retryPage,'settings');
  await retryPage.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('设置载入失败'),null,{timeout:5500}).catch(()=>{});
  await retryPage.waitForTimeout(1000);
  assert(outageCalls>=3,'Expected repeated interrupted Settings requests');
  const partial=await retryPage.evaluate(()=>document.querySelectorAll('#settings-workspace .ag-root-wrapper').length);
  assert.equal(partial,0,'Failed GET left a partially initialized Settings grid');
  offline=false;
  await selectModule(retryPage,'chapter-boundary');
  await selectModule(retryPage,'settings');
  await retryPage.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length>=2,null,{timeout:17000});
  const grids=await retryPage.evaluate(()=>document.querySelectorAll('#settings-workspace .ag-root-wrapper').length);
  assert.equal(grids,1,'Recovery duplicated a Settings grid');
  console.log('SETTINGS_OUTAGE_RESELECT_PASS',name,{grids,outageCalls});
  await ctx2.close();
 }finally{await browser.close();}
}
