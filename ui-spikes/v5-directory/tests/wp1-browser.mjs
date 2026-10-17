import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(root,'../../../web-component-platform/node_modules/playwright'));
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.woff2':'font/woff2'};
let external=0,posts=0;
const server=createServer(async(req,res)=>{
 if(req.method!=='GET'&&req.method!=='HEAD'){posts++;res.writeHead(405).end();return}
 try{
  const route=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const file=resolve(root,'.'+(route==='/'?'/index.html':route));
  if(!file.startsWith(root+sep))throw Error('unsafe');
  const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-store'}).end(data);
 }catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:642}});const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==origin){external++;return route.abort()};return route.continue();
   });
   await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:20000});
   await page.waitForFunction(()=>window.__ocr2mdV5?.phase==='ready',{timeout:24000});
   await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.ready==='true', {timeout:40000});
   const state=await page.evaluate(()=>({
    modules:window.__ocr2mdV5.modules,
    settings:document.querySelector('laity-settings-panel')?.dataset.ready,
    source:document.querySelector('laity-settings-panel')?.dataset.sourceReady,
    tri:document.querySelector('laity-settings-panel')?.dataset.wcpLayout,
    ag:!!document.querySelector('laity-settings-panel')?._gridApi,
    actions:[...document.querySelectorAll('#v5-global-actions button, #v5-actions button')].map(x=>x.id),
    globalActions:[...document.querySelectorAll('#v5-global-actions button')].map(x=>x.id),
    tabs:[...document.querySelectorAll('#v5-tabs button')].map(x=>x.textContent),
    sourceLoaded:!!document.querySelector('laity-settings-panel')?._codeSurface,
    status:document.querySelector('#v5-status')?.textContent,
  }));
   console.log('V5_WP1_SETTINGS_STATE',JSON.stringify({engine:name,...state,errors}));
   assert.deepEqual(state.modules,['ocr2md:settings']);
   assert.equal(state.settings,'true');
   assert.equal(state.source,'true');
   assert.equal(state.tri,'tripane');
   assert.equal(state.ag,true);
   assert.equal(state.sourceLoaded,true);
   assert.equal(state.actions.length,5);
   assert.deepEqual(state.globalActions,['settings-undo','settings-redo','settings-save']);
   assert.equal(errors.length,0,'unexpected errors '+JSON.stringify(errors));
   await page.screenshot({path:'/private/tmp/ocr2md-v5-wp1-'+name+'.png'});
  }finally{await browser.close()}
 }
 assert.equal(external,0,'external network during WP1');assert.equal(posts,0,'unexpected POST');
 console.log('V5_WP1_SETTINGS_PASS',JSON.stringify({browsers:2,external,posts}));
}finally{await new Promise(done=>server.close(done))}
