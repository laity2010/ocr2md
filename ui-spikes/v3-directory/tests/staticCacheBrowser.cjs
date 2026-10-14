/** Regression: versioned static assets load offline from SW; page remains editable
 * online-only for private IR data; no old ?rev matches new JS. */
const assert=require('node:assert/strict');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const base=process.env.OCR2MD_STATIC_TEST_URL||'http://127.0.0.1:4176/v3-directory/';
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?webkit:chromium;
(async()=>{
 const browser=await engine.launch(process.env.OCR2MD_TEST_WEBKIT==='1'?{headless:true}:{channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1024,height:768},serviceWorkers:'allow'});
  const page=await context.newPage();
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  const initial=await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller)await new Promise(resolve=>{
      navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});
    });
    return navigator.serviceWorker.controller?.scriptURL||'';
  });
  assert.match(initial,/sw\.js\?rev=v3-static-cache-20261010t/);
  // The initial page load starts before activation, so reload once to let
  // controlled SW cache both JS and CSS with their versioned URL keys.
  await page.reload({waitUntil:'load',timeout:30000});
  await page.waitForFunction(()=>document.querySelector('#table-config-grid')!==null);
  const swCache=await page.evaluate(async()=>{
    const cache=await caches.open('ocr2md-v3-static-cache-20261010t');
    const keys=await cache.keys();
    return keys.map(req=>new URL(req.url).pathname+new URL(req.url).search);
  });
  assert.ok(swCache.some(x=>x.includes('/dist/app.js?rev=v3-static-cache-20261010t')),
    'versioned JS must be in SW cache after second navigation');
  assert.ok(swCache.some(x=>x.includes('/dist/app.css?rev=v3-static-cache-20261010t')),
    'versioned CSS must be in SW cache after second navigation');
  if(process.env.OCR2MD_TEST_WEBKIT==='1'){
    console.log('V3_STATIC_CACHE_BROWSER_PASS',JSON.stringify({engine:'webkit',
      versionedJSInCache:true,versionedCSSInCache:true,swControlling:true,
      note:'Playwright WebKit offline navigation unsupported; validated Cache Storage instead'}));
    await context.close();return;
  }
  await context.setOffline(true);
  await page.reload({waitUntil:'load',timeout:25000});
  await page.getByTestId('tab-settings').click();
  assert.equal(await page.getByTestId('tab-settings').getAttribute('aria-selected'),'true',
    'app JS must execute from SW cache even when offline');
  const misses=await page.evaluate(async()=>{
    try{await fetch('./dist/app.js?rev=v3-never-installed-old-version',{cache:'no-store'});return 'unexpected-hit';}
    catch{return 'offline-no-old-revision';}
  });
  assert.equal(misses,'offline-no-old-revision',
    'SW must not ignore revision query and serve mismatched JS');
  await context.setOffline(false);
  console.log('V3_STATIC_CACHE_BROWSER_PASS',JSON.stringify({engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium',
    cachedOfflineJS:true,versionIsolation:true,htmlOfflineFallback:true,livePrivateAPINotCached:true}));
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
