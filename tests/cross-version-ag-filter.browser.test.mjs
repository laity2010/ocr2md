/** Mandatory V1 native filter gate on the actual translation Frame build. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {sampleSnapshot} from './translation-original-fixture.mjs';
import {preparedFixture} from './translation-preparation-fixture.mjs';
const HOST='http://127.0.0.1:5404/labs/lab-translation/';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--config','labs/lab-translation/vite.config.mjs','--host','127.0.0.1','--port','5404','--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
try{
 for(let i=0;i<100;i++){try{if((await fetch(HOST)).ok)break;}catch{}if(i===99)throw Error(log);await sleep(150);}
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:774,height:1032}:{width:1180,height:860},hasTouch:true});
   const errors=[],reads=[],probes=[];let failed=false,version=0,preparationFailed=false;const prepCalls=[];
   const old=await sampleSnapshot(),fresh=await sampleSnapshot(' refreshed'),withFormula=await sampleSnapshot(' prepared',true);
   const prepared=preparedFixture(withFormula);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>r.fulfill({json:{authorized:true}}));
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>r.fulfill({json:{allowedRoots:['/demo/books']}}));
   await page.route('**/labs/lab-frame/api/workspace-io/browse?*',r=>{const path=new URL(r.request().url()).searchParams.get('path');return r.fulfill({json:{path,children:path==='/demo/books'?[{path:'/demo/books/a',name:'a'},{path:'/demo/books/b',name:'b'}]:[]}});});
   await page.route('**/labs/lab-frame/api/workspace-io/probe',r=>{probes.push(r.request().postDataJSON().workspace);return r.fulfill({json:{verified:true,readable:true,writable:true}});});
   await page.route('**/labs/lab-sentence/api/**',r=>{assert.equal(r.request().method(),'GET');const u=new URL(r.request().url());assert(u.pathname.endsWith('/sentence/snapshot'));reads.push(u.searchParams.get('workspace'));return failed?r.fulfill({status:409,json:{error:'句表已过期'}}):r.fulfill({json:version===2?withFormula:version?fresh:old});});
   await page.route('**/labs/lab-translation/api/translation/initialize',r=>{
    assert.equal(r.request().method(),'POST');
    const input=r.request().postDataJSON();
    assert.deepEqual(input,{workspace:'/demo/books/b',source_document_hash:withFormula.source_document_hash,sentence_sha256:withFormula.sentence_sha256});
    prepCalls.push(input);
    return preparationFailed?r.fulfill({status:409,json:{error:'已有译句表不一致，拒绝覆盖'}}):r.fulfill({json:prepared});
   });
   await page.goto(HOST,{waitUntil:'domcontentloaded'});
   const settings=page.locator('#settings-workspace'),workspace=page.locator('#workspace'),grid=workspace.locator('.ocr-outline-grid');
   const nav=scope=>scope.locator('.ocr-source-file-select');
   const chooseNav=async(scope,value)=>{const wrapper=scope.locator('.ocr-navigation-files.ts-wrapper');await wrapper.locator('.ts-control').click();await page.locator('.ocr-navigation-popup-files:visible [data-value="'+value+'"]').click();};
   const tableOption=scope=>nav(scope).locator('option[value="original"]');
   const count=n=>page.waitForFunction(n=>document.querySelectorAll('#workspace .ocr-outline-grid .ag-row').length===n,n,{timeout:10000});
   await settings.locator('.ag-row').first().waitFor();
   assert.equal(await nav(settings).locator('optgroup[label="SQL"]').count(),0);assert.equal(reads.length,0);
   async function bind(path){
    await settings.locator('.ag-row',{hasText:'dataDirectory'}).click();await page.getByRole('button',{name:'打开目录树'}).click();
    const root=page.locator('wa-tree-item[data-path="/demo/books"]');await root.waitFor();
    if(!(await root.evaluate(el=>el.expanded)))await root.locator('[part="expand-button"]').first().click();
    const child=page.locator('wa-tree-item[data-path="'+path+'"]');await child.waitFor();await child.locator('[part="item"]').first().click();await page.getByRole('button',{name:'采用选中目录'}).click();
    await page.waitForFunction(path=>document.querySelector('[aria-label="当前资料目录"]')?.value===path,path);
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('可初始化原句表')&&document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql-init"]'));
    assert.equal(probes.at(-1),path);
   }
   await bind('/demo/books/a');assert.equal(reads.length,0);assert.equal(await tableOption(settings).count(),0);
   await page.locator('#global-save').click();await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-translation.settings.json.v1')?.includes('/demo/books/a')&&document.querySelector('#status')?.textContent.includes('可初始化原句表'));
   await chooseNav(settings,'sql-init');await workspace.waitFor({state:'visible'});await count(4);
   assert.deepEqual(reads,['/demo/books/a']);assert.equal(await tableOption(workspace).count(),1);assert.equal(await workspace.locator('.dv-content-container').count(),4);
   assert.equal((await workspace.locator('#editor .cm-content').innerText()).trim(),'');assert.equal(await workspace.locator('#undo').isDisabled(),true);assert.equal(await workspace.locator('#redo').isDisabled(),true);
   assert.equal(await grid.locator('.ag-row [col-id="raw"]').count(),4);
   assert.equal(await grid.locator('.ag-row [col-id="raw"]').first().textContent(),'# Heading\n\n');
   assert.equal(await grid.locator('table').count(),0,'raw HTML is text, not rendered HTML');
   const openFilter=async()=>{await grid.locator('.ag-body-horizontal-scroll-viewport').evaluate(el=>el.scrollLeft=320);const button=grid.locator('.ag-header-cell[col-id="type"] .ag-header-cell-filter-button');await button.waitFor();if(name==='iPad-WebKit')await button.tap();else await button.click();const pop=page.locator('.ocr-enum-filter[aria-label="type 筛选"]:visible');await pop.waitFor();return pop;};
   let popup=await openFilter();let cb=v=>popup.locator(`[data-filter-value="${v}"] input`);
   assert.equal(await cb('all').isChecked(),true);await cb('all').uncheck();await count(0);await cb('title').check();await count(1);await cb('text').check();await count(3);
   await page.keyboard.press('Escape');version=1;await chooseNav(workspace,'sql-init');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存分句快照'));await count(3);await page.waitForFunction(()=>[...document.querySelectorAll('#workspace .ag-row [col-id="raw"]')].some(x=>x.textContent.includes('refreshed')));
   popup=await openFilter();assert.equal(await cb('title').isChecked(),true);assert.equal(await cb('text').isChecked(),true);assert.equal(await cb('table_body').isChecked(),false);await cb('all').check();await count(4);await page.keyboard.press('Escape');
   await chooseNav(workspace,'settings');await settings.waitFor({state:'visible'});await bind('/demo/books/b');assert.equal(await tableOption(settings).count(),0);await count(0);
   failed=true;await chooseNav(settings,'sql-init');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('原句表初始化失败'));assert.equal(await tableOption(settings).count(),0);assert.equal(await workspace.isVisible(),false);
   failed=false;await chooseNav(settings,'sql-init');await workspace.waitFor({state:'visible'});await count(4);assert.equal(reads.at(-1),'/demo/books/b');
   // WP02: new source contains a complete non-translatable formula.
   version=2;await chooseNav(workspace,'sql-init');await count(5);
   assert.equal(await nav(workspace).locator('option[value="translation"]').count(),0);
   preparationFailed=true;await chooseNav(workspace,'translation-init');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('译句表初始化失败'));
   assert.equal(await nav(workspace).locator('option[value="translation"]').count(),0);await count(5);
   preparationFailed=false;await chooseNav(workspace,'translation-init');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('可翻译 4 句'));
   await count(5);assert.equal(await nav(workspace).locator('option[value="translation"]').count(),1);
   assert.equal(await workspace.locator('.dv-content-container').count(),4);
   const scroll=grid.locator('.ag-body-horizontal-scroll-viewport');
   await scroll.evaluate(el=>el.scrollLeft=530);
   const transButton=grid.locator('.ag-header-cell[col-id="translatable"] .ag-header-cell-filter-button');
   await transButton.waitFor();
   if(name==='iPad-WebKit')await transButton.tap();else await transButton.click();
   const transPopup=page.locator('.ocr-enum-filter[aria-label="可翻译 筛选"]:visible');
   await transPopup.waitFor();
   const tcb=v=>transPopup.locator('[data-filter-value="'+v+'"] input');
   assert.equal(await tcb('all').isChecked(),true);
   await tcb('all').uncheck();await count(0);await tcb('否').check();await count(1);
   assert.equal(await grid.locator('.ag-row [col-id="source_line"]').textContent(),'5');
   await page.keyboard.press('Escape');
   await scroll.evaluate(el=>el.scrollLeft=740);
   await page.waitForFunction(()=>[...document.querySelectorAll('#workspace .ag-row [col-id="protected"]')].some(el=>el.textContent.includes('latex')&&el.textContent.includes('$$x=1$$')));
   await chooseNav(workspace,'original');await count(5);
   await chooseNav(workspace,'translation');await count(1);
   await chooseNav(workspace,'settings');await settings.waitFor({state:'visible'});await bind('/demo/books/a');
   assert.equal(await nav(settings).locator('option[value="translation"]').count(),0);await count(0);
   assert.equal(prepCalls.length,2);
   console.log('TRANSLATION_WP02_BROWSER_PASS',name,'protected ranges / untranslated retained / native filter / switch / stale refusal');
   assert.deepEqual(errors,[]);console.log('TRANSLATION_WP01_BROWSER_PASS',name,'bind/init/raw/readonly/native all/multi/refresh/change/failure/retry',JSON.stringify({reads,probes}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
