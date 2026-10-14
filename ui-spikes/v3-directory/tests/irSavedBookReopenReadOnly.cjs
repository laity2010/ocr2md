/** Real saved-book restore regression. Copies source book to a temporary isolated Vault;
 * never writes to the real Obsidian folder, and makes no commit requests. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const repo=path.resolve(__dirname,'../../..');
const source=process.env.OCR2MD_IR_BOOK;
if(!source||!fs.existsSync(path.join(source,'.ocr2md','ir-current.v1.json'))){
 console.error('Usage: OCR2MD_IR_BOOK=<existing saved book directory> node tests/irSavedBookReopenReadOnly.cjs');
 process.exit(2);
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocr2md-real-saved-reopen-'));
const root=path.join(temp,'ocr2md');fs.mkdirSync(path.join(root,'ocr2md'),{recursive:true});
const bookName=path.basename(source);fs.cpSync(source,path.join(root,'ocr2md',bookName),{recursive:true});
const staticRoot=path.join(temp,'site');fs.mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
for(const file of ['index.html','sw.js'])fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory',file),path.join(staticRoot,'v3-directory',file));
for(const file of fs.readdirSync(path.join(repo,'ui-spikes/v3-directory/dist'))){
 const from=path.join(repo,'ui-spikes/v3-directory/dist',file);
 if(fs.statSync(from).isFile())fs.copyFileSync(from,path.join(staticRoot,'v3-directory/dist',file));
}
fs.copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
 path.join(staticRoot,'v3-directory/dist/pdf.worker.min.mjs'));
const port=13500+Math.floor(Math.random()*10000);
const base=`http://127.0.0.1:${port}`;
const server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),
 '--root',root,'--static',staticRoot,'--port',String(port)],{stdio:'ignore'});
(async()=>{
 let browser;
 try{
  for(let i=0;i<130;i++){
   if(fs.existsSync(path.join(temp,'private/access-key')))break;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(fs.existsSync(path.join(temp,'private/access-key')));
  browser=await (process.env.OCR2MD_TEST_WEBKIT==='1'?webkit:chromium).launch(
    process.env.OCR2MD_TEST_WEBKIT==='1'?{headless:true}:{channel:'chrome',headless:true});
  const emulateIpad=process.env.OCR2MD_REPRO_AG18==='1'&&process.env.OCR2MD_TEST_WEBKIT==='1';
  const ctx=await browser.newContext({
    viewport:emulateIpad?{width:834,height:1194}:{width:1460,height:930},
    hasTouch:emulateIpad||process.env.OCR2MD_REPRO_TOUCH==='1',
    ...(emulateIpad?{userAgent:'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'}:{})
  });
  const page=await ctx.newPage();const errors=[],writes=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('dialog',dialog=>dialog.accept()); // allows exiting unsaved isolated browser draft
  page.on('request',r=>{if(r.url().includes('/__v3/ir/commit'))writes.push(r.url());});
  const folder=`/ocr2md/${bookName}`;
  async function open(p){
   const locator=page.locator(`[data-open-path=${JSON.stringify(p)}]`);
   await locator.waitFor({state:'visible',timeout:20000});
   await page.evaluate(p=>{
     const b=Array.from(document.querySelectorAll('[data-open-path]')).find(e=>e.dataset.openPath===p);
     b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
     b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
     b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
     b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:2}));
   },p);
   await page.waitForFunction(p=>document.querySelector('#directory-path')?.textContent===`Obsidian/ocr2md${p}`,
     p,{timeout:30000});
  }
  await page.goto(base+'/v3-directory/',{waitUntil:'domcontentloaded'});
  // Fixed tab/navigation slots exist from the first frame, even before a book.
  assert.equal(await page.getByTestId('tab-workbench').isVisible(),true);
  assert.equal(await page.getByTestId('tab-workbench').isDisabled(),true);
  assert.equal(await page.getByTestId('workbench-path-nav').isVisible(),true);
  assert.equal(await page.getByTestId('workbench-path-nav').isDisabled(),true);
  await page.getByTestId('tab-settings').click();
  assert.equal(await page.getByTestId('tab-workbench').isVisible(),true);
  assert.equal(await page.getByTestId('workbench-path-nav').isVisible(),true);
  await page.locator('#vault-key').fill(fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim());
  await page.getByTestId('connect-vault').click();
  await page.getByTestId('tab-workspace').click();
  /* default home is already /ocr2md */await open(folder);
  await page.getByTestId('set-working-directory').click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:100000});
  const first=await page.locator('#workbench-ir-grid').innerText();
  if(process.env.OCR2MD_REPRO_LINE59!=='1')assert.ok(first.includes('测试.补录章节'), 'saved human title visible on first open');
  assert.equal(await page.getByTestId('ir-save').isDisabled(),true);
  if(process.env.OCR2MD_NAV_CLEAN==='1'){
    await page.setViewportSize({width:834,height:1194});
    const navbarGeometry=await page.evaluate(()=>{
      const tab=document.querySelector('#tab-workbench').getBoundingClientRect();
      const nav=document.querySelector('#workbench-path-nav').getBoundingClientRect();
      return {gap:nav.left-tab.right,overflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.ok(navbarGeometry.gap>=0&&navbarGeometry.gap<=20,
      'navigator must sit immediately right of Workbench tab: '+JSON.stringify(navbarGeometry));
    assert.ok(navbarGeometry.overflow<=0,'iPad navigator must not overflow');
    await page.setViewportSize({width:390,height:844});
    const narrow=await page.evaluate(()=>{
      const tab=document.querySelector('#tab-workbench').getBoundingClientRect();
      const nav=document.querySelector('#workbench-path-nav').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth-innerWidth,
        navbarVisible:nav.width>0&&nav.height>0,
        following:nav.top>=tab.top-2};
    });
    assert.ok(narrow.overflow<=0&&narrow.navbarVisible&&narrow.following,
      'narrow screen top navigation must stay visible, ordered and not overflow: '+JSON.stringify(narrow));
    await page.setViewportSize({width:834,height:1194});
    const navigator=page.getByTestId('workbench-path-nav');
    await page.waitForFunction(()=>document.querySelector('#workbench-path-nav')?.options.length===7,null,{timeout:45000});
    const choices=await navigator.locator('option').evaluateAll(options=>options.map(o=>({label:o.textContent,value:o.value})));
    assert.equal(choices.length,7);
    assert.equal(choices[0].value,folder);
    assert.ok(choices.slice(1).every(o=>o.value.startsWith(folder+'/chapters/')&&o.value.endsWith('.md')));
    assert.equal(await page.getByTestId('workbench-module-title').textContent(),'章节定界');
    const chapter=choices.find(o=>o.value.includes('02 Appendix A'));
    const another=choices.find(o=>o.value.includes('03 Appendix B'));
    assert.ok(chapter&&another);
    const original=fs.readFileSync(path.join(root,chapter.value.slice(1)),'utf8');
    // Even on Settings, the dropdown remains physically adjacent to Workbench
    // and selecting a chapter must activate the Workbench tab automatically.
    await page.getByTestId('tab-settings').click();
    assert.equal(await navigator.isVisible(),true);
    assert.equal(await page.getByTestId('tab-workbench').isVisible(),true);
    const settingsGap=await page.evaluate(()=>{
      const tab=document.querySelector('#tab-workbench').getBoundingClientRect();
      const nav=document.querySelector('#workbench-path-nav').getBoundingClientRect();
      return nav.left-tab.right;
    });
    assert.ok(settingsGap>=0&&settingsGap<=20,'stable tab+dropdown placement across tabs: '+settingsGap);
    await navigator.selectOption(chapter.value);
    assert.equal(await page.getByTestId('tab-workbench').getAttribute('aria-selected'),'true');
    await page.waitForFunction(()=>!document.querySelector('#wb-clean-modules')?.hidden&&
      document.querySelector('#workbench-source .cm-content')?.getAttribute('contenteditable')==='true',null,{timeout:30000});
    assert.equal(await page.getByTestId('workbench-file').isHidden(),true);
    assert.equal(await page.getByTestId('wb-clean-modules').isVisible(),true);
    assert.equal(await page.getByTestId('wb-clean-modules').inputValue(),'章节标题');
    assert.deepEqual(await page.getByTestId('wb-clean-modules').locator('option').allTextContents(),
      ['章节清洗 · 章节标题','章节清洗 · 媒体','章节清洗 · 表格','章节清洗 · LaTeX']);
    assert.equal(await page.locator('#wb-clean-normalize-ob').count(),0);
    assert.equal(await page.locator('#ir-heading-filters').isHidden(),true);
    assert.equal(await page.locator('#ir-sequence-start-control').isHidden(),true);
    const numbering=page.getByTestId('wb-clean-heading-numbers');
    assert.equal(await numbering.isChecked(),true,'heading ordinals default on');
    assert.equal(await page.getByTestId('workbench-calibration-grid').isVisible(),true,
      'chapter cleaning must actually display the AG text-block grid');
    assert.equal(await page.getByTestId('workbench-mode-chapters').isHidden(),true,
      'legacy chapter delimitation switch must not appear inside cleaning mode');
    assert.equal(await page.locator('#wb-module-menu').isHidden(),true);
    assert.equal(await page.getByTestId('workbench-ir-source').isHidden(),true);
    assert.equal(await page.getByTestId('workbench-source').isVisible(),true);
    assert.ok((await page.locator('#workbench-source').innerText()).includes('Data Sources'));
    assert.equal(await page.getByTestId('clean-save').isDisabled(),true);
    const headingPreview=page.locator('#workbench-calibration-grid .chapter-heading-preview');
    assert.ok(await headingPreview.count()>0,'heading cleaning AG must list real headings');
    assert.match(await headingPreview.first().textContent(),/^\(001\) /);
    const hCount=await headingPreview.count();
    await numbering.uncheck();
    assert.equal(await numbering.isChecked(),false);
    assert.equal(await headingPreview.count(),hCount);
    assert.doesNotMatch(await headingPreview.first().textContent(),/^\(001\) /,
      'unchecking must hide AG ordinal without changing markdown');
    assert.equal(await page.getByTestId('clean-save').isDisabled(),true,
      'heading numbering is view-only; no dirty edit');
    assert.equal(fs.readFileSync(path.join(root,chapter.value.slice(1)),'utf8'),original);
    await numbering.check();
    assert.match(await headingPreview.first().textContent(),/^\(001\) /);
    const headingSource=await page.locator('#workbench-source').innerText();
    assert.ok(headingSource.includes('Appendix A'));
    const brandStatus=page.getByTestId('status');
    assert.equal(await brandStatus.isVisible(),true);
    assert.equal(await page.locator('.v3-brand #status').count(),1,
      'sole displayed status must be immediately right of version');
    assert.equal(await page.locator('.workbench-bookbar').isVisible(),false);
    assert.equal(await page.locator('#wb-md-details').isVisible(),false,'no redundant Locate button');
    for(const id of ['clean-status','ir-status','workbench-status','workbench-pdf-status',
      'pdf-md-review-status','md-pdf-status'])
      assert.equal(await page.locator('#'+id).isVisible(),false,
        id+' must not render another status bar');
    const editLine=page.locator('#workbench-source .cm-line').filter({hasText:'Appendix A'}).first();
    await editLine.click();await page.keyboard.press('End');
    await page.keyboard.insertText(' · Reviewed heading');
    await page.waitForFunction(()=>document.querySelector('#workbench-preview')?.textContent?.includes('Reviewed heading'),null,{timeout:10000});
    assert.equal(await page.getByTestId('clean-save').isEnabled(),true);
    assert.ok((await page.locator('#workbench-calibration-grid').innerText()).includes('Reviewed heading'));
    assert.match(await page.getByTestId('status').textContent(),/未保存|章节|编辑/);
    // Unsaved chapter edits guard navigation, without changing the selected file.
    await page.evaluate(()=>{window.confirm=()=>false;});
    await navigator.selectOption(folder);
    assert.equal(await navigator.inputValue(),chapter.value);
    assert.ok((await page.locator('#workbench-source').innerText()).includes('Reviewed heading'));
    await page.getByTestId('clean-undo').click();
    assert.ok(!(await page.locator('#workbench-source').innerText()).includes('Reviewed heading'));
    await page.getByTestId('clean-redo').click();
    assert.ok((await page.locator('#workbench-source').innerText()).includes('Reviewed heading'));
    await page.getByTestId('clean-save').click();
    await page.waitForFunction(()=>document.querySelector('#clean-status')?.textContent?.includes('CAS 校验通过'),null,{timeout:18000}).catch(async error=>{
      console.error('CHAPTER_SAVE_DIAG',JSON.stringify({status:await page.getByTestId('clean-status').textContent(),
        sourceStatus:await page.getByTestId('workbench-status').textContent(),
        title:await page.getByTestId('workbench-module-title').textContent(),
        errors}));throw error;
    });
    assert.equal(await page.getByTestId('clean-save').isDisabled(),true);
    const edited=fs.readFileSync(path.join(root,chapter.value.slice(1)),'utf8');
    assert.ok(edited.includes('Reviewed heading'));
    assert.equal(original.includes('Reviewed heading'),false);
    assert.equal(fs.readFileSync(path.join(source,'chapters',path.basename(chapter.value)),'utf8'),original,
      'real user book has no browser fixture writes');
    await page.getByTestId('tab-settings').click();
    await navigator.selectOption(folder);
    assert.equal(await page.getByTestId('tab-workbench').getAttribute('aria-selected'),'true');
    await page.waitForFunction(()=>document.querySelector('#workbench-module-title')?.textContent==='章节定界',null,{timeout:15000});
    assert.equal(await page.getByTestId('workbench-ir-source').isVisible(),true);
    assert.equal(await page.getByTestId('wb-clean-modules').isHidden(),true);
    assert.equal(await page.getByTestId('workbench-mode-chapters').isVisible(),true);
    assert.equal(await page.getByTestId('workbench-calibration-grid').isHidden(),true,
      'root delimitation uses its own chapter IR table, not duplicate text blocks');
    assert.equal(await navigator.inputValue(),folder);
    await navigator.selectOption(another.value);
    await page.waitForFunction(()=>!document.querySelector('#wb-clean-modules')?.hidden&&
      document.querySelector('#workbench-source .cm-content')?.textContent?.includes('Appendix B'),null,{timeout:20000});
    assert.equal(await page.getByTestId('clean-save').isDisabled(),true);
    assert.deepEqual(errors,[]);
    console.log('V3_NAV_CHAPTER_CLEAN_BROWSER_PASS',JSON.stringify({engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium',
      book:bookName,chapters:6,previewSynced:true,casSave:true,unsavedCancel:true,
      backToDelimitation:true,secondChapter:true,originalBookUntouched:true}));
    await ctx.close();return;
  }
  if(process.env.OCR2MD_TOPBAR_ONLY==='1'){
    const version=await page.getByTestId('workbench-build').textContent();
    assert.equal(version,'v3-fixed-top-nav-20261010x');
    const bar=page.locator('.v3-top-row #workbench-ir-header-actions');
    assert.equal(await bar.isVisible(),true);
    assert.deepEqual(await bar.locator('button').evaluateAll(nodes=>nodes.map(n=>n.id)),
      ['ir-undo','ir-redo','ir-save','ir-publish-chapters']);
    assert.equal(await page.locator('#workbench-refresh,#workbench-back').count(),0);
    for(const width of [834,390]){
      await page.setViewportSize({width,height:1194});
      const layout=await page.evaluate(()=>{
        const brand=document.querySelector('.v3-brand').getBoundingClientRect();
        const version=document.querySelector('#workbench-build').getBoundingClientRect();
        const tabs=document.querySelector('.v3-top-row .tabs').getBoundingClientRect();
        const edit=document.querySelector('#workbench-ir-header-actions').getBoundingClientRect();
        const editor=document.querySelector('#workbench-ir-source').getBoundingClientRect();
        const pane=document.querySelector('#workbench-source-pane').getBoundingClientRect();
        const head=document.querySelector('#workbench-source-pane > .wb-pane-head').getBoundingClientRect();
        return {width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,
          versionOnBrand:Math.abs(version.top-brand.top)<15,
          sourceTitleHeight:head.height,editorTop:editor.top,paneTop:pane.top,
          actionsRightOfTabs:edit.left>=tabs.right-3||edit.top>=tabs.bottom-2,
          buttonsVisible:[...document.querySelectorAll('#workbench-ir-header-actions button')]
            .every(button=>button.getBoundingClientRect().width>20)};
      });
      assert.ok(layout.overflow<=0,'iPad/iPhone viewport must not overflow: '+JSON.stringify(layout));
      assert.ok(layout.versionOnBrand,'version must be adjacent to brand');
      assert.equal(layout.sourceTitleHeight,0);
      assert.ok(Math.abs(layout.editorTop-layout.paneTop)<=3,'no source toolbar gutter');
      assert.ok(layout.actionsRightOfTabs&&layout.buttonsVisible,JSON.stringify(layout));
      console.log('TOPBAR_REAL_BOOK_VIEWPORT',JSON.stringify(layout));
    }
    await page.getByTestId('tab-workspace').click();
    assert.equal(await page.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
    assert.equal(await bar.isVisible(),false,'IR buttons hidden on Workspace tab');
    await page.getByTestId('tab-workbench').click();
    assert.equal(await bar.isVisible(),true);
    await page.getByTestId('tab-settings').click();
    assert.equal(await bar.isVisible(),false,'IR buttons hidden on Settings tab');
    assert.deepEqual(errors,[]);
    assert.deepEqual(writes,[]);
    console.log('V3_TOP_TABS_ACTIONS_REAL_BOOK_PASS',JSON.stringify({version,zeroBookWrites:true,firstPartyTabs:true}));
    await ctx.close();return;
  }
  if(process.env.OCR2MD_REPRO_PUBLISH_READY==='1'){
    // User's actual saved DIRjson is a *legacy* whole-book projection with
    // six named file cuts and 21 needs-review OCR headings. Reproduce exact
    // publish-button flow in a temporary copy only, including CAS upgrade.
    const publish=page.getByTestId('ir-publish-chapters');
    assert.equal(await publish.isEnabled(),true,
      'named file boundaries enable publication even with unreviewed OCR headings');
    const currentDir=path.join(root,'ocr2md',bookName);
    assert.equal(fs.existsSync(path.join(currentDir,'chapters')),false);
    const originalPtr=JSON.parse(fs.readFileSync(path.join(currentDir,'.ocr2md/ir-current.v1.json')));
    const backupDir=path.join(currentDir,'chapters bk');
    assert.ok(fs.existsSync(backupDir),'renamed V2 chapters remain in temporary book');
    await publish.click();
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('发布成功'),
      null,{timeout:75000});
    const chapters=fs.readdirSync(path.join(currentDir,'chapters')).filter(n=>n.endsWith('.md'));
    const ptr=JSON.parse(fs.readFileSync(path.join(currentDir,'.ocr2md/ir-current.v1.json')));
    const zp=require('node:child_process').execFileSync('unzip',['-p',path.join(currentDir,'.ocr2md/ir-versions',ptr.archiveSha256+'.zip'),'document-ir.markdown-manifest.v1.json'],{maxBuffer:20*1024*1024});
    const manifest=JSON.parse(zp.toString());
    const irRaw=require('node:child_process').execFileSync('unzip',['-p',path.join(currentDir,'.ocr2md/ir-versions',ptr.archiveSha256+'.zip'),'document-ir.v1.json'],{maxBuffer:30*1024*1024});
    const ir=JSON.parse(irRaw.toString());
    assert.equal(chapters.length,6,'six named cuts become six editable MD files');
    assert.equal(manifest.projectionState,'chapter-files-for-cleaning');
    assert.equal(ir.chapterStructure.candidates.filter(x=>x.status!=='confirmed').length,21,
      'OCR candidate review must not be silently auto-approved by file publication');
    assert.notEqual(ptr.archiveSha256,originalPtr.archiveSha256,
      'old unsplit saved pointer is upgraded atomically to file-cut archive');
    assert.ok(fs.existsSync(backupDir),'existing renamed V2 chapters remain untouched');
    assert.deepEqual(errors,[]);
    console.log('REAL_SAVED_BOOK_PUBLISH_READY_PASS',JSON.stringify({files:chapters,
      projection:manifest.projectionState,pendingOcrReviews:21,legacyProjectionUpgraded:true,
      oldChapterBackupKept:true,realOriginalUntouched:true}));
    await ctx.close();return;
  }
  if(process.env.OCR2MD_REPRO_AG18==='1'){
    await page.setViewportSize({width:834,height:1194});
    const rows=await page.locator('#workbench-ir-grid .ag-row').allInnerTexts();
    console.log('REAL_AG18_ROWS',JSON.stringify(rows.map(x=>x.slice(0,100))));
    const candidate=page.locator('#workbench-ir-grid .ag-row').filter({hasText:'Appendix A'}).first();
    assert.ok(await candidate.count(),'real book must have Appendix A candidate visible in AG');
    await candidate.locator('.v3-heading-cell').click();
    await page.waitForTimeout(650);
    const pos=await page.locator('#ir-markdown-preview').evaluate(preview=>{
      const target=preview.querySelector('.v3-ir-preview-target');
      const frame=preview.getBoundingClientRect(),rect=target?.getBoundingClientRect();
      return {id:target?.dataset.irBlockId,matching:
        target?.dataset.irBlockId===document.querySelector('#workbench-ir-source')?.dataset.irBlockId,
        scrollTop:preview.scrollTop,frameTop:frame.top,frameBottom:frame.bottom,
        targetTop:rect?.top,targetBottom:rect?.bottom,
        visible:!!rect&&rect.top>=frame.top-3&&rect.top<frame.bottom-10,
        pdf:document.querySelector('#preview-tab-pdf')?.getAttribute('aria-selected')};
    });
    console.log('REAL_AG18_MD_GEOMETRY',JSON.stringify(pos));
    assert.equal(pos.matching,true);
    assert.equal(pos.visible,true,'AG-selected Appendix A must be visible in MD preview viewport');
    assert.equal(pos.pdf,'false','AG click must not force PDF');
    await page.waitForFunction(()=>!document.querySelector('#preview-tab-pdf')?.disabled,null,{timeout:30000});
    await page.getByTestId('preview-tab-pdf').click();
    await page.waitForTimeout(1000);
    const pdfState=await page.locator('#workbench-pdf-canvas').evaluate(host=>{
      const match=host.querySelector('.ocr2md-pdf-region-overlay');
      const shown=host.querySelector('.pdfViewer .page[data-page-number="18"]');
      const canvas=shown?.querySelector('canvas');
      return {pdfTheme:host.dataset.pdfTheme,renderingPage:host.dataset.renderingPage,
        focusPage:match?.dataset.pdfPage,canvasWidth:canvas?.width,canvasHeight:canvas?.height,
        canvasDisplay:canvas?getComputedStyle(canvas).display:null,
        status:document.querySelector('#workbench-pdf-status')?.textContent?.slice(0,150)};
    });
    console.log('REAL_AG18_PDF_DIAG',JSON.stringify(pdfState));
    await page.waitForFunction(()=>{
      const host=document.querySelector('#workbench-pdf-canvas');
      const page=host?.querySelector('.pdfViewer .page[data-page-number="18"]');
      const canvas=page?.querySelector('canvas');
      return !!canvas&&canvas.width>10&&canvas.height>10&&
        !host.dataset.renderingPage;
    },null,{timeout:45000});
    console.log('REAL_AG18_PAINTED',JSON.stringify(await page.locator('#workbench-pdf-canvas').evaluate(host=>({
      focus:host.querySelector('.ocr2md-pdf-region-overlay')?.dataset.pdfPage,
      blackPage:host.querySelector('.pdfViewer .page[data-page-number="18"] canvas')?.getBoundingClientRect().height,
      pending:host.dataset.renderingPage,
      canvasSamples:(()=>{
        const canvas=host.querySelector('.pdfViewer .page[data-page-number="18"] canvas');
        const context=canvas?.getContext('2d',{willReadFrequently:true});
        if(!context||!canvas)return null;
        const pixels=context.getImageData(Math.floor(canvas.width/2),Math.floor(canvas.height/2),1,1).data;
        return Array.from(pixels);
      })()
    }))));
    // Screenshot's page-18/page-19 mismatch: while PDF is already open,
    // a second AG row should move the rendered page to 19 without a stall.
    const next=page.locator('#workbench-ir-grid .ag-row').filter({hasText:'Appendix B'}).first();
    await next.locator('.v3-heading-cell').click();
    await page.waitForFunction(()=>document.querySelector('.ocr2md-pdf-region-overlay')?.dataset.pdfPage==='19',
      null,{timeout:45000});
    assert.equal(await page.getByTestId('preview-tab-pdf').getAttribute('aria-selected'),'true');
    assert.ok((await page.getByTestId('workbench-ir-source').getAttribute('data-ir-block-id')));
    await page.waitForFunction(()=>!document.querySelector('#workbench-pdf-canvas')?.dataset.renderingPage,
      null,{timeout:45000});
    console.log('REAL_AG19_PDF_PAINTED',JSON.stringify(await page.locator('#workbench-pdf-canvas').evaluate(host=>({
      focus:host.querySelector('.ocr2md-pdf-region-overlay')?.dataset.pdfPage,
      painted:!!host.querySelector('.pdfViewer .page[data-page-number="19"] canvas'),
      pending:host.dataset.renderingPage
    }))));
    assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
    console.log('REAL_AG18_FOCUS_PASS');
    await ctx.close();return;
  }
  await page.getByTestId('tab-workspace').click();
  await page.getByTestId('set-working-directory').click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:100000});
  const second=await page.locator('#workbench-ir-grid').innerText();
  if(process.env.OCR2MD_REPRO_LINE59!=='1')assert.ok(second.includes('测试.补录章节'),'saved human title visible after exiting and reopening');
  assert.equal(await page.getByTestId('ir-save').isDisabled(),true);
  // UIC-V3-MD-PREVIEW-SCROLL-001: a full book has enough blocks to exercise
  // actual scroll positions in both directions rather than a short fixture.
  await page.getByTestId('preview-tab-markdown').click();
  await page.waitForFunction(()=>document.querySelector('#ir-markdown-preview [data-source-line]')!==null);
  const scroller=page.locator('#workbench-ir-source .cm-scroller');
  const previewScroller=page.locator('#ir-markdown-preview');
  const cursorBefore=await page.locator('#workbench-ir-source').evaluate(root=>
    root.querySelector('.cm-activeLineGutter')?.textContent);
  await scroller.evaluate(el=>{el.scrollTop=Math.min(2400,el.scrollHeight-el.clientHeight);});
  await page.waitForFunction(()=>document.querySelector('#ir-markdown-preview')?.scrollTop>60,null,{timeout:6000});
  const afterSource=await previewScroller.evaluate(el=>el.scrollTop);
  assert.ok(afterSource>60,'scrolling MD source moves preview to corresponding blocks');
  await previewScroller.evaluate(el=>{el.scrollTop=0;});
  await page.waitForFunction(()=>document.querySelector('#workbench-ir-source .cm-scroller')?.scrollTop<500,
    null,{timeout:6000});
  assert.equal(await page.locator('#workbench-ir-source').evaluate(root=>
    root.querySelector('.cm-activeLineGutter')?.textContent),cursorBefore,
    'scroll sync must not move CodeMirror insertion caret');
  // Exact real-world UIC: saved Bufett's Alpha line 59 is a provisional
  // MinerU H3 author byline. Edit on an isolated copy, never save to Vault.
  if(process.env.OCR2MD_REPRO_LINE59==='1'){
    const title='Andrea Frazzini, David Kabiller, CFA,and Lasse Heje Pedersen';
    const line=page.locator('#workbench-ir-source .cm-line').filter({hasText:title}).first();
    let found=false;
    for(let scroll=0;scroll<=11000;scroll+=250){
      await page.locator('#workbench-ir-source .cm-scroller').evaluate((scroller,y)=>{scroller.scrollTop=y;},scroll);
      await page.waitForTimeout(30);
      if(await line.count()){found=true;break;}
    }
    assert.ok(found,'actual saved-book source line 59 should render in CodeMirror');
    await line.click();
    await page.keyboard.press('Home');
    const initialSel=await page.locator('#workbench-ir-source').evaluate(root=>{
      const selection=document.getSelection();
      return {collapsed:selection?.isCollapsed,activeLine:root.querySelector('.cm-activeLineGutter')?.textContent};
    });
    assert.equal(initialSel.collapsed,true,'a user click must not select the entire OCR heading');
    // Simulate the iPad's touchend handler after DOM caret placement. The
    // source->AG navigation must NOT mutate CodeMirror text selection.
    const afterTouch=await page.locator('#workbench-ir-source').evaluate(root=>{
      const line=Array.from(root.querySelectorAll('.cm-line'))
        .find(e=>e.textContent?.includes('Andrea Frazzini, David Kabiller'));
      const before=document.getSelection();
      const beforeState={collapsed:before?.isCollapsed,text:before?.toString(),
        activeLine:root.querySelector('.cm-activeLineGutter')?.textContent};
      const r=line.getBoundingClientRect();
      const touch=new Touch({identifier:11,target:line,clientX:r.left+6,
        clientY:r.top+6,pageX:r.left+6,pageY:r.top+6});
      line.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,changedTouches:[touch]}));
      return {...beforeState,afterCollapsed:document.getSelection()?.isCollapsed,
        afterText:document.getSelection()?.toString(),
        afterLine:root.querySelector('.cm-activeLineGutter')?.textContent};
    });
    assert.equal(afterTouch.afterCollapsed,true,
      'native iPad touchend must leave caret collapsed, not select whole IR title');
    assert.equal(afterTouch.afterText,'');
    assert.equal(afterTouch.afterLine,initialSel.activeLine);
    console.log('REAL_LINE59_TOUCH_CARET_PRESERVED',JSON.stringify(afterTouch));
    for(const hashes of [2,1,0]){
      await page.keyboard.press('Delete');
      await page.waitForTimeout(700);
      const state=await page.locator('#workbench-ir-source').evaluate(root=>{
        const target=Array.from(root.querySelectorAll('.cm-line')).find(e=>e.textContent?.includes('Andrea Frazzini, David Kabiller'));
        const active=root.querySelector('.cm-lineNumbers .cm-activeLineGutter');
        const status=document.querySelector('#ir-status');
        const sel=document.getSelection();
        return {text:target?.textContent?.slice(0,80),activeLine:active?.textContent,
          status:status?.textContent?.slice(0,140),focus:document.activeElement?.className,
          scrollTop:root.querySelector('.cm-scroller')?.scrollTop,anchorOffset:sel?.anchorOffset};
      });
      console.log('REAL_LINE59_BROWSER_STEP',hashes,JSON.stringify(state));
      assert.equal(state.text,`${hashes?'#'.repeat(hashes)+' ':''}${title}`,
        'deleting a heading hash must not be silently reverted');
      assert.ok(Number(state.activeLine)>30,'cursor stays near actual line59, not first line');
    }
    assert.equal(await page.getByTestId('ir-save').isEnabled(),true);
    assert.ok((await page.getByTestId('ir-status').textContent()).includes('源码修正已同步'));
    // Re-enter the saved version and reproduce the iPad Backspace gesture too.
    await page.getByTestId('tab-workspace').click();
    await page.getByTestId('set-working-directory').click();
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:80000});
    await page.setViewportSize({width:834,height:1194});
    const ipadLine=page.locator('#workbench-ir-source .cm-line').filter({hasText:title}).first();
    for(let scroll=0;scroll<=11000;scroll+=250){
      await page.locator('#workbench-ir-source .cm-scroller').evaluate((el,y)=>{el.scrollTop=y;},scroll);
      await page.waitForTimeout(30);if(await ipadLine.count())break;
    }
    assert.ok(await ipadLine.count(),'line59 must render in iPad-size view');
    if(process.env.OCR2MD_REPRO_TOUCH==='1'){
      // First select ANOTHER AG/title so the iPad tap must update the AG row.
      // If source -> AG navigation reselects the whole source block, the next
      // Backspace will wrongly delete the selection instead of one #.
      const other=page.locator('#workbench-ir-source .cm-line')
        .filter({hasText:'# Buffett’s Alpha'}).first();
      if(await other.count()){
        await other.tap();
        await page.waitForTimeout(120);
      }
      await ipadLine.tap();
      await page.waitForTimeout(170);
      const selection=await page.locator('#workbench-ir-source').evaluate(root=>{
        const s=document.getSelection();
        return {text:s?.toString()?.slice(0,120),collapsed:s?.isCollapsed,
          focus:root.contains(document.activeElement),
          line:root.querySelector('.cm-activeLineGutter')?.textContent?.trim(),
          caretOffset:s?.anchorOffset};
      });
      console.log('REAL_LINE59_TOUCH_SELECTION',JSON.stringify(selection));
      assert.equal(selection.collapsed,true,'touch placement must leave a collapsed insertion caret, never whole-block selection');
      assert.equal(selection.text,'');
      assert.ok(Number(selection.line)>30);
    }
    await ipadLine.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Backspace');
    await page.waitForTimeout(750);
    const ipadState=await page.locator('#workbench-ir-source').evaluate(root=>({
      text:Array.from(root.querySelectorAll('.cm-line')).find(e=>e.textContent?.includes('Andrea Frazzini'))?.textContent,
      caret:root.querySelector('.cm-activeLineGutter')?.textContent,
      status:document.querySelector('#ir-status')?.textContent?.slice(0,120)
    }));
    console.log('REAL_LINE59_IPAD_BACKSPACE',JSON.stringify(ipadState));
    assert.equal(ipadState.text,'## '+title,'iPad backspace demotion should persist');
    assert.ok(Number(ipadState.caret)>30,'iPad caret must not return to document start');
    if(process.env.OCR2MD_REPRO_SAVE==='1'){
      // Commit only inside the temporary copied Vault; verify persisted IR
      // instead of touching the actual Obsidian book.
      for(let i=0;i<2;i++){
        await page.keyboard.press('ArrowRight');await page.keyboard.press('Backspace');
        await page.waitForTimeout(570);
      }
      const plainLine=page.locator('#workbench-ir-source .cm-line')
        .filter({hasText:title}).first();
      assert.equal((await plainLine.innerText()).trimStart(),title);
      await page.getByTestId('ir-save').click();
      await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已保存到 Obsidian'),null,{timeout:80000});
      const response=await page.request.get(base+'/__v3/ir?book='+encodeURIComponent(folder),
        {headers:{'X-OCR2MD-V3-Key':fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim()}});
      assert.equal(response.status(),200);
      const saved=await response.json();
      const ir=JSON.parse(Buffer.from(saved.irBase64,'base64'));
      const id='blk_8187c88becf500b3a75be87e';
      assert.equal(ir.blocks.find(b=>b.blockId===id)?.type,'text');
      assert.ok(!ir.chapterStructure.candidates.some(c=>c.headingBlockId===id));
      const readback=ir.blocks.find(b=>b.blockId===id).text;
      assert.equal(readback,title);
      assert.equal(await page.getByTestId('ir-save').isDisabled(),true);
      await page.getByTestId('tab-workspace').click();
      await page.getByTestId('set-working-directory').click();
      await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:80000});
      const restored=await page.request.get(base+'/__v3/ir?book='+encodeURIComponent(folder),
        {headers:{'X-OCR2MD-V3-Key':fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim()}});
      const recovered=JSON.parse(Buffer.from((await restored.json()).irBase64,'base64'));
      assert.equal(recovered.blocks.find(b=>b.blockId===id)?.type,'text');
      assert.equal(recovered.blocks.find(b=>b.blockId===id)?.text,title);
      console.log('REAL_LINE59_ISOLATED_SAVE_REOPEN_PASS',JSON.stringify({type:'text',titleCandidates:false,originalVaultUntouched:true}));
    }
  }
  if(process.env.OCR2MD_REPRO_SAVE==='1'){
    assert.equal(writes.length,1,'one isolated Vault commit only');
  }else assert.deepEqual(writes,[],'no writes to even the isolated Vault');
  assert.deepEqual(errors,[]);
  console.log('REAL_SAVED_BOOK_REOPEN_PASS',JSON.stringify({restoredTwice:true,
    zeroWrites:process.env.OCR2MD_REPRO_SAVE!=='1',
    isolatedCommit:process.env.OCR2MD_REPRO_SAVE==='1',bookBlocks:225}));
  await ctx.close();
 }finally{if(browser)await browser.close();server.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error('REAL_SAVED_BOOK_REOPEN_FAIL',e);process.exitCode=1;});
