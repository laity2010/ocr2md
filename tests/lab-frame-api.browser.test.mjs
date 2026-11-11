import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
// Exercise the real production build to catch dynamic-import/Vite-optimizer differences.
const HOST='http://127.0.0.1:5297/labs/lab-frame/';
const proc=spawn('node',['node_modules/vite/bin/vite.js','preview','--config','labs/lab-frame/vite.config.mjs',
  '--host','127.0.0.1','--port','5297','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';proc.stdout.on('data',b=>output+=b);proc.stderr.on('data',b=>output+=b);
async function ready(){for(let i=0;i<60;i++){
  if(proc.exitCode!==null)throw Error('Vite preview failed: '+output);
  try{const r=await fetch(HOST);if(r.ok)return;}catch{}
  await sleep(250);
}throw Error('Vite preview startup timed out: '+output);}
try{
  await ready();
  for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:642}});
      const errors=[],apis=[],fontRequests=[];
      page.on('request',req=>{
        if(req.url().includes('/api/'))apis.push(req.url());
        if(req.url().endsWith('.woff2'))fontRequests.push(req.url());
      });
      page.on('pageerror',e=>errors.push(e.message));
      page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
      await page.goto(HOST,{waitUntil:'domcontentloaded'});
      await page.locator('#workspace .dv-content-container').first().waitFor();
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
      assert.equal((await page.locator('#editor .cm-content').innerText()).trim(),'');
      assert.equal(await page.locator('#workspace .ag-row').count(),0);
      assert.equal(await page.locator('#global-save').isVisible(),true);
      const positions=await page.evaluate(()=>({
        status:document.querySelector('#status').getBoundingClientRect().toJSON(),
        save:document.querySelector('#global-save').getBoundingClientRect().toJSON(),
        top:document.querySelector('header.toolbar').getBoundingClientRect().toJSON(),
      }));
      assert.ok(positions.save.x>=positions.status.right-1);
      assert.ok(positions.save.right<=positions.top.right+1);
      const nav=page.locator('#workspace .ocr-source-file-select');
      assert.equal(await nav.isEnabled(),true);
      const structure=await nav.evaluate(node=>({
        groups:[...node.querySelectorAll('optgroup')].map(g=>({
          label:g.label,files:[...g.querySelectorAll('option')].map(o=>o.textContent)})),
        live:node.value,
      }));
      assert.deepEqual(structure,{groups:[{label:'全局设置',files:['settings.json']}],live:''});
      assert.equal(await page.locator('#workspace .ocr-navigation-files.ts-wrapper').isVisible(),true);
      assert.equal(await page.locator('#workspace #undo').isDisabled(),true);
      assert.equal(await page.locator('#workspace #redo').isDisabled(),true);
      await page.locator('#global-save').click();
      assert.match(await page.locator('#status').innerText(),/无文档可保存/);
      // Click the *visible* Main Tom Select, not its hidden native business port.
      await page.locator('#workspace .ocr-navigation-files .ts-control').click();
      const dropdown=page.locator('.ocr-navigation-popup-files:visible');
      await dropdown.locator('.optgroup-header').waitFor({state:'visible'});
      assert.equal(await dropdown.locator('.optgroup-header').count(),1);
      assert.match(await dropdown.locator('.optgroup-header').innerText(),/全局设置/);
      assert.equal(await dropdown.locator('.option').count(),1);
      assert.match(await dropdown.locator('.option').innerText(),/settings.json/);
      await dropdown.locator('.option').click();
      await page.locator('#settings-workspace .dv-content-container').first().waitFor({timeout:16000});
      assert.equal(await page.locator('#settings-workspace .dv-content-container').count(),3);
      assert.equal(await page.locator('#settings-workspace .ocr-navigation-files.ts-wrapper').isVisible(),true);
      assert.equal(await page.locator('#settings-workspace #settings-undo').isVisible(),true);
      assert.equal(await page.locator('#settings-workspace #settings-redo').isVisible(),true);
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),2);
      assert.match(await page.locator('#settings-workspace .cm-content').innerText(),/Sarasa/);
      const readonly=page.locator('#settings-workspace .ocr-settings-readonly-value');
      assert.equal(await readonly.inputValue(),'Sarasa');
      assert.equal(await readonly.isDisabled(),true);
      await page.locator('#settings-workspace .ag-row').nth(1).click();
      const slider=page.locator('#settings-font-slider');
      assert.equal(await slider.inputValue(),'16');
      const originalStorage=await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1'));
      assert.equal(originalStorage,null,'no implicit persistence');
      await slider.fill('20');
      // Playwright may already fire the input event; never duplicate a CM6
      // changeScalar transaction or Undo will first revert the no-op edit.
      if(await page.locator('#status').evaluate(el=>getComputedStyle(el).fontSize)!=='20px')
        await slider.dispatchEvent('input');
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#status')).fontSize==='20px');
      assert.equal(await slider.inputValue(),'20');
      assert.equal(await page.locator('#status').evaluate(el=>getComputedStyle(el).fontSize),'20px');
      assert.equal(await page.locator('#settings-workspace .cm-content').evaluate(el=>getComputedStyle(el).fontSize),'20px');
      assert.match(await page.locator('#status').innerText(),/未保存/);
      await page.waitForFunction(()=>!document.querySelector('#settings-undo').disabled);
      assert.equal(await page.locator('#settings-redo').isDisabled(),true);
      await page.locator('#settings-undo').click();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#status')).fontSize==='16px');
      assert.equal(await page.locator('#settings-font-slider').inputValue(),'16');
      assert.equal(await page.locator('#settings-redo').isDisabled(),false);
      await page.locator('#settings-redo').click();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('#status')).fontSize==='20px');
      assert.equal(await page.locator('#settings-font-slider').inputValue(),'20');
      assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')),null);
      // Global Save applies to dirty Settings even after returning to Frame.
      await page.locator('#settings-workspace .ocr-frame-back').click();
      assert.equal(await page.locator('#workspace').isVisible(),true);
      await page.locator('#global-save').click();
      await page.waitForFunction(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')?.includes('"value": 20'));
      assert.match(await page.locator('#status').innerText(),/已保存/);
      const saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('ocr2md.lab-frame.settings.json.v1')));
      assert.equal(saved.settings['globalUi.font.family'].value,'Sarasa');
      assert.equal(saved.settings['globalUi.font.size'].value,20);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.locator('#workspace .dv-content-container').first().waitFor();
      assert.equal(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--ocr-frame-font-size')),'20px');
      await page.locator('#workspace .ocr-navigation-files .ts-control').click();
      await page.locator('.ocr-navigation-popup-files:visible .option').click();
      await page.locator('#settings-workspace .ag-row').nth(1).click();
      assert.equal(await page.locator('#settings-font-slider').inputValue(),'20');
      const settingsNav=page.locator('#settings-workspace .ocr-source-file-select');
      assert.equal(await settingsNav.inputValue(),'settings');
      assert.equal(await settingsNav.evaluate(node=>node.querySelectorAll('optgroup').length),1);
      assert.equal(await settingsNav.evaluate(node=>node.querySelectorAll('optgroup option').length),1);
      await page.locator('#settings-workspace .ocr-frame-back').click();
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
      assert.equal(await page.locator('#workspace').isVisible(),true);
      assert.equal(await page.locator('#workspace #editor .cm-content').evaluate(el=>getComputedStyle(el).fontSize),'20px');
      assert.deepEqual(apis,[]);
      assert.equal(fontRequests.some(url=>/sarasa-fixed-sc-(regular|bold)-[a-f0-9]{12}/.test(url)),false,
        'never request private 17MB Sarasa fonts');
      assert.deepEqual(errors,[]);
      console.log('LAB_FRAME_MAIN_SETTINGS_BROWSER_PASS',label,JSON.stringify({fontRequests}));
    }finally{await browser.close();}
  }
}finally{proc.kill('SIGTERM');}
