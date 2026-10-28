import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {copyFileSync,mkdirSync,readFileSync} from 'node:fs';
import {chromium,webkit,devices} from 'playwright';

const fixture='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const testFile='.v6/tests/compact-shell-browser-test.md';
const port=5216,url=`http://127.0.0.1:${port}/`;
mkdirSync('.v6/tests',{recursive:true});
mkdirSync('.v6/evidence',{recursive:true});
const original=readFileSync(fixture);
const originalText=original.toString('utf8');
const expectedLines=originalText.split('\n').length;
const formatCount=n=>n.toLocaleString('en-US');
copyFileSync(fixture,testFile);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  env:{...process.env,V6_DOCUMENT_PATH:process.cwd()+'/'+testFile},
  stdio:'ignore',
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// Portable browser launch: use Playwright-managed Chromium/WebKit binaries.
const engines=[['Chrome',chromium,{}],['WebKit',webkit,{}]];
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
          return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,width:r.width};
        };
        const buttons=[...document.querySelectorAll('header.toolbar > .source-actions button')].map(b=>b.id);
        const status=document.querySelector('#status');
        const toolbar=document.querySelector('.toolbar');
        const main=document.querySelector('main');
        const ag=document.querySelector('.ocr-outline-pane');
        const moduleToolbar=document.querySelector('.module-controls');
        const sourceActions=document.querySelector('.source-actions');
        const sourcePane=document.querySelector('.ocr-source-pane');
        const moduleActions=document.querySelector('#module-actions');
        return {
          viewport:{width:innerWidth,height:innerHeight},
          buttons,toolbar:rect(toolbar),main:rect(main),ag:rect(ag),
          moduleToolbar:rect(moduleToolbar),sourceActions:rect(sourceActions),
          sourcePane:rect(sourcePane),moduleActions:rect(moduleActions),
          sourceFileBar:rect(sourcePane.querySelector('.ocr-source-file-toolbar')),
          quoteIds:[...sourcePane.querySelectorAll('.ocr-source-file-toolbar .quote-indent-tools button')].map(b=>b.id),
          undoLabel:document.querySelector('#undo').textContent.trim(),
          redoLabel:document.querySelector('#redo').textContent.trim(),
          undoWidth:rect(document.querySelector('#undo')).width,redoWidth:rect(document.querySelector('#redo')).width,
          globalButtons:document.querySelectorAll('header.toolbar button:not(#build-version)').length,
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
      assert.deepEqual(initial.buttons,['undo','redo','save'],
        name+' global actions must be in the top status toolbar');
      assert.deepEqual(initial.quoteIds,['quote-outdent','quote-indent']);
      assert.equal(initial.undoLabel,'↶');assert.equal(initial.redoLabel,'↷');
      assert(initial.undoWidth<=36&&initial.redoWidth<=36,'Undo/Redo must be compact');
      assert.match(initial.build,/^main-\d{6}-\d{4}$/);
      assert(initial.toolbar.height<=42,name+' status bar must be compact');
      assert.equal(initial.globalButtons,3,'global actions must be unique');
      assert(Math.abs(initial.sourceActions.top-initial.toolbar.top)<=6,
        'CMD actions must share the global status row');
      assert(Math.abs(initial.sourceActions.right-initial.viewport.width)<=12,
        'Save must be at top-right window edge');
      assert(initial.sourceFileBar.height>=27,'source file toolbar missing');
      assert(initial.sourceFileBar.top>=initial.sourcePane.top,
        'source navigation must live inside the source pane');
      assert(Math.abs(initial.main.top-initial.toolbar.bottom)<=1,
        'Main workspace must begin immediately below the compact global status bar');
      assert(Math.abs(initial.main.bottom-initial.viewport.height)<1.5,'workspace fills to bottom edge');
      assert(initial.ag.height>520,'AG must remain full-height below chapter controls');
      assert.equal(initial.panes,3);
      assert(Object.values(initial.removed).every(n=>n===0),'no duplicate status bars');
      assert.equal(initial.adjacent,'build-version','global status immediately follows build number');
      assert.equal(initial.outlineCount,21);
      for(const text of ['✓ 已加载',`${formatCount(expectedLines)}行`,`${formatCount(originalText.length)}字`,'大纲21项','章节标定 注释0/标签0','⇅滚动同步',
        'Buffett’s Alpha.minerujson.md']){
        assert(initial.status.includes(text),name+' global status missing '+text);
        assert(initial.statusTitle.includes(text));
      }
      await page.screenshot({path:`.v6/evidence/compact-shell-${name.toLowerCase()}.png`});
      // The same controls must stay on the right of the single strip on Mac,
      // iPad portrait/landscape and narrow browser windows without clipping.
      for(const width of [834,768,610,430,390]){
        await page.setViewportSize({width,height:642});
        const g=await page.evaluate(()=>{
          const nav=document.querySelector('.module-controls');
          const source=document.querySelector('header.toolbar > .source-actions').getBoundingClientRect();
          const last=document.querySelector('#save').getBoundingClientRect();
          const bar=document.querySelector('.ocr-source-file-toolbar');
          const quote=document.querySelector('.ocr-source-file-toolbar > .quote-indent-tools').getBoundingClientRect();
          const selected=bar.querySelector('select').getBoundingClientRect();
          return {sourceRight:source.right,buttonRight:last.right,
            navOverflow:nav.scrollWidth>nav.clientWidth,
            quoteAfterSelect:quote.left>=selected.right-1,
            sourceOnScreen:source.left>=0};
        });
        assert(!g.navOverflow,`${name} module strip overflow at ${width}px`);
        assert(g.sourceOnScreen,`${name} header actions clipped at ${width}px`);
        assert(g.quoteAfterSelect,`${name} quote buttons must follow file navigator at ${width}px`);
        assert(Math.abs(g.buttonRight-width)<=12,`${name} save no longer top-right at ${width}px`);
        if(width===834)await page.screenshot({path:`.v6/evidence/compact-shell-portrait-${name.toLowerCase()}.png`});
      }
      await page.setViewportSize({width:1032,height:642});
      console.log('COMPACT_SHELL_LAYOUT_OK',name,JSON.stringify(initial));

      // Only CM6 changes the document; counts and save state migrate to the
      // single status line without resurrecting any per-pane footer.
      const lineBefore=await page.evaluate(()=>window.__v6cm6.view.state.doc.lines);
      await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        view.dispatch({changes:{from:view.state.doc.line(25).from,insert:'\n'}});
      });
      await page.waitForFunction(expected=>document.querySelector('#status')?.textContent.includes('未保存') &&
        document.querySelector('#status')?.textContent.includes(expected),
        `${formatCount(expectedLines+1)}行`,{timeout:12000});
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.lines),lineBefore+1);
      await page.locator('#undo').click();
      await page.waitForFunction(expected=>document.querySelector('#status')?.textContent.includes(expected),
        `${formatCount(expectedLines)}行`,{timeout:12000});

      // The existing quote actions must still edit live CM6 with the same
      // selection and support reverse action in the source navigation bar.
      const quoteSnapshot=await page.evaluate(()=>{
        const view=window.__v6cm6.view;
        const line=view.state.doc.line(25);
        view.dispatch({selection:{anchor:line.from}});
        return line.text;
      });
      await page.locator('.ocr-source-file-toolbar #quote-indent').click();
      assert.match(await page.evaluate(()=>window.__v6cm6.view.state.doc.line(25).text),
        /^> ?/,'quote-indent must prefix a Markdown quote marker');
      await page.locator('.ocr-source-file-toolbar #quote-outdent').click();
      assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.line(25).text),quoteSnapshot);

      // Sync stays implemented even though there is no fourth toolbar button.
      await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(false));
      assert.match(await page.locator('#status').textContent(),/⇅独立滚动/);
      await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(true));
      assert.match(await page.locator('#status').textContent(),/⇅滚动同步/);
      assert.equal(await page.locator('.ocr-outline-note').count(),0);

      // Save status is shown beside the build number; mock the isolated
      // document PUT and verify the same CM6 instance and contents persist.
      await page.route('**/api/document',route=>{
        if(route.request().method()==='PUT'){
          // Match production's strict CAS contract rather than weakening the
          // client: every simulated write carries If-Match and returns ETag.
          assert(route.request().headers()['if-match'],'Save omitted If-Match');
          const body=route.request().postData()||'';
          const etag='"'+createHash('sha256').update(body).digest('hex')+'"';
          return route.fulfill({status:200,headers:{ETag:etag},body:'saved'});
        }
        return route.continue();
      });
      await page.locator('#save').click();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('✓ 已保存'),
        null,{timeout:12000});
      assert.deepEqual(errors,[],name+' page errors');
      console.log('COMPACT_SHELL_PASS',name,JSON.stringify({
        toolbarHeight:initial.toolbar.height,freedWorkspaceHeight:initial.main.height,
        panes:3,buttons:initial.buttons,metadata:'global only',
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
