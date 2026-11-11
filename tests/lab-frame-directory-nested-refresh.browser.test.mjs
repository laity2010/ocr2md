/** iPad regression: an expanded nested directory stays browsable after refresh.
 * Real Vite Lab Frame UI, WebAwesome custom elements, mocked authorized API.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5301,url=`http://127.0.0.1:${port}/labs/lab-frame/`;
const dev=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-frame/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';dev.stdout.on('data',b=>output+=b);dev.stderr.on('data',b=>output+=b);
try{
 let ready=false;
 for(let i=0;i<90;i++){
  try{if((await fetch(url)).ok){ready=true;break}}catch{}
  await pause(150);
 }
 assert(ready,'Vite not ready: '+output.slice(-600));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1032,height:768},hasTouch:true});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   let rootsCalls=0, browseCalls=0;
   await page.route('**/api/workspace/roots',route=>{
    rootsCalls++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      allowedRoots:['/demo/docs'],activeBook:'',selectionError:'Old book moved'})});
   });
   await page.route('**/api/workspace/browse?*',route=>{
    browseCalls++;
    const path=new URL(route.request().url()).searchParams.get('path');
    const values={'/demo/docs':['alpha'],'/demo/docs/alpha':['nested'],'/demo/docs/alpha/nested':[]};
    const children=(values[path]||[]).map(name=>({name,path:path+'/'+name}));
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('.ocr-ag-module-select').first().selectOption('settings');
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().waitFor({timeout:20000});
   await page.locator('#settings-workspace .ag-row').filter({hasText:'dataDirectory'}).first().click();
   await page.getByRole('button',{name:'打开目录树'}).click();
   const root=page.locator('wa-tree-item[data-path="/demo/docs"]');
   const alpha=page.locator('wa-tree-item[data-path="/demo/docs/alpha"]');
   const nested=page.locator('wa-tree-item[data-path="/demo/docs/alpha/nested"]');
   await root.waitFor({state:'attached',timeout:15000});
   await alpha.waitFor({state:'attached',timeout:15000});
   await alpha.evaluate(item=>{item.expanded=true;});
   await nested.waitFor({state:'attached',timeout:15000});
   // Selection is a whole-row highlight (including indentation/chevron),
   // never a highlight spanning the selected directory's descendants.
   await alpha.locator('[part="item"]').first().click();
   await page.waitForFunction(()=>document.querySelector('wa-tree-item[data-path="/demo/docs/alpha"]')?.selected===true);
   const rowStyle=await alpha.locator('[part="item"]').first().evaluate(el=>{
     const s=getComputedStyle(el),p=el.getBoundingClientRect(),h=el.getRootNode().host.getBoundingClientRect();
     return {background:s.backgroundColor,color:s.color,width:p.width,hostWidth:h.width};
   });
   assert.equal(rowStyle.background,'rgb(57, 108, 90)','Selected directory should have strong whole-row green fill');
   assert.equal(rowStyle.color,'rgb(246, 255, 247)','Selected row text must be readable');
   assert(rowStyle.width>=rowStyle.hostWidth-2,'Highlight must cover the full row width');
   assert.equal(await root.getAttribute('selected'),null,'Ancestor must not also be selected');
   assert.equal(await nested.getAttribute('selected'),null,'Descendants must not also be selected');
   // Simulate the 5-second polling cycle explicitly. Previously this tried
   // assigning a recursive change result to `const changed`, then cleared tree.
   const callsBefore=rootsCalls;
   await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
   await page.waitForTimeout(1100);
   assert.equal(await root.count(),1,'The authorized root must survive refresh');
   assert.equal(await alpha.count(),1,'The expanded first-level directory must survive refresh');
   assert.equal(await nested.count(),1,'The second-level directory must survive refresh');
   assert.equal(await alpha.getAttribute('selected'),'','Refreshing must preserve the selected row');
   assert.equal(await alpha.locator('[part="item"]').first().evaluate(el=>getComputedStyle(el).backgroundColor),
     'rgb(57, 108, 90)','Refreshing must preserve whole-row highlight');
   // Each expanded parent must retain its OWN visible label, not just children.
   // The previous replaceChildren(...next) erased the parent's light-DOM text.
   const ownLabel=locator=>locator.evaluate(item=>[...item.childNodes]
     .filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(''));
   assert.match(await ownLabel(root),/📁 \/demo\/docs/,'Authorized root label missing after expansion');
   assert.match(await ownLabel(alpha),/📁 alpha/,'Expanded parent label missing after refresh');
   assert(!String(await page.locator('#status').innerText()).includes('目录同步失败'));
   assert(!String(await page.locator('#status').innerText()).includes('readonly'));
   assert.equal(rootsCalls,callsBefore,'Periodic content refresh must not recheck unrelated book selection');
   assert(browseCalls>=3,'Root and expanded branch must have refreshed');
   assert.deepEqual(errors,[]);
   console.log(name+'_FRAME_NESTED_REFRESH_PASS',JSON.stringify({rootsCalls,browseCalls}));
  }finally{await browser.close()}
 }
}finally{dev.kill('SIGTERM')}
