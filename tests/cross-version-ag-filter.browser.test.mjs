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
   const old=await sampleSnapshot(),fresh=await sampleSnapshot(' refreshed'),withFormula=await sampleSnapshot(' prepared',true,true),longSnapshot=await sampleSnapshot(' scroll',true,true,72);
   const prepared=preparedFixture(withFormula),oldPrepared=preparedFixture(old),freshPrepared=preparedFixture(fresh),longPrepared=preparedFixture(longSnapshot);
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>r.fulfill({json:{authorized:true}}));
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>r.fulfill({json:{allowedRoots:['/demo/books']}}));
   await page.route('**/labs/lab-frame/api/workspace-io/browse?*',r=>{const path=new URL(r.request().url()).searchParams.get('path');return r.fulfill({json:{path,children:path==='/demo/books'?[{path:'/demo/books/a',name:'a'},{path:'/demo/books/b',name:'b'}]:[]}});});
   await page.route('**/labs/lab-frame/api/workspace-io/probe',r=>{probes.push(r.request().postDataJSON().workspace);return r.fulfill({json:{verified:true,readable:true,writable:true}});});
   await page.route('**/labs/lab-sentence/api/**',r=>{assert.equal(r.request().method(),'GET');const u=new URL(r.request().url());assert(u.pathname.endsWith('/sentence/snapshot'));reads.push(u.searchParams.get('workspace'));return failed?r.fulfill({status:409,json:{error:'句表已过期'}}):r.fulfill({json:version===3?longSnapshot:version===2?withFormula:version?fresh:old});});
   await page.route('**/labs/lab-translation/api/translation/initialize',r=>{
    assert.equal(r.request().method(),'POST');
    const input=r.request().postDataJSON();
    const source=version===3?longSnapshot:version===2?withFormula:version?fresh:old;
    assert.deepEqual(input,{workspace:reads.at(-1),source_document_hash:source.source_document_hash,sentence_sha256:source.sentence_sha256});
    prepCalls.push(input);
    return preparationFailed?r.fulfill({status:409,json:{error:'已有译句表不一致，拒绝覆盖'}}):r.fulfill({json:version===3?longPrepared:version===2?prepared:version?freshPrepared:oldPrepared});
   });
   await page.goto(HOST,{waitUntil:'domcontentloaded'});
   const settings=page.locator('#settings-workspace'),workspace=page.locator('#workspace'),grid=workspace.locator('.ocr-outline-grid');
   const nav=scope=>scope.locator('.ocr-source-file-select');
   const chooseNav=async(scope,value)=>{const wrapper=scope.locator('.ocr-navigation-files.ts-wrapper');await wrapper.locator('.ts-control').click();await page.locator('.ocr-navigation-popup-files:visible [data-value="'+value+'"]').click();};
   const tableOption=scope=>nav(scope).locator('option[value="translation"]');
   const count=n=>page.waitForFunction(n=>document.querySelectorAll('#workspace .ocr-outline-grid .ag-row').length===n,n,{timeout:10000});
   await settings.locator('.ag-row').first().waitFor();
   assert.equal(await nav(settings).locator('optgroup[label="SQL"]').count(),0);assert.equal(reads.length,0);
   async function bind(path){
    await settings.locator('.ag-row',{hasText:'dataDirectory'}).click();await page.getByRole('button',{name:'打开目录树'}).click();
    const root=page.locator('wa-tree-item[data-path="/demo/books"]');await root.waitFor();
    if(!(await root.evaluate(el=>el.expanded)))await root.locator('[part="expand-button"]').first().click();
    const child=page.locator('wa-tree-item[data-path="'+path+'"]');await child.waitFor();await child.locator('[part="item"]').first().click();await page.getByRole('button',{name:'采用选中目录'}).click();
    await page.waitForFunction(path=>document.querySelector('[aria-label="当前资料目录"]')?.value===path,path);
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('可 SQL 初始化')&&document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql-init"]'));
    assert.equal(probes.at(-1),path);
   }
   await bind('/demo/books/a');assert.equal(reads.length,0);assert.equal(await tableOption(settings).count(),0);
   await page.locator('#global-save').click();await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-translation.settings.json.v1')?.includes('/demo/books/a')&&document.querySelector('#status')?.textContent.includes('可 SQL 初始化'));
   await chooseNav(settings,'sql-init');await workspace.waitFor({state:'visible'});await count(4);
   assert.deepEqual(reads,['/demo/books/a']);assert.equal(await tableOption(workspace).count(),1);assert.deepEqual(await nav(workspace).locator('optgroup[label="SQL"] option').evaluateAll(xs=>xs.map(x=>x.value)),['sql-init','translation']);assert.equal(await workspace.locator('.dv-content-container').count(),3);
   assert.equal((await workspace.locator('#editor .cm-content .cm-line').first().textContent()),'# Heading');
   assert.equal(await workspace.locator('#editor .cm-content').getAttribute('contenteditable'),'false');
   assert.equal(await workspace.locator('.ocr-preview-md-scroll h1').textContent(),'Heading');assert.equal(await workspace.locator('#undo').isDisabled(),true);assert.equal(await workspace.locator('#redo').isDisabled(),true);
   assert.equal(await grid.locator('.ag-row [col-id="raw"]').count(),4);
   assert.equal(await grid.locator('.ag-row [col-id="raw"]').first().textContent(),'# Heading\n\n');
   assert.equal(await grid.locator('table').count(),0,'raw HTML is text, not rendered HTML');
   const openFilter=async()=>{await grid.locator('.ag-body-horizontal-scroll-viewport').evaluate(el=>el.scrollLeft=320);const button=grid.locator('.ag-header-cell[col-id="type"] .ag-header-cell-filter-button');await button.waitFor();if(name==='iPad-WebKit')await button.tap();else await button.click();const pop=page.locator('.ocr-enum-filter[aria-label="type 筛选"]:visible');await pop.waitFor();return pop;};
   let popup=await openFilter();let cb=v=>popup.locator(`[data-filter-value="${v}"] input`);
   assert.equal(await cb('all').isChecked(),true);await cb('all').uncheck();await count(0);await cb('title').check();await count(1);await cb('text').check();await count(3);
   await page.keyboard.press('Escape');await chooseNav(workspace,'sql-init');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('译句表 ·'));await count(3);
   popup=await openFilter();assert.equal(await cb('title').isChecked(),true);assert.equal(await cb('text').isChecked(),true);assert.equal(await cb('table_body').isChecked(),false);await cb('all').check();await count(4);await page.keyboard.press('Escape');
   await chooseNav(workspace,'settings');await settings.waitFor({state:'visible'});await bind('/demo/books/b');assert.equal(await tableOption(settings).count(),0);await count(0);
   failed=true;await chooseNav(settings,'sql-init');await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('SQL 初始化失败'));assert.equal(await tableOption(settings).count(),0);assert.equal(await workspace.isVisible(),false);
   failed=false;version=2;preparationFailed=true;await chooseNav(settings,'sql-init');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('SQL 初始化失败'));
   assert.equal(await tableOption(settings).count(),0);await count(0);
   assert.equal(await workspace.isVisible(),false);
   preparationFailed=false;await chooseNav(settings,'sql-init');
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
   assert.deepEqual(await mode.locator('option').evaluateAll(xs=>xs.map(x=>x.value)),['md','prompt']);
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
   await mode.selectOption('md');
   // WP04F2: AG owns the two views, not SQL navigation.
   const agPicker=workspace.locator('.ocr-ag-module-select');
   assert.deepEqual(await agPicker.locator('option').allTextContents(),['原句表','待译句表']);
   assert.equal(await agPicker.inputValue(),'original');
   const beforeViewCalls=prepCalls.length, beforeViewReads=reads.length;
   await agPicker.selectOption('pending');await count(4);
   assert.equal(await workspace.locator('#editor .cm-line').allTextContents().then(x=>x.join('\n')),prepared.rows.map(r=>r.translatable?r.raw:r.raw.replace(/[^\n]/g,'')).join(''));
   assert.equal(await preview.locator('.ocr-math').count(),0);
   assert.equal(await preview.locator('.ocr-reviewed-inline-latex.translation-protected-preview').count(),1);
   assert((await source.locator('.translation-protected-source').allTextContents()).join('').includes('$r_t$'));
   assert.equal(await grid.locator('.ag-row [col-id="source_line"]').last().textContent(),'4');
   // WP04F3: only the source body is split; left RAW/line numbers, right text.
   const compare=workspace.locator('#prepared-editor');
   await compare.waitFor({state:'visible'});
   assert.equal(await source.locator('.cm-lineNumbers').count(),1);
   assert.equal(await compare.locator('.cm-gutters').count(),0);
   assert.equal(await compare.locator('.cm-content').getAttribute('contenteditable'),'false');
   assert.equal((await compare.locator('.cm-line').allTextContents()).join('\n'),prepared.rows.filter(r=>r.translatable).map(r=>r.text).join('\n'));
   const sides=await page.evaluate(()=>{
     const l=document.querySelector('#editor').getBoundingClientRect(),r=document.querySelector('#prepared-editor').getBoundingClientRect();
     return {left:l.right,right:r.left,lh:l.height,rh:r.height,width:r.width};
   });
   assert(sides.right>=sides.left-2&&sides.width>30&&Math.abs(sides.lh-sides.rh)<3);
   await compare.locator('.cm-line').filter({hasText:'B.'}).click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .translation-focus-source')].map(n=>n.textContent).join('').includes('B.'));
   await grid.locator('.ag-row-selected[row-id="3:1"]').first().waitFor();
   assert((await compare.locator('.translation-focus-source').allTextContents()).join('').includes('B.'));
   await source.locator('.cm-line').first().click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#prepared-editor .translation-focus-source')].map(n=>n.textContent).join('').includes('Heading'));
   assert.equal(await grid.locator('.ag-row-selected [col-id="source_line"]').textContent(),'1');

   await grid.locator('.ag-body-horizontal-scroll-viewport').evaluate(el=>el.scrollLeft=0);
   assert.equal(await grid.locator('.ag-header-cell[col-id="text"]').count(),1);
   await grid.locator('.ag-row [col-id="source_line"]').last().click();
   await page.waitForFunction(()=>[...document.querySelectorAll('#editor .translation-focus-source')].map(n=>n.textContent).join('').includes('<table>'));
   await agPicker.selectOption('original');await count(5);assert.equal(await compare.isVisible(),false);
   assert.equal((await source.locator('.cm-line').allTextContents()).join('\n'),withFormula.rows.map(r=>r.raw).join(''));
   assert.equal(await preview.locator('.ocr-math.translation-protected-preview').count(),1);
   assert.equal(prepCalls.length,beforeViewCalls);assert.equal(reads.length,beforeViewReads);
   console.log('TRANSLATION_WP04F2_BROWSER_PASS',name,'pending view and reversible reading projection without SQL');
   const scroll=grid.locator('.ag-body-horizontal-scroll-viewport');
   // Column definitions are replaced on view switch. WebKit may restore
   // horizontal scroll asynchronously. Reveal actual virtualized columns
   // rather than assuming an unchanged fixed pixel position.
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
   await chooseNav(workspace,'translation');await count(1);
   await chooseNav(workspace,'settings');await settings.waitFor({state:'visible'});await bind('/demo/books/a');
   assert.equal(await nav(settings).locator('option[value="translation"]').count(),0);await count(0);
   assert.equal((await source.locator('.cm-content').textContent()).trim(),'');assert.equal(await preview.locator('h1').count(),0);
   assert.equal(prepCalls.length,4);
   // Reload: only the explicitly saved Prompt survives; history is session-local.
   await page.reload({waitUntil:'domcontentloaded'});
   await settings.locator('.ag-row').first().waitFor();
   await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql-init"]'));
   await chooseNav(settings,'sql-init');await workspace.waitFor({state:'visible'});await count(5);
   await workspace.locator('.ocr-preview-mode').selectOption('prompt');
   assert.match(await workspace.locator('.translation-prompt-editor .cm-line').first().textContent(),/WP04draft/);
   assert.equal(await workspace.locator('#prompt-undo').isDisabled(),true);
   assert.equal(await workspace.locator('#prompt-redo').isDisabled(),true);
   // Long document: real scroll events in both panes, differing wrapping
   // and sentence counts. Drive the scrolling pane via native scrollDOM.
   await workspace.locator('.ocr-preview-mode').selectOption('md');
   version=3;await chooseNav(workspace,'sql-init');
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('可翻译 76 句'));
   await workspace.locator('.ocr-ag-module-select').selectOption('pending');
   await workspace.locator('#prepared-editor').waitFor({state:'visible'});
   const scrollPair=async(from,to,ratio)=>{
     const a=workspace.locator(from+' .cm-scroller'),b=workspace.locator(to+' .cm-scroller');
     const before=await b.evaluate(el=>el.scrollTop);
     await a.evaluate((el,ratio)=>{
       el.dispatchEvent(new WheelEvent('wheel',{deltaY:100,bubbles:true}));
       el.scrollTop=(el.scrollHeight-el.clientHeight)*ratio;
     },ratio);
     await page.waitForFunction(({sel,before})=>Math.abs(document.querySelector(sel+' .cm-scroller').scrollTop-before)>100,{sel:to,before});
     // Verify the same numbered passage is visible near the top on each
     // side, not merely that scrollTop changed by the same pixel amount.
     const visible=sel=>[...document.querySelectorAll(sel+' .cm-line')].filter(el=>{
       const rect=el.getBoundingClientRect(),sc=el.closest('.cm-scroller').getBoundingClientRect();
       return rect.bottom>sc.top+1&&rect.top<sc.top+Math.min(sc.height,100);
     }).map(el=>Number(el.textContent.match(/ROW_(\d+)/)?.[1])).filter(Number.isFinite);
     await page.waitForFunction(({from,to})=>{
       const visible=sel=>[...document.querySelectorAll(sel+' .cm-line')].filter(el=>{
         const rect=el.getBoundingClientRect(),sc=el.closest('.cm-scroller').getBoundingClientRect();
         return rect.bottom>sc.top+1&&rect.top<sc.top+Math.min(sc.height,120);
       }).map(el=>Number(el.textContent.match(/ROW_(\d+)/)?.[1])).filter(Number.isFinite);
       const x=visible(from),y=visible(to);
       return x.length&&y.length&&Math.abs(x[0]-y[0])<=2;
     },{from,to},{timeout:10000});
   };
   await scrollPair('#editor','#prepared-editor',.65);
   await scrollPair('#prepared-editor','#editor',.25);
   console.log('TRANSLATION_WP04F3_BROWSER_PASS',name,'split/gutters/exact text/click focus/semantic scrolling both directions');
   console.log('TRANSLATION_WP04_BROWSER_PASS',name,'three panes, independent Prompt, undo/redo, save/reload, reading preserved');
   console.log('TRANSLATION_WP04F1_BROWSER_PASS',name,'one init, one table, raw/text/refill, filter, stale refusal, source/preview and Prompt preserved');
   assert.deepEqual(errors,[]);console.log('TRANSLATION_WP01_BROWSER_PASS',name,'bind/init/raw/readonly/native all/multi/refresh/change/failure/retry',JSON.stringify({reads,probes}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
