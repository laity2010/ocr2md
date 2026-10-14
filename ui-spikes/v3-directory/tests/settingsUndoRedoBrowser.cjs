/** Browser UIC: shared undo/redo works across AG, source, preview and reset. */
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..'),network=path.resolve(root,'../../../agent-link-monitor/web');
const port=31000+Math.floor(Math.random()*24000),engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
const storageKey='ocr2md-v3-directory-settings-v1';
(async()=>{let browser;
try{
 for(let i=0;i<95;i++){try{if((await fetch(`http://127.0.0.1:${port}/index.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1150,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://agent-link.laity.bid/**',async route=>{
   const name=new URL(route.request().url()).pathname,asset=path.resolve(network,'.'+name);
   if(!asset.startsWith(network+'/')||!fs.existsSync(asset))return route.continue();
   await route.fulfill({status:200,contentType:name.endsWith('.json')?'application/json':name.endsWith('.css')?'text/css':name.endsWith('.woff2')?'font/woff2':'text/javascript',headers:{'access-control-allow-origin':'*'},body:fs.readFileSync(asset)});
 });
 // Simulate stored V3 preference from prior version (monospace was hardcoded).
 await page.addInitScript(({storageKey})=>localStorage.setItem(storageKey,JSON.stringify({mdFontFamily:'monospace'})),{storageKey});
 await page.goto(`http://127.0.0.1:${port}/index.html`,{waitUntil:'domcontentloaded'});
 await page.getByTestId('tab-settings').click();
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.ready==='true'&&document.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:25000});
 const panel=page.locator('#settings-shared');
 assert.equal(await panel.evaluate(e=>e.version),'0.1.14');
 assert.equal(await panel.evaluate(e=>e.values.mdFontFamily),'sarasa','legacy monospace must become explicit Sarasa');
 const source=panel.locator('laity-source-surface');
 assert.ok((await source.evaluate(e=>e.value)).includes('"mdFontFamily": "sarasa"'));
 const persisted=async()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),storageKey);
 assert.equal((await persisted()).mdFontFamily,'monospace','migration must not auto-save without consent');
 const undo=page.getByTestId('settings-undo'),redo=page.getByTestId('settings-redo');
 assert.equal(await undo.isDisabled(),true);assert.equal(await redo.isDisabled(),true);
 assert.equal(await panel.locator('[data-role="undo"]').isDisabled(),true);
 // 1) AG edit is a draft, not a persisted change.
 await panel.evaluate(e=>e._commitGridValue(e._schema.find(s=>s.id==='gridFontSize'),16));
 await page.waitForFunction(()=>document.querySelector('#settings-shared').values.gridFontSize===16);
 assert.equal((await persisted()).gridFontSize,undefined);
 assert.equal(await undo.isEnabled(),true);assert.equal(await redo.isDisabled(),true);
 assert.equal(await page.getByTestId('activity-settings').getAttribute('data-level'),'dirty',
   'an actual settings history entry marks the module as a draft');
 await undo.click();
 assert.equal(await panel.evaluate(e=>e.values.gridFontSize),14);
 assert.ok((await source.evaluate(e=>e.value)).includes('"gridFontSize": 14'));
 assert.equal(await redo.isEnabled(),true);
 await redo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),16);
 // A new edit from an undone state must discard the abandoned redo branch.
 await undo.click();
 await panel.evaluate(e=>e._commitGridValue(e._schema.find(s=>s.id==='gridFontSize'),15));
 assert.equal(await redo.isDisabled(),true);
 await undo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),14);
 await redo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),15);
 await panel.evaluate(e=>e._commitGridValue(e._schema.find(s=>s.id==='gridFontSize'),16));
 // 2) Parameter preview action must share the exact same history.
 await panel.evaluate(e=>e.selectSetting('mdShowHardReturns'));
 await panel.locator('[data-preview-boolean="false"]').click();
 assert.equal(await panel.evaluate(e=>e.values.mdShowHardReturns),false);
 await undo.click();assert.equal(await panel.evaluate(e=>e.values.mdShowHardReturns),true);
 await undo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),15);
 await redo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),16);
 await redo.click();assert.equal(await panel.evaluate(e=>e.values.mdShowHardReturns),false);
 // 3) Source typing valid JSONC, followed by invalid partial draft: undo restores.
 await source.evaluate(e=>e.value=e.value.replace('"gridFontSize": 16','"gridFontSize": 17'));
 await page.waitForFunction(()=>document.querySelector('#settings-shared').values.gridFontSize===17);
 await page.waitForTimeout(800);
 await source.evaluate(e=>e.value='// temporary invalid source\n{"gridFontSize": 999}');
 await page.waitForTimeout(240);
 assert.equal(await panel.evaluate(e=>e.values.gridFontSize),17);
 await undo.click();
 assert.equal(await panel.evaluate(e=>e.values.gridFontSize),17);
 assert.ok((await source.evaluate(e=>e.value)).includes('"gridFontSize": 17'),'undo restores valid draft');
 await undo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),16);
 await redo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),17);
 // Keyboard history also routes through the shared component, not a separate
 // CodeMirror-only undo stack; the active editor is inside ShadowRoot.
 await source.evaluate(e=>e.shadowRoot.querySelector('.cm-content').focus());
 await page.keyboard.press('Meta+z');
 assert.equal(await panel.evaluate(e=>e.values.gridFontSize),16);
 await page.keyboard.press('Meta+Shift+z');
 assert.equal(await panel.evaluate(e=>e.values.gridFontSize),17);
 // 4) Reset in explicit mode is a draft; undo before saving restores values.
 await page.getByTestId('settings-reset').click();
 assert.equal(await panel.evaluate(e=>e.values.gridFontSize),14);
 assert.equal((await persisted()).gridFontSize,undefined,'reset does not write before Save');
 await undo.click();assert.equal(await panel.evaluate(e=>e.values.gridFontSize),17);
 await page.getByTestId('settings-save').click();
 await page.waitForFunction(key=>{const v=JSON.parse(localStorage.getItem(key)||'{}');return v.gridFontSize===17&&v.mdFontFamily==='sarasa';},storageKey);
 await page.waitForFunction(()=>document.querySelector('[data-module-status="settings"]')?.dataset.summary==='配置已保存');
 assert.equal(await page.getByTestId('activity-settings').getAttribute('data-level'),'ready');
 assert.deepEqual(errors,[]);
 console.log('OCR2MD_SHARED_SETTINGS_UNDO_REDO_PASS',JSON.stringify({engine,sharedVersion:'0.1.14',sarasaMigration:true,agHistory:true,previewHistory:true,sourceHistory:true,invalidJsonRestored:true,resetDraftOnly:true,saveExplicit:true}));
}catch(e){console.error('OCR2MD_SHARED_SETTINGS_UNDO_REDO_FAIL',e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
