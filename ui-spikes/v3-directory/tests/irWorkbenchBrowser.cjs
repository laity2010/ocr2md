/** WP5 browser UIC test: authorized PDF + OCR JSON ONLY; three panes, AG, PDF source,
 * in-memory operation, explicit local draft download and zero Vault writes. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const {testPdf}=require('./fixturePdf.cjs');
const {settingValue,setSetting}=require('./settingsAgActions.cjs');
const repo=path.resolve(__dirname,'../../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocr2md-ir5-ui-'));
const root=path.join(temp,'ocr2md'),staticRoot=path.join(temp,'static'),
  port=12000+parseInt(crypto.createHash('sha256').update(temp).digest('hex').slice(0,6),16)%20000,
  url=`http://127.0.0.1:${port}/v3-directory/`;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const block=(type,content,bbox,level)=>({type,bbox,index:1,...(level?{level}:{}),lines:[{spans:[{type:'text',content}]}]});
(async()=>{
  fs.mkdirSync(path.join(root,'ocr2md','IRFixture','json'),{recursive:true});
  const pdf=testPdf();fs.writeFileSync(path.join(root,'ocr2md','IRFixture','original.pdf'),pdf);
  const ocr={_version_name:'3.4.4',_backend:'hybrid',pdf_info:[
    {page_idx:0,page_size:[612,792],preproc_blocks:[],discarded_blocks:[],para_blocks:[
      block('title','A Real IR Main Title',[35,60,400,110],1),
      block('text','First source paragraph without relying on MD.',[35,135,450,175]),
      block('title','Research Methods',[35,190,390,220],2),
      block('text','Second paragraph from OCR JSON and PDF original.',[35,230,500,280]),
      block('text','Third paragraph with an additional segment.',[35,295,450,325]),
    ]},
    ...(process.env.OCR2MD_TEST_PDF_TARGET_PREWARM_ONLY==='1'?[{
      page_idx:1,page_size:[612,792],preproc_blocks:[],discarded_blocks:[],para_blocks:[
        block('title','Second Page Heading',[35,70,450,120],1),
        block('text','A paragraph on the second PDF page.',[35,180,450,235]),
      ],
    }]:[]),
  ]};
  fs.writeFileSync(path.join(root,'ocr2md','IRFixture','json','MinerU_fixture.json'),JSON.stringify(ocr));
  fs.writeFileSync(path.join(root,'ocr2md','IRFixture','json','MinerU_old.json'),JSON.stringify(ocr));
  fs.mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
  for(const name of ['index.html','sw.js'])fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory',name),path.join(staticRoot,'v3-directory',name));
  for(const name of fs.readdirSync(path.join(repo,'ui-spikes/v3-directory/dist'))){
    const from=path.join(repo,'ui-spikes/v3-directory/dist',name);
    if(fs.statSync(from).isFile())fs.copyFileSync(from,path.join(staticRoot,'v3-directory/dist',name));
  }
  fs.copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),
    path.join(staticRoot,'v3-directory/dist/pdf.worker.min.mjs'));
  const server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),
    '--root',root,'--static',staticRoot,'--port',String(port)],{stdio:'ignore'});
  let browser;
  try{
    for(let n=0;n<80;n++){
      try{const r=await fetch(`http://127.0.0.1:${port}/__v3/fs?op=status`);
        if(r.status&&fs.existsSync(path.join(temp,'private/access-key')))break;}catch{}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const key=fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim();
    browser=await (process.env.OCR2MD_TEST_WEBKIT==='1'?webkit:chromium).launch(
      process.env.OCR2MD_TEST_WEBKIT==='1'?{headless:true}:{channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:process.env.OCR2MD_TEST_WEBKIT==='1'?
      {width:834,height:1194}:{width:1500,height:930},acceptDownloads:true});
    const page=await context.newPage();const pageErrors=[],writes=[];
    page.on('pageerror',e=>pageErrors.push(String(e)));
    page.on('request',r=>{if(r.url().includes('/__v3/fs')&&r.method()!=='GET')writes.push(r.method());});
    await page.goto(url,{waitUntil:'domcontentloaded'});
    await page.getByTestId('tab-settings').click();
    await page.locator('#vault-key').fill(key);
    await page.getByTestId('connect-vault').click();
    await page.getByTestId('tab-workspace').click();
    const open=async target=>{
      await page.locator(`[data-open-path="${target}"]`).waitFor({timeout:30000});
      await page.evaluate(p=>{
        const btn=document.querySelector(`[data-open-path="${p}"]`);
        for(let i=0;i<2;i++){
          btn.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
          btn.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
        }
      },target);
    };
    /* default home is already /ocr2md */
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
    // UIC-V3-NO-PDF-WORKBENCH-001: vault root contains book folders, not
    // an original PDF. It must not enter a blank IR workbench forever.
    await page.getByTestId('set-working-directory').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('没有直接存放的 PDF 原文'),null,{timeout:15000});
    assert.equal(await page.getByTestId('tab-workspace').getAttribute('aria-selected'),'true');
    assert.equal(await page.getByTestId('tab-workbench').getAttribute('aria-selected'),'false');
    assert.ok((await page.locator('#status').innerText()).includes('具体书籍文件夹'));
    if(process.env.OCR2MD_TEST_NO_PDF_ONLY==='1'){
      assert.deepEqual(pageErrors,[],'no JS errors in blank-folder guard');
      assert.deepEqual(writes,[],'blank-folder guard never writes to vault');
      console.log('V3_NO_PDF_WORKBENCH_GUARD_PASS',JSON.stringify({
        engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'WebKit':'Chrome',
        folder:'/ocr2md',workbenchStillClosed:true,actionableError:true,zeroWrites:true}));
      await context.close();return;
    }
    await open('/ocr2md/IRFixture');
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md/IRFixture');
    await page.getByTestId('set-working-directory').click();
    await page.getByTestId('tab-workbench').waitFor({state:'visible',timeout:20000});
    await page.locator('#panel-workbench').waitFor({state:'visible',timeout:30000});
    // UIC-V3-PREVIEW-INITIAL-MD-001: entering a workbench must never jump
    // into partially loaded PDF.js. PDF stays disabled until first Canvas paint.
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#preview-panel-markdown').isVisible(),true);
    await page.waitForFunction(()=>!document.querySelector('#preview-tab-pdf')?.disabled,
      null,{timeout:30000});
    if(process.env.OCR2MD_TEST_PDF_TARGET_PREWARM_ONLY==='1'){
      // Page two is intentionally outside the initial hidden viewport. Select
      // a page-two heading while MD remains visible; the app must warm the
      // *last* requested page rather than waiting for PDF tab activation.
      await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('检测到 2 份 OCR JSON'),null,{timeout:25000});
      await page.getByTestId('ir-ocr-select').selectOption({label:'MinerU_fixture.json'});
      await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('IR 已加载'),null,{timeout:30000});
      // Chapter classification can retain a page-two OCR heading as H2;
      // the H1-only visual filter must not block an explicit AG selection.
      await page.getByTestId('ir-only-h1').uncheck();
      const target=page.locator('#workbench-ir-grid .v3-heading-cell').filter({hasText:'Second Page Heading'}).first();
      await target.waitFor({timeout:12000}).catch(async error=>{
        console.log('PDF_TARGET_AG_DIAG',JSON.stringify({
          gridText:(await page.locator('#workbench-ir-grid').innerText()).slice(0,1250),
          status:await page.locator('#ir-status').textContent(),
          stage:await page.getByTestId('workbench-mode-chapters').getAttribute('aria-pressed'),
          counts:{headings:await page.locator('#workbench-ir-grid .v3-heading-cell').count(),rows:await page.locator('#workbench-ir-grid .ag-row').count()}
        }));throw error;
      });
      await target.click();
      assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true');
      await page.waitForFunction(()=>{
        const host=document.getElementById('workbench-pdf-canvas');
        const canvas=host?.querySelector('.pdfViewer .page[data-page-number="2"] canvas');
        return canvas?.width>0&&canvas?.height>0&&
          document.querySelector('[data-module-status="pdf"]')?.dataset.level==='ready';
      },null,{timeout:30000});
      assert.equal(await page.getByTestId('activity-pdf').isHidden(),true);
      const before=await page.evaluate(()=>{
        const host=document.getElementById('workbench-pdf-canvas');
        const canvas=host.querySelector('.pdfViewer .page[data-page-number="2"] canvas');
        window.__ocrTargetCanvas=canvas;
        return {width:canvas.width,height:canvas.height,
          resizeUpdates:host.dataset.pdfResizeUpdates,
          mdSelected:document.getElementById('preview-tab-markdown').getAttribute('aria-selected')};
      });
      await page.getByTestId('preview-tab-pdf').click();
      await page.waitForTimeout(500);
      assert.equal(await page.evaluate(()=>document.querySelector('#workbench-pdf-canvas .pdfViewer .page[data-page-number="2"] canvas')===window.__ocrTargetCanvas),true);
      assert.equal(await page.getByTestId('workbench-pdf-canvas').getAttribute('data-pdf-resize-updates'),before.resizeUpdates);
      assert.equal(await page.locator('#preview-panel-pdf').isVisible(),true);
      assert.deepEqual(pageErrors,[]);assert.deepEqual(writes,[]);
      console.log('PDF_AG_TARGET_BACKGROUND_PREWARM_PASS',JSON.stringify({
        engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',targetPage:2,
        fromAgHeading:true,mdPreserved:true,canvasReused:true,noVaultWrites:true,before}));
      await context.close();return;
    }
    if(process.env.OCR2MD_TEST_PDF_FIRST_PAINT_ONLY==='1'){
      const host=page.getByTestId('workbench-pdf-canvas');
      const first=await page.evaluate(()=>{
        const host=document.querySelector('#workbench-pdf-canvas');
        const canvas=host?.querySelector('.pdfViewer .page[data-page-number="1"] canvas');
        const scroller=host?.querySelector('.pdfViewerContainer');
        window.__ocrFirstCanvas=canvas;
        return {
          stage:document.querySelector('[data-module-status="pdf"]')?.dataset.level,
          hiddenPanel:document.querySelector('#preview-panel-pdf').hidden,
          firstPagePainted:host.dataset.firstPagePainted,
          width:canvas?.width,height:canvas?.height,
          scrollWidth:scroller?.clientWidth,scrollHeight:scroller?.clientHeight,
          resizeUpdates:host.dataset.pdfResizeUpdates,
        };
      });
      assert.equal(first.hiddenPanel,true);
      assert.equal(first.firstPagePainted,'true');
      assert.ok(first.width>0&&first.height>0,'ready needs a raster canvas');
      assert.equal(first.stage,'ready');
      assert.equal(await page.getByTestId('activity-pdf').isHidden(),true,
        'completed PDF disappears from activity strip only after paint');
      await page.getByTestId('preview-tab-pdf').click();
      await page.waitForTimeout(750);
      const later=await page.evaluate(()=>{
        const host=document.querySelector('#workbench-pdf-canvas');
        const canvas=host.querySelector('.pdfViewer .page[data-page-number="1"] canvas');
        const scroller=host.querySelector('.pdfViewerContainer');
        return {sameCanvas:canvas===window.__ocrFirstCanvas,
          width:canvas?.width,height:canvas?.height,
          scrollWidth:scroller?.clientWidth,scrollHeight:scroller?.clientHeight,
          resizeUpdates:host.dataset.pdfResizeUpdates,
          stage:document.querySelector('[data-module-status="pdf"]')?.dataset.level};
      });
      console.log('PDF_HIDDEN_VISIBLE_GEOMETRY',JSON.stringify({first,later}));
      assert.equal(later.sameCanvas,true,'switch should reuse the prepainted canvas');
      assert.equal(later.width,first.width);
      assert.equal(later.height,first.height);
      assert.equal(later.scrollWidth,first.scrollWidth);
      // The hidden panel includes the 35px tab strip; height may change
      // slightly on reveal, but page-width raster and viewer.update must not.
      assert.equal(later.resizeUpdates,'0');
      assert.equal(later.stage,'ready');
      await page.getByTestId('preview-tab-markdown').click();
      await page.getByTestId('preview-tab-pdf').click();
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(()=>window.__ocrFirstCanvas===
        document.querySelector('#workbench-pdf-canvas .pdfViewer .page[data-page-number="1"] canvas')),true);
      assert.deepEqual(pageErrors,[]);
      assert.deepEqual(writes,[]);
      console.log('PDF_HIDDEN_FIRST_FRAME_REUSED_PASS',JSON.stringify({engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',first,later,noVaultWrites:true}));
      await context.close();return;
    }
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true',
      'PDF finishing in background must not steal the MD tab');
    assert.equal(await page.getByTestId('workbench-pdf-canvas').getAttribute('data-pdf-theme'),
      'dark','PDF defaults to dark mode');
    await page.getByTestId('tab-settings').click();
    await settingValue(page,'pdfTheme');
    assert.equal(await page.locator('#settings-shared').evaluate(p=>p.values.pdfTheme),'dark');
    await setSetting(page,'pdfTheme','light');
    await page.getByTestId('settings-save').click();
    assert.equal(await page.getByTestId('workbench-pdf-canvas').getAttribute('data-pdf-theme'),'light');
    assert.ok(JSON.parse(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1'))).pdfTheme==='light');
    await page.getByTestId('tab-workbench').click();
    if(process.env.OCR2MD_UIC_NAV_THEME_ONLY==='1')console.log('NAV_THEME_SETTING_APPLIED');
    await page.getByTestId('preview-tab-pdf').click();
    assert.equal(await page.locator('#preview-panel-pdf').isVisible(),true);
    // Reload a ready PDF: MD becomes the safe default again during loading,
    // and the PDF tab cannot be clicked until first Canvas paint resolves.
    await page.locator('#pdf-reload').evaluate(button=>button.click());
    await page.waitForFunction(()=>document.querySelector('#preview-tab-pdf')?.disabled,
      null,{timeout:15000});
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true');
    assert.equal(await page.getByTestId('preview-tab-pdf').getAttribute('aria-disabled'),'true');
    await page.waitForFunction(()=>!document.querySelector('#preview-tab-pdf')?.disabled,
      null,{timeout:30000});
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true',
      'finishing PDF reload must not automatically switch previews');
    await page.getByTestId('preview-tab-markdown').click();
    assert.equal(await page.locator('#preview-panel-markdown').isVisible(),true);
    assert.equal(await page.getByTestId('workbench-mode-chapters').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#workbench-module-title').textContent(),'章节定界');
    assert.equal(await page.getByTestId('ir-export-md').isHidden(),true);
    assert.equal(await page.getByTestId('ir-export-zip').isHidden(),true);
    assert.equal(await page.locator('#wb-ir-details').isHidden(),true);
    assert.equal(await page.locator('#wb-module-menu').evaluate(e=>e.open),false);
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('检测到 2 份 OCR JSON'),null,{timeout:90000});
    assert.equal(await page.getByTestId('ir-ocr-select').locator('option').count(),3);
    assert.equal(await page.locator('#ir-ocr-source-choice').isVisible(),true,
      'multiple OCR files require a clearly labelled one-time source choice');
    await page.getByTestId('ir-ocr-select').selectOption({label:'MinerU_fixture.json'});
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('IR 已加载 5 块'),null,{timeout:90000});
    // The top activity strip is always live, even while the workspace tab is
    // selected / before the PDF tab is opened. No special debug state.
    await page.waitForFunction(()=>document.querySelector('[data-module-status="dirjson"]')?.dataset.summary?.includes('IR 已加载 5 块'),null,{timeout:12000});
    assert.equal(await page.getByTestId('activity-dirjson').getAttribute('data-level'),'ready');
    // UIC-V3-AG-H1-FILTER-001: default chapter AG shows only current MD H1.
    // This is an AG-only filter, not an OCR level filter or a DIRjson mutation.
    const h1Only=page.getByTestId('ir-only-h1');
    assert.equal(await h1Only.isVisible(),true);
    assert.equal(await page.locator('#ir-ocr-source-choice').isHidden(),true,
      'source dropdown disappears after DIRjson has been initialized');
    assert.equal(await page.locator('#workbench-module-title').isVisible(),true);
    assert.equal(await page.locator('#workbench-module-title').innerText(),'章节定界');
    assert.equal(await page.locator('#workbench-ir-panel #ir-heading-filters').count(),0);
    assert.equal(await page.locator('#workbench-ir-grid #ir-only-h1').count(),0);
    assert.equal(await page.locator('#workbench-layout .workbench-grid-pane > .wb-pane-head #ir-heading-filters').count(),1);
    for(const selector of ['#wb-module-menu','#ir-chapter-edit-details','#wb-ir-details',
      '#wb-ir-actions','#ir-v2-assignment','#workbench-mode-chapters']){
      assert.equal(await page.locator(selector).isHidden(),true,'legacy action hidden: '+selector);
    }
    assert.equal(await page.locator('#workbench-path-nav').count(),1,
      'book/chapter navigation remains essential for chapter cleaning');
    assert.equal(await page.getByTestId('ir-save').isVisible(),true);
    assert.equal(await page.getByTestId('ir-publish-chapters').isVisible(),true);
    const startNumber=page.getByTestId('ir-v2-sequence-start');
    assert.equal(await startNumber.isVisible(),true,'start number belongs in chapter AG toolbar');
    assert.equal(await page.locator('#workbench-layout .workbench-grid-pane > .wb-pane-head #ir-sequence-start-control').count(),1);
    assert.equal(await startNumber.isEnabled(),true);
    assert.equal(await startNumber.inputValue(),'01');
    assert.equal(await page.locator('#ir-v2-sequence').isHidden(),true,
      'do not reintroduce an extra sequential numbering button');
    if(process.env.OCR2MD_TEST_CHAPTER_UI_ONLY==='1'){
      assert.equal(await h1Only.isChecked(),true);
      assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),1);
      await h1Only.uncheck();
      assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),2);
      await h1Only.check();
      assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),1);
      // Changing start number commits only when leaving the field / Enter.
      // It renumbers checked chapter-file owners, not the OCR heading levels.
      const sourceBefore=await page.getByTestId('workbench-ir-source').innerText();
      await startNumber.fill('05');
      assert.equal(await page.getByTestId('ir-save').isEnabled(),true,
        'initial DIRjson can be saved even without numbering');
      await startNumber.press('Enter');
      await page.waitForFunction(()=>document.querySelector('[data-testid="ir-v2-chapter-file"]')?.value==='05 A Real IR Main Title.md');
      assert.equal(await startNumber.inputValue(),'05');
      assert.equal(await page.getByTestId('ir-undo').isEnabled(),true);
      assert.equal(await page.getByTestId('ir-publish-chapters').isDisabled(),true,
        'renumbered files must be saved before publish');
      assert.equal(await page.getByTestId('workbench-ir-source').innerText(),sourceBefore,
        'renumbering filenames must not mutate source heading or OCR text');
      await page.getByTestId('ir-undo').click();
      await page.waitForFunction(()=>document.querySelector('#ir-v2-sequence-start')?.value==='01');
      assert.notEqual(await page.getByTestId('ir-v2-chapter-file').first().inputValue(),'05 A Real IR Main Title.md');
      await page.getByTestId('ir-redo').click();
      await page.waitForFunction(()=>document.querySelector('#ir-v2-sequence-start')?.value==='05');
      assert.equal(await page.getByTestId('ir-v2-chapter-file').first().inputValue(),'05 A Real IR Main Title.md');
      // Invalid values cannot mutate the current IR snapshot.
      await startNumber.fill('abc');
      await startNumber.press('Tab');
      assert.equal(await page.getByTestId('ir-v2-chapter-file').first().inputValue(),'05 A Real IR Main Title.md');
      await startNumber.fill('05');
      await startNumber.press('Tab');
      await page.getByTestId('workbench-mode-ir').evaluate(button=>button.click());
      assert.equal(await page.locator('#ir-sequence-start-control').isHidden(),true,
        'start-number input must be chapter-delimitation-only');
      await page.getByTestId('workbench-mode-chapters').evaluate(button=>button.click());
      assert.equal(await startNumber.isVisible(),true);
      assert.equal(await startNumber.inputValue(),'05');
      await page.setViewportSize({width:390,height:844});
      const startRect=await startNumber.boundingBox();
      assert.ok(startRect&&startRect.x>=0&&startRect.x+startRect.width<=392,
        'iPad narrow viewport start input must not overflow screen: '+JSON.stringify(startRect));
      assert.deepEqual(writes,[],'chapter-only renumber/filter cannot write real vault');
      console.log('V3_CHAPTER_DELIMITATION_MINIMAL_UI_PASS',JSON.stringify({
        engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium',
        h1InGridHeader:true,legacyHidden:true,ocrAmbiguityPromptOnly:true,
        chapterNavigatorPreserved:true,startNumberInAgHeader:true,numberingUndoRedo:true,
        draftSaved:false,sourceNonMutating:true}));
      await context.close();return;
    }
    assert.equal(await h1Only.isChecked(),true,'H1-only checkbox is on by default');
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),1);
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('A Real IR Main Title'));
    assert.ok(!(await page.locator('#workbench-ir-grid').innerText()).includes('Research Methods'));
    const pristineSource=await page.getByTestId('workbench-ir-source').innerText();
    await h1Only.uncheck();
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),2,
      'unchecking reveals all OCR title candidates');
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('Research Methods'),null,{timeout:10000});
    // UIC-V3-STANDALONE-TAP-001: the H2 row used to show "—" instead of an
    // actionable checkbox. Keep the SAME DOM input alive across rapid AG
    // redraws; changing the file cut must never select the row or change ##.
    const h2Row=page.locator('#workbench-ir-grid .ag-row').filter({hasText:'Research Methods'}).first();
    const h2Check=h2Row.getByTestId('ir-v2-standalone');
    assert.equal(await h2Check.count(),1,'non-H1 chapter title has a checkbox');
    assert.equal(await h2Check.isEnabled(),true);
    assert.equal(await h2Check.isChecked(),false);
    const stableH2Input=await h2Check.elementHandle();
    const previousSelected=await page.locator('#workbench-ir-grid .ag-row-selected').count();
    for(let tap=0;tap<6;tap++){
      const expected=tap%2===0;
      if(expected)await h2Check.check();else await h2Check.uncheck();
      assert.equal(await h2Check.isChecked(),expected,'file checkbox reliably toggles at tap '+tap);
      assert.equal(await stableH2Input.evaluate(input=>input.isConnected),true,
        'AG refresh must not destroy the touched checkbox');
      assert.equal(await h2Row.getByTestId('ir-v2-chapter-file').isDisabled(),!expected);
      assert.equal(await page.locator('#workbench-ir-grid .ag-row-selected').count(),previousSelected,
        'checkbox action must not trigger AG row selection');
      assert.equal(await page.getByTestId('workbench-ir-source').innerText(),pristineSource,
        'checkbox action cannot change heading levels or code source');
    }
    const tapSize=await h2Check.locator('..').evaluate(el=>el.getBoundingClientRect().height);
    assert.ok(tapSize>=36,'iPad chapter file checkbox requires at least a 36px touch target');
    await h1Only.check();
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),1);
    assert.equal(await page.getByTestId('workbench-ir-source').innerText(),pristineSource,
      'AG H1-only filter must not edit the full-book Markdown source');
    assert.equal(await page.getByTestId('ir-save').isEnabled(),true,
      'first-save behavior is unchanged by AG filter');
    // Switch modes: H1 filter is hidden and cannot hide IR logical blocks.
    // Legacy modes remain callable internally, but are no longer shown in chapter UI.
    await page.getByTestId('workbench-mode-ir').evaluate(button=>button.click());
    assert.equal(await h1Only.isHidden(),true);
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),5,
      'IR logical block mode must not inherit chapter-only external filter');
    await page.getByTestId('workbench-mode-chapters').evaluate(button=>button.click());
    assert.equal(await h1Only.isVisible(),true);
    assert.equal(await h1Only.isChecked(),true,'chapter filter selection survives mode round-trip');
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),1);
    // Continue existing chapter-edit UIC with all candidates visible.
    await h1Only.uncheck();
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),2);
    assert.equal(await page.getByTestId('ir-md-file').locator('option').count(),1,
      'chapter delimitation starts with ONE full-book source, not guessed chapters');
    assert.equal(await page.getByTestId('ir-md-file').inputValue(),'dir:whole-book-draft');
    assert.ok((await page.getByTestId('workbench-ir-source').getAttribute('data-ir-md-path')).endsWith('/whole-book-draft.md'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('Research Methods'),
      'full-book source crosses OCR-inferred subsection boundary');
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('OCR 原文标题'));
    assert.equal(await page.getByTestId('ir-chapter-filter').isHidden(),true);
    // UIC-V3-AG-FOURWAY-NAV-001: AG, source and MD preview move to the
    // same stable DIRjson block; PDF remains hidden until explicitly chosen.
    await page.locator('#workbench-ir-grid .ag-row').first().locator('.v3-heading-cell').click();
    await page.waitForFunction(()=>{
      const source=document.querySelector('#workbench-ir-source');
      return Boolean(source?.dataset.irBlockId&&
        document.querySelector('#ir-markdown-preview .v3-ir-preview-target')?.dataset.irBlockId===source.dataset.irBlockId);
    },null,{timeout:12000});
    const targetIrId=await page.getByTestId('workbench-ir-source').getAttribute('data-ir-block-id');
    assert.ok(targetIrId);
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true',
      'AG selection must not auto-switch to PDF');
    assert.equal(await page.locator('#ir-markdown-preview .v3-ir-preview-target').getAttribute('data-ir-block-id'),targetIrId);
    await page.getByTestId('preview-tab-pdf').click();
    await page.waitForFunction(id=>document.querySelector('.ocr2md-pdf-region-overlay')?.dataset.elementId===id,
      targetIrId,{timeout:15000});
    assert.equal(await page.locator('.ocr2md-pdf-region-overlay').getAttribute('data-pdf-page'),'1');
    await page.waitForFunction(()=>document.querySelector('[data-module-status="pdf"]')?.dataset.level==='ready',null,{timeout:12000});
    await page.getByTestId('preview-tab-markdown').click();
    assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#ir-markdown-preview .v3-ir-preview-target').getAttribute('data-ir-block-id'),targetIrId);
    await page.getByTestId('preview-tab-pdf').click();
    if(process.env.OCR2MD_UIC_NAV_THEME_ONLY==='1'){
      // The setting survives reload, and reset restores the dark default.
      const settingsPage=await context.newPage();
      await settingsPage.goto(url,{waitUntil:'domcontentloaded'});
      await settingsPage.getByTestId('tab-settings').click();
      assert.equal(JSON.parse(await settingsPage.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}')).pdfTheme,'light');
      assert.equal(await settingsPage.getByTestId('workbench-pdf-canvas').getAttribute('data-pdf-theme'),'light');
      await settingsPage.getByTestId('tab-settings').click();
      await settingsPage.getByTestId('settings-reset').click();
      assert.equal(JSON.parse(await settingsPage.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}')).pdfTheme,'dark');
      // V2 last-known-good: invalid JSON cannot overwrite the saved theme.
      await settingsPage.locator('#settings-shared laity-source-surface').evaluate(e=>e.value='{ broken json');
      await settingsPage.waitForFunction(()=>document.querySelector('#settings-shared .las-status')?.textContent?.includes('源码未应用'));
      await settingsPage.getByTestId('settings-save').click();
      assert.ok((await settingsPage.locator('#settings-shared .las-status').innerText()).includes('保存失败'));
      assert.equal(JSON.parse(await settingsPage.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}')).pdfTheme,'dark');
      assert.equal(await settingsPage.getByTestId('workbench-pdf-canvas').getAttribute('data-pdf-theme'),'dark');
      await settingsPage.close();
      assert.deepEqual(pageErrors,[],'no JavaScript errors during AG/MD/PDF navigation');
      assert.deepEqual(writes,[],'navigation and PDF theme never write to Vault');
      console.log('V3_AG_MD_PDF_THEME_UIC_PASS',JSON.stringify({
        sameBlock:targetIrId,mdTabPreserved:true,deferredPdfOverlay:true,
        previewHighlight:true,themeDefault:'dark',themeSaved:'light',noVaultWrites:true}));
      await context.close();return;
    }
    // Official PDF.js zoom must preserve region overlays and manual scale on resize.
    const pdfWidthBefore=await page.locator('.pdfViewer .page[data-page-number="1"] canvas').first()
      .evaluate(e=>e.getBoundingClientRect().width);
    await page.getByTestId('pdf-zoom-value').selectOption('125');
    await page.waitForFunction(()=>document.querySelector('#pdf-zoom-value')?.value==='125');
    await page.waitForFunction(before=>{
      const canvas=document.querySelector('.pdfViewer .page[data-page-number="1"] canvas');
      return !!canvas&&canvas.getBoundingClientRect().width>before*1.08;
    },pdfWidthBefore,{timeout:15000});
    assert.equal(await page.locator('.ocr2md-pdf-region-overlay').getAttribute('data-pdf-page'),'1');
    await page.setViewportSize({width:1250,height:930});
    await page.waitForTimeout(500);
    assert.equal(await page.getByTestId('pdf-zoom-value').inputValue(),'125','resize keeps manual zoom');
    await page.getByTestId('pdf-zoom-out').click();
    assert.notEqual(await page.getByTestId('pdf-zoom-value').inputValue(),'125');
    await page.getByTestId('pdf-zoom-value').selectOption('page-fit');
    assert.equal(await page.getByTestId('pdf-zoom-value').inputValue(),'page-fit');
    await page.getByTestId('pdf-zoom-value').selectOption('page-width');
    assert.equal(await page.getByTestId('pdf-zoom-value').inputValue(),'page-width');
    // Human reviews and names one first-level heading, preserving raw OCR evidence.
    // V2's primary workflow is inline checkbox + editable filename + start-number
    // sequence, not the V3 advanced classification dialog.
    const v2First=page.getByTestId('ir-v2-standalone').first();
    assert.equal(await v2First.isChecked(),true);
    assert.equal(await v2First.isDisabled(),true,'first owner cannot merge backwards');
    assert.equal(await page.getByTestId('ir-v2-chapter-file').count(),2,
      'every visible OCR title has a chapter file editor, inherited names readonly');
    assert.equal(await page.getByTestId('ir-v2-chapter-file').nth(1).isDisabled(),true);
    assert.equal(await v2First.getAttribute('title'),
      '首个标题是文件起点，没有前一个文件可合并');
    // Legacy V2 numbering remains testable through the retained internal API;
    // its old controls are intentionally removed from the chapter UI.
    await page.getByTestId('ir-v2-sequence-start').evaluate(input=>{input.value='05';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.getByTestId('ir-v2-sequence').evaluate(button=>button.click());
    await page.waitForFunction(()=>document.querySelector('[data-testid="ir-v2-chapter-file"]')?.value==='05 A Real IR Main Title.md',null,{timeout:15000});
    assert.equal(await page.getByTestId('ir-save').isEnabled(),true);
    const inlineFile=page.getByTestId('ir-v2-chapter-file').first();
    await inlineFile.fill('05 Manual Main Chapter.md');
    await inlineFile.press('Tab');
    await page.waitForFunction(()=>document.querySelector('[data-testid="ir-v2-chapter-file"]')?.value==='05 Manual Main Chapter.md',null,{timeout:15000});
    assert.equal(await page.getByTestId('ir-v2-chapter-file').first().inputValue(),'05 Manual Main Chapter.md');
    assert.ok((await page.getByTestId('workbench-ir-source').getAttribute('data-ir-md-path')).endsWith('/whole-book-draft.md'),
      'renaming a chapter never splits the live review source');
    // Advanced classification remains a secondary tool for exceptional OCR titles.
    // Old role classifier is hidden in chapters but retains its internal
    // adapter contract for previously saved DIRjson and advanced IR cases.
    await page.getByTestId('ir-chapter-role').evaluate(input=>{input.value='root';input.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.getByTestId('ir-chapter-file-name').evaluate(input=>{input.value='01-Example Chapter.md';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.getByTestId('ir-chapter-reason').evaluate(input=>{input.value='人工核实 PDF 首页标题是正文主章节';input.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.getByTestId('ir-chapter-apply').evaluate(button=>button.click());
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('章节定界已暂存'));
    assert.equal(await page.getByTestId('ir-v2-chapter-file').first().inputValue(),'01-Example Chapter.md');
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('已标定'),
      null,{timeout:15000});
    assert.equal(await page.getByTestId('ir-save').isEnabled(),true);
    assert.ok((await page.getByTestId('workbench-ir-source').getAttribute('data-ir-md-path')).endsWith('/whole-book-draft.md'));
    // V2 heading style parity: the actual generated Markdown H1 defines the
    // heading level displayed in the AG row, NOT the original MinerU level.
    const agHeading=page.locator('#workbench-ir-grid .v3-heading-cell[data-heading-level="1"]').first();
    assert.equal(await agHeading.count(),1);
    assert.ok((await agHeading.innerText()).startsWith('# A Real IR Main Title'));
    const headingH2=page.locator('#workbench-ir-grid .v3-heading-cell[data-heading-level="2"]');
    assert.equal(await headingH2.count(),1);
    // V2 standard: AG lists/reveals settings, CodeMirror is sole JSON source.
    await page.getByTestId('tab-settings').click();
    assert.equal(await page.locator('#settings-shared laity-source-surface').count(),1);
    for(const [key,value] of Object.entries({
      workbenchGridFontSize:15,workbenchGridRowHeight:42,
      mdSourceFontSize:16,mdPreviewFontSize:18,mdSourceLineHeight:1.6,
      mdPreviewLineHeight:1.72,mdFontFamily:'system',mdShowHardReturns:true,
      'mdHeadingSizes.0':1.9,'mdHeadingSizes.1':1.6,'mdHeadingSizes.2':1.4,
      'mdHeadingSizes.3':1.25,'mdHeadingSizes.4':1.1,'mdHeadingSizes.5':1,
      'mdHeadingColors.0':'#aabbcc','mdCodeColors.comment':'#8899aa',
    }))await setSetting(page,key,value);
    await page.getByTestId('settings-save').click();
    await page.waitForFunction(()=>document.querySelector('#settings-shared .las-status')?.textContent?.includes('已保存'),null,{timeout:7000});
    await page.getByTestId('tab-workbench').click();
    const computed=await page.evaluate(()=>{
      const css=e=>getComputedStyle(document.querySelector(e));
      return {headingAgColor:css('#workbench-ir-grid .v3-heading-cell[data-heading-level="1"]').color,
        headingAgSize:css('#workbench-ir-grid .v3-heading-cell[data-heading-level="1"]').fontSize,
        headingSourceColor:css('#workbench-ir-source .cm-line.cm-obsidian-h1').color,
        headingSourceSize:css('#workbench-ir-source .cm-line.cm-obsidian-h1').fontSize,
        editorSize:css('#workbench-ir-source .cm-editor').fontSize,
        codeComment:getComputedStyle(document.documentElement).getPropertyValue('--obsidian-code-comment').trim(),
        savedGridFont:getComputedStyle(document.documentElement).getPropertyValue('--grid-font-size').trim(),
        rawSettings:JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1'))};
    });
    assert.equal(computed.headingAgColor,'rgb(170, 187, 204)');
    assert.equal(computed.headingSourceColor,computed.headingAgColor);
    assert.equal(parseFloat(computed.headingAgSize),16*1.9);
    assert.equal(parseFloat(computed.headingSourceSize),16*1.9);
    assert.equal(computed.editorSize,'16px');
    assert.equal(computed.savedGridFont,'15px');
    assert.equal(computed.codeComment,'#8899aa');
    assert.equal(computed.rawSettings.mdPreviewFontSize,18);
    await page.getByTestId('preview-tab-markdown').click();
    const previewH1=page.getByTestId('ir-markdown-preview').locator('h1').first();
    await previewH1.waitFor();
    assert.equal(await previewH1.evaluate(e=>getComputedStyle(e).color),'rgb(170, 187, 204)');
    assert.ok(Math.abs(parseFloat(await previewH1.evaluate(e=>getComputedStyle(e).fontSize))-18*1.9)<.2);
    assert.ok((await page.getByTestId('ir-markdown-preview').locator('h2').count())>=1);
    await page.getByTestId('preview-tab-pdf').click();
    assert.equal(await page.locator('#ir-dirty-indicator').isHidden(),true);
    await page.getByTestId('workbench-mode-ir').evaluate(button=>button.click());
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.querySelectorAll('.ag-row').length===5);
    assert.equal(await page.getByTestId('ir-export-md').isHidden(),true,
      'source toolbar is absent; downloads remain in the IR details popover');
    assert.equal(await page.getByTestId('workbench-ir-panel').isVisible(),true);
    assert.equal(await page.getByTestId('workbench-review-panel').isHidden(),true);
    assert.equal(await page.getByTestId('workbench-calibration-grid').isHidden(),true);
    assert.equal(await page.getByTestId('workbench-ir-source').isVisible(),true);
    assert.equal(await page.getByTestId('workbench-source').isHidden(),true);
    assert.equal(await page.getByTestId('workbench-file').isHidden(),true);
    assert.equal(await page.getByTestId('ir-chapter-filter').isVisible(),true);
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('Research Methods'));
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('First source paragraph'),
      null,{timeout:15000});
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('First source paragraph'));
    assert.equal(await page.locator('#workbench-ir-grid .ag-root').count(),1,'real AG Grid');
    assert.equal(await page.getByTestId('workbench-ir-source').locator('.cm-editor').count(),1,'IR source uses CodeMirror');
    assert.equal(await page.getByTestId('ir-chapter-filter').locator('option').count(),3);
    await page.locator('#workbench-ir-grid .ag-row').filter({hasText:'First source paragraph'}).first().click();
    await page.waitForFunction(()=>document.querySelector('#ir-source-evidence')?.textContent?.includes('/pdf_info/0/para_blocks/1'),
      null,{timeout:30000});
    const original=await page.locator('#workbench-ir-source').innerText();
    assert.ok(original.includes('<!-- ocr2md-ir:block='));
    assert.ok(original.includes('First source paragraph'));
    assert.equal(await page.getByTestId('ir-md-file').locator('option').count(),1,
      'fixture chapter root is one main heading with one subsection');
    assert.ok((await page.getByTestId('ir-source-evidence').textContent()??'').includes(''),
      'source metadata available in edit popover');
    await page.waitForFunction(()=>Boolean(document.querySelector('.ocr2md-pdf-region-overlay')?.dataset.elementId),null,{timeout:30000});
    assert.equal(await page.locator('.ocr2md-pdf-region-overlay').getAttribute('data-pdf-page'),'1');
    const paragraphId=await page.getByTestId('workbench-ir-source').getAttribute('data-ir-block-id');
    // Exact source bbox is fixture-owned data: PDF canvas click must navigate to
    // IR block and generated MD, never via legacy official Markdown.
    await page.locator('.pdfViewer .page[data-page-number="1"] canvas').first().evaluate((canvas)=>{
      const bounds=canvas.getBoundingClientRect();
      const centerX=0.5*(35+400)/612,centerY=0.5*(60+110)/792;
      canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,
        clientX:bounds.left+centerX*bounds.width,
        clientY:bounds.top+centerY*bounds.height}));
    });
    await page.waitForTimeout(450);
    await page.waitForFunction(prior=>{
      const current=document.querySelector('#workbench-ir-source')?.dataset.irBlockId;
      return !!current&&current!==prior;
    },paragraphId,{timeout:20000});
    const titleId=await page.getByTestId('workbench-ir-source').getAttribute('data-ir-block-id');
    assert.notEqual(titleId,paragraphId);
    // Generated MD cursor -> IR -> PDF: use the visible CodeMirror line, not an OCR DOM guess.
    await page.locator('#workbench-ir-source .cm-line').filter({hasText:'First source paragraph'}).first().click();
    await page.waitForFunction(id=>document.querySelector('#workbench-ir-source')?.dataset.irBlockId===id,
      paragraphId,{timeout:20000});
    // Source is OCR text; no MD file was present in the fixture.
    assert.equal(fs.existsSync(path.join(root,'ocr2md','IRFixture','.ocr2md')),false);
    await page.getByTestId('preview-tab-markdown').click();
    await page.waitForFunction(()=>document.querySelector('#ir-markdown-preview')?.textContent?.includes('First source paragraph'));
    assert.equal(await page.getByTestId('ir-markdown-preview').isVisible(),true);
    await page.getByTestId('preview-tab-pdf').click();
    await page.locator('#wb-ir-details > summary').click();
    assert.ok((await page.getByTestId('ir-source-evidence').textContent()).includes('/pdf_info/0/para_blocks/1'));
    assert.equal(await page.getByTestId('ir-export-md').isVisible(),true);

    await page.getByTestId('ir-edit-reason').fill('依据 PDF 明确测试段落拆分');
    await page.getByTestId('ir-split-offset').fill('18');
    await page.getByTestId('ir-split').click();
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.querySelectorAll('.ag-row').length===6);
    assert.ok((await page.getByTestId('ir-status').textContent()).includes('拆分操作已暂存'));
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),6);
    await page.getByTestId('ir-edit-reason').fill('PDF 对照确认合并连续两部分');
    await page.getByTestId('ir-merge').click();
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('合并操作已暂存'));
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),5);
    await page.getByTestId('ir-edit-text').fill('Edited text with preserved OCR source.');
    await page.getByTestId('ir-edit-reason').fill('对照 PDF 完成人工草稿校正（未核准）');
    await page.getByTestId('ir-apply-text').click();
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('文本修改已暂存'),null,{timeout:15000});
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('Edited text'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('Edited text'));
    assert.ok((await page.locator('#ir-dirty-indicator').innerText()).includes('未保存'));
    const pending=page.waitForEvent('download');
    await page.getByTestId('ir-export').click();
    const download=await pending;
    const target=path.join(temp,'downloaded-document-ir.json');await download.saveAs(target);
    const exported=JSON.parse(fs.readFileSync(target,'utf8'));
    assert.equal(exported.blocks.length,5);
    assert.ok(exported.blocks.some(b=>b.text==='Edited text with preserved OCR source.'));
    assert.ok(exported.blocks.every(b=>b.audit==='unreviewed'));
    assert.deepEqual(exported.reconstruction.appliedOperations.map(x=>x.kind),['split','merge','edit-text']);
    const downloadMD=page.waitForEvent('download');
    await page.getByTestId('ir-export-md').click();
    const mdDownload=await downloadMD;
    const mdPath=path.join(temp,'current-chapter.md');await mdDownload.saveAs(mdPath);
    const chapterText=fs.readFileSync(mdPath,'utf8');
    assert.ok(chapterText.includes('Edited text with preserved OCR source.'));
    assert.ok(chapterText.includes('<!-- ocr2md-ir:block='));
    const downloadZIP=page.waitForEvent('download');
    await page.getByTestId('ir-export-zip').click();
    const zipDownload=await downloadZIP;
    const zipPath=path.join(temp,'ir-export.zip');await zipDownload.saveAs(zipPath);
    const listing=execFileSync('unzip',['-Z','-1',zipPath],{encoding:'utf8'});
    assert.ok(listing.includes('document-ir.v1.json'));
    assert.ok(listing.includes('document-ir.markdown-manifest.v1.json'));
    const check=execFileSync('unzip',['-t',zipPath],{encoding:'utf8'});
    assert.ok(check.includes('No errors detected'));
    const index=JSON.parse(execFileSync('unzip',['-p',zipPath,'document-ir.markdown-manifest.v1.json'],{encoding:'utf8'}));
    assert.equal(index.projectionState,'chapter-files-for-cleaning',
      'named file cuts may be exported without certifying OCR title reviews');
    assert.ok(index.files.every(f=>listing.includes('chapters/'+f.path.split('/').at(-1))));
    assert.equal(index.files.reduce((n,f)=>n+f.ranges.length,0),5);
    assert.equal(index.audit,'unreviewed');
    const ranges=index.files.flatMap(f=>f.ranges);
    assert.equal(ranges.find(r=>r.blockId===exported.blocks[1].blockId)?.evidence[0].pdfPageNumber,1);
    assert.ok(ranges.some(r=>r.blockId===exported.blocks[1].blockId));
    assert.equal(await page.locator('#workbench-source').isHidden(),true);
    await page.setViewportSize({width:834,height:1194});
    assert.ok(await page.getByTestId('workbench-ir-panel').isVisible());
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=0,'iPad overflow');
    await page.getByTestId('workbench-mode-review').evaluate(button=>button.click());
    assert.equal(await page.getByTestId('workbench-review-panel').isVisible(),true,'legacy review intact');
    await page.getByTestId('workbench-mode-text').evaluate(button=>button.click());
    assert.equal(await page.getByTestId('workbench-calibration-grid').isVisible(),true,'legacy text mode intact');
    await page.getByTestId('workbench-mode-ir').evaluate(button=>button.click());
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('Edited text'),'draft survives mode toggle');
    // DIRjson direct CodeMirror editing: source title corrected in place,
    // AG updates immediately; a deleted Markdown heading loses its IR chapter
    // role but never its source OCR evidence; Ctrl-Z restores the IR snapshot.
    await page.getByTestId('workbench-mode-chapters').evaluate(button=>button.click());
    const sourceTitle=page.locator('#workbench-ir-source .cm-line.cm-obsidian-h1').first();
    await sourceTitle.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' verified');
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('源码修正已同步'),null,{timeout:30000});
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('A Real IR Main Title verified'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('A Real IR Main Title verified'));
    // UIC-V3-DIR-HEADER-001: stable top-right bar, dirty save, and real DIRjson undo/redo.
    // UIC-V3-TOP-TABS-ACTIONS-001: these are the real workbench controls,
    // relocated directly alongside the top tabs; no duplicate proxy controls.
    const header=page.locator('.v3-top-row');
    const headerActions=header.locator('#workbench-ir-header-actions');
    assert.equal(await headerActions.isVisible(),true);
    assert.deepEqual(await headerActions.locator(':scope > button').evaluateAll(nodes=>nodes.map(n=>n.id)),
      ['ir-undo','ir-redo','ir-save','ir-publish-chapters']);
    assert.equal(await page.locator('#workbench-refresh,#workbench-back').count(),0);
    assert.equal(await page.locator('#ir-save').count(),1,'save action must not be duplicated');
    assert.equal(await page.locator('#panel-workbench .workbench-bookbar #ir-undo, #panel-workbench .workbench-bookbar #ir-save, #panel-workbench .workbench-bookbar #workbench-refresh').count(),0,
      'top-level editor controls are not in the book breadcrumb row');
    const deployedBuild=await page.getByTestId('workbench-build').textContent();
    assert.match(deployedBuild,/^v3-[a-z0-9-]+$/,'visible build version should remain next to app title');
    assert.equal(await page.evaluate(()=>new URL(document.querySelector('script[type=module]').src).searchParams.get('rev')),
      deployedBuild,'visible version must match the actual bundled script');
    const topGeometry=await page.evaluate(()=>{
      const version=document.querySelector('#workbench-build').getBoundingClientRect();
      const brand=document.querySelector('h1.v3-brand').getBoundingClientRect();
      const tabs=document.querySelector('.v3-top-row .tabs').getBoundingClientRect();
      const actions=document.querySelector('#workbench-ir-header-actions').getBoundingClientRect();
      const source=document.querySelector('#workbench-source-pane').getBoundingClientRect();
      const editor=document.querySelector('#workbench-ir-source').getBoundingClientRect();
      const sourceHead=document.querySelector('#workbench-source-pane > .wb-pane-head').getBoundingClientRect();
      return {titleAndVersionSameLine:Math.abs(version.top-brand.top)<14,
        actionsToRightOfTabs:actions.left>=tabs.right-2,sourceHeadHeight:sourceHead.height,
        editorStartsAtSource:Math.abs(editor.top-source.top)<2,
        bodyOverflow:document.documentElement.scrollWidth-innerWidth};
    });
    assert.equal(topGeometry.titleAndVersionSameLine,true,'version next to app title');
    assert.equal(topGeometry.actionsToRightOfTabs,true,'actions on far right of tabs');
    assert.equal(topGeometry.sourceHeadHeight,0,'source pane header not laid out');
    assert.equal(topGeometry.editorStartsAtSource,true,'source editor reclaims toolbar height');
    assert.ok(topGeometry.bodyOverflow<=0,'no horizontal overflow');
    assert.equal(await page.getByTestId('ir-save').isEnabled(),true);
    assert.equal(await page.getByTestId('ir-save').getAttribute('data-dirty'),'true');
    assert.equal(await page.getByTestId('ir-publish-chapters').isDisabled(),true,
      'unsaved DIRjson draft and unconfirmed chapters may not be published');
    assert.equal(await page.getByTestId('ir-save').textContent(),'保存标定');
    assert.equal(await page.getByTestId('ir-undo').isEnabled(),true);
    assert.equal(await page.getByTestId('ir-redo').isDisabled(),true);
    await page.getByTestId('ir-undo').click();
    await page.waitForFunction(()=>!document.querySelector('#workbench-ir-grid')?.innerText?.includes('A Real IR Main Title verified'));
    assert.equal(await page.getByTestId('ir-redo').isEnabled(),true);
    await page.getByTestId('ir-redo').click();
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('A Real IR Main Title verified'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('A Real IR Main Title verified'));
    assert.equal(await page.getByTestId('ir-redo').isDisabled(),true);
    await page.locator('#workbench-ir-source .cm-line.cm-obsidian-h2').first().click();
    await page.keyboard.press('End');
    for(let i=0;i<'## Research Methods'.length;i++)await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Delete');await page.keyboard.press('Delete');await page.keyboard.press('Delete');
    await page.waitForTimeout(800);
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('源码修正已同步'),null,{timeout:30000});
    assert.equal(await page.locator('#workbench-ir-grid .v3-heading-cell[data-heading-level="2"]').count(),0);
    // The demoted OCR title becomes a true text block, leaving chapter-only
    // AG rows while remaining available in source and the blocks review stage.
    assert.ok(!(await page.locator('#workbench-ir-grid').innerText()).includes('Research Methods'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('Research Methods'));
    await page.keyboard.press('ControlOrMeta+z');
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已撤销'),null,{timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid .v3-heading-cell[data-heading-level="2"]')!==null,null,{timeout:15000});
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('## Research Methods'));
    assert.equal(await page.getByTestId('ir-save').isEnabled(),true);
    // V2 CodeMirror line-number action, V3 human-only missing-title insertion.
    const gutter=page.locator('#workbench-ir-source .cm-lineNumbers .cm-gutterElement')
      .filter({hasText:/^\s*2\s*$/}).first();
    await gutter.waitFor({state:'visible',timeout:15000});
    // Regression UIC: V3 uses the V2 dark gutter, legible numbers and accented active line.
    const gutterStyle=await page.locator('#workbench-ir-source').evaluate(root=>{
      const gutters=root.querySelector('.cm-gutters');
      const normal=root.querySelector('.cm-lineNumbers .cm-gutterElement:not(.cm-activeLineGutter)');
      const active=root.querySelector('.cm-lineNumbers .cm-activeLineGutter');
      if(!gutters||!normal||!active)return null;
      return {background:getComputedStyle(gutters).backgroundColor,
        foreground:getComputedStyle(gutters).color,
        activeColor:getComputedStyle(active).color,
        activeBackground:getComputedStyle(active).backgroundColor,
        activeWeight:getComputedStyle(active).fontWeight,
        normalCursor:getComputedStyle(normal).cursor};
    });
    assert.ok(gutterStyle,'CodeMirror line-number gutter and active line must exist');
    assert.equal(gutterStyle.background,'rgb(39, 47, 52)','V2 dark gutter background');
    assert.notEqual(gutterStyle.foreground,gutterStyle.background,'line numbers stay legible');
    assert.equal(gutterStyle.activeColor,'rgb(131, 192, 146)','V2 accent active line');
    assert.notEqual(gutterStyle.activeBackground,gutterStyle.background,'active gutter highlighted');
    assert.equal(gutterStyle.activeWeight,'700');
    assert.equal(gutterStyle.normalCursor,'pointer','all IR line numbers remain actionable');
    await gutter.click();
    assert.equal(await page.getByTestId('ir-line-actions').isVisible(),true);
    assert.ok((await page.getByTestId('ir-line-action-caption').textContent()).includes('第 2 行'));
    await page.getByTestId('ir-line-add-title').click();
    await page.getByTestId('ir-line-title-text').fill('Missing Heading Restored From PDF');
    await page.getByTestId('ir-line-title-level').selectOption('1');
    await page.getByTestId('ir-line-title-page').fill('1');
    await page.getByTestId('ir-line-title-confirm').check();
    await page.getByTestId('ir-line-title-commit').click();
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('新标题已补入'),null,{timeout:5500});
    assert.equal(await page.getByTestId('ir-line-actions').isHidden(),true);
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('Missing Heading Restored From PDF'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('# Missing Heading Restored From PDF'));
    assert.equal(await page.locator('#workbench-ir-grid .ag-row').count(),3);
    assert.ok((await page.locator('#workbench-ir-grid').innerText()).includes('人工补录'));
    // The second H1 is a manually restored true root. Unchecking its
    // "独立成章" cannot demote its # heading to ## or alter the source.
    const manualRow=page.locator('#workbench-ir-grid .ag-row')
      .filter({hasText:'Missing Heading Restored From PDF'}).first();
    const manualStandalone=manualRow.getByTestId('ir-v2-standalone');
    assert.equal(await manualStandalone.isChecked(),true);
    const sourceBeforeJoin=await page.getByTestId('workbench-ir-source').innerText();
    assert.equal((sourceBeforeJoin.match(/# Missing Heading Restored From PDF/g)||[]).length,1);
    await manualStandalone.uncheck();
    assert.equal(await manualStandalone.isChecked(),false);
    assert.equal(await manualRow.getByTestId('ir-v2-chapter-file').isDisabled(),true);
    assert.equal(await page.getByTestId('workbench-ir-source').innerText(),sourceBeforeJoin,
      'canceling independent file must not change the H1 title or whole-book source');
    assert.equal(await manualRow.locator('.v3-heading-cell[data-heading-level="1"]').count(),1);
    await manualStandalone.check();
    assert.equal(await manualStandalone.isChecked(),true);
    assert.equal(await page.getByTestId('workbench-ir-source').innerText(),sourceBeforeJoin);
    assert.equal(await manualRow.getByTestId('ir-v2-chapter-file').isEnabled(),true);
    // UIC-V3-IOS-CARET: IR CodeMirror uses native caret and native selection.
    const native=await page.locator('#workbench-ir-source').evaluate(root=>({
      editable:root.querySelector('.cm-content')?.getAttribute('contenteditable'),
      caret:getComputedStyle(root.querySelector('.cm-content')).caretColor,
      synthetic:root.querySelectorAll('.cm-cursorLayer').length
    }));
    assert.equal(native.editable,'true');
    assert.equal(native.caret,'rgb(10, 132, 255)');
    assert.equal(native.synthetic,0,'V3 must not draw a duplicate synthetic cursor');
    // UIC-V3-MANUAL-HEADING-DELETE: gutter delete then undo restores title.
    const deletedHeadingLine=page.locator('#workbench-ir-source .cm-line')
      .filter({hasText:'# Missing Heading Restored From PDF'}).first();
    const lineNumber=await deletedHeadingLine.evaluate(node=>
      [...node.closest('.cm-content').querySelectorAll('.cm-line')].indexOf(node)+1);
    // Regression: the selection is deliberately at the document start while
    // the user opens a DIFFERENT line's gutter menu. Location must follow
    // the deleted IR block rather than that unrelated old caret.
    await page.locator('#workbench-ir-source .cm-line').first().click();
    await page.keyboard.press('Home');
    const deleteGutter=page.locator('#workbench-ir-source .cm-lineNumbers .cm-gutterElement')
      .filter({hasText:new RegExp('^\\s*'+lineNumber+'\\s*$')}).first();
    await deleteGutter.click();
    assert.equal(await page.getByTestId('ir-line-delete-title').isVisible(),true);
    page.once('dialog',d=>d.accept());
    await page.getByTestId('ir-line-delete-title').click();
    await page.waitForTimeout(450);
    await page.waitForFunction(()=>!document.querySelector('#workbench-ir-grid')?.innerText?.includes('Missing Heading Restored From PDF'));
    assert.ok(!(await page.getByTestId('workbench-ir-source').innerText()).includes('# Missing Heading Restored From PDF'));
    const afterGutterDelete=Number(await page.locator('#workbench-ir-source .cm-lineNumbers .cm-activeLineGutter').first().textContent());
    assert.ok(lineNumber>2 && afterGutterDelete>1 && Math.abs(afterGutterDelete-lineNumber)<=2,
      `deletion must leave caret near deleted title, expected ~${lineNumber}, found ${afterGutterDelete}`);
    assert.equal(await page.getByTestId('ir-undo').isEnabled(),true);
    await page.getByTestId('ir-undo').click();
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('Missing Heading Restored From PDF'));
    // Repro: typing/pasting body beneath a manually restored title must create
    // a separate page-anchored text block, not drop the edit or jump to line 1.
    const restoredLine=page.locator('#workbench-ir-source .cm-line')
      .filter({hasText:'# Missing Heading Restored From PDF'}).first();
    await restoredLine.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(380); // Real human pause must NOT trigger rollback.
    assert.ok(!(await page.getByTestId('ir-status').textContent()).includes('源码编辑被撤销'));
    await page.keyboard.insertText('Pasted under restored title.\n\nSecond pasted paragraph.');
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('源码修正已同步'),null,{timeout:18000});
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('Second pasted paragraph.'));
    const cursorLine=await page.locator('#workbench-ir-source').evaluate(root=>{
      const selection=root.ownerDocument.getSelection();
      const anchor=selection?.anchorNode;
      const element=anchor instanceof Element?anchor:anchor?.parentElement;
      return element?.closest('.cm-line')?.textContent??'';
    });
    assert.ok(cursorLine.includes('Second pasted paragraph.'),'cursor should remain on pasted text, not top');
    // iPad safety: syntactically incomplete/invalid input stays in the editor
    // instead of being silently reverted by a delayed 220ms source sync.
    await page.keyboard.insertText('\n# invalid unanchored heading');
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('源码尚未同步'),null,{timeout:12000});
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('# invalid unanchored heading'),
      'invalid text must remain editable, not bounce back or reset selection');
    assert.equal(await page.getByTestId('ir-save').isDisabled(),true,
      'unsynchronized source cannot be saved');
    const activeGutter=await page.locator('#workbench-ir-source .cm-lineNumbers .cm-activeLineGutter').first().textContent();
    assert.ok(Number(activeGutter)>10,'invalid text must not reset caret to first line');
    await page.getByTestId('ir-undo').click();
    assert.ok(!(await page.getByTestId('workbench-ir-source').innerText()).includes('# invalid unanchored heading'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('Second pasted paragraph.'));
    // Deleting the textual title in source (without touching its marker)
    // must also remove only the manual heading and preserve its body.
    const textLine=page.locator('#workbench-ir-source .cm-line')
      .filter({hasText:'# Missing Heading Restored From PDF'}).first();
    await textLine.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.keyboard.press('Backspace');
    await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('源码修正已同步'),null,{timeout:12000});
    assert.ok(!(await page.getByTestId('workbench-ir-source').innerText()).includes('# Missing Heading Restored From PDF'));
    assert.ok((await page.getByTestId('workbench-ir-source').innerText()).includes('Second pasted paragraph.'));
    const afterSourceDelete=Number(await page.locator('#workbench-ir-source .cm-lineNumbers .cm-activeLineGutter').first().textContent());
    assert.ok(afterSourceDelete>1,'deleting source title text must not move caret to first line');
    await page.getByTestId('ir-undo').click();
    await page.waitForFunction(()=>document.querySelector('#workbench-ir-grid')?.innerText?.includes('Missing Heading Restored From PDF'));

    // Chapters-first hides diagnostic exports by design; use V3's preserved
    // legacy IR inspection mode to inspect the serialized, UNSAVED draft.
    await page.getByTestId('workbench-mode-ir').evaluate(button=>button.click());
    await page.getByTestId('ir-export').waitFor({state:'visible'});
    const manualDraft=page.waitForEvent('download');
    await page.getByTestId('ir-export').click();
    const manualDownload=await manualDraft;
    const manualFile=path.join(temp,'manual-dirjson-draft.json');
    await manualDownload.saveAs(manualFile);
    const manualDir=JSON.parse(fs.readFileSync(manualFile,'utf8'));
    assert.equal(manualDir.manualHeadings.length,1);
    assert.equal(manualDir.manualHeadings[0].pdfPageNumber,1);
    assert.equal(manualDir.blocks.filter(b=>b.sources.length===0).length,2);
    assert.equal(manualDir.manualTexts?.length,1);
    assert.equal(manualDir.manualTexts[0].pdfPageNumber,1);
    assert.equal(manualDir.sourceElements.length,exported.sourceElements.length);
    assert.equal(manualDir.blocks.length,7);
    assert.deepEqual(writes,[],'browser IR operations must never write to Vault');
    assert.deepEqual(pageErrors,[], 'No page errors');
    assert.equal(sha(fs.readFileSync(path.join(root,'ocr2md','IRFixture','original.pdf'))),sha(pdf));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'ocr2md','IRFixture','json','MinerU_fixture.json'))),ocr);
    console.log('IR_WP5_BROWSER_FIXTURE_PASS',JSON.stringify({blocks:5,chapters:2,source:'OCR JSON only',
      selectedPdfRegion:true,stageCorrection:true,split:true,merge:true,download:true,markdownExport:true,zipValidated:true,pdfToIrToMd:true,mdToPdf:true,iPadViewport:true,legacyModes:true,chapterBoundary:true,wholeBookSource:true,dirEditableSource:true,manualTitleLineGutter:true,undoRedo:true,v2InlineAssign:true,pdfZoom:true,v2Styles:true,settingsLive:true,zeroVaultWrites:true}));
    await context.close();
  }finally{if(browser)await browser.close();server.kill('SIGTERM');fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error('IR_WP5_BROWSER_FIXTURE_FAIL',e);process.exitCode=1;});
