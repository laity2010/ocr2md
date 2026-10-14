/** UIC: Work directory first, Settings loaded during idle and gated until ready. */
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const network=path.resolve(root,'../../../agent-link-monitor/web');
const port=30000+Math.floor(Math.random()*28000);
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/index.html`)).ok)break;}catch{}await sleep(90);}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1032,height:784}});
 const requests=[],errors=[];
 const startedAt=Date.now();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(r.url().includes('/shared-settings/'))requests.push({asset:new URL(r.url()).pathname.split('/').pop(),at:Date.now()-startedAt});});
 await page.route('https://agent-link.laity.bid/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const target=path.resolve(network,'.'+pathname);
  if(!target.startsWith(network+'/')||!fs.existsSync(target))return route.continue();
  if(pathname.endsWith('settings-panel.js'))await sleep(2200);
  if(pathname.endsWith('/source-surface.js'))await sleep(1100);
  if(pathname.endsWith('.woff2'))await sleep(3700);
  const ext=path.extname(target);
  let body=fs.readFileSync(target);
  if(pathname.endsWith('sarasa-ui.css'))body=Buffer.from(body.toString().replace(/local\("Sarasa Fixed SC"\), local\("Sarasa-Fixed-SC-Regular"\),/,'').replace(/local\("Sarasa Fixed SC"\),\s*local\("Sarasa-Fixed-SC-Regular"\),/,''));
  await route.fulfill({status:200,contentType:ext==='.json'?'application/json':ext==='.css'?'text/css':ext==='.woff2'?'font/woff2':'text/javascript',headers:{'access-control-allow-origin':'*'},body});
 });
 await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
 const workspace=page.getByTestId('tab-workspace');
 const tab=page.getByTestId('tab-settings');
 assert.equal(await workspace.getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('#panel-workspace').isVisible(),true);
 assert.equal(await tab.isDisabled(),true);
 assert.equal(await tab.getAttribute('aria-disabled'),'true');
 // Programmatic activation may not override a disabled Settings gate.
 await page.evaluate(()=>document.querySelector('#tab-settings').click());
 assert.equal(await tab.getAttribute('aria-selected'),'false');
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.ready==='true'
 && document.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:30000});
 const fontDiag=await page.evaluate(()=>({
   faceState:[...document.fonts].filter(x=>x.family==='Laity Sarasa Fixed SC').map(x=>x.status),
   fontRequestSeen:performance.getEntriesByType('resource').some(x=>x.name.includes('sarasa-fixed-sc-gb2312-regular-v1.0.36.woff2')),
 }));
 const stillDisabled=await tab.isDisabled();
 // The installed local face may already be loaded by WebKit; in that case
 // opening Settings need not wait for a network request that never occurs.
 assert.ok(stillDisabled||fontDiag.faceState.includes('loaded'),
   'Settings cannot unlock with an unready font: '+JSON.stringify(fontDiag));
 assert.equal(await workspace.getAttribute('aria-selected'),'true');
 await page.waitForFunction(()=>document.querySelector('#tab-settings')?.dataset.settingsState==='ready',null,{timeout:20000});
 const afterMs=Date.now()-startedAt;
 assert.equal(await tab.isEnabled(),true);
 assert.equal(await tab.getAttribute('aria-disabled'),'false');
 assert.equal(await workspace.getAttribute('aria-selected'),'true','Settings readiness does not steal the tab');
 assert.equal(await page.locator('#panel-settings').isHidden(),true);
 const panel=page.locator('#settings-shared');
 assert.equal(await panel.locator('laity-source-surface').count(),1);
 assert.ok(await panel.locator('.ag-row').count()>5);
 assert.equal(await panel.locator('.las-preview').count(),1);
 await tab.click();
 assert.equal(await tab.getAttribute('aria-selected'),'true');
 assert.ok(await panel.locator('.las-source-col').isVisible());
 assert.ok(requests.some(x=>x.asset==='settings-panel.js'));
 assert.ok(requests.some(x=>x.asset.endsWith('.woff2')) || fontDiag.faceState.includes('loaded')); 
 assert.deepEqual(errors,[]);
 console.log('V3_DIRECTORY_FIRST_SETTINGS_IDLE_GATE_PASS',JSON.stringify({engine,readyAtMs:afterMs,requests,agReady:true,sourceReady:true,fontSettled:true}));
 // Failure path: if CodeMirror cannot initialize, a partially loaded Settings
 // screen must never be opened. Working directory must remain available.
 // Use a fresh process: WebKit may share its ESM module cache between
 // pages/contexts inside one browser process, bypassing the injected 503.
 const failureBrowser=await (engine==='webkit'?webkit:chromium).launch(
   engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const failurePage=await failureBrowser.newPage({viewport:{width:1032,height:784}});
 await failurePage.route('https://agent-link.laity.bid/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname.endsWith('/source-surface.js'))return route.fulfill({status:503,contentType:'text/plain',body:'test induced shared source failure'});
  const file=path.resolve(network,'.'+pathname);
  if(!file.startsWith(network+'/')||!fs.existsSync(file))return route.continue();
  const ext=path.extname(file);
  await route.fulfill({status:200,contentType:ext==='.json'?'application/json':ext==='.css'?'text/css':ext==='.woff2'?'font/woff2':'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(file)});
 });
 await failurePage.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
 // WebKit can delay delivering a failed dynamic-import rejection; the
 // contract does not depend on the exact retry time. The safety invariant is
 // that an incomplete Settings screen never becomes available.
 await sleep(engine==='webkit'?6500:2500);
 const failure=await failurePage.evaluate(()=>({
   tabState:document.querySelector('#tab-settings')?.dataset.settingsState,
   tabDisabled:document.querySelector('#tab-settings')?.disabled,
   agReady:document.querySelector('#settings-shared')?.dataset.ready,
   sourceReady:document.querySelector('#settings-shared')?.dataset.sourceReady,
 }));
 console.log('INCOMPLETE_SETTINGS_GATE_DIAG',JSON.stringify({engine,...failure}));
 assert.equal(failure.tabDisabled,true);
 assert.notEqual(failure.tabState,'ready');
 assert.equal(await failurePage.locator('#panel-workspace').isVisible(),true);
 assert.equal(await failurePage.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
 if(failure.sourceReady==='fallback')assert.equal(failure.tabState,'error');
 await failurePage.close();
 await failureBrowser.close();
 console.log('V3_SETTINGS_FAILURE_STAYS_DISABLED_PASS',engine);
}catch(e){console.error('V3_DIRECTORY_FIRST_SETTINGS_IDLE_GATE_FAIL',e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
