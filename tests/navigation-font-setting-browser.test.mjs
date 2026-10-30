/** Main regression for the registered navigation font-size subscription
 * (SUB-L01): Settings slider -> settings.changed -> Layout subscriber ->
 * --ocr-navigation-font-size on picker + popup. Chrome + WebKit, isolated
 * settings file, transient change only (no Save, no API writes). */
import {selectModule} from './navigation-ui.test-helper.mjs';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const folder=mkdtempSync(join(tmpdir(),'ocr2md-nav-font-test-'));
const jsonPath=join(folder,'settings.json');
writeFileSync(jsonPath,JSON.stringify({globalUi:{navigation:{dropdownFontSize:10}}},null,2)+'\n');
const port=5767,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],
  {cwd:process.cwd(),env:{...process.env,V6_SETTINGS_PATH:jsonPath,V6_DOCUMENT_PATH:join(folder,'mother.minerujson.md')},stdio:'ignore'});
const pause=t=>new Promise(r=>setTimeout(r,t));
let ready=false;
for(let i=0;i<180;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await pause(120);}
assert(ready,'Vite navigation-font test server failed to start');
try{
  for(const [name,engine,path] of [['Chromium',chromium,chromeExecutable()],['WebKit',webkit,webkitExecutable()]]){
    const browser=await engine.launch({headless:true,executablePath:path});
    try{
      const page=await browser.newPage({viewport:{width:1365,height:840}});
      const errors=[],writes=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&new URL(r.url()).pathname.startsWith('/api/'))writes.push(r.method()+' '+r.url());});
      await page.goto(base,{waitUntil:'domcontentloaded'});
      await page.locator('#editor .cm-editor').waitFor({state:'visible'});
      await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--ocr-navigation-font-size').trim()==='10pt',null,{timeout:16000});
      const pickerFont=()=>page.evaluate(()=>getComputedStyle([...document.querySelectorAll('.ts-wrapper.ocr-navigation-select .ts-control')].find(e=>e.getClientRects().length)).fontSize);
      const before=await pickerFont();
      await selectModule(page,'settings');
      await page.locator('#settings-workspace .ag-row').filter({hasText:'dropdownFontSize'}).first().click();
      await page.waitForFunction(()=>document.querySelector('.ocr-settings-control label')?.textContent==='dropdownFontSize',null,{timeout:20000});
      const slider=page.locator('#settings-font-slider');
      await slider.waitFor({state:'visible',timeout:25000});
      assert.equal(await slider.inputValue(),'10');
      await slider.evaluate(el=>{el.value='14';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--ocr-navigation-font-size').trim()==='14pt',null,{timeout:12000});
      const after=await pickerFont();
      assert.notEqual(after,before,'navigation picker font must follow the registered setting');
      assert.equal(Math.round(parseFloat(after)*3/4),14,'picker computed size must equal 14pt');
      assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
      console.log('NAV_FONT_SUBSCRIPTION_PASS',name,before,'->',after);
    }finally{await browser.close();}
  }
}finally{server.kill();}
