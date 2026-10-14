/** Stage-only WCP 0.1.7 + real Shared Settings CDN, fake read-only Vault.
 * Prove navigation without crossing WCP ShadowRoot and no writes to Obsidian.
 */
import {chromium,webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as sleep} from 'node:timers/promises';
import {createServer} from 'node:net';
const root='/tmp/ocr2md-v4-workspace-stage';
const port=await new Promise((resolve,reject)=>{const server=createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const value=server.address().port;server.close(()=>resolve(value))})});
const origin='http://127.0.0.1:'+port;
const wcp=await readFile('../web-component-platform/.release-stage/wcp-workbench.js');
const sha=createHash('sha256').update(wcp).digest('hex');
const loader=await readFile('../web-component-platform/src/loader.js','utf8');
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const ws='obsidian-ocr2md',mod=(path,kind,id)=>({path,kind,nodeId:id,workspaceId:ws,size:kind==='file'?36:0,revision:'rev-1',modifiedAt:'2026-10-12T00:00:00Z'});
const home=[mod('/ocr2md/Book A','directory','book'),mod('/ocr2md/test.md','file','md')];
const book=[mod('/ocr2md/Book A/original.pdf','file','pdf'),mod('/ocr2md/Book A/notes.md','file','notes')];
const respond=(route,obj,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(obj)});
try{
 let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error('STAGE_SERVER_EXITED');try{if((await fetch(origin+'/v4-directory/')).ok){ready=true;break}}catch{}await sleep(160)}
 assert.ok(ready,'static stage running');
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:642},isMobile:true,hasTouch:true,deviceScaleFactor:2});
   const errors=[],vaultWrites=[];
   page.on('pageerror',x=>errors.push(String(x)));
   await page.route('https://wcp.laity.bid/components/v1/**',async route=>{
    const url=new URL(route.request().url());const p=url.pathname;
    const headers={'access-control-allow-origin':'*','cache-control':'no-store','content-type':'text/javascript'};
    if(p.endsWith('loader.js'))return route.fulfill({status:200,headers,body:loader});
    if(p.endsWith('manifest.json'))return route.fulfill({status:200,headers:{...headers,'content-type':'application/json'},body:JSON.stringify({schemaVersion:1,stable:'0.1.7',previous:null,releases:[{version:'0.1.7',entry:'releases/0.1.7/wcp-workbench.js',sha256:sha,size:wcp.length,tag:'laity-wcp-workbench-v0-1-7'}]})});
    if(p.endsWith('0.1.7/wcp-workbench.js'))return route.fulfill({status:200,headers,body:wcp});
    return route.abort('blockedbyclient');
   });
   await page.route('**/__v3/fs**',async route=>{
    const r=route.request();if(r.method()!=='GET'){vaultWrites.push(r.url());return respond(route,{error:'read only'},403)}
    const q=new URL(r.url()).searchParams,op=q.get('op');
    const access=r.headers()['x-ocr2md-v3-key']==='fixture-key';
    if(op==='status')return respond(route,{authorized:access,rootLabel:'Obsidian/ocr2md',canPairLocally:false,workspaceId:ws});
    if(!access)return respond(route,{code:'EACCES',error:'Access required'},403);
    if(op==='bootstrap')return respond(route,{mounts:[],root:mod('/','directory','root'),page:{entries:[],generation:'1'}});
    if(op==='stat')return respond(route,mod(q.get('path'),'directory','root'));
    if(op==='list')return respond(route,{entries:q.get('path')==='/ocr2md'?home:book,generation:'test',nextCursor:''});
    if(op==='read')return respond(route,{base64:Buffer.from('# Read-only fixture text').toString('base64'),revision:'rev-1',totalBytes:24});
    return respond(route,{error:'unknown'},404);
   });
   await page.goto(origin+'/v4-directory/',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:60000});
   await page.locator('#settings-shared[data-ready="true"]').waitFor({timeout:45000});
   await page.waitForFunction(()=>document.querySelector('laity-wcp-workbench-v0-1-7')?.shadowRoot?.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:30000});
   const columns=await page.locator('#settings-shared').evaluate(e=>e._gridApi.getAllDisplayedColumns().map(c=>c.getColId()));
   assert.deepEqual(columns.slice(0,4),['componentModule','featureGroup','enabled','parameterName']);
   await page.locator('#tab-workspace').click();
   await page.locator('[data-testid="workspace-component"]').waitFor({timeout:55000});
   await page.locator('[data-testid="workspace-authorize"]').waitFor({timeout:12000});
   assert.equal(await page.locator('#tab-workspace').getAttribute('aria-selected'),'true');
   const reuse=page.locator('[data-testid="workspace-reuse-v3"]');
   await reuse.click();
   await page.locator('[data-testid="workspace-status"]').filter({hasText:'未找到 v3 保存的密钥'}).waitFor({timeout:16000});
   const mode=engine==='chromium'?'session':'local';
   await page.evaluate((store)=>{
     const target=store==='session'?sessionStorage:localStorage;
     target.setItem('ocr2md-v3-mac-vault-key','fixture-key');
   },mode);
   await reuse.click();
   await page.locator('[data-testid="workspace-connect"]').waitFor({state:'hidden',timeout:20000});
   const after=await page.evaluate((store)=>({
     old:(store==='session'?sessionStorage:localStorage).getItem('ocr2md-v3-mac-vault-key'),
     newSession:sessionStorage.getItem('ocr2md-v4-workspace-access-key'),
     newPersistent:localStorage.getItem('ocr2md-v4-workspace-access-key'),
   }),mode);
   assert.equal(after.old,'fixture-key','V3 credential preserved');
   assert.equal(after.newSession,'fixture-key','V4 auth placed in separate session');
   assert.equal(after.newPersistent,null,'V4 must not persist credential');
   await page.locator('[data-testid="workspace-ag"] .workspace-entry').first().waitFor({timeout:35000});
   await page.locator('[data-testid="workspace-ag"] .workspace-entry').first().dblclick();
   await page.locator('[data-testid="workspace-path"]').filter({hasText:'Book A'}).waitFor({timeout:20000});
   await page.locator('[data-testid="workspace-set-root"]').click();
   await page.locator('[data-testid="workspace-status"]').filter({hasText:'工作目录已选定'}).waitFor({timeout:20000});

   // Physical iPad gesture emulation: touch twice, not Playwright mouse dblclick.
   await page.locator('[data-testid="workspace-parent"]').click();
   await page.locator('[data-testid="workspace-path"]').filter({hasText:'Obsidian/ocr2md/ocr2md'}).waitFor({timeout:20000});
   const bookCell=page.locator('.workspace-entry[data-open-path="/ocr2md/Book A"]').first();
   const rect=await bookCell.boundingBox();assert.ok(rect,'Book A row found');
   await page.touchscreen.tap(rect.x+Math.min(35,rect.width/2),rect.y+rect.height/2);
   await page.waitForTimeout(120);
   await page.touchscreen.tap(rect.x+Math.min(35,rect.width/2),rect.y+rect.height/2);
   await page.locator('[data-testid="workspace-path"]').filter({hasText:'Book A'}).waitFor({timeout:20000});

   assert.deepEqual(vaultWrites,[]);
   await page.locator('#tab-settings').click();
   await page.locator('#settings-shared[data-ready="true"]').waitFor({timeout:35000});
   assert.equal(await page.locator('#tab-settings').getAttribute('aria-selected'),'true');
   assert.deepEqual(errors,[]);
   console.log('V4_WORKSPACE_BROWSER_PASS',JSON.stringify({engine,wcp:'0.1.7',settingsColumns:columns,workspace:'Book A',credentialReuse:mode,filesystemWrites:vaultWrites.length,errors:errors.length}));
   await page.close();
  }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM')}
