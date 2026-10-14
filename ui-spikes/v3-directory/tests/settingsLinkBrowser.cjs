/** Shared Settings bidirectional UIC; independent of any Vault data. */
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const repo=path.resolve(__dirname,'../../..');
const port=30000+Math.floor(Math.random()*28000),url=`http://127.0.0.1:${port}/index.html`;
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1',
  '--directory',path.join(repo,'ui-spikes/v3-directory')],{stdio:'ignore'});
(async()=>{let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1100,height:850}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 assert.equal(await page.locator('.tabs [role=tab]').first().textContent(),'设置');
 await page.getByTestId('tab-settings').click();
 await page.waitForFunction(()=>{
   const panel=document.querySelector('#settings-shared');
   return panel?.dataset.ready==='true'&&panel?.dataset.sourceReady==='true';
 },null,{timeout:25000});
 const panel=page.locator('#settings-shared');
 assert.equal(await panel.evaluate(e=>e.version),'0.1.14');
 assert.equal(await panel.locator('.ag-row').count()>5,true);
 assert.equal(await panel.locator('laity-source-surface').count(),1);
 // Non-schema capabilities belong in the independent settings-page panel,
 // NOT the centralized settings component's AG/source layout or footer.
 const auth=page.getByTestId('settings-vault-tools');
 assert.equal(await page.locator('#panel-settings > #settings-connection-details').count(),1);
 assert.equal(await panel.locator('#settings-connection-details').count(),0);
 assert.equal(await panel.locator('#vault-key').count(),0);
 assert.equal(await auth.locator('#vault-key').count(),1);
 assert.equal(await auth.locator('#connect-vault').count(),1);
 assert.equal(await auth.locator('#remember-device').count(),1);
 assert.equal(await auth.locator('#forget-key').count(),1);
 // Details can expand separately without stealing AG or source layout tracks.
 if(!await auth.evaluate(e=>e.open))await auth.locator('summary').click();
 assert.equal(await auth.locator('#vault-key').isVisible(),true);
 const siblingLayout=await page.evaluate(()=>{
   const main=document.querySelector('#v3-shared-config-layout');
   const auth=document.querySelector('#settings-connection-details');
   const panel=document.querySelector('#settings-shared');
   return {sameParent:main.parentElement===auth.parentElement,
     authBelowMain:auth.getBoundingClientRect().top>=main.getBoundingClientRect().bottom-2,
     mainHeight:main.getBoundingClientRect().height,
     panelHeight:panel.getBoundingClientRect().height};
 });
 assert.equal(siblingLayout.sameParent,true);
 assert.equal(siblingLayout.authBelowMain,true);
 assert.ok(siblingLayout.mainHeight>250&&siblingLayout.panelHeight>250);
 assert.equal(await panel.locator('.las-app-footer #vault-key').count(),0);
 assert.equal(await panel.locator('.las-source-col').isVisible(),true);
 // AG -> CodeMirror: same key highlighted on both surfaces.
 await panel.evaluate(e=>e.selectSetting('mdHardReturnColor'));
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.linkedKey==='mdHardReturnColor');
 assert.equal(await panel.locator('.las-linked-row').count(),1);
 assert.equal(await panel.evaluate(e=>e.querySelector('laity-source-surface').ranges.length),1);
 // CodeMirror -> AG: nested value selects its owning top-level property.
 await panel.evaluate(e=>{
   const source=e.querySelector('laity-source-surface');
   const offset=source.value.indexOf('"directory"');source.revealRange(offset+3,offset+3);
 });
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.linkedKey==='agSourceScenes');
 // Edits remain drafts until Save, and invalid inputs never overwrite settings.
 await panel.evaluate(e=>{
   const source=e.querySelector('laity-source-surface');const config=e.values;
   config.gridFontSize=18;source.value=JSON.stringify(config,null,2);
 });
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.values.gridFontSize===18);
 assert.equal(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1')),null);
 await page.getByTestId('settings-save').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}').gridFontSize===18);
 await panel.evaluate(e=>e.querySelector('laity-source-surface').value='{"gridFontSize": 99}');
 await page.getByTestId('settings-save').click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).gridFontSize),18);
 await page.getByTestId('settings-reset').click();
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.values.gridFontSize===14);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).gridFontSize),18,
   'explicit reset remains a draft until Save');
 await page.getByTestId('settings-save').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}').gridFontSize===14);
 assert.deepEqual(errors,[]);
 console.log('V3_SHARED_SETTINGS_UIC_PASS',JSON.stringify({engine,firstTab:true,version:'0.1.14',bidirectional:true,draft:true,save:true,invalidRejected:true,reset:true}));
}catch(err){console.error('V3_SHARED_SETTINGS_UIC_FAIL',err);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
