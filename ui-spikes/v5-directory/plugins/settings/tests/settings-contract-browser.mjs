/** Contract v1 acceptance: virtual plugin added entirely at the HTTP registry
 * boundary. No Settings, WCP, Workspace or on-disk fixture modifications.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const root=resolve(import.meta.dirname,'../../..');
const repo=resolve(root,'../..');
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(root,'../../../web-component-platform/node_modules/playwright'));
const sourceFiles=[resolve(root,'plugins/settings/settings.js'),resolve(root,'plugins/settings/ui-settings-model.js'),resolve(root,'plugins/settings/settings.schema.json'),resolve(root,'../../../agent-link-monitor/shared-settings/src/settings-panel.js')];
const sourceHash=async()=>Promise.all(sourceFiles.map(async p=>createHash('sha256').update(await readFile(p)).digest('hex')));
const originalHash=await sourceHash();
const buildText=execFileSync('npm',['run','build'],{cwd:resolve(root,'../../../agent-link-monitor/shared-settings'),timeout:95000,encoding:'utf8'});
const match=buildText.match(/FASTDEV_CANDIDATE_BUILD_OK\s+(\{[^\n]+\})/);
assert(match,'shared settings build report missing');
const settingsBuild=resolve(JSON.parse(match[1]).directory);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const virtualSchema=[
 {id:'fixtureEnabled',label:'插件开关',type:'boolean',defaultValue:false,component:'独立测试插件',featureGroup:'接口验收'},
 {id:'fixtureCount',label:'插件数量',type:'integer',min:1,max:9,defaultValue:3,component:'独立测试插件',featureGroup:'接口验收'},
 {id:'fixtureText',label:'插件文本',type:'string',defaultValue:'hello',pattern:'^[a-z]+$',component:'独立测试插件',featureGroup:'接口验收'},
];
let includeFixture=true;
const fixtureSource=`export const settings=${JSON.stringify(virtualSchema)};
export const contracts=[];
export const modules=[{id:'ocr2md:fixture',name:'独立测试插件',version:'1.0.0',presentation:'full',mount(host){host.textContent='独立测试插件';},unmount(host){host.replaceChildren();}}];`;
const baseRegistry=(await readFile(resolve(root,'plugins/registry.generated.js'),'utf8'));
const virtualRegistry=baseRegistry+`\nimport * as virtualPlugin from './fixture/index.js';\nplugins.push(Object.freeze({...virtualPlugin,manifest:Object.freeze({id:'ocr2md:fixture',kind:'ui',tab:'测试插件',home:false,order:98,actions:[]})}));\n`;
const server=createServer(async(req,res)=>{
 if(req.method!=='GET')return res.writeHead(405).end();
 try{
  const path=decodeURIComponent(new URL(req.url,'http://fixture.test').pathname);
  if(path==='/__v3/fs')return res.writeHead(401,{'Content-Type':'application/json'}).end('{"error":"UNAUTHORIZED"}');
  if(path==='/plugins/fixture/index.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(fixtureSource);
  if(path==='/plugins/registry.generated.js')return res.writeHead(200,{'Content-Type':'text/javascript'}).end(includeFixture?virtualRegistry:baseRegistry);
  const prefix='/vendor/shared-settings/v1/releases/0.1.18/';
  const sub=path.startsWith(prefix)?path.slice(prefix.length):'';
  const file=['settings-panel.js','settings-grid.js'].includes(sub)?resolve(settingsBuild,sub):resolve(root,'.'+(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)&&!file.startsWith(settingsBuild+sep))throw Error('unsafe');
  const data=await readFile(file);
  return res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(data);
 }catch{return res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const artifacts=resolve(repo,'.runtime/ocr2md-build-evidence/settings-contract-v1');
await mkdir(artifacts,{recursive:true,mode:0o700});
const expected=['sourceFontSize','sourceLineHeight','sourceComments','previewHeight','accentColor','workspaceRemember30Days','fixtureEnabled','fixtureCount','fixtureText'];
try{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch(engine==='chromium'?{channel:'chrome'}:{});
  const context=await browser.newContext({viewport:{width:1032,height:642}});
  try{
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const ready=async()=>{
    await page.waitForFunction(()=>window.__ocr2mdV5?.phase==='ready',{timeout:55000});
    await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.wcpLayout==='tripane',{timeout:60000});
   };
   await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:30000});await ready();
   const panel=page.locator('laity-settings-panel');
   const visible=await panel.evaluate(e=>e.getVisibleSettingIds());
   assert.deepEqual(visible,expected,'Plugin registration must be automatically discovered');
   const rows=await panel.evaluate(e=>e.getComponentRows().filter(x=>x.componentModule==='独立测试插件'));
   assert.deepEqual(rows.map(x=>x.parameterName),['插件开关','插件数量','插件文本']);
   await page.evaluate(()=>{window.contractNotifications=[];document.addEventListener('wcp:settings:changed-v1',e=>window.contractNotifications.push(e.detail))});
   const ensure=id=>panel.evaluate((e,id)=>e._gridApi.ensureNodeVisible(e._gridApi.getRowNode(id),'middle'),id);
   await ensure('fixtureEnabled');
   await page.locator('laity-settings-panel [col-id="value"] input[data-setting-value="fixtureEnabled"]').check();
   await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.values.fixtureEnabled===true);
   for(const [id,value] of [['fixtureCount','7'],['fixtureText','edited']]){
    await ensure(id);
    // AG Grid's public row API drives the same onCellValueChanged callback as
    // the inline editor. This avoids timing sensitivity in WebKit recycled DOM
    // while checking the real rendered AG→model→save path.
    await panel.evaluate((element,{id,value})=>element._gridApi.getRowNode(id).setDataValue('value',value),{id,value});
    await page.waitForFunction(({id,value})=>String(document.querySelector('laity-settings-panel')?.values[id])===value,{id,value},{timeout:8500});
   }
   await ensure('fixtureText');
   await page.screenshot({path:resolve(artifacts,engine+'-registered.png'),animations:'disabled'});
   await page.locator('[data-action="settings-save"]').click();
   await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')||'{}').fixtureText==='edited',{timeout:10000});
   const result=await page.evaluate(()=>({stored:JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')),
    notices:window.contractNotifications.filter(x=>x.ownerId==='ocr2md:fixture'),
    read:(()=>{let data;document.dispatchEvent(new CustomEvent('wcp:settings:read-v1',{detail:{ownerId:'ocr2md:fixture',reply:v=>{data=v}}}));return data})()}));
   const values={fixtureEnabled:true,fixtureCount:7,fixtureText:'edited'};
   assert.deepEqual(result.read,values);
   assert.deepEqual(result.notices.at(-1)?.values,values);
   assert.equal(result.stored.workspaceRemember30Days,false);
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   assert.deepEqual(await panel.evaluate(e=>({enabled:e.values.fixtureEnabled,count:e.values.fixtureCount,text:e.values.fixtureText})),{enabled:true,count:7,text:'edited'});
   includeFixture=false;
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   assert.deepEqual(await panel.evaluate(e=>e.getVisibleSettingIds()),expected.slice(0,6));
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')).fixtureText),'edited');
   includeFixture=true;
   await page.reload({waitUntil:'domcontentloaded'});await ready();
   assert.equal(await panel.evaluate(e=>e.values.fixtureText),'edited');
   assert.deepEqual(errors,[]);
   assert.deepEqual(await sourceHash(),originalHash,'Settings source changed by plugin install/uninstall');
   console.log('SETTINGS_CONTRACT_V1_BROWSER_PASS',JSON.stringify({engine,registered:3,storedValues:values,
    reload:true,removeAndRestore:true,settingsSourceUnchanged:true,errors}));
  }finally{await context.close();await browser.close();includeFixture=true}
 }
}finally{await new Promise(resolve=>server.close(resolve))}
