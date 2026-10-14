/** Read-only UIC: OCR2MD V3 opens at the real Obsidian/ocr2md/ocr2md home. */
const {spawn}=require('node:child_process');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const port=30000+Math.floor(Math.random()*27000);
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
(async()=>{let browser;
try{
 for(let i=0;i<85;i++){try{if((await fetch(`http://127.0.0.1:${port}/index.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,110));}
 browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 // Static fixture is mounted at /index.html unlike production /v3-directory/.
 // Disable SW so it cannot claim /__v3/fs and bypass the test's API proxy.
 const context=await browser.newContext({viewport:{width:1130,height:840},serviceWorkers:'block'});
 const page=await context.newPage();
 const loadedDirectories=[];
 await page.route('**/__v3/fs?*',async route=>{
  const parsed=new URL(route.request().url());
  if(parsed.searchParams.get('op')==='list')loadedDirectories.push(parsed.searchParams.get('path'));
  const target=`http://127.0.0.1:4176${parsed.pathname}${parsed.search}`;
  const response=await route.fetch({url:target});await route.fulfill({response});
 });
 // Work-directory load must not wait for global Shared Settings.
 await page.route('https://agent-link.laity.bid/shared-settings/v1/settings-panel.js*',async route=>{
  await new Promise(r=>setTimeout(r,3500));await route.continue();
 });
 await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md'
   && !!document.querySelector('[data-open-path="/ocr2md/2022"]'),null,{timeout:28000});
 assert.equal(await page.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
 assert.equal(await page.getByTestId('directory-path').textContent(),'Obsidian/ocr2md/ocr2md');
 assert.equal(await page.getByTestId('directory-parent').isDisabled(),true);
 assert.equal(await page.locator('[data-open-path="/ocr2md"][data-kind="directory"]').count(),0,'no nested redundant OCR root row');
 assert.equal(await page.locator('[data-open-path="/books"]').count(),0,'parent Vault tools not shown at book root');
 assert.ok(loadedDirectories.includes('/ocr2md'),'app must list book home');
 assert.equal(loadedDirectories.includes('/'),false,'must not list underlying vault root first');
 assert.equal(await page.locator('#directory-grid-shell').getAttribute('aria-busy'),'false');
 // A subdirectory remains navigable; back stops at the specified home.
 // Same touch double-tap semantics as iPad Safari; AG redraw replaces cells
 // after the first click, so native Playwright dblclick can hit a stale cell.
 await page.locator('[data-open-path="/ocr2md/2022"]').evaluate(button=>{
   button.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,detail:2}));
 });
 await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/2022',null,{timeout:6000}).catch(async e=>{
   console.log('NAVIGATION_DIAG',JSON.stringify({dirs:loadedDirectories,path:await page.locator('#directory-path').textContent(),status:await page.locator('#status').textContent(),busy:await page.locator('#directory-grid-shell').getAttribute('aria-busy'),button:await page.locator('[data-open-path="/ocr2md/2022"]').count()}));
   throw e;
 });
 assert.equal(await page.getByTestId('directory-parent').isEnabled(),true);
 await page.getByTestId('directory-parent').click();
 await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md',null,{timeout:15000});
 assert.equal(await page.getByTestId('directory-parent').isDisabled(),true);
 assert.ok(loadedDirectories.every(x=>x.startsWith('/ocr2md')),'no browse above book root');
 console.log('OCR2MD_V3_DIRECTORY_DEFAULT_ROOT_PASS',JSON.stringify({engine,root:'Obsidian/ocr2md/ocr2md',readOnly:true,dirs:loadedDirectories}));
}catch(e){console.error('OCR2MD_V3_DIRECTORY_DEFAULT_ROOT_FAIL',e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
