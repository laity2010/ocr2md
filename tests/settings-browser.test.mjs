/** Real WP Settings triple-pane regression: Chrome + WebKit, isolated Vite I/O. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
const root=process.cwd();
const folder=mkdtempSync(join(tmpdir(),'ocr2md-v6-settings-test-'));
const jsonPath=join(folder,'settings.json');
const port=5763,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:root,env:{...process.env,V6_SETTINGS_PATH:jsonPath,
    V6_DOCUMENT_PATH:join(folder,'mother.minerujson.md')},stdio:'ignore'});
const pause=t=>new Promise(r=>setTimeout(r,t));
let ready=false;
for(let i=0;i<180;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await pause(120);}
assert(ready,'Vite settings test server failed to start');
const engines=[['Chromium',chromium,{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{headless:true,executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
try{
  for(const [name,engine,options]of engines){
    const browser=await engine.launch(options);
    try{
      const page=await browser.newPage({viewport:{width:1365,height:840}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.locator('#editor .cm-editor').waitFor({state:'visible'});
      assert.equal(await page.locator('.dv-groupview').count(),3,'Unopened settings must not create a second Dockview');
      assert.equal(await page.locator('.cm-content').count(),1,'Unopened settings must not create a second CM6');
      await page.locator('#module-select').selectOption('settings');
      const slider=page.locator('#settings-font-slider');
      await slider.waitFor({state:'visible',timeout:25000});
      assert.equal(await slider.inputValue(),name==='Chromium'?'12':'14');
      // The startup settings snapshot is asynchronous. Compare both sources
      // only after its saved font size has actually been published to CSS.
      await page.waitForFunction(()=>document.documentElement.style.getPropertyValue(
        '--ocr-cm-source-font-size')===document.querySelector('#settings-font-slider')?.value+'pt',
        null,{timeout:16000});
      const sourceStyle=await page.locator('#editor .cm-editor').evaluate(el=>({
        background:getComputedStyle(el).backgroundColor,
        color:getComputedStyle(el).color,
        font:getComputedStyle(el).fontSize,
        family:getComputedStyle(el.querySelector('.cm-scroller')).fontFamily,
        gutters:getComputedStyle(el.querySelector('.cm-gutters')).backgroundColor,
        caret:getComputedStyle(el.querySelector('.cm-content')).caretColor,
      }));
      assert.equal(await page.locator('#settings-workspace .cm-editor').count(),1);
      assert.equal(await page.locator('#editor .cm-editor').count(),1);
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),1);
      assert.deepEqual(await page.locator('#settings-workspace .ocr-settings-filter-header span').allTextContents(),
        ['一级分类','二级分类','键名']);
      assert.equal((await page.locator('#settings-workspace .ag-header-cell-text').allTextContents()).at(-1),
        '键注释');
      assert.equal(await page.locator('#settings-workspace .ocr-settings-filter').count(),3);
      assert.deepEqual(await page.locator('#settings-workspace .ag-header-cell[col-id]').evaluateAll(nodes=>
        nodes.map(node=>node.getAttribute('col-id'))),
        ['primaryCategory','secondaryCategory','keyName','keyComment']);
      assert((await page.locator('#settings-workspace .ag-header-cell[col-id]').evaluateAll(nodes=>
        nodes.every(node=>node.classList.contains('ag-header-cell')&&!node.querySelector('.ag-header-cell-moving')))));
      const initialJSON=JSON.parse(await page.locator('#settings-workspace .cm-content').innerText());
      assert.equal(initialJSON.$comments['globalUi.cmSource.defaultFontSize'],
        '所有 CM6 源码窗的默认字号（8–32 pt）');
      assert.equal(initialJSON.$comments.globalUi,'全局 UI');
      assert.equal(initialJSON.$comments['globalUi.cmSource'],'CM 源码窗');
      const agCells=await page.locator('#settings-workspace .ag-row [col-id]').allTextContents();
      assert(agCells.includes('全局 UI'));
      assert(agCells.includes('CM 源码窗'));
      assert(agCells.includes('defaultFontSize'));
      assert(agCells.some(v=>v.includes('所有 CM6 源码窗')));
      const settingsStyle=await page.locator('#settings-workspace .cm-editor').evaluate(el=>({
        background:getComputedStyle(el).backgroundColor,
        color:getComputedStyle(el).color,
        font:getComputedStyle(el).fontSize,
        family:getComputedStyle(el.querySelector('.cm-scroller')).fontFamily,
        gutters:getComputedStyle(el.querySelector('.cm-gutters')).backgroundColor,
        caret:getComputedStyle(el.querySelector('.cm-content')).caretColor,
      }));
      assert.deepEqual(settingsStyle,sourceStyle,'Every CM6 source must share its appearance');
      const coloredJSON=await page.locator('#settings-workspace .cm-content').evaluate(el=>{
        const ordinary=getComputedStyle(el).color;
        return [...el.querySelectorAll('.cm-line span')].map(span=>({
          text:span.textContent,color:getComputedStyle(span).color,
        })).filter(item=>item.color!==ordinary);
      });
      assert(coloredJSON.some(span=>span.text.includes('defaultFontSize')),
        'JSON property names must have syntax highlighting');
      assert(coloredJSON.some(span=>/^(?:12|14)$/.test(span.text)),
        'JSON number values must have syntax highlighting');
      await page.waitForFunction(()=>[...document.querySelectorAll('#settings-workspace .ag-row')].some(e=>e.textContent.includes('全局 UI')),{timeout:10000});
      const labels=await page.locator('#settings-workspace .ag-row').allTextContents();
      assert(labels[0]?.includes('defaultFontSize'));
      assert((await page.locator('.ocr-settings-breadcrumb').textContent()).includes('全局 UI / CM 源码窗 / defaultFontSize'));
      assert.equal(await page.locator('.ocr-settings-control label').textContent(),'defaultFontSize');
      assert.equal(await page.locator('.ocr-settings-key-comment').textContent(),
        initialJSON.$comments['globalUi.cmSource.defaultFontSize']);
      // Exact-value filters exist only on the first three fixed-order columns.
      const firstFilter=page.getByRole('combobox',{name:'筛选一级分类'});
      await firstFilter.selectOption('全局 UI');
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),1);
      await firstFilter.selectOption('');
      // Hide the row deliberately, then click its JSON source key. Source -> AG
      // must clear the now-incompatible filter and locate the matching row.
      await firstFilter.evaluate(element=>{
        const missing=document.createElement('option');missing.value='NO_SUCH_CATEGORY';
        missing.textContent='NO_SUCH_CATEGORY';element.append(missing);
        element.value=missing.value;element.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length===0);
      const sourceKey=page.locator('#settings-workspace .cm-line span')
        .filter({hasText:'defaultFontSize'}).last();
      await sourceKey.click();
      await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length===1);
      assert.equal(await firstFilter.inputValue(),'');
      await page.locator('#settings-workspace .ag-row').click();
      // AG -> CMD selects the *real JSON key*, never the localized label.
      assert((await page.locator('#settings-workspace .cm-content').innerText()).includes('defaultFontSize'));
      assert.equal(await page.locator('#settings-workspace .ag-row-selected').count(),1);
      const setSlider=async value=>{await slider.evaluate((element,v)=>{
        element.value=String(v);element.dispatchEvent(new Event('input',{bubbles:true}));
      },value);};
      const computed=()=>page.evaluate(()=>getComputedStyle(document.querySelector('#editor .cm-editor')).fontSize);
      await setSlider(name==='Chromium'?18:16);
      await page.waitForFunction(expected=>document.documentElement.style.getPropertyValue(
        '--ocr-cm-source-font-size')===expected, (name==='Chromium'?18:16)+'pt',{timeout:15000});
      // WebKit does not compute styles for descendants of display:none.
      // Check the published token, then verify visible CM editor geometry.
      assert.equal(await page.evaluate(()=>document.documentElement.style
        .getPropertyValue('--ocr-cm-source-font-size')), (name==='Chromium'?18:16)+'pt');
      assert(Math.abs(parseFloat(await page.locator('#settings-workspace .cm-editor')
        .evaluate(node=>getComputedStyle(node).fontSize))-(name==='Chromium'?24:21.33333))<0.1);
      await page.locator('#module-select').selectOption('chapter-boundary');
      assert(Math.abs(parseFloat(await computed())-(name==='Chromium'?24:21.33333))<0.1);
      await page.locator('#module-select').selectOption('settings');
      await slider.waitFor({state:'visible'});
      const raw=await page.locator('#settings-workspace .cm-content').innerText();
      assert.equal(JSON.parse(raw).globalUi.cmSource.defaultFontSize,name==='Chromium'?18:16);
      await page.locator('#undo').click();
      assert.equal(await slider.inputValue(),name==='Chromium'?'12':'14');
      await page.locator('#redo').click();
      assert.equal(await slider.inputValue(),name==='Chromium'?'18':'16');
      if(name==='Chromium'){
        // User changes JSON directly in CM6; registration publishes the same value.
        const editor=page.locator('#settings-workspace .cm-content');
        await editor.click();await editor.press('ControlOrMeta+A');
        await page.keyboard.insertText('{"globalUi":{"cmSource":{"defaultFontSize":14}}}\n');
        await page.waitForTimeout(150);
        assert.equal(await slider.inputValue(),'14');
        assert.equal(await page.evaluate(()=>document.documentElement.style
          .getPropertyValue('--ocr-cm-source-font-size')),'14pt');
        await page.locator('#module-select').selectOption('chapter-boundary');
        assert.equal(await page.locator('#editor .cm-editor').count(),1);
        await page.locator('#module-select').selectOption('settings');
        assert.equal(await slider.inputValue(),'14');
        // Playwright click returns before the asynchronous CMD save completes.
        // A successful PUT response establishes that the server has committed
        // the JSON file atomically before disk bytes are asserted below.
        const saveResponse=page.waitForResponse(response=>response.url().endsWith('/api/settings')&&
          response.request().method()==='PUT',{timeout:20000});
        await page.locator('#save').click();
        assert.equal((await saveResponse).status(),200,'CMD must confirm JSON persistence');
        const persisted=JSON.parse(readFileSync(jsonPath,'utf8'));
        assert.equal(persisted.globalUi.cmSource.defaultFontSize,14);
        assert.equal(persisted.$comments['globalUi.cmSource.defaultFontSize'],
          '所有 CM6 源码窗的默认字号（8–32 pt）',
          'CMD should restore missing key comments before saving legacy JSON');
        // Verify round-trip persistence, not merely an unsaved in-memory value.
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#module-select').selectOption('settings');
        await slider.waitFor();
        assert.equal(await slider.inputValue(),'14');
        // The metadata really comes from JSON. Editing its text instantly
        // updates the AG comment and preview without changing the font value.
        const annotated=JSON.parse(await page.locator('#settings-workspace .cm-content').innerText());
        annotated.$comments['globalUi.cmSource.defaultFontSize']='手动修改的字号注释';
        const metadataEditor=page.locator('#settings-workspace .cm-content');
        await metadataEditor.click();await metadataEditor.press('ControlOrMeta+A');
        await page.keyboard.insertText(JSON.stringify(annotated,null,2));
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-key-comment')?.textContent===
          '手动修改的字号注释',{timeout:10000});
        assert((await page.locator('#settings-workspace .ag-row').innerText()).includes('手动修改的字号注释'));
        assert.equal(await slider.inputValue(),'14');
        // The cursor on the JSON leaf or its comment must locate the AG row.
        await page.locator('#settings-workspace .cm-line').filter({hasText:'"defaultFontSize": 14'}).first().click();
        assert.equal(await page.locator('#settings-workspace .ag-row-selected').count(),1);
        // Invalid yet parseable JSON must not emit a changed message or save.
        const direct=page.locator('#settings-workspace .cm-content');
        await direct.click();await direct.press('ControlOrMeta+A');
        await page.keyboard.insertText('{"globalUi":{"cmSource":{"defaultFontSize":33}}}');
        await page.waitForTimeout(150);
        assert.equal(await slider.isDisabled(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.style
          .getPropertyValue('--ocr-cm-source-font-size')),'14pt');
        // Invalid JSON must NOT cause a PUT. The previous persisted value
        // remains unchanged even when Save is clicked.
        await page.locator('#save').click();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('设置保存失败'),
          null,{timeout:16000});
        assert.equal(JSON.parse(readFileSync(jsonPath,'utf8')).globalUi.cmSource.defaultFontSize,14);
        await page.locator('#undo').click();
        assert.equal(await slider.isEnabled(),true);
        assert.equal(await slider.inputValue(),'14');
        // Two modules may legitimately have the same leaf name. CMD must
        // update the full registered path and leave the other value untouched.
        const duplicate=JSON.parse(await direct.innerText());
        duplicate.otherGroup={defaultFontSize:7};
        duplicate.$comments.otherGroup='Unregistered test group';
        duplicate.$comments['otherGroup.defaultFontSize']='Unregistered duplicate key';
        await direct.click();await direct.press('ControlOrMeta+A');
        await page.keyboard.insertText(JSON.stringify(duplicate,null,2));
        await slider.evaluate(node=>{node.value='19';node.dispatchEvent(new Event('input',{bubbles:true}));});
        await page.waitForFunction(()=>document.documentElement.style.getPropertyValue(
          '--ocr-cm-source-font-size')==='19pt',{timeout:15000});
        const afterDuplicate=JSON.parse(await direct.innerText());
        assert.equal(afterDuplicate.globalUi.cmSource.defaultFontSize,19);
        assert.equal(afterDuplicate.otherGroup.defaultFontSize,7);
      }
      assert.equal(errors.length,0,`uncaught page errors: ${errors.join(';')}`);
      if(name==='Chromium'){
        await page.screenshot({path:resolve('.v6/evidence/settings-three-pane.png')});
      }
      console.log('SETTINGS_BROWSER_PASS',name,JSON.stringify({agCategories:true,jsonCM:true,slider:true,
        messageApplied:true,undoRedo:true,saveReload:name==='Chromium'}));
      await page.close();
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
