/** OCR2MD V5 live development browser acceptance, LAN default. No Vault writes. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(import.meta.dirname,'../../../../web-component-platform/node_modules/playwright'));
const origin=process.env.OCR2MD_V5_PUBLIC_ORIGIN||'https://192.168.1.10:4443';
const info=await fetch(origin+'/release-info.json').then(r=>{assert.equal(r.status,200);return r.json()});
assert.match(info.buildId,/^v5-\d{6}-\d{6}$/);assert.equal(info.sharedSettings.version,'0.1.18');assert.equal(info.wcpVersion,'0.1.8');
for(const path of ['/v4-directory/','/v5-directory/'])assert.equal((await fetch(origin+path)).status,410);
for(const op of ['pair','list','stat','read'])assert.equal((await fetch(origin+'/__v3/fs?op='+op)).status,403);
for(const route of ['/plugins/filesystem/plugin.json','/plugins/filesystem/index.js','/plugins/filesystem/workspace-fs.js'])
 assert.equal((await fetch(origin+route)).status,404,'retired mixed module still publicly readable: '+route);
for(const [engineName,browserType] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await browserType.launch(engineName==='chromium'?{channel:'chrome'}:{});
 try{
  const ctx=await browser.newContext({viewport:{width:1032,height:642},
   ignoreHTTPSErrors:origin==='https://192.168.1.10:4443'});
  const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.__ocr2mdV5?.phase==='ready',{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.wcpLayout==='tripane',{timeout:55000});
  await page.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('release-info.json?releaseCheck=')),{timeout:12000});
  const state=await page.evaluate(()=>{
   const panel=document.querySelector('laity-settings-panel');const inventory=window.__ocr2mdV5.instance.getComponents();
   return {inventory,rows:panel.getComponentRows(),parameterIds:panel.getVisibleSettingIds(),
    frameBuild:document.querySelector('.wcp-app-build')?.textContent,
    mountedVersion:panel.version,wcpVersion:window.__ocr2mdV5.instance.version,frameHeight:document.querySelector('.wcp-app-mount').getBoundingClientRect().height,
    enabledToggleCount:panel.querySelectorAll('input[data-setting-enabled]').length,
    blankCells:panel.querySelectorAll('[data-component-placeholder]').length,
    source:panel.sourceText,
   };
  });
  assert.equal(state.frameBuild,info.buildId);assert.equal(state.mountedVersion,'0.1.18');
  assert.equal(state.wcpVersion,info.wcpVersion,'one WCP version must match manifest');
  assert.equal(await page.evaluate(async()=> (await import('./plugins/settings/settings.js')).settingsModule.isDirty()),false,
    'first initialization must not be marked dirty and prevent auto-refresh');
  assert.deepEqual(state.parameterIds,['sourceFontSize','sourceLineHeight','sourceComments','previewHeight','accentColor']);
  assert(state.frameHeight>400);
  assert.equal(state.inventory.length,3,'only WCP runtime + Settings + TriPane should be registered');
  for(const component of state.inventory){
   const matches=state.rows.filter(row=>row.componentModule===component.name);
   assert(matches.length>0,'missing component '+component.id);
   if(matches.every(row=>row.placeholder))assert.deepEqual(matches,[{
    componentModule:component.name,featureGroup:'',enabled:null,parameterName:'',value:'',placeholder:true}]);
  }
  assert(!state.inventory.some(x=>x.id==='ocr2md:filesystem'),'retired mixed legacy service must not be registered');
  assert.equal(state.blankCells,state.rows.filter(x=>x.placeholder).length);
  assert.equal(state.enabledToggleCount,state.parameterIds.length);
  assert(!state.source.includes('component:ocr2md:filesystem'));
  await page.locator('.wcp-app-version').click();
  const listed=await page.locator('.wcp-app-catalog-items li').evaluateAll(els=>els.map(x=>x.dataset.componentId));
  assert.deepEqual(listed,state.inventory.map(x=>x.id));
  await page.locator('.wcp-app-catalog [data-action="close"]').click();
  await page.locator('[data-action="settings-save"]').click();
  await page.waitForFunction(()=>!!localStorage.getItem('ocr2md-v5-ui-settings-v1'),{timeout:12000});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')));
  assert.equal(saved.sourceFontSize,13);
  assert(!Object.keys(saved).some(k=>k.startsWith('component:')));
  assert.deepEqual(errors,[]);
  console.log('V5_DEV_LIVE_DOUBLE_COMPONENT_GATE_PASS',JSON.stringify({engine:engineName,build:info.buildId,
   components:state.inventory.map(x=>x.id),rows:state.rows.length,blanks:state.blankCells,sourceSaved:true,errors}));
 }finally{await browser.close()}
}
