import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {chromium, webkit, devices} from 'playwright';
import {homedir} from 'node:os';

const original='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const testFile='.v6/tests/dockview-preview-test.md';
const port=5199, address='http://127.0.0.1:'+port+'/';
mkdirSync('.v6/tests',{recursive:true});
mkdirSync('.v6/evidence',{recursive:true});
const originalBytes=readFileSync(original);
writeFileSync(testFile,originalBytes);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  env:{...process.env,V6_DOCUMENT_PATH:process.cwd()+'/'+testFile},stdio:'ignore',
});
async function waitServer() {
  for(let i=0;i<130;i++) {
    try {if((await fetch(address)).ok)return;} catch {}
    await new Promise(resolve=>setTimeout(resolve,110));
  }
  throw Error('Isolated Vite test server unavailable');
}
const engines=[
  ['Chrome',chromium,{executablePath:chromeExecutable()}],
  ['WebKit',webkit,{executablePath:webkitExecutable()}],
];
try {
  await waitServer();
  for(const [label,engine,launchOptions] of engines) {
    const browser=await engine.launch({headless:true,...launchOptions});
    try {
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642}});
      // The preview contains third-party MinerU images. Never depend on CDN
      // speed or credentials for local layout/renderer tests.
      await page.route('**/*',route=> {
        if(route.request().url().startsWith('http://127.0.0.1:'+port))return route.continue();
        return route.abort();
      });
      const pageErrors=[];
      page.on('pageerror',e=>pageErrors.push(e.message));
      await page.goto(address,{waitUntil:'domcontentloaded',timeout:40000});
      await page.waitForFunction(()=>Boolean(window.__v6cm6?.view &&
        document.querySelector('#status')?.textContent.includes('已加载')),
        {timeout:30000});
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-markdown .katex').length>=20,
        {timeout:45000});
      const snapshot=await page.evaluate(()=>{
        const source=document.querySelector('.cm-content');
        const left=document.querySelector('#editor');
        const right=document.querySelector('.ocr-preview-pane');
        return {
          panes:document.querySelectorAll('.dv-groupview').length,
          sourceExists:!!source,
          sourceSize:window.__v6cm6.view.state.doc.length,
          images:right.querySelectorAll('img').length,
          lazyImages:[...right.querySelectorAll('img')].filter(x=>x.loading==='lazy').length,
          tables:right.querySelectorAll('table').length,
          math:right.querySelectorAll('.katex').length,
          preservedComment:window.__v6cm6.view.state.doc.sliceString(0,40),
          previewIncludesComment:right.textContent.includes('minerujson:block:'),
          editorWidth:left.getBoundingClientRect().width,
          previewWidth:right.getBoundingClientRect().width,
          editorFont:getComputedStyle(source).fontFamily,
          editor:window.__v6cm6.view,
        };
      });
      assert.equal(snapshot.panes,3,label+' Dockview must contain AG, source and shared preview groups');
      assert(snapshot.sourceExists && snapshot.sourceSize>300000);
      assert.equal(snapshot.images,11);
      assert.equal(snapshot.lazyImages,11);
      assert.equal(snapshot.tables,8);
      assert.equal(snapshot.math,20);
      assert.match(snapshot.preservedComment,/minerujson/);
      assert(!snapshot.previewIncludesComment);
      assert(snapshot.editorWidth>200 && snapshot.previewWidth>200);
      assert.match(snapshot.editorFont,/OCR2MD Sarasa/);

      const live=await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        const doc=view.state.doc;
        const before=doc.length;
        const insert='\n\n## Live preview check\n\n**EDIT_SYNC_OK**\n';
        view.dispatch({changes:{from:before,insert}});
        return {before,after:view.state.doc.length,insertLength:insert.length};
      });
      assert.equal(live.after,live.before+live.insertLength);
      await page.waitForFunction(()=>document.querySelector('.ocr-markdown')
        ?.textContent.includes('EDIT_SYNC_OK'),{timeout:25000});
      assert(await page.evaluate(()=>window.__v6cm6.view===window.__v6cm6.view));
      await page.locator('#undo').click();
      await page.waitForFunction(()=>!document.querySelector('.ocr-markdown')
        ?.textContent.includes('EDIT_SYNC_OK'),{timeout:25000});

      const resize=await page.evaluate(()=>{
        const api=window.__v6cm6.dockview;
        const editor=window.__v6cm6.view;
        const before=api.toJSON();
        api.layout(900,450);
        const during=api.toJSON();
        api.layout(1032,550);
        return {
          panels:api.panels.map(p=>p.id),
          beforeWidth:before.grid.width,
          duringWidth:during.grid.width,
          sameEditor:window.__v6cm6.view===editor,
          previewExists:!!document.querySelector('.ocr-markdown'),
        };
      });
      assert(resize.panels.includes('source') && resize.panels.includes('preview'));
      assert(resize.sameEditor && resize.previewExists);

      // HTML from editing is untrusted: event handlers / script must not run.
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        view.dispatch({changes:{from:view.state.doc.length,insert:
          '\n<script>window.__injected=1</script>\n<img src=x onerror="window.__injected=2">\n'}});
      });
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-markdown img').length>=12,
        {timeout:25000});
      assert.equal(await page.evaluate(()=>window.__injected||0),0,label+' XSS was not blocked');
      assert.equal(await page.locator('.ocr-markdown script').count(),0);
      assert.deepEqual(pageErrors,[],label+' JavaScript errors');
      await page.screenshot({path:`.v6/evidence/dockview-preview-${label.toLowerCase()}.png`});
      console.log('DOCKVIEW_PREVIEW_PASS',label,JSON.stringify({
        width:1032,groups:snapshot.panes,images:snapshot.images,
        tables:snapshot.tables,math:snapshot.math,liveUpdate:'pass',
        undo:'pass',editorInstanceStable:true,source:'CM6 only',
        layout:'pass',sanitize:'pass',errors:pageErrors.length,
      }));
    } finally {
      await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,11000))]);
    }
  }
  assert.deepEqual(readFileSync(original),originalBytes,'Original fixture must stay unchanged');
} finally {
  server.kill('SIGTERM');
}
