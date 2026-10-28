/** Real WP Settings triple-pane regression: Chrome + WebKit, isolated Vite I/O. */
import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir,homedir} from 'node:os';
import {join,resolve} from 'node:path';
const root=process.cwd();
const folder=mkdtempSync(join(tmpdir(),'ocr2md-v6-settings-test-'));
const jsonPath=join(folder,'settings.json');
const KEY='globalUi.cmSource.defaultFontSize';
const TITLE_KEY='chapterBoundary.ag.titleFontScale';
// Start from the previously published V6 scalar+$comments schema; opening
// settings must migrate it once without writing until Save.
writeFileSync(jsonPath,JSON.stringify({
  $comments:{[KEY]:'旧格式中保留的字号说明'},
  globalUi:{cmSource:{defaultFontSize:12}},
  otherSystem:{untouched:true},
},null,2)+'\n');
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
      await selectModule(page,'settings');
      const slider=page.locator('#settings-font-slider');
      const sourceJSON=()=>page.evaluate(()=>JSON.parse(window.__v6cm6.settings.source.getText()));
      // The new navigation-font setting can be the last selected Settings
      // record. Select the CM font row through the real AG UI before asserting
      // the expected saved 12pt/14pt fixture, never assume the default row.
      await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'})
        .first().click();
      await page.waitForFunction(()=>document.querySelector('.ocr-settings-control label')?.textContent==='defaultFontSize',
        null,{timeout:20000});
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
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),3,
        'CM font, title scale and navigation dropdown are registered');
      assert.deepEqual(await page.locator('#settings-workspace .ag-header-cell-text').allTextContents(),
        ['一级分类','二级分类','键名','键注释']);
      assert.equal(await page.locator('#settings-workspace .ag-header-cell-filter-button').count(),3,
        'Reuse native AG Grid filter buttons for the first 3 columns');
      assert.equal(await page.locator('#settings-workspace .ocr-settings-filter-header').count(),0,
        'No parallel custom header filters');
      assert.deepEqual(await page.locator('#settings-workspace .ag-header-cell[col-id]').evaluateAll(nodes=>
        nodes.map(node=>node.getAttribute('col-id'))),
        ['primaryCategory','secondaryCategory','keyName','keyComment']);
      assert((await page.locator('#settings-workspace .ag-header-cell[col-id]').evaluateAll(nodes=>
        nodes.every(node=>node.classList.contains('ag-header-cell')&&!node.querySelector('.ag-header-cell-moving')))));
      const initialJSON=await sourceJSON();
      const record=initialJSON.settings[KEY];
      assert.equal(record.key,'defaultFontSize');
      assert.equal(record.category1,'全局 UI');
      assert.equal(record.category2,'CM 源码窗');
      assert.equal(record.comment,'旧格式中保留的字号说明');
      assert.deepEqual(record.range,{min:8,max:32,step:1});
      assert.equal(record.value,name==='Chromium'?12:14);
      assert.deepEqual(initialJSON.settings[TITLE_KEY].range,{min:0.2,max:2,step:0.1});
      assert.equal(initialJSON.settings[TITLE_KEY].value,1);
      assert.equal(initialJSON.settings[TITLE_KEY].category1,'章节定界');
      assert.equal(initialJSON.settings[TITLE_KEY].category2,'AG 表');
      assert.equal(initialJSON.$legacy.otherSystem.untouched,true,
        'Migrating schema must preserve unrelated legacy settings');
      const agCells=await page.locator('#settings-workspace .ag-row [col-id]').allTextContents();
      assert(agCells.includes('全局 UI'));
      assert(agCells.includes('CM 源码窗'));
      assert(agCells.includes('defaultFontSize'));
      assert(agCells.some(v=>v.includes('旧格式中保留的字号说明')));
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
      assert(labels.some(row=>row.includes('defaultFontSize')),
        'CM saved font setting must be present regardless of AG row sorting');
      assert((await page.locator('.ocr-settings-breadcrumb').textContent()).includes('全局 UI / CM 源码窗 / defaultFontSize'));
      assert.equal(await page.locator('.ocr-settings-control label').textContent(),'defaultFontSize');
      assert.equal(await page.locator('.ocr-settings-key-comment').textContent(),
        record.comment);
      // The Chapter Outline's native checkbox filter is reused verbatim.
      const filterButton=page.locator('#settings-workspace .ag-header-cell[col-id="primaryCategory"] .ag-header-cell-filter-button');
      await filterButton.click();
      const nativeFilter=page.locator('.ocr-enum-filter:visible');
      await nativeFilter.waitFor();
      assert.equal(await nativeFilter.locator('[data-filter-value="全局 UI"]').count(),1);
      await nativeFilter.locator('[data-filter-value="全局 UI"] input').uncheck();
      await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length===1);
      // Click the source record: it must clear a filter that hides that row.
      await page.locator('#settings-workspace .cm-line').filter({hasText:'"key": "defaultFontSize"'}).first().click();
      await page.waitForFunction(()=>document.querySelectorAll('#settings-workspace .ag-row').length===3);
      assert.equal(await page.locator('#settings-workspace .ag-row-selected').count(),1);
      assert.equal(await page.locator('#settings-workspace .ag-header-cell-filter-button').count(),3);
      await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).click();
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
      await selectModule(page,'chapter-boundary');
      assert(Math.abs(parseFloat(await computed())-(name==='Chromium'?24:21.33333))<0.1);
      await selectModule(page,'settings');
      await slider.waitFor({state:'visible'});
      const raw=await page.evaluate(()=>window.__v6cm6.settings.source.getText());
      assert.equal(JSON.parse(raw).settings[KEY].value,name==='Chromium'?18:16);
      await page.locator('#undo').click();
      assert.equal(await slider.inputValue(),name==='Chromium'?'12':'14');
      await page.locator('#redo').click();
      assert.equal(await slider.inputValue(),name==='Chromium'?'18':'16');
      if(name==='Chromium'){
        // User changes JSON directly in CM6; registration publishes the same value.
        const editor=page.locator('#settings-workspace .cm-content');
        await editor.click();await editor.press('ControlOrMeta+A');
        const current=await sourceJSON();
        current.settings[KEY].value=14;
        await page.keyboard.insertText(JSON.stringify(current,null,2)+'\n');
        // Full-document paste leaves the cursor at the final (chapter) record.
        // Explicitly reselect the CM setting before testing its slider.
        await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).click();
        await page.waitForTimeout(150);
        assert.equal(await slider.inputValue(),'14');
        assert.equal(await page.evaluate(()=>document.documentElement.style
          .getPropertyValue('--ocr-cm-source-font-size')),'14pt');
        await selectModule(page,'chapter-boundary');
        assert.equal(await page.locator('#editor .cm-editor').count(),1);
        await selectModule(page,'settings');
        assert.equal(await slider.inputValue(),'14');
        // Playwright click returns before the asynchronous CMD save completes.
        // A successful PUT response establishes that the server has committed
        // the JSON file atomically before disk bytes are asserted below.
        const saveResponse=page.waitForResponse(response=>response.url().endsWith('/api/settings')&&
          response.request().method()==='PUT',{timeout:20000});
        await page.locator('#save').click();
        assert.equal((await saveResponse).status(),200,'CMD must confirm JSON persistence');
        const persisted=JSON.parse(readFileSync(jsonPath,'utf8'));
        assert.equal(persisted.settings[KEY].value,14);
        assert.equal(persisted.settings[KEY].comment,'旧格式中保留的字号说明',
          'Migrate old comment into the parameter record');
        assert.equal(persisted.$legacy.otherSystem.untouched,true);
        // Verify round-trip persistence, not merely an unsaved in-memory value.
        await page.reload({waitUntil:'domcontentloaded'});
        await selectModule(page,'settings');
        await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'})
          .first().click();
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-control label')?.textContent==='defaultFontSize',
          null,{timeout:16000});
        await slider.waitFor();
        assert.equal(await slider.inputValue(),'14');
        // The metadata really comes from JSON. Editing its text instantly
        // updates the AG comment and preview without changing the font value.
        const annotated=await sourceJSON();
        annotated.settings[KEY].comment='手动修改的字号注释';
        annotated.settings[KEY].category1='个性化 UI';
        annotated.settings[KEY].category2='源码编辑器';
        annotated.settings[KEY].range={min:10,max:24,step:1};
        const metadataEditor=page.locator('#settings-workspace .cm-content');
        await metadataEditor.click();await metadataEditor.press('ControlOrMeta+A');
        await page.keyboard.insertText(JSON.stringify(annotated,null,2));
        await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).click();
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-key-comment')?.textContent===
          '手动修改的字号注释',{timeout:10000});
        assert((await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).innerText()).includes('手动修改的字号注释'));
        assert.equal(await slider.inputValue(),'14');
        assert.equal(await slider.getAttribute('min'),'10');
        assert.equal(await slider.getAttribute('max'),'24');
        assert((await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).innerText()).includes('个性化 UI'));
        assert((await page.locator('.ocr-settings-breadcrumb').innerText()).includes('源码编辑器'));
        // The cursor on the JSON leaf or its comment must locate the AG row.
        await page.locator('#settings-workspace .cm-line').filter({hasText:'"value": 14'}).first().click();
        assert.equal(await page.locator('#settings-workspace .ag-row-selected').count(),1);
        // Invalid yet parseable JSON must not emit a changed message or save.
        const direct=page.locator('#settings-workspace .cm-content');
        await direct.click();await direct.press('ControlOrMeta+A');
        const invalidRecord=await sourceJSON();
        invalidRecord.settings[KEY].value=33;
        await page.keyboard.insertText(JSON.stringify(invalidRecord));
        await page.waitForTimeout(150);
        assert.equal(await slider.isDisabled(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.style
          .getPropertyValue('--ocr-cm-source-font-size')),'14pt');
        // Invalid JSON must NOT cause a PUT. The previous persisted value
        // remains unchanged even when Save is clicked.
        await page.locator('#save').click();
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('设置保存失败'),
          null,{timeout:16000});
        assert.equal(JSON.parse(readFileSync(jsonPath,'utf8')).settings[KEY].value,14);
        await page.locator('#undo').click();
        await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).click();
        await page.locator('#settings-workspace .cm-line').filter({hasText:'"value": 14'}).first().click();
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-breadcrumb')?.textContent.includes('defaultFontSize'));
        assert.equal(await slider.isEnabled(),true);
        assert.equal(await slider.inputValue(),'14');
        // Two modules may legitimately have the same leaf name. CMD must
        // update the full registered path and leave the other value untouched.
        const duplicate=await sourceJSON();
        duplicate.settings['otherGroup.defaultFontSize']={
          key:'defaultFontSize',category1:'Other',category2:'Test',comment:'Unregistered record',
          value:7,range:{min:1,max:10,step:1}
        };
        await direct.click();await direct.press('ControlOrMeta+A');
        await page.keyboard.insertText(JSON.stringify(duplicate,null,2));
        await page.locator('#settings-workspace .ag-row').filter({hasText:'defaultFontSize'}).click();
        await page.locator('#settings-workspace .cm-line').filter({hasText:'"value": 14'}).first().click();
        await page.waitForFunction(()=>document.querySelector('.ocr-settings-breadcrumb')?.textContent.includes('defaultFontSize'));
        await slider.evaluate(node=>{node.value='19';node.dispatchEvent(new Event('input',{bubbles:true}));});
        await page.waitForFunction(()=>document.documentElement.style.getPropertyValue(
          '--ocr-cm-source-font-size')==='19pt',{timeout:15000});
        const afterDuplicate=await sourceJSON();
        assert.equal(afterDuplicate.settings[KEY].value,19);
        assert.equal(afterDuplicate.settings['otherGroup.defaultFontSize'].value,7);
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
