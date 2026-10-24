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
      assert.equal(await page.locator('#settings-workspace .cm-editor').count(),1);
      assert.equal(await page.locator('#editor .cm-editor').count(),1);
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),3);
      await page.waitForFunction(()=>[...document.querySelectorAll('#settings-workspace .ag-row')].some(e=>e.textContent.includes('全局 UI')),{timeout:10000});
      const labels=await page.locator('#settings-workspace .ag-row').allTextContents();
      assert(labels.some(v=>v.includes('全局 UI'))&&labels.some(v=>v.includes('CM 源码窗'))&&labels.some(v=>v.includes('默认字号')));
      assert((await page.locator('.ocr-settings-breadcrumb').textContent()).includes('全局 UI / CM 源码窗 / 默认字号'));
      const setSlider=async value=>{await slider.evaluate((element,v)=>{
        element.value=String(v);element.dispatchEvent(new Event('input',{bubbles:true}));
      },value);};
      const computed=()=>page.evaluate(()=>getComputedStyle(document.querySelector('#editor .cm-editor')).fontSize);
      await setSlider(name==='Chromium'?18:16);
      await page.waitForTimeout(150);
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
        await page.locator('#save').click();
        assert.equal(JSON.parse(readFileSync(jsonPath,'utf8')).globalUi.cmSource.defaultFontSize,14);
        // Verify round-trip persistence, not merely an unsaved in-memory value.
        await page.reload({waitUntil:'domcontentloaded'});
        await page.locator('#module-select').selectOption('settings');
        await slider.waitFor();
        assert.equal(await slider.inputValue(),'14');
        // Invalid yet parseable JSON must not emit a changed message or save.
        const direct=page.locator('#settings-workspace .cm-content');
        await direct.click();await direct.press('ControlOrMeta+A');
        await page.keyboard.insertText('{"globalUi":{"cmSource":{"defaultFontSize":33}}}');
        await page.waitForTimeout(150);
        assert.equal(await slider.isDisabled(),true);
        assert.equal(await page.evaluate(()=>document.documentElement.style
          .getPropertyValue('--ocr-cm-source-font-size')),'14pt');
        await page.locator('#save').click();
        assert.equal(JSON.parse(readFileSync(jsonPath,'utf8')).globalUi.cmSource.defaultFontSize,14);
        await page.locator('#undo').click();
        assert.equal(await slider.isEnabled(),true);
        assert.equal(await slider.inputValue(),'14');
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
