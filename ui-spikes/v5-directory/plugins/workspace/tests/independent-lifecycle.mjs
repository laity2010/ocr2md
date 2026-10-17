/** WP0 ownership gate: real WCP public loader, real AG+source components,
 * a sealed synthetic GET-only Vault (no real Vault or production writes).
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const root=resolve(import.meta.dirname,'../../..');
const {chromium,webkit}=require(resolve(root,'../../../web-component-platform/node_modules/playwright'));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const calls=[];
const rememberCalls=[];
const pdf={nodeId:'pdf-2',path:'/ocr2md/Alpha/Alpha.pdf',kind:'file',size:100,revision:'rev2',modifiedAt:'2026-10-17'};
const textfile={nodeId:'text-3',path:'/ocr2md/Alpha/notes.md',kind:'file',size:10,revision:'rev3',modifiedAt:'2026-10-17'};
const directory={nodeId:'dir-1',path:'/ocr2md/Alpha',kind:'directory',size:0,revision:'rev1',modifiedAt:'2026-10-17'};
const reply=(res,data,status=200)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(data));
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/__v5/auth/remember'&&req.method==='POST'){
  let raw='';for await (const chunk of req)raw+=chunk;
  const remember=JSON.parse(raw).remember;
  rememberCalls.push({remember,hasKey:Boolean(req.headers['x-ocr2md-v3-key']),method:req.method});
  return reply(res,{remembered:remember});
 }
 if(req.method!=='GET')throw Error('WP0_FORBIDDEN_SERVER_MUTATION');
 if(url.pathname==='/__v3/fs'){
  const op=url.searchParams.get('op'),path=url.searchParams.get('path');
  const authorized=req.headers['x-ocr2md-v3-key']==='wp0-secret';
  calls.push({op,path,authorized,method:req.method});
  if(op==='status')return reply(res,{authorized,canPairLocally:false,rootLabel:'Obsidian/ocr2md',error:authorized?'':'需要授权'});
  if(!authorized)return reply(res,{error:'UNAUTHORIZED'},403);
  if(op==='list'){
   if(path==='/ocr2md')return reply(res,{entries:[directory],generation:'fixture',nextCursor:''});
   if(path==='/ocr2md/Alpha')return reply(res,{entries:[pdf,textfile],generation:'fixture',nextCursor:''});
   return reply(res,{error:'NOT_FOUND'},404);
  }
  if(op==='read'&&path===textfile.path)return reply(res,{base64:Buffer.from('# Alpha\n', 'utf8').toString('base64'),totalBytes:8,revision:'rev3'});
  return reply(res,{error:'WP0_UNSUPPORTED_REQUEST'},400);
 }
 if(url.pathname==='/')return res.writeHead(200,{'Content-Type':'text/html'}).end(`<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>html,body{margin:0;height:100%;background:#1d2732}#host{height:640px;width:1032px}</style></head><body><div id="host"></div></body></html>`);
 const file=resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+sep))return res.writeHead(404).end();
 try{const bytes=await readFile(file);return res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(bytes)}
 catch{return res.writeHead(404).end()}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch(name==='chromium'?{channel:'chrome'}:{});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',err=>errors.push(String(err)));
   page.on('requestfailed',r=>errors.push('request '+r.url()+' '+r.failure()?.errorText));
   await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
   await page.evaluate(async()=>{
    const api=await import('/vendor/wcp/components/v1/loader.js');
    const pkg=await import('/plugins/workspace/index.js');
    window.fixture={api,pkg};
    window.fixture.blank={id:'ocr2md:blank',name:'空白模块',version:'1.0.0',presentation:'full',
     mount(host){const span=document.createElement('span');span.dataset.testid='blank-module';span.textContent='空白模块';host.append(span)},
     unmount(host){host.replaceChildren()}};
    window.fixture.install=async enabled=>{
     const modules=enabled?[...pkg.modules,window.fixture.blank]:[window.fixture.blank];
     const contracts=enabled?pkg.contracts:[];
     const runtime=await api.mountWcp(document.getElementById('host'),{
       appId:'workspace-wp0-test',modules,contracts,hostChrome:'external',
       allowedBuiltinPlugins:[],initialModuleId:enabled?'ocr2md:workspace':'ocr2md:blank',autoApply:false,
     });
     window.fixture.runtime=runtime;
     return runtime.version;
    };
    window.fixture.remove=()=>{window.fixture.runtime?.dispose();window.fixture.runtime=null};
   });
   // Disabled: module not in WCP catalog and no backend calls.
   const before=calls.length;
   assert.equal(await page.evaluate(()=>window.fixture.install(false)),'0.1.11');
   assert(await page.locator('[data-testid=blank-module]').count()===1);
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),0);
   assert.equal(calls.length,before);
   await page.evaluate(()=>window.fixture.remove());
   assert.equal(await page.locator('laity-wcp-workbench-v0-1-10').count(),0);
   console.log('WORKSPACE_WP0_DISABLED_NO_SIDE_EFFECT_PASS',name);
   // Install: require authorization, only directory GETs.
   await page.evaluate(()=>window.fixture.install(true));
   await page.locator('[data-testid=workspace-component]').waitFor({timeout:30000});
   await page.locator('[data-testid=workspace-connect]').waitFor();
   await page.locator('[aria-label="Mac Vault 访问密钥"]').fill('wp0-secret');
   await page.locator('[data-testid=workspace-authorize]').click();
   await page.locator('[data-open-path="/ocr2md/Alpha"]').waitFor({timeout:20000});
   assert.equal(await page.locator('[data-testid=workspace-ag]').count(),1);
   assert.equal(await page.locator('[data-testid=workspace-source]').count(),1);
   assert.equal(await page.locator('[data-testid=workspace-module-tools]').count(),0,
     'buttons must be provided by AppFrame, not duplicated within workspace content');
   await page.locator('[aria-label="选择目录 Alpha"]').click();
   await page.locator('[data-testid=workspace-status]').getByText(/已选择 Alpha/).waitFor({state:'attached',timeout:10000});
   assert.equal(await page.locator('[data-testid=workspace-status]').isVisible(),false,
     'normal selection status must not occupy a row above AG');
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('wcp:app-action',
     {detail:{id:'workspace-set-root'}})));
   await page.locator('[data-testid=workspace-status]').getByText(/工作目录已选定/).waitFor({state:'attached',timeout:18000});
   await page.evaluate(()=>{
    window.rememberNotices=[];
    document.addEventListener('wcp:module-status',e=>window.rememberNotices.push(e.detail?.message));
    document.dispatchEvent(new CustomEvent('wcp:settings:changed-v1',{
     detail:{ownerId:'ocr2md:workspace',values:{workspaceRemember30Days:true}}}));
   });
   await page.waitForFunction(()=>window.rememberNotices.some(x=>x?.includes('30 天')),{timeout:12000});
   assert(rememberCalls.at(-1)?.remember===true&&rememberCalls.at(-1)?.hasKey);
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('wcp:settings:changed-v1',{
    detail:{ownerId:'ocr2md:workspace',values:{workspaceRemember30Days:false}}})));
   await page.waitForTimeout(300);
   assert.equal(rememberCalls.at(-1)?.remember,false);
   assert.equal(rememberCalls.at(-1)?.hasKey,false,'forget must not send a Vault key');
   await page.locator('[data-open-path="/ocr2md/Alpha"]').dblclick();
   await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').waitFor({timeout:15000});
   await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').click();
   await page.locator('[data-testid=workspace-status]').getByText(/已选择 notes.md/).waitFor({state:'attached',timeout:15000});
   assert(!calls.some(x=>x.op==='read'||x.op==='pair'||x.op==='stat'));
   const current=await page.evaluate(()=>window.fixture.runtime.getComponents().map(x=>x.id));
   assert(current.includes('ocr2md:directory')&&current.includes('ocr2md:workspace'));
   console.log('WORKSPACE_V5_ACTUAL_AG_METADATA_AND_DIRECTORY_PASS',name,{calls:calls.length,current});
   // Switching tabs must preserve the SAME mounted AG/source/Dockview DOM,
   // not merely reconstruct an empty panel around cached JSON rows.
   await page.locator('[data-testid=workspace-component]').evaluate(el=>{
    window.workspaceLiveView=el;
    window.workspaceLiveGrid=el.querySelector('[data-testid=workspace-ag]');
    window.workspaceLiveSource=el.querySelector('[data-testid=workspace-source]');
    window.workspaceSourceReadyAfterFirstMount=0;
    document.addEventListener('laity-source-ready',()=>window.workspaceSourceReadyAfterFirstMount++);
   });
   const listBeforeSwitch=calls.filter(x=>x.op==='list').length;
   const statusBeforeSwitch=calls.filter(x=>x.op==='status').length;
   const cssLink=page.locator('#ocr2md-workspace-resident link[href*="ag-grid-base.min.css"]');
   assert.equal(await cssLink.getAttribute('media'),'all',
    'Workspace grid structural CSS must be active while Workspace is visible');
   await page.evaluate(()=>window.fixture.runtime.selectModule('ocr2md:blank'));
   await page.locator('[data-testid=blank-module]').waitFor({timeout:18000});
   assert.equal(await cssLink.getAttribute('media'),'not all',
    'inactive Workspace must not leak the legacy light AG theme into Settings');
   assert.equal(await page.locator('#ocr2md-workspace-resident').getAttribute('aria-hidden'),'true',
    'parked workspace must be inert and hidden outside the WCP module viewport');
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),1,
    'workspace view must stay connected to avoid destroying its CodeMirror');
   assert.equal(await page.locator('[data-testid=workspace-module-tools]').count(),0);
   await page.evaluate(()=>window.fixture.runtime.selectModule('ocr2md:workspace'));
   await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').waitFor({timeout:20000});
   assert.equal(await cssLink.getAttribute('media'),'all',
    'restored Workspace must re-enable its AG stylesheet');
   assert.equal(await page.locator('#ocr2md-workspace-resident').getAttribute('aria-hidden'),null);
   assert.equal(await page.locator('[data-testid=workspace-component]').evaluate(el=>
    el===window.workspaceLiveView && el.querySelector('[data-testid=workspace-ag]')===window.workspaceLiveGrid
      && el.querySelector('[data-testid=workspace-source]')===window.workspaceLiveSource
      && el.isConnected),true,
     'switching back must reattach the original AG/Source DOM, not recreate it');
   assert.equal(await page.evaluate(()=>window.workspaceSourceReadyAfterFirstMount),0,
    'CodeMirror must stay connected without firing another ready event');
   assert.equal(calls.filter(x=>x.op==='list').length,listBeforeSwitch,
     'switching back to workspace must restore cached directory without list request');
   assert.equal(calls.filter(x=>x.op==='status').length,statusBeforeSwitch,
     'switching back must not re-check Vault or flash the authorization panel');
   assert.equal(await page.locator('[data-testid=workspace-connect]').isVisible(),false);
   // Seeing notes.md after remount confirms navigation stayed in Alpha; no path label needed.
   assert.equal(await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').count(),1);
   // Manual Refresh is the explicit request to fetch the directory again.
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('wcp:app-action',
     {detail:{id:'workspace-refresh'}})));
   for(let attempt=0;attempt<60&&calls.filter(x=>x.op==='list').length===listBeforeSwitch;attempt++)
    await page.waitForTimeout(100);
   await page.locator('[data-testid=workspace-status]').getByText(/^已加载 /).waitFor({state:'attached',timeout:15000});
   assert.equal(calls.filter(x=>x.op==='list').length,listBeforeSwitch+1,
     'workspace-refresh must fetch the selected directory exactly once');
   const listAfterRefresh=calls.filter(x=>x.op==='list').length;
   await page.evaluate(()=>window.fixture.remove());
   assert.equal(await page.locator('laity-wcp-workbench-v0-1-10').count(),0);
   assert.equal(await cssLink.getAttribute('media'),'not all',
    'uninstalled Workspace must keep its global stylesheet inactive');
   const noRequest=calls.length;
   await page.waitForTimeout(600);
   assert.equal(calls.length,noRequest,'removed plugin must not poll backend');
   // Reinstall in the same page without modifying WCP or Settings.
   await page.evaluate(()=>window.fixture.install(true));
   await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').waitFor({timeout:20000});
   assert.equal(await page.locator('[data-testid=workspace-component]').evaluate(el=>
    el===window.workspaceLiveView),true,
    'a newly created WCP host in the same page must reuse our existing view');
   assert.equal(calls.filter(x=>x.op==='list').length,listAfterRefresh,
     'reinstall in the same page session must not implicitly refresh');
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),1);
   assert.equal(await page.locator('[data-testid=workspace-pathbar]').count(),0);
   assert.equal(await page.locator('[data-testid=workspace-ag]').count(),1);
   const counts=await page.locator('[data-testid=workspace-component]').count();
   assert.equal(counts,1,'remount must not leave duplicate workspace DOM');
   await page.evaluate(()=>window.fixture.remove());
   assert.equal(await page.locator('#ocr2md-workspace-resident').getAttribute('aria-hidden'),'true');
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),1);
   assert(calls.every(x=>x.method==='GET'));
   assert.deepEqual(errors,[]);
   console.log('WORKSPACE_WP0_UNINSTALL_REINSTALL_PASS',name,{requests:calls.length,noWrite:true});
  }finally{await browser.close()}
 }
 console.log('WORKSPACE_WP0_WCP_BLACKBOX_LIFECYCLE_PASS',{browsers:2});
}finally{await new Promise(ok=>server.close(ok))}
