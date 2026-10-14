/** WP0: failed first layout + retry must not load data into an orphan view.
 * Real book/PDF reads only; every Vault write is rejected. The initial layout
 * failure is injected, rather than claiming to emulate an actual iPad stack.
 */
import {webkit,chromium} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.env.V4_RECOVERY_ROOT??'ui-spikes/v4-directory');
const base=process.env.V4_RECOVERY_URL??'http://127.0.0.1:4176/v4-wp3-candidate/';
const fromDisk=process.env.V4_RECOVERY_DEPLOYED!=='1';
const book='/ocr2md/Bufett’s Alpha';
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
const diagnostics=resolve('.tmp/wp0-20261014-regression');await mkdir(diagnostics,{recursive:true});
for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
 if(process.env.V4_RECOVERY_ENGINE&&name!==process.env.V4_RECOVERY_ENGINE)continue;
 const browser=await engine.launch(name==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1032,height:642},isMobile:true,hasTouch:true,ignoreHTTPSErrors:true});
  const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/__v3/**',route=>{
   if(route.request().method()==='GET')return route.continue();
   writes.push(new URL(route.request().url()).pathname);
   return route.fulfill({status:403,contentType:'application/json',body:'{"error":"WP0_READ_ONLY"}'});
  });
  if(fromDisk)await page.route(base+'**',async route=>{
   const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice(new URL(base).pathname.length))||'index.html';
   if(rel.startsWith('/')||rel.split('/').includes('..'))return route.abort();
   try{return route.fulfill({status:200,contentType:mime[extname(rel)]??'application/octet-stream',body:await readFile(join(root,rel))})}
   catch{return route.fulfill({status:404,body:'not found'})}
  });
  await page.addInitScript(()=>{
   const original=window.getComputedStyle;let first=true;
   window.getComputedStyle=function(element,...rest){
    const style=original.call(this,element,...rest);
    if(first&&element.id==='boundary-layout'){
     first=false;window.__wp0LayoutFailureInjected=true;
     return new Proxy(style,{get:(target,key)=>key==='position'?'static':Reflect.get(target,key,target)});
    }
    return style;
   };
  });
  const active=async id=>{
   await page.waitForFunction(id=>document.body.dataset.v4ActiveModule===id,id,{timeout:30000});
  };
  const snapshot=()=>page.evaluate(()=>{
   const residents=[...document.querySelectorAll('[data-boundary-resident]')];
   const visible=residents.find(el=>!el.hasAttribute('aria-hidden'));
   const inside=el=>{const r=el?.getBoundingClientRect();return Boolean(r&&r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight)};
   return {residents:residents.length,filterCount:document.querySelectorAll('#ir-only-h1').length,
    navigation:document.querySelector('#v4-workbench-path-nav')?.options.length??0,
    visibleRows:visible?.querySelectorAll('#workbench-ir-grid [role=row]').length??0,
    sourceCharacters:visible?.querySelector('#workbench-ir-source [contenteditable=true]')?.textContent?.length??0,
    sourceVisible:inside(visible?.querySelector('#workbench-ir-source [contenteditable=true]')),
    pdfReady:visible?.querySelector('#boundary-pdf-view')?.dataset.pdfPhase==='ready',
    pdfVisible:inside(visible?.querySelector('#boundary-pdf-view canvas')),
    recoveryInjected:window.__wp0LayoutFailureInjected===true};
  });
  try{
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:65000});
   await page.getByTestId('tab-chapter-boundary').click();await active('chapter-boundary');
   const failed=await snapshot();assert.equal(failed.recoveryInjected,true);
   await page.getByTestId('tab-workspace').click();await active('workspace');
   await page.getByTestId('tab-chapter-boundary').click();await active('chapter-boundary');
   await page.getByTestId('tab-workspace').click();await active('workspace');
   await page.locator('[data-open-path="'+book+'"]').dblclick();
   await page.getByTestId('workspace-set-root').click();await active('chapter-boundary');
   await page.waitForFunction(()=>document.querySelector('#workbench-ir-source')?.dataset.irRestoreSource==='saved-dirjson',null,{timeout:65000});
   await page.waitForFunction(()=>document.querySelector('#boundary-pdf-view')?.dataset.pdfPhase==='ready',null,{timeout:45000});
   const loaded=await snapshot();
   await page.screenshot({path:join(diagnostics,'mount-recovery-'+name+'.png')});
   console.log('WP0_MOUNT_RECOVERY_EVIDENCE',JSON.stringify({name,failed,loaded,errors,writes}));
   assert.equal(loaded.residents,1,'failed layout must leave no orphan resident');
   assert.equal(loaded.filterCount,1,'toolbar controls must not duplicate');
   assert.ok(loaded.navigation>1,'selecting a book after empty workbench must populate navigation');
   assert.ok(loaded.visibleRows>1,'real AG rows must be in the visible resident');
   assert.ok(loaded.sourceCharacters>1000&&loaded.sourceVisible,'real source must be in the visible resident');
   assert.ok(loaded.pdfReady&&loaded.pdfVisible,'real PDF must be in the visible resident');
   const firstChapter=await page.locator('#v4-workbench-path-nav option').last().getAttribute('value');
   await page.locator('#v4-workbench-path-nav').selectOption(firstChapter);await active('chapter-cleaning');
   await page.waitForFunction(()=>document.querySelector('#chapter-clean-source [contenteditable=true]')?.textContent?.length>0,null,{timeout:40000});
   await page.locator('#v4-workbench-path-nav').selectOption(book);await active('chapter-boundary');
   await page.waitForFunction(()=>!document.querySelector('#tab-settings').disabled,null,{timeout:60000});
   await page.getByTestId('tab-settings').click();await active('settings');
   await page.getByTestId('tab-chapter-boundary').click();await active('chapter-boundary');
   const after=await snapshot();assert.equal(after.residents,1);assert.ok(after.visibleRows>1&&after.sourceVisible&&after.pdfVisible);
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
   console.log('WP0_BASIC_WORKFLOW_PASS',JSON.stringify({name,loaded,after,realVaultWrites:0}));
  }finally{await page.close()}
 }finally{await browser.close()}
}
