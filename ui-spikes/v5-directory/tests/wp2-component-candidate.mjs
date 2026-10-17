/** Standalone WCP+shared Settings candidate, no production changes or Vault writes. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(root,'../../../web-component-platform/node_modules/playwright'));
// Candidate tests must load a fresh authoritative Shared Settings build, not
// the last stable mirror or a potentially stale deployed release.
const settingsBuildOutput=execFileSync('npm',['run','build'],{
 cwd:resolve(root,'../../../agent-link-monitor/shared-settings'),encoding:'utf8',timeout:90000});
const settingsBuildDir=resolve(JSON.parse(settingsBuildOutput.match(/FASTDEV_CANDIDATE_BUILD_OK\s+(\{[^\n]+\})/)[1]).directory);
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
let external=0,writes=0;
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'){writes++;res.writeHead(405).end();return}
 try{
  const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const builtPrefix='/vendor/shared-settings/v1/releases/0.1.18/';
  const builtFile=path.startsWith(builtPrefix)?path.slice(builtPrefix.length):'';
  const file=['settings-panel.js','settings-grid.js'].includes(builtFile)
   ?resolve(settingsBuildDir,builtFile):resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)&&!file.startsWith(settingsBuildDir+sep))throw Error('unsafe');
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(data);
 }catch{res.writeHead(404).end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,browserType] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await browserType.launch(name==='chromium'?{channel:'chrome'}:{});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:642}}),errors=[];
   page.on('pageerror',e=>{errors.push(e.message);console.log('V5_BROWSER_PAGEERROR',name,String(e).slice(0,1000))});
   page.on('requestfailed',r=>console.log('V5_BROWSER_REQUEST_FAILED',r.url(),r.failure()?.errorText));
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==url){external++;return route.abort()}
    return route.continue();
   });
   await page.goto(url+'/',{waitUntil:'domcontentloaded',timeout:25000});
   await page.waitForFunction(()=>['ready','error'].includes(window.__ocr2mdV5?.phase),null,{timeout:40000});
   console.log('WCP_COMPOSITION_BOOT',name,await page.evaluate(()=>({boot:window.__ocr2mdV5,body:document.body.textContent.slice(0,300)})));
   assert.equal(await page.evaluate(()=>window.__ocr2mdV5.phase),'ready');
   await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.wcpLayout==='tripane',{timeout:45000});
   const state=await page.evaluate(()=>{
    const panel=document.querySelector('laity-settings-panel');
    return {components:[...document.querySelectorAll('[data-component]')].map(x=>x.dataset.component),
      version:panel.version,publicReady:panel.isLayoutReady,privateTouched:false,
      layoutSlots:!!panel.getLayoutSlots()?.host,
      shown:panel.getVisibleSettingIds(),parameterNames:panel.getParameterNames(),
      componentRows:panel.getComponentRows(),inventory:window.__ocr2mdV5.instance.getComponents(),
      catalogWcp:document.querySelectorAll('.wcp-app-catalog-items li').length,
      blankEnabledCellCount:panel.querySelectorAll('[data-component-placeholder]')?.length??0,
      enabledToggleCount:panel.querySelectorAll('input[data-setting-enabled]').length,
      source:panel.sourceText,build:document.querySelector('.wcp-app-build')?.textContent,
      status:document.querySelector('.wcp-app-status-text')?.textContent,
      actions:[...document.querySelectorAll('.wcp-app-global-actions [data-action],.wcp-app-module-actions [data-action]')].map(x=>x.dataset.action),
      tabs:[...document.querySelectorAll('[role=tab]')].map(x=>x.textContent),
      wcpLayout:panel.dataset.wcpLayout,
      frameHeight:document.querySelector('.wcp-app-mount').getBoundingClientRect().height};
   });
   assert.deepEqual(state.components,['wcp:app-frame-v1']);
   assert.equal(state.version,'0.1.18');assert.equal(state.publicReady,true);
   assert.deepEqual(state.shown,['sourceFontSize','sourceLineHeight','sourceComments','previewHeight','accentColor','workspaceRemember30Days']);
   assert.equal(state.parameterNames.at(-1),'记住此设备 30 天');
   assert(state.parameterNames.includes('源码字号'));
   assert.equal(state.layoutSlots,true);assert.equal(state.frameHeight>400,true);
   // WCP owns the complete inventory; Settings displays only user-facing
   // entries. Internal services remain registered and visible in WCP diagnostics.
   assert(state.inventory.some(c=>c.id==='platform:wcp'),'WCP missing from real catalog');
   for(const item of state.inventory.filter(c=>c.id!=='ocr2md:directory')){
     const rows=state.componentRows.filter(r=>r.componentModule===item.name);
     assert(rows.every(r=>r.componentVersion===item.version),'registered version missing: '+item.id);
     assert(rows.length>0,'registered component not represented: '+item.id);
     if(rows.every(r=>r.placeholder)){
       assert.equal(rows.length,1,'exactly one blank row per setting-less component');
       assert.deepEqual(rows[0],{componentModule:item.name,componentVersion:item.version,featureGroup:'',enabled:null,
         parameterName:'',value:'',placeholder:true});
     }
   }
   const invIds=state.inventory.map(x=>x.id);
   assert.equal(new Set(invIds).size,invIds.length,'WCP registry must not duplicate IDs');
   assert(state.componentRows.some(r=>r.placeholder),'expect a system component without exposed settings');
   assert.equal(state.blankEnabledCellCount,state.componentRows.filter(r=>r.placeholder).length);
   assert.equal(state.enabledToggleCount,state.shown.length,'blank component rows cannot have enable checkboxes');
   assert(!state.inventory.some(r=>r.id==='ocr2md:filesystem'),'unconsumed mixed filesystem must not register');
   assert(state.inventory.some(r=>r.id==='ocr2md:workspace'),'workspace UI must be registered');
   assert(state.inventory.some(r=>r.id==='ocr2md:directory'),'directory service must be registered');
   assert(!state.componentRows.some(r=>r.componentModule==='只读工作目录服务'),
     'internal directory service must not create a Settings placeholder row');
   assert(state.componentRows.some(row=>row.componentModule==='工作目录'&&row.parameterName==='记住此设备 30 天'&&row.value==='false'),
    'Workspace setting must appear as a real editable AG row rather than an empty placeholder');
   const fields=await page.locator('laity-settings-panel').evaluate(e=>e._gridApi.getColumnDefs().map(c=>c.headerName));
   assert.deepEqual([...fields].sort(),['启用','组件模块','版本号','功能组','参数名','参数值'].sort(),
     'Settings must display an editable VALUE column');

   assert.equal(state.actions.length,5);assert.deepEqual(state.tabs,['工作目录','设置']);
   assert.equal(await page.locator('.wcp-app-catalog').count(),0,'version badge no longer opens component list');
   assert.equal(await page.locator('.wcp-app-version').evaluate(el=>el.tagName),'DIV');
   assert.deepEqual(errors,[]);
   await page.screenshot({path:'/private/tmp/ocr2md-v5-wcp-component-candidate-'+name+'-20261017.png'});
   await page.locator('[data-action="settings-save"]').click();
   await page.waitForFunction(()=>!!localStorage.getItem('ocr2md-v5-ui-settings-v1'),{timeout:12000});
   console.log('WCP_COMPONENT_API_V5_CANDIDATE_PASS',JSON.stringify({engine:name,components:state.components,settingsVersion:state.version,
    ids:state.shown,registered:state.inventory,placeholders:state.componentRows.filter(r=>r.placeholder),build:state.build,layout:state.wcpLayout,frameHeight:state.frameHeight,errors}));
  }finally{await browser.close()}
 }
 assert.equal(external,0);assert.equal(writes,0);
 console.log('WCP_COMPONENT_API_ISOLATION_PASS',JSON.stringify({external,writes,engines:2}));
}finally{await new Promise(done=>server.close(done))}
