/** E2E performance guard: slow manifest is advisory; it must not block UI. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const network=path.resolve(root,'../../../agent-link-monitor/web');
const port=30000+Math.floor(Math.random()*28000);
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
(async()=>{let browser;
 try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/index.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,90));}
  browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1100,height:850}});
  const loadedAt=Date.now();const requested={};let manifestCompleted=false;
  page.on('request',request=>{
    const pathname=new URL(request.url()).pathname;
    if(pathname.includes('shared-settings/v1/manifest.json'))requested.manifest=Date.now()-loadedAt;
    if(pathname.includes('shared-settings/v1/settings-panel.js'))requested.panel=Date.now()-loadedAt;
    if(pathname.includes('shared-settings/v1/settings-grid.js'))requested.grid=Date.now()-loadedAt;
    if(pathname.includes('shared-source/v1/source-surface.js'))requested.source=Date.now()-loadedAt;
  });
  await page.route('https://agent-link.laity.bid/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const target=path.resolve(network,'.'+pathname);
    if(!target.startsWith(network+'/')||!fs.existsSync(target))return route.continue();
    if(pathname.endsWith('/manifest.json'))await new Promise(r=>setTimeout(r,4700));
    await route.fulfill({status:200,
      contentType:pathname.endsWith('.json')?'application/json':pathname.endsWith('.css')?'text/css':pathname.endsWith('.woff2')?'font/woff2':'text/javascript',
      headers:{'access-control-allow-origin':'*','cache-control':'no-store'},
      body:fs.readFileSync(target)});
    if(pathname.endsWith('/manifest.json'))manifestCompleted=true;
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
  await page.getByTestId('tab-settings').click();
  await page.waitForFunction(()=>{
    const e=document.querySelector('#settings-shared');
    return e?.dataset.ready==='true'&&e?.dataset.sourceReady==='true'&&e.querySelectorAll('.ag-row').length>3;
  },null,{timeout:15000});
  const readyMs=Date.now()-loadedAt;
  assert.equal(manifestCompleted,false,'shared component must render BEFORE delayed manifest response');
  assert.ok(requested.panel!=null&&requested.grid!=null&&requested.source!=null,
    JSON.stringify(requested));
  assert.ok(requested.grid-requested.panel<3000,JSON.stringify(requested));
  assert.ok(Math.abs(requested.grid-requested.source)<1800,
    'CodeMirror and AG must be requested concurrently rather than serially');
  assert.ok(readyMs<12000,`UI should load independently of an advisory version check, got ${readyMs}ms`);
  const firstPaint=await page.locator('#settings-shared').evaluate(e=>({version:e.version,rows:e.querySelectorAll('.ag-row').length,
    syntax:e.querySelector('laity-source-surface')?.getAttribute('syntax')}));
  assert.equal(firstPaint.version,'0.1.14');
  assert.equal(firstPaint.syntax,'jsonc');
  console.log('SHARED_SETTINGS_NONBLOCKING_LOAD_PASS',JSON.stringify({engine,readyMs,requestsMs:requested,manifestCompletedBeforeReady:manifestCompleted,...firstPaint}));
 }catch(error){console.error('SHARED_SETTINGS_NONBLOCKING_LOAD_FAIL',error);process.exitCode=1;}
 finally{await browser?.close();server.kill('SIGTERM');}
})();
