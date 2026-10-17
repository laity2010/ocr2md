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
const pdf={nodeId:'pdf-2',path:'/ocr2md/Alpha/Alpha.pdf',kind:'file',size:100,revision:'rev2',modifiedAt:'2026-10-17'};
const textfile={nodeId:'text-3',path:'/ocr2md/Alpha/notes.md',kind:'file',size:10,revision:'rev3',modifiedAt:'2026-10-17'};
const directory={nodeId:'dir-1',path:'/ocr2md/Alpha',kind:'directory',size:0,revision:'rev1',modifiedAt:'2026-10-17'};
const reply=(res,data,status=200)=>res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(data));
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
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
   assert.equal(await page.evaluate(()=>window.fixture.install(false)),'0.1.8');
   assert(await page.locator('[data-testid=blank-module]').count()===1);
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),0);
   assert.equal(calls.length,before);
   await page.evaluate(()=>window.fixture.remove());
   assert.equal(await page.locator('laity-wcp-workbench-v0-1-8').count(),0);
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
   assert.equal(await page.locator('body > #workspace-module-tools').count(),0,'global actions forbidden');
   await page.locator('[aria-label="选择目录 Alpha"]').click();
   await page.locator('[data-testid=workspace-set-root]').click();
   await page.locator('[data-testid=workspace-status]').getByText(/工作目录已选定/).waitFor({timeout:18000});
   await page.locator('[data-open-path="/ocr2md/Alpha"]').dblclick();
   await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').waitFor({timeout:15000});
   await page.locator('[data-open-path="/ocr2md/Alpha/notes.md"]').click();
   await page.locator('[data-testid=workspace-status]').getByText(/已选择 notes.md/).waitFor({timeout:15000});
   assert(calls.some(x=>x.op==='read'&&x.path===textfile.path));
   const current=await page.evaluate(()=>window.fixture.runtime.getComponents().map(x=>x.id));
   assert(current.includes('ocr2md:directory')&&current.includes('ocr2md:workspace'));
   console.log('WORKSPACE_WP0_ACTUAL_AG_CODE_AND_DIRECTORY_PASS',name,{calls:calls.length,current});
   // Switch calls the real WCP unmount, removes AG/Source and module toolbar.
   await page.evaluate(()=>window.fixture.runtime.selectModule('ocr2md:blank'));
   await page.locator('[data-testid=blank-module]').waitFor({timeout:18000});
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),0);
   assert.equal(await page.locator('[data-testid=workspace-module-tools]').count(),0);
   await page.evaluate(()=>window.fixture.remove());
   assert.equal(await page.locator('laity-wcp-workbench-v0-1-8').count(),0);
   const noRequest=calls.length;
   await page.waitForTimeout(600);
   assert.equal(calls.length,noRequest,'removed plugin must not poll backend');
   // Reinstall in the same page without modifying WCP or Settings.
   await page.evaluate(()=>window.fixture.install(true));
   await page.locator('[data-open-path="/ocr2md/Alpha"]').waitFor({timeout:20000});
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),1);
   assert.equal(await page.locator('[data-testid=workspace-module-tools]').count(),1);
   assert.equal(await page.locator('[data-testid=workspace-ag]').count(),1);
   const counts=await page.locator('[data-testid=workspace-component]').count();
   assert.equal(counts,1,'remount must not leave duplicate workspace DOM');
   await page.evaluate(()=>window.fixture.remove());
   assert.equal(await page.locator('[data-testid=workspace-component]').count(),0);
   assert(calls.every(x=>x.method==='GET'));
   assert.deepEqual(errors,[]);
   console.log('WORKSPACE_WP0_UNINSTALL_REINSTALL_PASS',name,{requests:calls.length,noWrite:true});
  }finally{await browser.close()}
 }
 console.log('WORKSPACE_WP0_WCP_BLACKBOX_LIFECYCLE_PASS',{browsers:2});
}finally{await new Promise(ok=>server.close(ok))}
