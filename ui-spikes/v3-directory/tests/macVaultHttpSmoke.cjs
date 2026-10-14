const assert = require('node:assert/strict');
const {mkdtempSync,mkdirSync,readFileSync,existsSync,writeFileSync,rmSync,copyFileSync} = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');
const {chromium} = require('../../v2/node_modules/@playwright/test');
const {testPdf}=require('./fixturePdf.cjs');
const {settingValue,setSetting}=require('./settingsAgActions.cjs');
const repo = path.resolve(__dirname, '../../..');
const temp=mkdtempSync(path.join(os.tmpdir(),'ocr2md-v3-http-fs-'));
const root=path.join(temp,'ocr2md');
const staticRoot=path.join(temp,'http-static');
const url='http://127.0.0.1:4293/v3-directory/';
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const doubleTapRow=async (page, itemPath)=>{
  // Re-listing or selection triggers an AG Grid DOM redraw. Wait for the
  // new, visible semantic button instead of racing a detached/virtualized row.
  await page.locator(`button[data-open-path="${itemPath}"]`).waitFor({state:'visible',timeout:30000});
  // Two taps in one browser task (not two Node round-trips) so a stressed
  // CI Mac cannot accidentally exceed Safari's double-tap time window.
  await page.evaluate(path=>{
    // Hold the same listener for both touch clicks: AG Grid can detach
    // the DOM node after selecting it on tap one. The second synthetic tap
    // still reaches its registered handler, just like the real gesture.
    const button=Array.from(document.querySelectorAll('button[data-open-path]'))
      .find(node=>node.dataset.openPath===path);
    if(!button)throw Error('Cannot find directory name '+path);
    for(let i=0;i<2;i++){
      button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
      button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
    }
  },itemPath);
};
(async()=>{
  mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
  for(const file of ['index.html','sw.js']) copyFileSync(path.join(repo,'ui-spikes/v3-directory',file),path.join(staticRoot,'v3-directory',file));
  for(const file of require('node:fs').readdirSync(path.join(repo,'ui-spikes/v3-directory/dist'))) copyFileSync(path.join(repo,'ui-spikes/v3-directory/dist',file),path.join(staticRoot,'v3-directory/dist',file));
  copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(staticRoot,'v3-directory/dist/pdf.worker.min.mjs'));
  mkdirSync(path.join(root,'ocr2md'),{recursive:true});
  writeFileSync(path.join(root,'ocr2md','binary.pdf'), Buffer.from('%PDF-1.7\0not-text'));
  writeFileSync(path.join(root,'ocr2md','原文.pdf'),testPdf());
  writeFileSync(path.join(root,'ocr2md','appendix.pdf'),testPdf({paddingBytes:1000}));
  writeFileSync(path.join(root,'ocr2md','ocr-extract-001.json'),JSON.stringify({page:1,items:[{text:'OCR from PDF'}]}));
  writeFileSync(path.join(root,'ocr2md','workbench-example.md'),'# Test heading\nFirst paragraph.\n<br>\n## Another section\nSecond paragraph.');
  writeFileSync(path.join(root,'ocr2md','large.md'), '# Large text\n'+'A'.repeat(650000)+'\nEND_MARKER_NOT_IN_PREFIX');
  mkdirSync(path.join(root,'books'));
  writeFileSync(path.join(root,'root-note.txt'),'Root plain text');
  writeFileSync(path.join(root,'extensionless'),'No suffix');
  writeFileSync(path.join(root,'notes.MD'),'Upper extension');
  mkdirSync(path.join(root,'tools'));
  mkdirSync(path.join(root,'.obsidian'));
  writeFileSync(path.join(root,'.obsidian','secret.json'),'do not disclose');
  const server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),
    '--root',root,'--static',staticRoot,'--port','4293'],{stdio:'ignore'});
  let browser;
  try {
    for(let i=0;i<50;i++){
      try {if((await fetch('http://127.0.0.1:4293/__v3/fs?op=status')).ok)break;}catch{}
      await wait(100);
    }
    const status=await (await fetch('http://127.0.0.1:4293/__v3/fs?op=status')).json();
    assert.equal(status.authorized,false,'localhost port outside trusted 4176 needs key');
    const unauthorized=await fetch('http://127.0.0.1:4293/__v3/fs?op=bootstrap');
    assert.equal(unauthorized.status,401);
    const key=readFileSync(path.join(temp,'private/access-key'),'utf8').trim();
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:834,height:1194},hasTouch:true,isMobile:true});
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const pdfRangeRequests=[];
    page.on('request',request=>{
      const u=new URL(request.url());
      if(u.pathname==='/__v3/fs' && u.searchParams.get('op')==='read' && u.searchParams.get('path')==='/ocr2md/原文.pdf')
        pdfRangeRequests.push({offset:Number(u.searchParams.get('offset')),length:Number(u.searchParams.get('length'))});
    });
    await page.goto(url);
    await page.getByTestId('tab-workspace').waitFor();
    assert.equal(await page.getByRole('tablist',{name:'工作台模块'}).getByRole('tab').count(),3);
    await page.getByTestId('tab-settings').click();
    assert.equal(await page.locator('#panel-settings > #settings-connection-details').count(),1);
    assert.equal(await page.locator('#settings-shared #vault-key').count(),0);
    await page.waitForFunction(()=>document.getElementById('settings-connection-details')?.open===true,
      null,{timeout:6000});
    await page.getByTestId('connect-vault').waitFor();
    await page.locator('#vault-key').fill(key);
    await page.getByTestId('connect-vault').click();
    await page.getByTestId('tab-workspace').click();
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/');
    assert.equal(await page.getByTestId('directory-parent').count(),1);
    assert.equal(await page.getByTestId('directory-parent').isDisabled(),true);
    assert.ok(await page.locator('#directory-list .ag-root').count()>0,'genuine AG Grid is mounted');
    assert.equal(await page.getByTestId('working-source-editor').locator('.cm-editor').count(),1,'real shared v2 WorkingEditor mounted');
    assert.equal(await page.locator('#v3-workspace-mobile-splitter').count(),1);
    assert.equal(await page.locator('#v3-workspace-split').count(),1);
    for(const item of ['/ocr2md','/books','/tools']) await page.locator(`[data-open-path="${item}"]`).waitFor();
    assert.equal(await page.locator('[data-open-path="/.obsidian"]').count(),0);
    assert.equal(await page.locator('#directory-search').count(),0,'independent quick search is removed');
    assert.equal(await page.locator('#source-item-name,#source-item-metadata,#source-note').count(),0);
    assert.equal(await page.locator('#directory-grid-shell').getAttribute('aria-busy'),'false');
    assert.equal(await page.getByTestId('directory-loading').isHidden(),true);
    assert.equal(await page.locator('#directory-list .ag-header-cell[col-id="kind"]').count(),1);
    const beforeColumnOrder=await page.locator('#directory-list [role="columnheader"]').allTextContents();
    await page.locator('#directory-list [role="columnheader"]').filter({hasText:'类型'}).first()
      .dragTo(page.locator('#directory-list [role="columnheader"]').filter({hasText:'名称'}).first());
    const afterColumnOrder=await page.locator('#directory-list [role="columnheader"]').allTextContents();
    assert.deepEqual(afterColumnOrder,beforeColumnOrder,'AG column order must not change on drag');
    assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('单击 AG 表中的'));

    // The directory itself now uses exactly the v2 EnumCheckboxFilter with All.
    await page.locator('#directory-list .ag-header-cell[col-id="kind"] .ag-header-cell-filter-button').click();
    const kindFilter=page.locator('.config-enum-filter:visible');
    await kindFilter.locator('input[aria-label="All"]').waitFor();
    assert.equal(await kindFilter.locator('input[aria-label="All"]').isChecked(),true);
    await kindFilter.locator('input[aria-label="All"]').uncheck();
    await kindFilter.locator('input[aria-label=".txt"]').check();
    await page.locator('[data-open-path="/root-note.txt"]').waitFor();
    assert.equal(await page.locator('[data-open-path="/books"]').count(),0,'only .txt pass type filter');
    assert.equal(await page.getByTestId('directory-parent').count(),1,'pinned parent survives filtering');
    await kindFilter.locator('input[aria-label="All"]').check();
    assert.equal(await kindFilter.locator('input[aria-label=".md"]').count(),1,'uppercase .MD normalized to .md');
    assert.equal(await kindFilter.locator('input[aria-label="无后缀"]').count(),1);
    await page.keyboard.press('Escape');
    await page.locator('[data-open-path="/books"]').waitFor();
    // One click selects a FOLDER ROW, exposes its individual metadata in the source pane,
    // but must NEVER change the AG directory.
    await page.locator('[data-open-path="/ocr2md"]').click();
    assert.equal(await page.getByTestId('directory-path').textContent(),'Obsidian/ocr2md/');
    const folderSource=await page.locator('#working-editor .cm-content').textContent();
    assert.ok(folderSource.includes('"类型": "目录"'));
    assert.ok(folderSource.includes('"节点":'));
    assert.ok(!folderSource.includes('当前页项目数'),'folder details must not dump child inventory');
    // Inject deterministic network latency into the first child list request.
    // While in flight, the AG grid is inert and the visible loading veil is active.
    let slowBrowseSeen=false;
    await page.route('**/__v3/fs?*',async route=>{
      const u=new URL(route.request().url());
      if(!slowBrowseSeen && u.searchParams.get('op')==='list' && u.searchParams.get('path')==='/ocr2md') {
        slowBrowseSeen=true; await wait(850);
      }
      await route.continue();
    });
    // Dispatch two successive user-like click events in the browser; avoiding
    // Playwright dblclick's actionability wait when the FIRST tap sets inert.
    // Two real-ish touch events, re-resolving AG row after each redraw.
    // Selecting an AG row forces a full renderer redraw; wait for the new
    // visible name cell to exist before sending the independent touch pair.
    await page.locator('[data-open-path="/ocr2md"]').waitFor({state:'visible',timeout:15000});
    await doubleTapRow(page,'/ocr2md');
    await page.getByTestId('directory-loading').waitFor({state:'visible',timeout:5000});
    assert.equal(await page.locator('#directory-grid-shell').getAttribute('aria-busy'),'true');
    assert.equal(await page.locator('#directory-list').getAttribute('inert'),'');
    assert.equal(await page.locator('#file-actions').getAttribute('inert'),'', 'file actions also blocked while browse pending');
    assert.equal(await page.getByTestId('directory-parent').isEnabled(),false,'inert AG grid blocks clicking during loading');
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
    await page.getByTestId('directory-loading').waitFor({state:'hidden'});
    assert.equal(await page.locator('#directory-grid-shell').getAttribute('aria-busy'),'false');
    assert.equal(await page.locator('#directory-list').getAttribute('inert'),null);
    assert.equal(await page.locator('#file-actions').getAttribute('inert'),null);
    assert.equal(slowBrowseSeen,true);
    assert.equal(await page.getByTestId('directory-parent').isEnabled(),true);
    const openedSource=await page.locator('#working-editor .cm-content').textContent();
    assert.ok(openedSource.includes('"类型": "目录"'));
    assert.ok(!openedSource.includes('内容:'),'no aggregate directory listing');
    assert.ok(openedSource.includes('Obsidian/ocr2md/ocr2md'));
    assert.equal(await page.getByTestId('tab-workbench').isVisible(),true,
      'global workbench tab always occupies its template slot');
    assert.equal(await page.getByTestId('tab-workbench').isDisabled(),true,
      'not yet mounted: disable the action instead of removing the tab');
    assert.equal(await page.getByTestId('set-working-directory').isEnabled(),true);
    // Regression: Cloudflare can intermittently answer a PDF Range request
    // with a non-JSON 530 HTML page; the GET must be retried transparently.
    let simulatedGateway530=false;
    await page.route('**/__v3/fs?*',async route=>{
      const u=new URL(route.request().url());
      if (!simulatedGateway530 && u.searchParams.get('op')==='read' && u.searchParams.get('path')==='/ocr2md/原文.pdf') {
        simulatedGateway530=true;
        await route.fulfill({status:530,contentType:'text/html',body:'<html>temporary cloudflare error</html>'});
      } else await route.continue();
    });
    await page.getByTestId('set-working-directory').click();
    await page.waitForFunction(()=>document.querySelector('#tab-workbench')?.getAttribute('aria-selected')==='true',
      null,{timeout:25000});
    assert.equal(await page.getByTestId('tab-workbench').getAttribute('aria-selected'),'true');
    // Reuse v2 resizers: desktop AG/source width and source/PDF height.
    const columnSplitter=page.getByTestId('workbench-column-splitter');
    const rowSplitter=page.getByTestId('workbench-row-splitter');
    const mobileSplitter=page.getByTestId('workbench-mobile-splitter');
    assert.equal(await columnSplitter.isVisible(),false,'iPad portrait stacks audit/source/PDF panes');
    assert.equal(await mobileSplitter.isVisible(),true,'iPad portrait stack remains resizable');
    await page.setViewportSize({width:1280,height:900});
    assert.equal(await columnSplitter.isVisible(),true);
    assert.equal(await rowSplitter.isVisible(),true);
    assert.equal(await mobileSplitter.isVisible(),false);
    const splitBefore=await page.evaluate(()=>({
      left:parseFloat(getComputedStyle(document.getElementById('workbench-layout')).getPropertyValue('--left-pane-width')),
      top:parseFloat(getComputedStyle(document.getElementById('workbench-right-pane')).getPropertyValue('--editor-top-percent')),
      directory:localStorage.getItem('ocr2md-v3-directory-split-v1'),
    }));
    await columnSplitter.focus();await page.keyboard.press('ArrowRight');
    await rowSplitter.focus();await page.keyboard.press('ArrowDown');
    const splitAfter=await page.evaluate(()=>({
      left:parseFloat(getComputedStyle(document.getElementById('workbench-layout')).getPropertyValue('--left-pane-width')),
      top:parseFloat(getComputedStyle(document.getElementById('workbench-right-pane')).getPropertyValue('--editor-top-percent')),
      leftSaved:localStorage.getItem('ocr2md-v3-workbench-columns-v1'),
      topSaved:localStorage.getItem('ocr2md-v3-workbench-editor-preview-v2'),
      directory:localStorage.getItem('ocr2md-v3-directory-split-v1'),
    }));
    assert.ok(splitAfter.left>splitBefore.left,'desktop AG/source width moves with v2 splitter');
    assert.ok(splitAfter.top>splitBefore.top,'source/PDF height moves with v2 splitter');
    assert.equal(Number(splitAfter.leftSaved),splitAfter.left);
    assert.equal(Number(splitAfter.topSaved),splitAfter.top);
    assert.equal(splitBefore.directory,splitAfter.directory,'directory split stays independent');
    // Physical mouse drag changes geometry (not just localStorage values).
    const beforeWidth=await page.locator('#workbench-layout .workbench-grid-pane').evaluate(node=>node.getBoundingClientRect().width);
    const colBox=await columnSplitter.boundingBox();
    assert.ok(colBox);
    await page.mouse.move(colBox.x+colBox.width/2,colBox.y+colBox.height/2);
    await page.mouse.down();await page.mouse.move(colBox.x+colBox.width/2+40,colBox.y+colBox.height/2,{steps:4});await page.mouse.up();
    const afterWidth=await page.locator('#workbench-layout .workbench-grid-pane').evaluate(node=>node.getBoundingClientRect().width);
    assert.ok(afterWidth>beforeWidth+15,'real drag expands left AG pane');
    const beforeSourceHeight=await page.locator('#workbench-layout .workbench-source-pane').evaluate(node=>node.getBoundingClientRect().height);
    const rowBox=await rowSplitter.boundingBox();
    assert.ok(rowBox);
    await page.mouse.move(rowBox.x+rowBox.width/2,rowBox.y+rowBox.height/2);
    await page.mouse.down();await page.mouse.move(rowBox.x+rowBox.width/2,rowBox.y+rowBox.height/2+35,{steps:4});await page.mouse.up();
    const afterSourceHeight=await page.locator('#workbench-layout .workbench-source-pane').evaluate(node=>node.getBoundingClientRect().height);
    assert.ok(afterSourceHeight>beforeSourceHeight+14,'real drag increases v2 source pane height');
    // At narrow iPhone width, AG/source areas stack but BOTH vertical splitters
    // stay adjustable (desktop-width handle is hidden).
    await page.setViewportSize({width:390,height:844});
    assert.equal(await columnSplitter.isVisible(),false);
    assert.equal(await mobileSplitter.isVisible(),true);
    await mobileSplitter.focus();
    const mobileBefore=await page.locator('#workbench-layout .workbench-grid-pane').evaluate(node=>node.getBoundingClientRect().height);
    await page.keyboard.press('ArrowDown');
    const mobileAfter=await page.locator('#workbench-layout .workbench-grid-pane').evaluate(node=>node.getBoundingClientRect().height);
    assert.ok(mobileAfter>mobileBefore+4,'mobile AG/top pane adjusts independently');
    assert.ok(Number(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-workbench-mobile-grid-height-v1')))>34);
    const rightBelow=await page.locator('#workbench-right-pane').evaluate(node=>node.getBoundingClientRect().y);
    const gridBottom=await page.locator('#workbench-layout .workbench-grid-pane').evaluate(node=>node.getBoundingClientRect().bottom);
    assert.ok(rightBelow>=gridBottom,'mobile workbench panes are stacked');
    await page.setViewportSize({width:1280,height:900});
    assert.equal(await columnSplitter.isVisible(),true);
    assert.equal(await rowSplitter.isVisible(),true);
    // Current V3 contract: Markdown is the initial tab, while PDF range-loads
    // quietly in the background. Explicit user selection opens the PDF.
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true',
      'Markdown remains initial preview; PDF background preload is independent');
    await page.getByTestId('preview-tab-pdf').click();
    assert.equal(await page.getByTestId('preview-tab-pdf').getAttribute('aria-selected'),'true');
    assert.equal(await page.getByTestId('workbench-pdf-file').inputValue(),'/ocr2md/原文.pdf');
    await page.waitForFunction(()=>document.querySelector('#workbench-pdf-status')?.textContent?.includes('第 1 / 2 页'),null,{timeout:12000}).catch(async error=>{
      console.error('PDF_DEBUG_STATUS',await page.getByTestId('workbench-pdf-status').textContent());
      console.error('PDF_DEBUG_WORKBENCH',await page.getByTestId('workbench-status').textContent());
      console.error('PDF_DEBUG_ERRORS',errors);
      throw error;
    });
    await page.locator('#workbench-pdf-canvas .pdfViewer .page[data-page-number="1"] canvas').waitFor({timeout:30000});
    assert.equal(await page.locator('#workbench-pdf-canvas .pdfViewer .page[data-page-number="1"] canvas').count(),1);
    assert.equal(simulatedGateway530,true,'fixture must inject an actual non-JSON 530 read');
    assert.equal(await page.getByTestId('pdf-reload').count(),1,'PDF must have an explicit re-open action');
    assert.ok(pdfRangeRequests.length>0,'PDF.js must use authenticated Mac Vault range reads');
    assert.ok(pdfRangeRequests.every(v=>v.length>0&&v.length<=64*1024),'each PDF read is bounded');
    assert.ok(pdfRangeRequests.reduce((n,v)=>n+v.length,0)<1024*1024,
      'initial PDF page must not fetch full 2 MiB original');
    assert.ok((await page.getByTestId('workbench-ocr-json-status').textContent()).includes('1 份'));
    assert.equal(await page.getByTestId('pdf-page-prev').isDisabled(),true);
    await page.getByTestId('pdf-page-next').click();
    await page.waitForFunction(()=>document.querySelector('#workbench-pdf-status')?.textContent?.includes('第 2 / 2 页'),null,{timeout:12000}).catch(async error=>{
      console.error('PDF_PAGE2_DEBUG_STATUS',await page.getByTestId('workbench-pdf-status').textContent());
      console.error('PDF_PAGE2_DEBUG_CANVAS',await page.locator('#workbench-pdf-canvas canvas').evaluateAll(nodes=>nodes.map(n=>n.closest('.page')?.dataset.pageNumber)));
      console.error('PDF_PAGE2_DEBUG_ERRORS',errors);
      throw error;
    });
    await page.locator('#workbench-pdf-canvas .pdfViewer .page[data-page-number="2"] canvas').waitFor({timeout:30000});
    assert.equal(await page.locator('#workbench-pdf-canvas .pdfViewer .page[data-page-number="2"] canvas').count(),1);
    await page.getByTestId('preview-tab-markdown').click();
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true');
    await page.getByTestId('preview-tab-pdf').click();
    // V3 navigation is now the single top dropdown. Older PDF file chooser
    // is intentionally hidden rather than creating a second navigation UI.
    assert.equal(await page.getByTestId('workbench-pdf-file').isHidden(),true,
      'legacy PDF source chooser cannot duplicate global navigation');
    assert.ok((await page.getByTestId('workbench-folder').textContent()).includes('/ocr2md'));
    // Chapter delimitation is the new default; legacy text-grid assertions
    // explicitly select the retained legacy module instead of assuming it.
    await page.locator('#wb-module-menu > summary').click();
    await page.getByTestId('workbench-mode-text').click();
    await page.locator('#workbench-calibration-grid .ag-root').waitFor();
    await page.locator('#workbench-source .cm-editor').waitFor();
    await page.getByTestId('preview-tab-markdown').click();
    assert.equal(await page.getByTestId('workbench-file').isHidden(),true,
      'legacy Markdown dropdown must not duplicate the global directory navigation');
    assert.equal(await page.locator('#workbench-source .cm-content').getAttribute('contenteditable'),'false',
      'legacy text module retains read-only source permission');
    await page.getByTestId('tab-workspace').click();
    assert.equal(await page.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
    await page.locator('[data-open-path="/ocr2md/binary.pdf"]').click();
    await page.waitForFunction(()=>document.querySelector('#working-editor .cm-content')?.textContent?.includes('binary.pdf'));
    assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('二进制文件不按文本解析')); 
    assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('binary.pdf'));
    assert.ok(!(await page.locator('#working-editor .cm-content').textContent()).includes('%PDF-1.7'));
    await page.locator('[data-open-path="/ocr2md/large.md"]').click();
    await page.waitForFunction(()=>document.querySelector('#working-editor .cm-content')?.textContent?.includes('其余内容未加载'));
    assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('650'));
    const sourcePreview=await page.locator('#working-editor .cm-content').innerText();
    assert.ok(sourcePreview.includes('# Large text'));
    assert.ok(!sourcePreview.includes('END_MARKER_NOT_IN_PREFIX'));
    await page.locator('#file-actions summary').click();
    await page.locator('#create-name').fill('WP3-http-integration');
    await page.getByTestId('create-folder').click();
    await page.locator('[data-open-path="/ocr2md/WP3-http-integration"]').waitFor({timeout:10000});
    assert.ok(existsSync(path.join(root,'ocr2md','WP3-http-integration')));
    await doubleTapRow(page,'/ocr2md/WP3-http-integration');
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/WP3-http-integration');
    await page.getByTestId('directory-loading').waitFor({state:'hidden'});
    await page.locator('#create-name').fill('real.md');
    await page.locator('#file-content').fill('# 真实目录 HTTP 写入验收\nMac/iPad统一存储接口');
    await page.getByTestId('create-file').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'real.md'}).waitFor();
    assert.equal(readFileSync(path.join(root,'ocr2md','WP3-http-integration','real.md'),'utf8'),'# 真实目录 HTTP 写入验收\nMac/iPad统一存储接口');
    await page.reload();
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('tab-workspace').click();
    await page.locator('[data-open-path="/ocr2md"]').waitFor();
    await doubleTapRow(page,'/ocr2md');
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
    await page.getByTestId('directory-loading').waitFor({state:'hidden'});
    await doubleTapRow(page,'/ocr2md/WP3-http-integration');
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/WP3-http-integration');
    await page.getByTestId('directory-loading').waitFor({state:'hidden'});
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'real.md'}).click();
    await page.waitForFunction(()=>document.querySelector('#working-editor .cm-content')?.textContent?.includes('Mac/iPad统一存储接口'));
    assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('real.md'));
    assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('文件'));
    assert.equal(await page.locator('#working-editor .cm-content').getAttribute('contenteditable'),'false');
    await page.locator('#file-actions summary').click();
    await page.getByTestId('read-file').click();
    await page.waitForFunction(()=>document.querySelector('#file-content')?.value.includes('Mac/iPad统一存储接口'));
    await page.locator('#target').fill('copied.md');
    await page.getByTestId('copy-file').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'copied.md'}).waitFor();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'copied.md'}).click();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByTestId('remove').click();
    await page.waitForFunction(()=>![...document.querySelectorAll('#directory-list [data-kind="file"]')].some(x=>x.textContent?.includes('copied.md')));
    assert.equal(existsSync(path.join(root,'ocr2md','WP3-http-integration','copied.md')),false);
    await page.getByTestId('tab-settings').click();
    const sharedGrid=page.locator('#settings-shared .las-grid');
    await sharedGrid.locator('.ag-row').first().waitFor();
    assert.ok(await sharedGrid.locator('.ag-row').count()>=10,'centralized Shared Settings AG table must show v3 settings');
    assert.equal(await page.locator('#settings-shared laity-source-surface').count(),1,
      'Agent Link Shared Source CodeMirror is present next to Shared Settings AG');
    await setSetting(page,'showSizeColumn',false);
    await setSetting(page,'gridDensity','compact');
    await page.getByTestId('settings-save').click();
    const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')));
    assert.equal(persisted.showSizeColumn,false);
    assert.equal(persisted.gridDensity,'compact');
    // Invalid numeric JSON is rejected, never persisted to preferences.
    await page.locator('#settings-shared laity-source-surface').evaluate((e,json)=>{e.value=json},JSON.stringify({
      ...persisted,gridFontSize:99},null,2));
    await page.getByTestId('settings-save').click();
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1'))).gridFontSize,14);
    await page.getByTestId('tab-workspace').click();
    await page.getByTestId('directory-parent').click();
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('settings-reset').click();
    assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1'))).gridDensity,'standard');
    await page.getByTestId('tab-workspace').click();
    assert.equal(existsSync(path.join(root,'.obsidian','secret.json')),true);
    assert.deepEqual(errors,[]);
    console.log('V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS real-temp-disk auth/list/create/read/reload/copy/delete, config safe');
    await context.close();
  } finally {
    if(browser) await browser.close();
    server.kill('SIGTERM');
    rmSync(temp,{force:true,recursive:true});
  }
})().catch(e=>{console.error('V3_MAC_VAULT_HTTP_E2E_FAILED',e);process.exitCode=1});
