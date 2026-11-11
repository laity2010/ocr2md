import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const HOST='http://127.0.0.1:5295/labs/lab-frame/';
const proc=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-frame/vite.config.mjs','--host','127.0.0.1','--port','5295','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';proc.stdout.on('data',b=>output+=b);proc.stderr.on('data',b=>output+=b);
async function ready(){for(let i=0;i<40;i++){
  if(proc.exitCode!==null)throw Error('Vite failed: '+output);
  try{const r=await fetch(HOST);if(r.ok)return;}catch{}
  await sleep(200);
}throw Error('Vite startup timed out: '+output);}
try{
  await ready();
  for(const [label,browserType] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await browserType.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:642}});
      const api=[];const exceptions=[];
      page.on('request',req=>{if(req.url().includes('/api/'))api.push(req.url());});
      page.on('pageerror',err=>exceptions.push(err.message));
      await page.goto(HOST,{waitUntil:'networkidle'});
      await page.waitForSelector('#workspace .dv-content-container');
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4, label+' four panes');
      assert.equal((await page.locator('#editor .cm-content').innerText()).trim(),'');
      assert.equal(await page.locator('#workspace .ag-row').count(),0);
      assert.equal(await page.locator('#workspace .ocr-detached-pdf-pane').count(),1);
      assert.equal((await page.locator('#lab-frame-home').innerText()).trim(),'OCR2MD lab-frame');
      assert.equal(await page.locator('#lab-frame-home').getAttribute('href'),'/labs/');
      assert.match(await page.locator('#build-version').innerText(),/^\d{8}-\d{4}$/);
      assert.match(await page.locator('#status').innerText(),/空白四窗/);
      assert.equal(await page.locator('header .source-actions, body>.module-controls').count(),0);
      const positions=await page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector)?.getBoundingClientRect();
          return r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null;};
        return {ag:rect('#workspace .ocr-ag-toolbar'),left:rect('#workspace .ocr-outline-pane'),
          nav:rect('#workspace .ocr-source-file-select'),source:rect('#workspace .ocr-source-pane'),
          undo:rect('#workspace #undo'),redo:rect('#workspace #redo'),
          sourceBar:rect('#workspace .ocr-source-file-toolbar'),global:rect('header.toolbar')};
      });
      assert.ok(positions.ag&&positions.nav&&positions.undo&&positions.redo,label+' toolbar present');
      assert.ok(Math.abs(positions.ag.top-positions.left.top)<=2,label+' AG toolbar at left pane top');
      assert.ok(positions.ag.right<=positions.left.right+1,label+' AG toolbar only in left pane');
      assert.ok(positions.nav.top>=positions.sourceBar.top && positions.nav.bottom<=positions.sourceBar.bottom+1,label+' navigation inside source top toolbar');
      assert.ok(positions.undo.left>=positions.nav.right-1 &&
        positions.redo.left>=positions.undo.right-1,label+' Undo/Redo immediately after navigation');
      assert.ok(positions.sourceBar.top>=positions.source.top-1,label+' controls belong to source');
      assert.equal(await page.locator('#workspace .ocr-ag-module-select').inputValue(),'frame');
      assert.equal(await page.locator('#workspace #undo').isDisabled(),true);
      assert.equal(await page.locator('#workspace #redo').isDisabled(),true);
      await page.locator('#workspace .ocr-ag-module-select').selectOption('settings');
      assert.equal(await page.locator('#settings-workspace .dv-content-container').count(),3);
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),0);
      assert.equal((await page.locator('#settings-workspace .cm-content').innerText()).trim(),'');
      assert.equal(await page.locator('#settings-workspace .ocr-ag-module-select').inputValue(),'settings');
      assert.equal(await page.locator('#settings-workspace .ocr-source-file-select').count(),1);
      assert.equal(await page.locator('#settings-workspace .ocr-source-undo-redo button').count(),2);
      await page.locator('#settings-workspace .ocr-ag-module-select').selectOption('frame');
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
      assert.deepEqual(api,[],label+' no API fetch');
      assert.deepEqual(exceptions,[],label+' browser errors');
      // Direct F01/F02 module entry: construct/dispose an independent blank Dockview.
      const direct=await page.evaluate(async()=>{
        const {createFrameWorkspace,createEmptySettings}=await import('./layout.js');
        const host=document.createElement('div');host.style.cssText='width:700px;height:440px;position:absolute;top:-1000px';document.body.append(host);
        const moduleEvents=[];
        const f=createFrameWorkspace(host,{onModuleChange:name=>moduleEvents.push('frame:'+name)});
        const first={split:f.split,panes:host.querySelectorAll('.dv-content-container').length};
        const framePicker=host.querySelector('.ocr-ag-module-select');
        framePicker.value='settings';framePicker.dispatchEvent(new Event('change',{bubbles:true}));
        const frameRetained=framePicker.value;
        f.setSplit(false);const second=host.querySelectorAll('.dv-content-container').length;
        f.setSplit(true);const third=host.querySelectorAll('.dv-content-container').length;
        f.dispose();host.remove();
        const h=document.createElement('div');h.style.cssText='width:700px;height:440px;position:absolute;top:-1000px';document.body.append(h);
        const s=createEmptySettings(h,{onModuleChange:name=>moduleEvents.push('settings:'+name)});
        s.activate();const settingsPanes=h.querySelectorAll('.dv-content-container').length;
        const settingsPicker=h.querySelector('.ocr-ag-module-select');
        settingsPicker.value='frame';settingsPicker.dispatchEvent(new Event('change',{bubbles:true}));
        const settingsRetained=settingsPicker.value;
        s.dispose();h.remove();
        return {first,second,third,settingsPanes,moduleEvents,frameRetained,settingsRetained};
      });
      assert.deepEqual(direct,{first:{split:true,panes:4},second:3,third:4,
        settingsPanes:3,moduleEvents:['frame:settings','settings:frame'],
        frameRetained:'frame',settingsRetained:'settings'},label+' direct APIs');
      console.log('LAB_FRAME_BROWSER_PASS',label,JSON.stringify(direct));
      await page.close();
    }finally{await browser.close();}
  }
}finally{proc.kill('SIGTERM');}
