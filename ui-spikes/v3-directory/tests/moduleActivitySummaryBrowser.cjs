/** Module activity stream UIC: all five statuses remain live across tabs. */
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const network=path.resolve(root,'../../../agent-link-monitor/web');
const port=30000+Math.floor(Math.random()*25000);
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const ids=['settings','workspace','workbench','dirjson','pdf'];
const tick=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let browser;
try{
 for(let i=0;i<95;i++){try{if((await fetch(`http://127.0.0.1:${port}/index.html`)).ok)break;}catch{}await tick(90);}
 browser=await(engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1140,height:870},serviceWorkers:'block'});
 const page=await context.newPage();const errors=[];let settingsStartedAt=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__v3/fs?*',async route=>{
   const url=new URL(route.request().url());
   const response=await route.fetch({url:`http://127.0.0.1:4176${url.pathname}${url.search}`});
   await route.fulfill({response});
 });
 await page.route('https://agent-link.laity.bid/**',async route=>{
   const url=new URL(route.request().url());
   const target=path.resolve(network,'.'+url.pathname);
   if(!target.startsWith(network+'/')||!fs.existsSync(target))return route.continue();
   if(url.pathname.endsWith('/settings-panel.js')){settingsStartedAt=Date.now();await tick(1600);}
   if(url.pathname.endsWith('/source-surface.js'))await tick(900);
   const ext=path.extname(target);
   await route.fulfill({status:200,body:fs.readFileSync(target),contentType:ext==='.json'?'application/json':ext==='.css'?'text/css':ext==='.woff2'?'font/woff2':'text/javascript',headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
 const entries=page.locator('[data-module-status]');
 const visible=async()=>entries.evaluateAll(nodes=>nodes.filter(n=>!n.hidden).map(n=>n.dataset.moduleStatus));
 assert.equal(await entries.count(),5);
 assert.deepEqual(await entries.evaluateAll(items=>items.map(x=>x.dataset.moduleStatus)),ids);
 const initialValues=await entries.evaluateAll(items=>items.map(x=>x.querySelector('[data-activity-value]')?.textContent));
 assert.ok(initialValues[0].includes('加载'));
 assert.ok(initialValues[1].includes('连接')||initialValues[1].includes('已就绪'),
   'workspace may have already connected before DOMContentLoaded: '+JSON.stringify(initialValues));
 assert.equal(initialValues[2],'未选择书籍');
 assert.equal(initialValues[3],'等待书籍');
 assert.ok(initialValues[4].includes('未加载'));
 const firstVisible=await visible();
 assert.ok(firstVisible.includes('settings'),JSON.stringify(firstVisible));
 assert.ok(firstVisible.every(x=>x==='settings'||x==='workspace'),
   'idle workbench, DIRjson and PDF are never shown: '+JSON.stringify(firstVisible));
 // The fast local vault can already be ready by DOMContentLoaded. In that
 // case the workspace completed and rightfully disappeared immediately.
 assert.equal(await page.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
 await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md' &&
   document.querySelector('[data-module-status="workspace"]')?.dataset.level==='ready',null,{timeout:25000});
 assert.equal(await page.getByTestId('tab-settings').isDisabled(),true,
   'directory must be ready while delayed settings script is still loading');
 const workspaceSummary=await page.getByTestId('activity-workspace').getAttribute('data-summary');
 assert.ok(workspaceSummary.includes('项'),workspaceSummary);
 assert.equal(await page.getByTestId('activity-workspace').isHidden(),true,
   'completed work directory automatically exits the status strip');
 assert.deepEqual(await visible(),['settings'],'only background Settings remains');
 const check=async(id,part,level)=>{
   await page.waitForFunction(([id,part,level])=>{
     const el=document.querySelector(`[data-module-status="${id}"]`);
     return el?.dataset.summary?.includes(part) && el?.dataset.level===level;
   },[id,part,level],{timeout:15000});
   const text=await page.getByTestId('activity-'+id).textContent();
   assert.ok(text.includes(part),id+': '+text);
 };
 await page.waitForFunction(()=>document.querySelector('#tab-settings')?.dataset.settingsState==='ready',null,{timeout:30000});
 await check('settings','就绪','ready');
 assert.equal(await page.getByTestId('activity-settings').isHidden(),true);
 assert.equal(await page.locator('#v3-activity-summary').isHidden(),true,
   'when all activity completes the whole status strip must collapse');
 assert.deepEqual(await visible(),[]);
 assert.equal(await page.getByTestId('tab-workspace').getAttribute('aria-selected'),'true',
   'background settings completion cannot switch tabs');
 // Exercise production observers by updating model-owned hidden status nodes
 // while the browser is still on the workspace tag. This must not depend on
 // visibility or a status-derived network poll.
 await page.evaluate(()=>{
   document.getElementById('ir-status').textContent='正在同步 DIRjson 全书源码';
   document.getElementById('workbench-status').textContent='正在读取工作台文件';
   document.getElementById('workbench-pdf-status').textContent='正在渲染第 3 页';
 });
 await check('dirjson','同步','busy');
 await check('workbench','读取工作台','busy');
 await check('pdf','第 3 页','busy');
 assert.deepEqual(await visible(),['workbench','dirjson','pdf'],
   'active modules reappear and completed Settings/Directory remain hidden');
 // Independent progress: PDF completes, IR fails while other modules retain
 // their own state. The legacy last-action message must still be visible.
 await page.evaluate(()=>{
   document.getElementById('workbench-pdf-status').textContent='PDF 原文 · 第 3 / 18 页 · 按需读取';
   document.getElementById('ir-status').textContent='DIRjson 快照加载失败：来源不一致';
   document.getElementById('status').textContent='文件操作已拒绝，请检查版本';
 });
 await check('pdf','第 3 / 18 页','ready');
 await check('dirjson','加载失败','error');
 assert.equal(await page.getByTestId('activity-pdf').isHidden(),true,
   'PDF exits after rendering completes');
 assert.deepEqual(await visible(),['workbench','dirjson'],
   'an unresolved DIRjson error remains visible');
 assert.equal(await page.getByTestId('activity-workspace').getAttribute('data-summary'),workspaceSummary);
 const settingsLate=await page.getByTestId('activity-settings').evaluate(e=>({level:e.dataset.level,summary:e.dataset.summary,detail:e.title,tab:document.querySelector('#tab-settings')?.dataset.settingsState,raw:document.querySelector('#settings-shared .las-status')?.textContent}));
 assert.equal(settingsLate.level,'ready',JSON.stringify(settingsLate));
 assert.ok((await page.getByTestId('status').textContent()).includes('文件操作已拒绝'));
 assert.ok((await page.getByTestId('activity-dirjson').getAttribute('title')).includes('来源不一致'));
 await page.getByTestId('tab-settings').click();
 assert.equal(await page.getByTestId('activity-pdf').getAttribute('data-summary'),'PDF 原文 · 第 3 / 18 页 · 按需读取');
 assert.equal(await page.getByTestId('activity-dirjson').getAttribute('data-level'),'error');
 // Unsaved drafts remain in the bar until explicitly saved.
 await page.evaluate(()=>document.getElementById('ir-status').textContent='DIRjson 已暂存 · 待保存');
 await check('dirjson','待保存','dirty');
 assert.deepEqual(await visible(),['workbench','dirjson']);
 await page.evaluate(()=>document.getElementById('ir-status').textContent='DIRjson 已保存');
 await check('dirjson','已保存','ready');
 assert.equal(await page.getByTestId('activity-dirjson').isHidden(),true);
 // Narrow iPad-width header scrolls horizontally while several jobs run.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
   document.getElementById('workbench-status').textContent='正在读取大量章节文件';
   document.getElementById('ir-status').textContent='正在同步 DIRjson 源码';
   document.getElementById('workbench-pdf-status').textContent='正在渲染第 4 页';
 });
 await check('dirjson','同步','busy');
 await check('pdf','第 4 页','busy');
 const geometry=await page.evaluate(()=>{
   const strip=document.getElementById('v3-activity-summary');
   return {scrollWidth:strip.scrollWidth,clientWidth:strip.clientWidth,
     right:strip.getBoundingClientRect().right,viewport:innerWidth,
     count:document.querySelectorAll('.v3-activity-summary').length};
 });
 assert.ok(geometry.scrollWidth>geometry.clientWidth,JSON.stringify(geometry));
 assert.ok(geometry.right<=geometry.viewport+2,JSON.stringify(geometry));
 assert.equal(geometry.count,1);
 // Resolving all remaining activity empties the strip again, without timers.
 await page.evaluate(()=>{
   document.getElementById('workbench-status').textContent='工作台文件已加载';
   document.getElementById('ir-status').textContent='DIRjson 已保存';
   document.getElementById('workbench-pdf-status').textContent='PDF 原文 · 第 4 / 18 页 · 按需读取';
 });
 await page.waitForFunction(()=>document.querySelector('#v3-activity-summary')?.hidden===true);
 assert.deepEqual(await visible(),[]);
 assert.deepEqual(errors,[]);
 console.log('V3_ALL_MODULE_ACTIVITY_SUMMARIES_PASS',JSON.stringify({engine,settingsStarted:settingsStartedAt>0,workspaceReadyFirst:true,independentBackground:true,completedRemoved:true,dirtyAndErrorStay:true,reappearsOnNewWork:true,narrowScroll:true}));
}catch(e){console.error('V3_ALL_MODULE_ACTIVITY_SUMMARIES_FAIL',e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
