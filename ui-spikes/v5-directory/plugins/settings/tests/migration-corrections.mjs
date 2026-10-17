/** V5 Settings-only migration remediation: same original V4 schema, user-visible
 * AG parameter IDs, inactive chapter section hidden, latent values preserved. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {dirname,resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(resolve(root,'../../..','web-component-platform/node_modules/playwright'));
const sourceSchema=await readFile(resolve(root,'../v4-directory/plugins/settings/settings.schema.json'));
const newSchema=await readFile(resolve(root,'plugins/settings/settings.schema.json'));
assert.equal(sourceSchema.compare(newSchema),0,'frozen V4 schema was altered');
const schema=JSON.parse(newSchema.toString());
const shownIds=schema.filter(e=>e.group!=='章节定界').map(e=>e.id);
const hiddenIds=schema.filter(e=>e.group==='章节定界').map(e=>e.id);
assert.equal(shownIds.length,5);assert.equal(hiddenIds.length,3);
const mimetype={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'};
const server=createServer(async(req,res)=>{
 try{
  const route=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=resolve(root,'.'+(route==='/'?'/index.html':route));
  if(!file.startsWith(root+sep))throw Error('unsafe');
  const data=await readFile(file);
  res.writeHead(200,{'Content-Type':mimetype[extname(file)]||'application/octet-stream'}).end(data);
 }catch{res.writeHead(404).end()}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await engine.launch(name==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
  try{
   const ctx=await browser.newContext({viewport:{width:1032,height:642}});
   const previouslySaved={sourceFontSize:13,sourceLineHeight:1.5,sourceComments:true,previewHeight:30,
    accentColor:'#83c092',chapterAgColumnsLocked:false,chapterAgFontSize:19,chapterTitleFontScale:1.7};
   await ctx.addInitScript(({saved})=>{
    localStorage.setItem('ocr2md-v5-ui-settings-v1',JSON.stringify(saved));
   },{saved:previouslySaved});
   const page=await ctx.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('laity-settings-panel')?.dataset.wcpLayout==='tripane', {timeout:60000});
   const state=await page.evaluate(()=>{
    const panel=document.querySelector('laity-settings-panel');const api=panel._gridApi;
    const col=api.getColumnDefs().find(c=>c.field==='parameterName');
    const rows=[];api.forEachNode(row=>rows.push({id:row.data?.id,originalLabel:row.data?.parameterName,
      displayed:col?.valueGetter?.({data:row.data})??row.data?.parameterName}));
    return {rows,source:panel._codeSurface?.value||'',schema:panel.settingsSchema,
      storageBefore:JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1'))};
   });
   assert.deepEqual(state.rows.map(r=>r.id),shownIds);
   assert.deepEqual(state.rows.map(r=>r.displayed),shownIds,'parameter name must be stable original parameter ID');
   assert(state.rows.some(r=>r.originalLabel!==r.displayed),'preserve localized labels and underlying data');
   assert(!state.source.includes('chapterAgFontSize'),'unmigrated chapter settings leaked to source');
   assert.deepEqual(state.schema.map(r=>r.id),shownIds);
   assert.deepEqual(state.storageBefore,previouslySaved);
   await page.locator('#settings-save').click();
   await page.waitForFunction(()=>!!document.querySelector('#v5-status')?.textContent.includes('配置已保存'),{timeout:12000});
   const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v5-ui-settings-v1')));
   for(const id of hiddenIds)assert.equal(stored[id],previouslySaved[id],'must preserve hidden persisted '+id);
   assert.deepEqual(errors,[]);
   console.log('V5_SETTINGS_MIGRATION_CORRECTIONS_PASS',JSON.stringify({browser:name,
    shownParameterNames:state.rows.map(r=>r.displayed),hiddenIds,hiddenStoredValuesPreserved:true,
    originalFrozenSchemaUnchanged:true,errors}));
  }finally{await browser.close()}
 }
}finally{await new Promise(done=>server.close(done))}
