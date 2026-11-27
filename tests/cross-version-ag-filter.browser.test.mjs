/** Mandatory V1 native filter gate on the actual translation Frame build. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {sampleSnapshot} from './translation-original-fixture.mjs';
import {preparedFixture} from './translation-preparation-fixture.mjs';
import {createTranslationJSON} from '../ui/translation/export-json.js';
import {readFile} from 'node:fs/promises';
const HOST='http://127.0.0.1:5404/labs/lab-translation/';
const server=spawn('node',['node_modules/vite/bin/vite.js','preview','--config','labs/lab-translation/vite.config.mjs','--host','127.0.0.1','--port','5404','--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',b=>log+=b);server.stderr.on('data',b=>log+=b);
try{
 for(let i=0;i<100;i++){try{if((await fetch(HOST)).ok)break;}catch{}if(i===99)throw Error(log);await sleep(150);}
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:774,height:1032}:{width:1180,height:860},hasTouch:true});
   const errors=[],reads=[],probes=[],loads=[],prepCalls=[];let failed=false,version=0,preparationFailed=false,denied=false,late=null;const persisted=new Map();
   const old=await sampleSnapshot(),fresh=await sampleSnapshot(' refreshed'),withFormula=await sampleSnapshot(' prepared',true,true),longSnapshot=await sampleSnapshot(' scroll',true,true,72);
   const prepared=preparedFixture(withFormula),oldPrepared=preparedFixture(old),freshPrepared=preparedFixture(fresh),longPrepared=preparedFixture(longSnapshot);
   persisted.set('/demo/books/d',longPrepared);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>r.fulfill({json:{authorized:true}}));
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>r.fulfill({json:{allowedRoots:['/demo/books']}}));
   await page.route('**/labs/lab-frame/api/workspace-io/browse?*',r=>{const path=new URL(r.request().url()).searchParams.get('path');return r.fulfill({json:{path,children:path==='/demo/books'?[{path:'/demo/books/a',name:'a'},{path:'/demo/books/b',name:'b'},{path:'/demo/books/c',name:'c'},{path:'/demo/books/d',name:'d'}]:[]}});});
   await page.route('**/labs/lab-frame/api/workspace-io/probe',r=>{probes.push(r.request().postDataJSON().workspace);return denied?r.fulfill({status:403,json:{error:'denied'}}):r.fulfill({json:{verified:true,readable:true,writable:true}});});
   await page.route('**/labs/lab-sentence/api/**',r=>{assert.equal(r.request().method(),'GET');const u=new URL(r.request().url());assert(u.pathname.endsWith('/sentence/snapshot'));reads.push(u.searchParams.get('workspace'));return failed?r.fulfill({status:409,json:{error:'句表已过期'}}):r.fulfill({json:version===3?longSnapshot:version===2?withFormula:version?fresh:old});});
   await page.route('**/labs/lab-translation/api/translation/load?*',async r=>{
    assert.equal(r.request().method(),'GET');
    const path=new URL(r.request().url()).searchParams.get('workspace');loads.push(path);
    const result=persisted.get(path);
    const reply=failed?{status:409,json:{error:'句表已过期，保留原表'}}:{json:result?{...result,state:'ready'}:{schema:'ocr2md-translation-preparation/v2',state:'missing'}};
    if(late&&path===late.path){const gate=late;gate.started();await gate.promise;try{await r.fulfill(reply);}catch{}return;}
    return r.fulfill(reply);
   });
   await page.route('**/labs/lab-translation/api/translation/initialize',r=>{
    assert.equal(r.request().method(),'POST');
    const input=r.request().postDataJSON();
    const source=version===3?longSnapshot:version===2?withFormula:version?fresh:old;
    assert.deepEqual(input,{workspace:reads.at(-1),source_document_hash:source.source_document_hash,sentence_sha256:source.sentence_sha256});
    prepCalls.push(input);
    if(preparationFailed)return r.fulfill({status:409,json:{error:'已有译句表不一致，拒绝覆盖'}});
    const result=version===3?longPrepared:version===2?prepared:version?freshPrepared:oldPrepared;
    persisted.set(input.workspace,result);return r.fulfill({json:result});
   });
   await page.goto(HOST,{waitUntil:'domcontentloaded'});
   const settings=page.locator('#settings-workspace'),workspace=page.locator('#workspace'),grid=workspace.locator('.ocr-outline-grid');
   const nav=scope=>scope.locator('.ocr-source-file-select');
   const chooseNav=async(scope,value)=>{const wrapper=scope.locator('.ocr-navigation-files.ts-wrapper');if(!(await wrapper.evaluate(el=>el.classList.contains('dropdown-active'))))await wrapper.locator('.ts-control').click();else console.log('SQL_NAV_RESTORED_FOCUS',name);await page.locator('.ocr-navigation-popup-files:visible [data-value="'+value+'"]').click();};
   const tableOption=scope=>nav(scope).locator('option[value="translation"]');
   const count=n=>page.waitForFunction(n=>document.querySelectorAll('#workspace .ocr-outline-grid .ag-row').length===n,n,{timeout:10000});
   await settings.locator('.ag-row').first().waitFor();
   assert.equal(await nav(settings).locator('optgroup[label="SQL"]').count(),0);assert.equal(reads.length,0);
   const dialog=page.locator('#translation-sql-actions-dialog');
   const openSQL=async(scope,keyboard=false)=>{const wrapper=scope.locator('.ocr-navigation-files.ts-wrapper');if(!(await wrapper.evaluate(el=>el.classList.contains('dropdown-active'))))await wrapper.locator('.ts-control').click();else console.log('SQL_NAV_RESTORED_FOCUS',name);const h=page.locator('.ocr-navigation-popup-files:visible .optgroup-header').filter({hasText:/^SQL$/});await h.waitFor();if(keyboard)await page.keyboard.press('Alt+Enter');else if(name==='iPad-WebKit')await h.tap();else await h.click();await dialog.waitFor();};
   const init=async()=>{await openSQL(settings);await dialog.getByRole('button',{name:'初始化译句表',exact:true}).click();};
   const waitStatus=text=>page.waitForFunction(text=>document.querySelector('#status')?.textContent.includes(text),text);
   async function adopt(path){
    await settings.locator('.ag-row',{hasText:'dataDirectory'}).click();await page.getByRole('button',{name:'打开目录树'}).click();
    const root=page.locator('wa-tree-item[data-path="/demo/books"]');await root.waitFor();
    if(!(await root.evaluate(el=>el.expanded)))await root.locator('[part="expand-button"]').first().click();
    const child=page.locator('wa-tree-item[data-path="'+path+'"]');await child.waitFor();await child.locator('[part="item"]').first().click();await page.getByRole('button',{name:'采用选中目录'}).click();
    await page.waitForFunction(path=>document.querySelector('[aria-label="当前资料目录"]')?.value===path,path);
   }
   async function bind(path,status='尚无译句表'){await adopt(path);await waitStatus(status);assert.equal(probes.at(-1),path);}
   await bind('/demo/books/a');assert.equal(reads.length,0);assert.equal(prepCalls.length,0);assert.equal(await tableOption(settings).count(),0);
   assert.equal(await nav(settings).locator('optgroup[label="SQL"] option:enabled').count(),0);
   await page.locator('#global-save').click();await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-translation.settings.json.v1')?.includes('/demo/books/a'));await waitStatus('尚无译句表');
   // Startup with no table stays in settings and performs no initialization.
   await page.reload({waitUntil:'domcontentloaded'});await settings.locator('.ag-row').first().waitFor();await waitStatus('尚无译句表');assert.equal(prepCalls.length,0);
   const beforeCancel=loads.length;
   await openSQL(settings,true);await dialog.getByRole('button',{name:'取消'}).click();assert.equal(await nav(settings).inputValue(),'settings');assert.equal(prepCalls.length,0);assert.equal(loads.length,beforeCancel);
   await init();await workspace.waitFor({state:'visible'});await count(4);
   assert.deepEqual(reads,['/demo/books/a']);assert.equal(prepCalls.length,1);assert.equal(await tableOption(workspace).count(),1);assert.deepEqual(await nav(workspace).locator('optgroup[label="SQL"] option').evaluateAll(xs=>xs.map(x=>x.value)),['translation']);assert.equal(await workspace.locator('.dv-content-container').count(),3);
   await openSQL(workspace);assert.equal(await dialog.getByRole('button',{name:'初始化译句表',exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:'取消'}).click();assert.equal(await nav(workspace).inputValue(),'translation');assert.equal(prepCalls.length,1);
   assert.equal((await workspace.locator('#editor .cm-content .cm-line').first().textContent()),'# Heading');
   assert.equal(await workspace.locator('#editor .cm-content').getAttribute('contenteditable'),'false');
   assert.equal(await workspace.locator('.ocr-preview-md-scroll h1').textContent(),'Heading');assert.equal(await workspace.locator('#undo').isDisabled(),true);assert.equal(await workspace.locator('#redo').isDisabled(),true);
   assert.equal(await grid.locator('.ag-row [col-id="raw"]').count(),4);
   assert.equal(await grid.locator('.ag-row [col-id="raw"]').first().textContent(),'# Heading\n\n');
   assert.equal(await grid.locator('table').count(),0,'raw HTML is text, not rendered HTML');
   const openFilter=async()=>{await grid.locator('.ag-body-horizontal-scroll-viewport').evaluate(el=>el.scrollLeft=320);const button=grid.locator('.ag-header-cell[col-id="type"] .ag-header-cell-filter-button');await button.waitFor();if(name==='iPad-WebKit')await button.tap();else await button.click();const pop=page.locator('.ocr-enum-filter[aria-label="type 筛选"]:visible');await pop.waitFor();return pop;};
   let popup=await openFilter();let cb=v=>popup.locator(`[data-filter-value="${v}"] input`);
   assert.equal(await cb('all').isChecked(),true);await cb('all').uncheck();await count(0);await cb('title').check();await count(1);await cb('text').check();await count(3);
   await page.keyboard.press('Escape');await chooseNav(workspace,'settings');await waitStatus('已有译句表');assert.equal(await settings.isVisible(),true);const beforeLoad=loads.length;await chooseNav(settings,'translation');await workspace.waitFor({state:'visible'});await count(3);assert.equal(loads.length,beforeLoad+1);assert.equal(prepCalls.length,1);
   popup=await openFilter();assert.equal(await cb('title').isChecked(),true);assert.equal(await cb('text').isChecked(),true);assert.equal(await cb('table_body').isChecked(),false);await cb('all').check();await count(4);await page.keyboard.press('Escape');
   await chooseNav(workspace,'settings');await settings.waitFor({state:'visible'});await waitStatus('已有译句表');
   failed=true;await bind('/demo/books/b','译句表加载失败');assert.equal(await tableOption(settings).count(),0);await count(0);assert.equal(await workspace.isVisible(),false);
   await openSQL(settings);assert.equal(await dialog.getByRole('button',{name:'初始化译句表',exact:true}).isDisabled(),true);assert.equal(prepCalls.length,1);
   failed=false;await dialog.getByRole('button',{name:'重新检查'}).click();await waitStatus('尚无译句表');
   version=2;preparationFailed=true;await init();await waitStatus('SQL 初始化失败');assert.equal(await tableOption(settings).count(),0);await count(0);assert.equal(await workspace.isVisible(),false);
   preparationFailed=false;await openSQL(settings);await dialog.getByRole('button',{name:'重新检查'}).click();await waitStatus('尚无译句表');
   // Save the selected book before creating; saving is read-only discovery.
   await page.locator('#global-save').click();await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-translation.settings.json.v1')?.includes('/demo/books/b'));await waitStatus('尚无译句表');
   await init();
   await workspace.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('可翻译 4 句'));
   await count(5);assert.equal(await tableOption(workspace).count(),1);
   assert.equal(reads.at(-1),'/demo/books/b');
   assert.equal(await workspace.locator('.dv-content-container').count(),3);
   const source=workspace.locator('#editor'),preview=workspace.locator('.ocr-preview-md-scroll');
   const sourceLines=await source.locator('.cm-line').allTextContents();
   assert.equal(sourceLines.join('\n'),withFormula.rows.map(r=>r.raw).join(''));
   assert.equal(await source.locator('.cm-content').getAttribute('contenteditable'),'false');
   assert.equal(await preview.locator('h1').textContent(),'Heading');
   assert.equal(await preview.locator('table td').first().textContent(),'Text');
   assert.equal(await preview.locator('.ocr-reviewed-inline-latex.translation-protected-preview').count(),1);
   assert.equal(await preview.locator('code.translation-protected-preview').count(),1);
   assert.equal(await preview.locator('.ocr-math.translation-protected-preview').count(),1);
   assert.equal(await preview.locator('h1.translation-protected-preview').count(),0);
   assert((await source.locator('.translation-protected-source').allTextContents()).join('').includes('$r_t$'));
   // AG -> source/preview, source -> AG, preview -> source/AG.
   await grid.locator('.ag-row [col-id="source_line"]').last().click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .translation-focus-source')].map(n=>n.textContent).join('').includes('$$x=1$$'));
   assert.equal(await preview.locator('.ocr-math.translation-focus-preview').count(),1);
   await source.locator('.cm-line').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected [col-id="source_line"]')?.textContent==='1');
   await preview.locator('table td').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected [col-id="source_line"]')?.textContent==='4');
   assert((await source.locator('.translation-focus-source').allTextContents()).join('').includes('<table>'));
   // WP04: same preview pane, independent CM6 Prompt state and history.
   const mode=workspace.locator('.ocr-preview-mode');
   assert.deepEqual(await mode.locator('option').evaluateAll(xs=>xs.map(x=>x.value)),['md','prompt','json']);
   assert.equal(await workspace.locator('.ocr-detached-pdf-pane,.ocr-preview-split-toggle').count(),0);
   const settingsBefore=await page.evaluate(()=>localStorage.getItem('ocr2md.lab-translation.settings.json.v1'));
   const promptKey='ocr2md.lab-translation.prompt.md.v1';
   await mode.selectOption('prompt');
   const prompt=workspace.locator('.translation-prompt-editor');
   await prompt.waitFor({state:'visible'});
   assert.equal(await preview.isVisible(),false);
   assert.equal(await prompt.locator('.cm-content').getAttribute('contenteditable'),'true');
   assert.match(await prompt.locator('.cm-line').first().textContent(),/独立校译任务书/);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),promptKey),null);
   const initialLine=await prompt.locator('.cm-line').first().textContent();
   await prompt.locator('.cm-line').first().click();
   await page.keyboard.insertText('WP04draft');
   await page.waitForFunction(()=>document.querySelector('.translation-prompt-editor .cm-line')?.textContent.includes('WP04draft'));
   assert.equal(await workspace.locator('#undo').isDisabled(),true);
   assert.equal(await workspace.locator('#redo').isDisabled(),true);
   assert.equal(await page.evaluate(key=>localStorage.getItem(key),promptKey),null);
   await workspace.locator('#prompt-undo').click();
   await page.waitForFunction(line=>document.querySelector('.translation-prompt-editor .cm-line')?.textContent===line,initialLine);
   await workspace.locator('#prompt-redo').click();
   await page.waitForFunction(()=>document.querySelector('.translation-prompt-editor .cm-line')?.textContent.includes('WP04draft'));
   await grid.locator('.ag-row [col-id="source_line"]').last().click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .translation-focus-source')].map(n=>n.textContent).join('').includes('$$x=1$$'));
   assert.equal(await mode.inputValue(),'prompt');
   await mode.selectOption('md');assert.equal(await preview.isVisible(),true);
   assert.equal(await prompt.isVisible(),false);
   assert.equal(await preview.locator('.ocr-math.translation-focus-preview').count(),1);
   assert.equal(await preview.locator('.ocr-math.translation-protected-preview').count(),1);
   await mode.selectOption('prompt');
   assert.match(await prompt.locator('.cm-line').first().textContent(),/WP04draft/);
   assert.equal(await workspace.locator('#prompt-undo').isEnabled(),true);
   await page.locator('#global-save').click();
   await page.waitForFunction(key=>localStorage.getItem(key)?.includes('WP04draft'),promptKey);
   assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-translation.settings.json.v1')),settingsBefore);
   assert.equal((await source.locator('.cm-line').allTextContents()).join('\n'),withFormula.rows.map(r=>r.raw).join(''));
   await mode.selectOption('json');
   const jsonHost=workspace.locator('.translation-json-preview'),exportButton=workspace.getByRole('button',{name:'导出 JSON',exact:true});
   await jsonHost.waitFor({state:'visible'});
   assert.equal(await preview.isVisible(),false);assert.equal(await prompt.isVisible(),false);
   assert.equal(await jsonHost.locator('.cm-content').getAttribute('contenteditable'),'false');
   assert.equal(await workspace.locator('#prompt-undo').isVisible(),false);
   assert.equal(await exportButton.isEnabled(),true);
   const expectedJSON=await createTranslationJSON(prepared);
   // CM6 may virtualize long documents; inspect the real visible start
   // and use the download event to verify every exported byte.
   assert.equal(await jsonHost.locator('.cm-line').first().textContent(),'{');
   assert.match((await jsonHost.locator('.cm-line').allTextContents()).join('\n'),/ocr2md-trans\/v1/);
   const downloadPromise=page.waitForEvent('download');
   await exportButton.click();const downloaded=await downloadPromise;
   assert.equal(downloaded.suggestedFilename(),'sentences.json');
   assert.equal(await readFile(await downloaded.path(),'utf8'),expectedJSON.text);
   // WP05A2: reuse exact source gutter styles, and sync by compound identity.
   const gutterStyle=scope=>scope.locator('.cm-gutters').evaluate(el=>{
     const c=getComputedStyle(el);return [c.backgroundColor,c.color,c.borderRightColor,c.borderRightWidth,c.fontFamily,c.fontSize];
   });
   assert.deepEqual(await gutterStyle(jsonHost),await gutterStyle(source));
   const selectedJSON=jsonHost.locator('.translation-focus-json');
   assert.equal(await selectedJSON.count(),0,'non-exported math sentence has no JSON target');
   await grid.locator('.ag-row [col-id="source_line"]').first().click();
   await selectedJSON.waitFor();assert.equal((await selectedJSON.textContent()).trim(),'"text": '+JSON.stringify(prepared.rows[0].text));
   assert.equal(await selectedJSON.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(235, 163, 82, 0.18)');
   await source.locator('.cm-line').filter({hasText:'<table>'}).first().click();
   await page.waitForFunction(expected=>document.querySelector('.translation-focus-json')?.textContent.trim()===expected,'"text": '+JSON.stringify(prepared.rows.find(r=>r.source_line===4).text));
   await mode.selectOption('md');
   await source.locator('.cm-line').first().click();
   await mode.selectOption('json');
   await page.waitForFunction(expected=>document.querySelector('.translation-focus-json')?.textContent.trim()===expected,'"text": '+JSON.stringify(prepared.rows[0].text));
   await grid.locator('.ag-row [col-id="source_line"]').last().click();await page.waitForFunction(()=>!document.querySelector('.translation-focus-json'));
   console.log('TRANSLATION_WP05A2_BROWSER_PASS',name,'shared gutter, AG/source identity, hidden focus restore, non-exported clear');

   await mode.selectOption('prompt');
   assert.match(await prompt.locator('.cm-line').first().textContent(),/WP04draft/);
   assert.equal(await workspace.locator('#prompt-undo').isEnabled(),true);
   await mode.selectOption('md');
   console.log('TRANSLATION_WP05A_BROWSER_PASS',name,'JSON preview readonly, exact download, Prompt preserved');
   // WP04F6: only one AG view and one full RAW source, no hidden comparison editor.
   const agPicker=workspace.locator('.ocr-ag-module-select');
   assert.deepEqual(await agPicker.locator('option').allTextContents(),['原句表']);
   assert.equal(await agPicker.inputValue(),'original');
   await count(5);
   assert.equal(await workspace.locator('#prepared-editor,.translation-comparison-divider,.translation-source-comparison').count(),0);
   assert.equal(await workspace.locator('.ocr-source-pane .cm-editor').count(),1);
   assert.equal(await source.locator('.cm-lineNumbers').count(),1);
   assert.equal((await source.locator('.cm-line').allTextContents()).join('\n'),prepared.rows.map(r=>r.raw).join(''));
   assert.equal(await preview.locator('.ocr-math.translation-protected-preview').count(),1);
   // WP04F4: full left source, adopted boundary widget, darker protected text.
   assert.equal(await source.locator('.translation-final-boundary').count(),1);
   assert.equal(await source.locator('.translation-final-boundary').getAttribute('aria-label'),'最终句界 · MDLine 3 · 句 0');
   assert.equal(await source.locator('.translation-final-boundary').evaluate(el=>getComputedStyle(el,'::before').content),'"│"');
   const rawFormula=source.locator('.cm-line').filter({hasText:'$$x=1$$'});
   assert.equal(await rawFormula.count(),1);
   assert((await rawFormula.locator('.translation-protected-source').allTextContents()).join('').includes('$$x=1$$'));
   assert.equal(await rawFormula.locator('.translation-protected-source').first().evaluate(el=>getComputedStyle(el).color),'rgb(80, 94, 85)');
   // WP04F5: actual computed styles, not just CSS presence. Compare an
   // ordinary quote text node with scanner-protected content on the same line.
   const visual=await source.evaluate(root=>{
     const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
     const colorFor=(fragment,protectedOnly=false)=>{
       walker.currentNode=root;
       for(let node=walker.nextNode();node;node=walker.nextNode()){
         const parent=node.parentElement;
         if(!node.nodeValue.includes(fragment)||!!parent.closest('.translation-protected-source')!==protectedOnly)continue;
         const owner=parent.closest('.translation-protected-source')??parent;
         return {color:getComputedStyle(parent).color,background:getComputedStyle(owner).backgroundColor,shadow:getComputedStyle(owner).boxShadow};
       }
       return null;
     };
     return {quote:colorFor('B.'),math:colorFor('r',true),body:colorFor('Text')};
   });
   assert.equal(visual.quote?.color,'rgb(154, 167, 157)','V2 quoted prose must remain unchanged');
   assert.equal(visual.quote?.background,'rgba(0, 0, 0, 0)');
   assert.equal(visual.math?.color,'rgb(80, 94, 85)');
   assert.equal(visual.math?.background,'rgb(37, 48, 44)');
   assert.notEqual(visual.math?.shadow,'none');
   assert.equal(visual.body?.color,'rgb(211, 198, 170)');
   console.log('TRANSLATION_WP04F5_BROWSER_PASS',name,JSON.stringify(visual));
   // Verify actual AG cell-container overlay and both
   // reading focus surfaces on the same non-protected sentence.
   await grid.locator('.ag-row [col-id="source_line"]').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ag-row-selected[row-id="1:0"]')&&document.querySelector('#editor .translation-focus-source')&&document.querySelector('.ocr-preview-md-scroll .translation-focus-preview'));
   await page.mouse.move(0,0);
   const focus=await page.evaluate(()=>{
     const row=document.querySelector('#workspace .ag-row-selected[row-id="1:0"]');
     const source=document.querySelector('#editor .translation-focus-source');
     const preview=document.querySelector('.ocr-preview-md-scroll .translation-focus-preview');
     const overlays=[...row.querySelectorAll('.ag-grid-pinned-left-cells,.ag-grid-pinned-right-cells,.ag-grid-scrolling-cells')].filter(el=>el.getBoundingClientRect().width>0).map(el=>getComputedStyle(el,'::before').backgroundColor);
     return {row:overlays[0],overlays,source:getComputedStyle(source).backgroundColor,preview:getComputedStyle(preview).backgroundColor,
       theme:getComputedStyle(row).getPropertyValue('--ag-selected-row-background-color').trim()};
   });
   assert.equal(focus.row,'rgba(235, 163, 82, 0.18)',JSON.stringify(focus));
   assert(focus.overlays.length>0&&focus.overlays.every(color=>color===focus.row),JSON.stringify(focus));
   assert.equal(focus.source,focus.row,JSON.stringify(focus));
   assert.equal(focus.preview,focus.row,JSON.stringify(focus));
   // Wholly protected sentences remain in AG and full source/preview.
   await rawFormula.click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .translation-focus-source')].map(n=>n.textContent).join('').includes('$$x=1$$'));
   await grid.locator('.ag-row-selected[row-id="5:0"]').first().waitFor();
   assert.equal(await preview.locator('.ocr-math.translation-focus-preview').count(),1);
   await preview.locator('table td').first().click();
   await grid.locator('.ag-row-selected[row-id="4:0"]').first().waitFor();
   assert((await source.locator('.translation-focus-source').allTextContents()).join('').includes('<table>'));
   console.log('TRANSLATION_WP04F6_BROWSER_PASS',name,JSON.stringify(focus));
   const scroll=grid.locator('.ag-body-horizontal-scroll-viewport');
   // Reveal actual virtualized columns rather than assuming a fixed scroll position.
   async function revealColumn(id){
     const header=grid.locator('.ag-header-cell[col-id="'+id+'"]');
     const max=await scroll.evaluate(el=>el.scrollWidth-el.clientWidth);
     for(const x of [530,0,...Array.from({length:Math.ceil(max/80)+1},(_,i)=>Math.min(max,i*80))]){
       await scroll.evaluate((el,x)=>{el.scrollLeft=x;},x);
       await page.waitForTimeout(150);
       if(await header.count()){
         // The header itself can be wider than the available center pane.
         // Playwright performs actual scrolling and hit-testing on the
         // interactive filter button below, and all result assertions remain.
         return header;
       }
     }
     throw Error('Unable to reveal column '+id+' '+JSON.stringify(await grid.locator('.ag-header-cell').evaluateAll(xs=>xs.map(x=>x.getAttribute('col-id')))));
   }
   const transButton=(await revealColumn('translatable')).locator('.ag-header-cell-filter-button');
   await transButton.waitFor();
   if(name==='iPad-WebKit')await transButton.tap();else await transButton.click();
   const transPopup=page.locator('.ocr-enum-filter[aria-label="可翻译 筛选"]:visible');
   await transPopup.waitFor();
   const tcb=v=>transPopup.locator('[data-filter-value="'+v+'"] input');
   assert.equal(await tcb('all').isChecked(),true);
   await tcb('all').uncheck();await count(0);await tcb('否').check();await count(1);
   assert.equal(await grid.locator('.ag-row [col-id="source_line"]').textContent(),'5');
   await page.keyboard.press('Escape');
   await revealColumn('protected');
   await page.waitForFunction(()=>[...document.querySelectorAll('#workspace .ag-row [col-id="protected"]')].some(el=>el.textContent.includes('latex')&&el.textContent.includes('$$x=1$$')));
   await revealColumn('text');
   await page.waitForFunction(()=>[...document.querySelectorAll('#workspace .ag-row [col-id="text"]')].some(el=>el.textContent.includes('⟦P0⟧')));
   await chooseNav(workspace,'settings');await waitStatus('已有译句表');await chooseNav(settings,'translation');await workspace.waitFor({state:'visible'});await count(1);
   // AG filtering never changes the export.
   await mode.selectOption('json');
   const filteredDownload=page.waitForEvent('download');await exportButton.click();
   assert.equal(await readFile(await (await filteredDownload).path(),'utf8'),expectedJSON.text);

   await chooseNav(workspace,'settings');await settings.waitFor({state:'visible'});await waitStatus('已有译句表');await bind('/demo/books/c');
   assert.equal(await nav(settings).locator('option[value="translation"]').count(),0);await count(0);
   assert.equal((await source.locator('.cm-content').textContent()).trim(),'');assert.equal(await preview.locator('h1').count(),0);
   assert.equal((await jsonHost.locator('.cm-content').textContent()).trim(),'');
   assert.equal(await workspace.locator('.translation-json-actions button').isDisabled(),true);

   assert.equal(prepCalls.length,3);
   // Reload: only the explicitly saved Prompt survives; history is session-local.
   await page.reload({waitUntil:'domcontentloaded'});
   await workspace.waitFor({state:'visible'});await count(5);assert.equal(prepCalls.length,3);assert.equal(loads.at(-1),'/demo/books/b');
   await workspace.locator('.ocr-preview-mode').selectOption('prompt');
   assert.match(await workspace.locator('.translation-prompt-editor .cm-line').first().textContent(),/WP04draft/);
   assert.equal(await workspace.locator('#prompt-undo').isDisabled(),true);
   assert.equal(await workspace.locator('#prompt-redo').isDisabled(),true);
   // Long document: the one full source retains stable navigation.
   await workspace.locator('.ocr-preview-mode').selectOption('md');
   version=3;await chooseNav(workspace,'settings');await waitStatus('已有译句表');await bind('/demo/books/d','已有译句表');assert.equal(await settings.isVisible(),true);await chooseNav(settings,'translation');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('可翻译 76 句'));
   assert.equal(await workspace.locator('#prepared-editor').count(),0);
   assert.equal(await workspace.locator('.ocr-ag-module-select option').count(),1);
   await source.locator('.cm-scroller').evaluate(el=>{el.scrollTop=(el.scrollHeight-el.clientHeight)*.65;});
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-line')].some(el=>/ROW_0[4-6]\d/.test(el.textContent)));
   const visible=source.locator('.cm-line').filter({hasText:/ROW_0[4-6]\d/}).first();
   await visible.click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .translation-focus-source')].some(el=>/ROW_0[4-6]\d/.test(el.textContent)));
   assert((await grid.locator('.ag-row-selected').count())>0);
   await workspace.locator('.ocr-preview-mode').selectOption('json');
   const selectedLong=workspace.locator('.translation-focus-json');
   await selectedLong.waitFor();assert.match(await selectedLong.textContent(),/ROW_0[4-6]\d/);
   await page.waitForFunction(()=>{const el=document.querySelector('.translation-focus-json'),sc=el?.closest('.cm-scroller');if(!sc)return false;const a=el.getBoundingClientRect(),b=sc.getBoundingClientRect();return a.bottom>b.top&&a.top<b.bottom;});
   await workspace.locator('.ocr-preview-mode').selectOption('md');
   // Late response for another authorized book cannot repopulate the new empty book.
   await chooseNav(workspace,'settings');await waitStatus('已有译句表');
   let release,started;const promise=new Promise(r=>release=r),seen=new Promise(r=>started=r);late={path:'/demo/books/b',promise,started};
   await adopt('/demo/books/b');await seen;await bind('/demo/books/c');release();late=null;await sleep(200);
   assert.equal(await tableOption(settings).count(),0);await count(0);assert.equal((await source.locator('.cm-content').textContent()).trim(),'');
   denied=true;await bind('/demo/books/d','工作区文件读写验证失败');assert.equal(await nav(settings).locator('optgroup[label="SQL"]').count(),0);
   denied=false;await bind('/demo/books/d','已有译句表');await chooseNav(settings,'translation');await workspace.waitFor({state:'visible'});assert.equal(prepCalls.length,3);
   console.log('TRANSLATION_WP05A1_BROWSER_PASS',name,'SQL group modal, cancel/keyboard/touch, no fake table, GET-only restore and switching, no automatic POST, stale/denied/late cleared',JSON.stringify({loads,prepCalls:prepCalls.length}));
   console.log('TRANSLATION_WP04_BROWSER_PASS' ,name,'three panes, independent Prompt, undo/redo, save/reload, reading preserved');
   console.log('TRANSLATION_WP04F1_BROWSER_PASS',name,'one init, one table, raw/text/refill, filter, stale refusal, source/preview and Prompt preserved');
   assert.deepEqual(errors,[]);console.log('TRANSLATION_WP01_BROWSER_PASS',name,'bind/init/raw/readonly/native all/multi/refresh/change/failure/retry',JSON.stringify({reads,probes}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
