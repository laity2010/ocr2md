/** OCR2MD V5 live development browser acceptance, LAN default. No Vault writes. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(import.meta.dirname,'../../../../web-component-platform/node_modules/playwright'));
const origin=process.env.OCR2MD_V5_PUBLIC_ORIGIN||'https://192.168.1.10:4443';
const info=await fetch(origin+'/release-info.json').then(r=>{assert.equal(r.status,200);return r.json()});
assert.match(info.buildId,/^v5-\d{6}-\d{6}$/);assert.equal(info.sharedSettings.version,'0.1.18');assert.equal(info.wcpVersion,'0.1.11');
for(const path of ['/v4-directory/','/v5-directory/'])assert.equal((await fetch(origin+path)).status,410);
for(const op of ['pair','stat','read'])assert.equal((await fetch(origin+'/__v3/fs?op='+op)).status,403);
assert.equal((await fetch(origin+'/__v3/fs?op=list&path=%2Focr2md')).status,401,
 'list must require existing Vault key even when gateway connects from localhost');
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
  assert.deepEqual(state.parameterIds,['sourceFontSize','sourceLineHeight','sourceComments','previewHeight','accentColor','workspaceRemember30Days']);
  assert(state.rows.some(row=>row.componentModule==='工作目录'&&row.parameterName==='记住此设备 30 天'&&row.value==='false'),
   'workspace remember option must be shown with default off');
  const columns=await page.evaluate(()=>document.querySelector('laity-settings-panel')._gridApi.getColumnDefs().map(c=>c.headerName));
  assert.deepEqual([...columns].sort(),['启用','组件模块','版本号','功能组','参数名','参数值'].sort());
  assert(state.frameHeight>400);
  assert.equal(state.inventory.length,5,'WCP + Settings + TriPane + Workspace + Directory service');
  for(const id of ['ocr2md:directory','ocr2md:workspace'])
   assert(state.inventory.some(item=>item.id===id),'Workspace component missing: '+id);
  for(const component of state.inventory.filter(c=>c.id!=='ocr2md:directory')){
   const matches=state.rows.filter(row=>row.componentModule===component.name);
   assert(matches.length>0,'missing component '+component.id);
   assert(matches.every(row=>row.componentVersion===component.version),'component version missing '+component.id);
   if(matches.every(row=>row.placeholder))assert.deepEqual(matches,[{
    componentModule:component.name,componentVersion:component.version,featureGroup:'',enabled:null,parameterName:'',value:'',placeholder:true}]);
  }
  assert(!state.rows.some(row=>row.componentModule==='只读工作目录服务'),
    'internal directory service must not appear in user settings');
  assert(!state.inventory.some(x=>x.id==='ocr2md:filesystem'),'retired mixed legacy service must not be registered');
  assert.equal(state.blankCells,state.rows.filter(x=>x.placeholder).length);
  assert.equal(state.enabledToggleCount,state.parameterIds.length);
  assert(!state.source.includes('component:ocr2md:filesystem'));
  assert.equal(await page.locator('.wcp-app-catalog').count(),0,'WCP badge must not show duplicate component catalog');
  assert.equal(await page.locator('.wcp-app-version').evaluate(el=>el.tagName),'DIV',
    'WCP badge should be noninteractive when its catalog is disabled');
  await page.locator('[data-action="settings-save"]').click();
  await page.waitForFunction(()=>!!localStorage.getItem('ocr2md-v5-ui-settings-v1'),{timeout:12000});
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')));
  assert.equal(saved.sourceFontSize,13);
  assert.equal(saved.workspaceRemember30Days,false);
  assert(!Object.keys(saved).some(k=>k.startsWith('component:')));
  // Exercise real AG editing of the VALUE, not the unrelated 'enabled' checkbox.
  await page.evaluate(()=>{
   const grid=document.querySelector('laity-settings-panel')._gridApi;
   grid.ensureNodeVisible(grid.getRowNode('workspaceRemember30Days'),'middle');
  });
  const rememberToggle=page.locator('laity-settings-panel [col-id="value"] input[data-setting-value="workspaceRemember30Days"]');
  await rememberToggle.check();
  await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.values.workspaceRemember30Days===true,
    {timeout:12000});
  await page.locator('[data-action="settings-save"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')||'{}').workspaceRemember30Days===true,
    {timeout:12000});
  assert.equal(await page.evaluate(()=>document.querySelector('laity-settings-panel').getComponentRows()
   .find(row=>row.parameterName==='记住此设备 30 天')?.value),'true');
  const toolbarTopSettings=await page.locator('.wcp-app-toolbar').evaluate(e=>e.getBoundingClientRect().top);
  await page.getByRole('tab',{name:'工作目录'}).click();
  const workspace=page.locator('[data-testid=workspace-component]');
  await workspace.waitFor({timeout:30000});
  await page.waitForFunction(()=>document.querySelector(
    '.wcp-app-module-actions [data-action="workspace-parent"]')!==null,
    null,{timeout:12000});
  const actionIds=await page.locator('.wcp-app-module-actions [data-action]').evaluateAll(
    els=>els.map(x=>x.dataset.action));
  assert.deepEqual(actionIds,['workspace-parent','workspace-refresh','workspace-set-root','workspace-layout-mode']);
  assert.equal(await page.locator('[data-testid=workspace-module-tools]').count(),0);
  await page.waitForFunction(root=>{
   const r=root?.querySelector('.ws-layout')?.getBoundingClientRect();
   return r?.height>=300;
  },await workspace.elementHandle(),{timeout:12000});
  const measures=await workspace.evaluate(root=>({
   toolbarTitleHidden:document.querySelector('.wcp-app-toolbar-title')?.hidden,
   toolbarPath:document.querySelector('.wcp-app-toolbar-context')?.textContent,
   agHeight:root.querySelector('.ws-layout').getBoundingClientRect().height,
   toolbarHeight:document.querySelector('.wcp-app-toolbar').getBoundingClientRect().height,
  }));
  const toolbarTopWorkspace=await page.locator('.wcp-app-toolbar').evaluate(e=>e.getBoundingClientRect().top);
  assert(Math.abs(toolbarTopWorkspace-toolbarTopSettings)<1,
    'module switch must not move common toolbar: '+toolbarTopSettings+' -> '+toolbarTopWorkspace);
  assert(measures.toolbarTitleHidden===true&&!measures.toolbarPath&&measures.toolbarHeight<60&&measures.agHeight>=300,
    'Workspace module toolbar consumes AG workspace: '+JSON.stringify(measures));
  await page.locator('.wcp-app-module-actions [data-action=workspace-layout-mode]').click();
  assert.equal(await page.locator('[data-testid=workspace-pathbar]').count(),0);
  const authState=await page.locator('[data-testid=workspace-connect]').isVisible();
  assert(authState,'real Vault must be credential-gated in a new browser');
  assert.equal(await page.locator('[data-testid=workspace-ag]').count(),1);
  await page.getByRole('tab',{name:'设置'}).click();
  assert(Math.abs(await page.locator('.wcp-app-toolbar').evaluate(e=>e.getBoundingClientRect().top)-toolbarTopSettings)<1);
  await page.locator('laity-settings-panel').waitFor({timeout:30000});
  assert.deepEqual(errors,[]);
  console.log('V5_DEV_LIVE_DOUBLE_COMPONENT_GATE_PASS',JSON.stringify({engine:engineName,build:info.buildId,
   components:state.inventory.map(x=>x.id),rows:state.rows.length,blanks:state.blankCells,sourceSaved:true,errors}));
 }finally{await browser.close()}
}
