import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {copyFileSync,mkdirSync,readFileSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';
import {homedir} from 'node:os';

const fixture='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const testFile='.v6/tests/compact-shell-browser-test.md';
const port=5216,url=`http://127.0.0.1:${port}/`;
mkdirSync('.v6/tests',{recursive:true});
mkdirSync('.v6/evidence',{recursive:true});
const original=readFileSync(fixture);
copyFileSync(fixture,testFile);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  env:{...process.env,V6_DOCUMENT_PATH:process.cwd()+'/'+testFile},
  stdio:'ignore',
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const engines=[
  ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
];
try {
  let ready=false;
  for(let i=0;i<180;i++){
    try {if((await fetch(url)).ok){ready=true;break;}}catch {}
    await sleep(100);
  }
  assert(ready,'isolated Vite test server unavailable');
  for(const [name,engine,launchOptions] of engines){
    if(process.env.V6_ONLY_CHROME && name!=='Chrome')continue;
    if(process.env.V6_ONLY_WEBKIT && name!=='WebKit')continue;
    const browser=await engine.launch({headless:true,...launchOptions});
    try {
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1032,height:642}});
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      // Images embedded by MinerU may be remote; they must not delay layout.
      await page.route('**/*',route=>{
        if(route.request().url().startsWith(url))return route.continue();
        return route.abort();
      });
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.waitForFunction(()=>window.__v6cm6?.outline?.rows?.length===21 &&
        document.querySelector('#status')?.textContent?.includes('已加载'),
        null,{timeout:55000});
      const initial=await page.evaluate(()=>{
        const rect=el=>{
          const r=el.getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,height:r.height,width:r.width};
        };
        const buttons=[...document.querySelectorAll('header.toolbar .actions button')].map(b=>b.id);
        const status=document.querySelector('#status');
        const toolbar=document.querySelector('.toolbar');
        const main=document.querySelector('main');
        const ag=document.querySelector('.ocr-outline-pane');
        return {
          viewport:{width:innerWidth,height:innerHeight},
          buttons,toolbar:rect(toolbar),main:rect(main),ag:rect(ag),
          status:status.textContent,statusTitle:status.title,
          adjacent:status.previousElementSibling?.id,
          build:document.querySelector('#build-version')?.textContent,
          outlineCount:window.__v6cm6.scrollState.outlineCount,
          panes:document.querySelectorAll('.dv-groupview').length,
          removed:{
            fileSubbar:document.querySelectorAll('.subbar').length,
            pageFooter:document.querySelectorAll('.app > footer').length,
            agNote:document.querySelectorAll('.ocr-outline-note').length,
            oldSummary:document.querySelectorAll('#summary').length,
            oldCount:document.querySelectorAll('#count').length,
            syncButton:document.querySelectorAll('#sync-scroll').length,
            extractButton:document.querySelectorAll('#extract').length,
          },
        };
      });
      assert.deepEqual(initial.buttons,['undo','redo','save'],name+' only three toolbar buttons');
      assert(initial.toolbar.height<=42,name+' toolbar must be compact');
      assert.equal(initial.main.top,initial.toolbar.bottom+37,'module toolbar must sit between top bar and workspace');
      assert(Math.abs(initial.main.bottom-initial.viewport.height)<1.5,'workspace fills to bottom edge');
      assert(initial.ag.height>520,'AG must remain full-height below chapter controls');
      assert.equal(initial.panes,4);
      assert(Object.values(initial.removed).every(n=>n===0),'no duplicate status bars');
      assert.equal(initial.adjacent,'build-version','global status immediately follows build number');
      assert.equal(initial.outlineCount,21);
      for(const text of ['✓ 已加载','3,560行','314,218字','大纲21项','章节标定 注释0/标签0','⇅滚动同步',
        'Buffett’s Alpha.minerujson.md']){
        assert(initial.status.includes(text),name+' global status missing '+text);
        assert(initial.statusTitle.includes(text));
      }
      await page.screenshot({path:`.v6/evidence/compact-shell-${name.toLowerCase()}.png`});
      console.log('COMPACT_SHELL_LAYOUT_OK',name,JSON.stringify(initial));

      // Only CM6 changes the document; counts and save state migrate to the
      // single status line without resurrecting any per-pane footer.
      const lineBefore=await page.evaluate(()=>window.__v6cm6.view.state.doc.lines);
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        view.dispatch({changes:{from:view.state.doc.line(25).from,insert:'\n'}});
      });
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存') &&
        document.querySelector('#status')?.textContent.includes('3,561行'),
        null,{timeout:12000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.lines),lineBefore+1);
      await page.locator('#undo').click();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('3,560行'),
        null,{timeout:12000});

      // Sync stays implemented even though there is no fourth toolbar button.
      await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(false));
      assert.match(await page.locator('#status').textContent(),/⇅独立滚动/);
      await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(true));
      assert.match(await page.locator('#status').textContent(),/⇅滚动同步/);
      assert.equal(await page.locator('.ocr-outline-note').count(),0);

      // Save status is shown beside the build number; mock the isolated
      // document PUT and verify the same CM6 instance and contents persist.
      await page.route('**/api/document',route=>{
        if(route.request().method()==='PUT')
          return route.fulfill({status:200,body:'saved'});
        return route.continue();
      });
      await page.locator('#save').click();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('✓ 已保存'),
        null,{timeout:12000});
      assert.deepEqual(errors,[],name+' page errors');
      console.log('COMPACT_SHELL_PASS',name,JSON.stringify({
        toolbarHeight:initial.toolbar.height,freedWorkspaceHeight:initial.main.height,
        panes:4,buttons:initial.buttons,metadata:'global only',
        undo:true,save:true,syncState:true,errors:errors.length,
      }));
    } finally {
      await Promise.race([browser.close(),sleep(9000)]);
    }
  }
  assert.deepEqual(readFileSync(fixture),original,'original MinerU fixture must stay immutable');
} finally {
  server.kill('SIGTERM');
}
