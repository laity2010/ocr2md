/** WP0 real WCP browser boot in Chromium + WebKit; never touches V4 or Vault.
 * Uses development Playwright from sibling WCP; not required by V5 runtime.
 */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {join,resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.V5_PLAYWRIGHT_PACKAGE||resolve(root,'../../../web-component-platform/node_modules/playwright'));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8'};
let posts=0,failedExternal=0;
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){posts++;res.writeHead(405).end('read-only WP0');return}
 try{
  const url=new URL(req.url,'http://localhost'),decoded=decodeURIComponent(url.pathname);
  const file=resolve(root,'.'+(decoded==='/'?'/index.html':decoded));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return}
  const bytes=await readFile(file);
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',
   'Cache-Control':'no-store'}).end(bytes);
 }catch{res.writeHead(404).end('missing')}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const address='http://127.0.0.1:'+server.address().port;
let checks=0;
try{
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch(name==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
  try{
   const page=await browser.newPage();
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==address){failedExternal++;return route.abort()}
    return route.continue();
   });
   await page.goto(address+'/',{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>['ready','error'].includes(window.__ocr2mdV5?.phase),{timeout:30000});
   const state=await page.evaluate(()=>({
    phase:window.__ocr2mdV5.phase,
    error:window.__ocr2mdV5.error||null,
    version:window.__ocr2mdV5.wcpVersion,
    modules:window.__ocr2mdV5.modules,
    nav:document.querySelectorAll('#v5-tabs button').length,
    status:document.querySelector('#v5-status')?.textContent,
    mounted:!!document.querySelector('laity-wcp-workbench-v0-1-7')?.shadowRoot?.querySelector('[data-testid=v5-wp0-bootstrap]'),
    wcpElements:document.querySelectorAll('laity-wcp-workbench-v0-1-7').length
   }));
   assert.equal(state.phase,'ready',name+' failed '+JSON.stringify({state,errors}));
   assert.equal(state.version,'0.1.7');
   assert.deepEqual(state.modules,['ocr2md:bootstrap']);
   assert.equal(state.nav,1);
   assert.equal(state.mounted,true);
   assert.equal(state.wcpElements,1);
   assert.deepEqual(errors,[]);
   console.log('V5_WP0_REAL_BROWSER_PASS',JSON.stringify({engine:name,...state}));
   checks+=6;
  }finally{await browser.close()}
 }
 assert.equal(posts,0,'any POST would violate WP0');
 assert.equal(failedExternal,0,'external requests would violate local-only bootstrap');
 console.log('V5_WP0_UI_GATE_PASS',JSON.stringify({browsers:2,assertions:checks,posts,externalRequests:failedExternal}));
}finally{await new Promise(ok=>server.close(ok))}
