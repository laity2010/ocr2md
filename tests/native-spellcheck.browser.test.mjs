/** Browser-native spellcheck experiment: the browser owns recognition;
 * the app only toggles CM6 content attributes and never fabricates AG rows.
 * A headless WebKit pass is NOT proof of red squiggles on a physical iPad.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const original=[
  '<!-- minerujson:block:v1:0:0 -->','# Chapter One','',
  'This is a beautifull book. I recieve many letters.','',
  '<!-- minerujson:block:v1:1:0 -->','# Chapter Two','',
  'Another paragraf contains errors.','',
  '<!-- minerujson:source:v1','{"keepEvidence":true}','-->','',
].join('\n');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-spellcheck-'));
const doc=join(dir,'document.md');
writeFileSync(doc,original);
const port=5977,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_DOCUMENT_PATH:doc},
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function choose(page,value){
  await page.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').click();
  await page.locator(`.ocr-navigation-popup-elements:visible [data-value="${value}"]`).click();
  await page.waitForFunction(v=>document.querySelector('#module-select')?.value===v,value);
}
try{
  let ready=false;
  for(let i=0;i<150;i++){
    try{if((await fetch(base)).ok){ready=true;break;}}catch{}
    await sleep(100);
  }
  assert(ready,'isolated Vite app did not start');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad WebKit',webkit,true]]){
    const browser=await engine.launch({headless:true});
    try{
      const context=await browser.newContext(mobile
        ?{...devices['iPad Pro 11'],viewport:{width:1032,height:720}}
        :{viewport:{width:1120,height:760}});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
      const source=page.locator('#editor .cm-content');
      await source.waitFor({state:'visible',timeout:45000});
      assert.equal(await source.getAttribute('spellcheck'),'false','default should be off');
      assert.equal(await page.locator('.ocr-spellcheck-experiment').isVisible(),false);
      await page.locator('#editor .cm-line').filter({hasText:'beautifull'}).click();
      await page.keyboard.press('End');
      const before=await page.evaluate(()=>({
        doc:window.__v6cm6.view.state.doc.toString(),
        head:window.__v6cm6.view.state.selection.main.head,
        history:window.__v6cm6.view.state.doc.length,
        dirty:window.__v6cm6.dirty,
      }));
      await choose(page,'spellcheck');
      assert.equal(await source.getAttribute('spellcheck'),'true','native spellcheck not enabled');
      assert.equal(await source.getAttribute('lang'),'en-US');
      assert(await page.locator('.ocr-spellcheck-experiment').isVisible());
      assert.match(await page.locator('.ocr-spellcheck-experiment').innerText(),/AG 暂无错误行/);
      assert.equal(await page.locator('#editor .cm-line').filter({hasText:'beautifull'}).count(),1);
      assert.equal(await page.locator('.ocr-outline-grid:visible').count(),0,'old AG grid still visible');
      assert.equal(await page.locator('#ag-functions-toggle').isDisabled(),true);
      assert.equal(await page.locator('.ocr-global-ag-status').isVisible(),false,
        'old AG module count must not masquerade as spellcheck results');
      const during=await page.evaluate(()=>({
        doc:window.__v6cm6.view.state.doc.toString(),
        head:window.__v6cm6.view.state.selection.main.head,
        dirty:window.__v6cm6.dirty,
      }));
      assert.equal(during.doc,before.doc,'module switch changed Markdown');
      assert.equal(during.head,before.head,'module switch lost CM6 caret');
      assert.equal(during.dirty,false,'module switch created unsaved changes');
      await choose(page,'media');
      assert.equal(await source.getAttribute('spellcheck'),'false','did not disable spellcheck');
      assert.equal(await source.getAttribute('lang'),null,'language override persisted');
      assert.equal(await page.locator('.ocr-spellcheck-experiment').isVisible(),false);
      await choose(page,'spellcheck');
      assert.equal(await source.getAttribute('spellcheck'),'true');
      // Actual editor editing and undo must remain normal while enabled.
      await page.locator('#editor .cm-line').filter({hasText:'beautifull'}).click();
      await page.keyboard.press('End');
      await page.keyboard.type(' zzmisspelt');
      assert((await source.textContent()).includes('zzmisspelt'));
      await page.locator('#undo').click();
      await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent.includes('zzmisspelt'));
      assert.equal(readFileSync(doc,'utf8'),original,'experiment persisted Markdown');
      assert.deepEqual(errors,[],name+' page errors');
      console.log('PASS native spellcheck',name,'content attrs / module visibility / no data mutation / undo');
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');
  await sleep(250);
  rmSync(dir,{recursive:true,force:true});
}
