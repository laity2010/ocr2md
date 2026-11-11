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
      await page.waitForSelector('.dv-root');
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4, label+' four panes');
      assert.equal(await page.locator('#editor .cm-content').innerText(),'');
      assert.equal(await page.locator('#workspace .ag-row').count(),0);
      assert.equal(await page.locator('#workspace .ocr-detached-pdf-pane').count(),1);
      assert.match(await page.locator('#build-version').innerText(),/^v6-lab-frame-/);
      assert.match(await page.locator('#status').innerText(),/空白四窗/);
      await page.locator('#build-version').click();
      assert.equal(await page.locator('#engineering-dialog').evaluate(el=>el.open),true);
      await page.locator('#engineering-close').click();
      await page.locator('#module-select').selectOption('settings');
      assert.equal(await page.locator('#settings-workspace .dv-content-container').count(),3);
      assert.equal(await page.locator('#settings-workspace .ag-row').count(),0);
      assert.equal(await page.locator('#settings-workspace .cm-content').innerText(),'');
      await page.locator('#module-select').selectOption('frame');
      assert.equal(await page.locator('#workspace .dv-content-container').count(),4);
      assert.deepEqual(api,[],label+' no API fetch');
      assert.deepEqual(exceptions,[],label+' browser errors');
      // Direct F01/F02 module entry: construct/dispose an independent blank Dockview.
      const direct=await page.evaluate(async()=>{
        const {createFrameWorkspace,createEmptySettings}=await import('./layout.js');
        const host=document.createElement('div');host.style.cssText='width:700px;height:440px;position:absolute;top:-1000px';document.body.append(host);
        const f=createFrameWorkspace(host);const first={split:f.split,panes:host.querySelectorAll('.dv-content-container').length};
        f.setSplit(false);const second=host.querySelectorAll('.dv-content-container').length;
        f.setSplit(true);const third=host.querySelectorAll('.dv-content-container').length;
        f.dispose();host.remove();
        const h=document.createElement('div');h.style.cssText='width:700px;height:440px;position:absolute;top:-1000px';document.body.append(h);
        const s=createEmptySettings(h);s.activate();const settingsPanes=h.querySelectorAll('.dv-content-container').length;
        s.dispose();h.remove();
        return {first,second,third,settingsPanes};
      });
      assert.deepEqual(direct,{first:{split:true,panes:4},second:3,third:4,settingsPanes:3},label+' direct APIs');
      console.log('LAB_FRAME_BROWSER_PASS',label,JSON.stringify(direct));
      await page.close();
    }finally{await browser.close();}
  }
}finally{proc.kill('SIGTERM');}
