/** V3 real browser UIC: publish confirmed DIRjson to editable chapters/.
 * All writes are inside a temporary test vault, NEVER the user's book. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn,execFileSync}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const {settingValue,setSetting}=require('./settingsAgActions.cjs');
const repo=path.resolve(__dirname,'../../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocr2md-publish-browser-'));
const root=path.join(temp,'ocr2md'),book=path.join(root,'ocr2md/Book');
const staticRoot=path.join(temp,'site'),port=40000+parseInt(crypto.createHash('sha256').update(temp).digest('hex').slice(0,7),16)%20000;
const base=`http://127.0.0.1:${port}`;
function seed(){
 execFileSync('node',[path.join(__dirname,'chapterPublishFixture.cjs'),book]);
 const py=`import sys,base64\nfrom pathlib import Path\nsys.path.insert(0,sys.argv[2])\nfrom v3_mac_vault import V3MacVault\nfrom v3_ir_persistence import save_snapshot\nr=Path(sys.argv[1]);v=V3MacVault(r,r.parent/'private/access-key');data=(r/'ocr2md/Book/cleaning.zip').read_bytes();result=save_snapshot(v,{'book':'/ocr2md/Book','expectedGeneration':None,'requestId':'seed-confirmed','archiveBase64':base64.b64encode(data).decode()});print(result['generation'])`;
 return execFileSync('python3',['-c',py,root,path.join(repo,'ui-spikes/v2')]).toString().trim();
}
async function ready(){for(let n=0;n<180;n++){try{const r=await fetch(base+'/__v3/fs?op=status');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,140));}throw Error('fixture HTTP not ready');}
(async()=>{
 let browser,server;
 try{
  const generation=seed();const pdfBefore=fs.readFileSync(path.join(book,'original.pdf'));
  fs.mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
  for(const f of ['index.html','sw.js'])fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory',f),path.join(staticRoot,'v3-directory',f));
  for(const f of fs.readdirSync(path.join(repo,'ui-spikes/v3-directory/dist'))){const origin=path.join(repo,'ui-spikes/v3-directory/dist',f);if(fs.statSync(origin).isFile())fs.copyFileSync(origin,path.join(staticRoot,'v3-directory/dist',f));}
  fs.copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(staticRoot,'v3-directory/dist/pdf.worker.min.mjs'));
  server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),'--root',root,'--static',staticRoot,'--port',String(port)],{stdio:'ignore'});
  await ready();const key=fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim();
  browser=await (process.env.OCR2MD_TEST_WEBKIT==='1'?webkit:chromium).launch(process.env.OCR2MD_TEST_WEBKIT==='1'?{headless:true}:{channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:900,height:1160}});
  const page=await context.newPage();const errors=[];
  const posts=[];page.on('request',r=>{
    if(r.method()==='POST'&&r.url().includes('/__v3/ir/'))posts.push({url:r.url(),body:r.postData()||''});
  });
  page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',dlg=>dlg.accept());
  await page.goto(base+'/v3-directory/',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('.tabs [role=tab]').first().textContent(),'设置');
  // One Workbench template shell, with previews mounted only for modules
  // that actually have MD/PDF previews. Workspace/Settings are AG + source.
  const templateStructure=await page.evaluate(()=>
    ['workspace','workbench','settings'].map(scene=>{
      const panel=document.getElementById('panel-'+scene);
      const layout=panel.querySelector('.v3-template-layout');
      if(scene==='settings')return {scene,panelClass:true,grid:true,source:true,
        preview:false,previewTabs:0,verticalSplitter:true,horizontalSplitter:false};
      const grid=layout.querySelector(':scope > .workbench-grid-pane');
      const right=layout.querySelector(':scope > .workbench-right-pane');
      return {scene,panelClass:panel.classList.contains('v3-template-panel'),
        grid:!!grid,source:!!right.querySelector('.workbench-source-pane'),
        preview:!!right.querySelector('.workbench-preview-pane'),
        previewTabs:right.querySelectorAll('.workbench-preview-tabs button[role=tab]').length,
        verticalSplitter:!!layout.querySelector(':scope > [role=separator][aria-orientation=vertical]'),
        horizontalSplitter:!!right.querySelector('[role=separator][aria-orientation=horizontal]')};
    }));
  for(const frame of templateStructure){
    assert.equal(frame.panelClass,true,frame.scene+' must retain Workbench shell');
    assert.equal(frame.grid&&frame.source,true,frame.scene+' must mount AG + source');
    assert.equal(frame.verticalSplitter,true,frame.scene+' must retain AG/source splitter');
    const hasPreview=frame.scene==='workbench';
    assert.equal(frame.preview,hasPreview,frame.scene+' preview eligibility');
    assert.equal(frame.previewTabs,hasPreview?2:0,frame.scene+' preview buttons');
    assert.equal(frame.horizontalSplitter,hasPreview,
      frame.scene+' must not reserve a source/preview separator when absent');
  }
  assert.equal(await page.locator('#workspace-source-pane #file-actions').count(),1,
    'file actions remain attached to the directory source, not a third pane');
  assert.equal(await page.locator('#panel-settings > #settings-connection-details').count(),1,
    'Mac authorization is a separate sibling panel, outside the shared settings component');
  assert.equal(await page.locator('#shared-settings-mount #settings-connection-details').count(),0);
  assert.equal(await page.locator('#workspace-top-actions button').count(),4);
  assert.equal(await page.locator('#settings-top-actions button').count(),5);
  assert.deepEqual(await page.locator('#settings-top-actions button').evaluateAll(buttons=>buttons.map(b=>b.id)),
    ['settings-undo','settings-redo','settings-reset','settings-save','']);
  assert.equal(await page.locator('#workbench-ir-header-actions button').count(),4);
  assert.equal(await page.locator('#workbench-clean-actions button').count(),4);
  assert.equal(await page.getByTestId('workspace-template-layout').isVisible(),true);
  const fullSource=await page.evaluate(()=>{
    const pane=document.getElementById('workspace-right-pane');
    const source=document.getElementById('workspace-source-pane');
    return {pane:pane.getBoundingClientRect().height,
      source:source.getBoundingClientRect().height};
  });
  assert.ok(fullSource.source>=fullSource.pane-3,
    'directory source fills its entire right column with no preview gap');
  assert.equal(await page.locator('#panel-workspace .workbench-preview-pane').count(),0);
  assert.equal(await page.locator('#panel-settings .workbench-preview-pane').count(),0);
  assert.equal(await page.getByTestId('tab-workbench').isDisabled(),true);
  assert.equal(await page.locator('#workspace-top-actions button:not(:disabled)').count(),0);
  await page.getByTestId('tab-settings').click();
  assert.equal(await page.locator('#settings-top-actions').isVisible(),true);
  assert.equal(await page.getByTestId('settings-save').isVisible(),true);
  assert.equal(await page.locator('#workspace-top-actions').isHidden(),true);
  assert.equal(await page.getByTestId('settings-template-layout').isVisible(),true);
  await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.ready==='true'
    && document.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:25000});
  assert.equal(await page.locator('#settings-shared laity-source-surface').count(),1);
  assert.equal(await page.locator('#settings-shared .las-grid').isVisible(),true);
  assert.equal(await page.locator('#settings-shared .las-source-col').isVisible(),true);
  await page.locator('#vault-key').fill(key);
  await page.getByTestId('connect-vault').click();await page.getByTestId('tab-workspace').click();
  for(const destination of ['/ocr2md/Book']){
   await page.locator(`[data-open-path="${destination}"]`).waitFor({timeout:30000});
   await page.evaluate(p=>{const b=document.querySelector(`[data-open-path="${p}"]`);
     for(let i=0;i<2;i++){
       b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
       b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
     }
   },destination);
   await page.waitForFunction(p=>document.querySelector('#directory-path')?.textContent?.includes(p.split('/').slice(1).join('/')),
     destination,{timeout:25000});
  }
  await page.getByTestId('set-working-directory').click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:80000});
  const publish=page.getByTestId('ir-publish-chapters');
  assert.equal(await publish.isEnabled(),true,'named chapter boundaries enable Publish even when OCR titles need review');
  assert.equal(fs.existsSync(path.join(book,'chapters')),false);
  await publish.click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('发布成功'),null,{timeout:25000});
  const published=path.join(book,'chapters');
  const names=fs.readdirSync(published).filter(f=>f.endsWith('.md'));
  assert.equal(names.length,2);
  for(const name of names){const data=fs.readFileSync(path.join(published,name),'utf8');assert.ok(data.includes('# Chapter '));}
  assert.equal(fs.readFileSync(path.join(book,'original.pdf')).equals(pdfBefore),true);
  // Published chapters now use real DIRjson provenance, not the old WP4
  // Markdown sidecar. Exercise production AG → source → MD preview → PDF.
  await page.getByTestId('tab-workspace').click();
  await page.getByTestId('set-working-directory').click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('已恢复保存的 DIRjson'),null,{timeout:50000});
  const nav=page.getByTestId('workbench-path-nav');
  await nav.locator('option').filter({hasText:names[0]}).waitFor({state:'attached',timeout:20000});
  await nav.selectOption('/ocr2md/Book/chapters/'+names[0]);
  // PDF tab stays unseen, yet PDF.js metadata + first page geometry must be
  // available via background authenticated Range requests.
  await page.waitForFunction(()=>document.querySelector('#preview-tab-pdf')?.disabled===false
    && document.querySelector('#preview-tab-markdown')?.getAttribute('aria-selected')==='true'
    && document.querySelector('#preview-panel-pdf')?.hidden===true
    && (document.querySelector('#workbench-pdf-canvas')?.getBoundingClientRect().width??0)>100,
    null,{timeout:30000});
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('#workbench-pdf-canvas .pdfViewer .page canvas');
    return canvas&&canvas.width>0&&canvas.height>0;
  },null,{timeout:35000});
  assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true',
    'PDF should preload without opening or covering the Markdown tab');
  const grid=page.getByTestId('workbench-calibration-grid');
  const heading=grid.locator('.v3-clean-heading-cell').first();
  await heading.waitFor({timeout:20000});
  const pairShape=await page.evaluate(()=>({
    count:document.querySelectorAll('.v3-ag-source-pair').length,
    scenes:['v3-workspace-split','workbench-layout','v3-shared-config-layout'].map(
      id=>document.getElementById(id)?.dataset.agSourceScene),
    sourceHosts:[...document.querySelectorAll('.v3-ag-source-editor')].map(e=>e.id),
    gridHosts:[...document.querySelectorAll('.v3-ag-source-grid')].map(e=>e.id),
  }));
  assert.equal(pairShape.count,2,'settings now uses Agent Link shared component, not a third local AG/source pair');
  assert.deepEqual(pairShape.scenes.slice(0,2),['directory','cleaning']);
  assert.deepEqual(pairShape.sourceHosts.sort(),
    ['working-editor','workbench-source','workbench-ir-source'].sort());
  assert.deepEqual(pairShape.gridHosts.sort(),
    ['directory-list','workbench-calibration-grid'].sort());
  // V3 unified CSS and native iOS caret: headings/AG/tags remain navigable,
  // source editors must not use CodeMirror's synthetic drawSelection cursor.
  await page.waitForFunction(()=>Boolean(document.querySelector('#workbench-source .cm-hard-return-marker')));
  const unifiedStyle=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement);
    const source=document.querySelector('#workbench-source .cm-content');
    const top=document.querySelector('#tab-workbench');
    const grid=document.querySelector('#workbench-calibration-grid');
    const previewTab=document.querySelector('#preview-tab-markdown');
    return {nativeCaret:getComputedStyle(source).caretColor,
      nativeUserSelect:getComputedStyle(source).userSelect,
      sourceSyntheticCursor:document.querySelectorAll('#workbench-source .cm-cursorLayer').length,
      hardReturnColor:getComputedStyle(document.querySelector('#workbench-source .cm-hard-return-marker')).color,
      rootColor:root.getPropertyValue('--ocr2md-hard-return-color').trim(),
      accent:root.getPropertyValue('--v3-ui-accent').trim(),
      agAccent:getComputedStyle(grid).getPropertyValue('--ag-accent-color').trim(),
      tagSelected:top.getAttribute('aria-selected'),
      previewTabSelected:previewTab.getAttribute('aria-selected')};
  });
  assert.equal(unifiedStyle.nativeCaret,'rgb(10, 132, 255)');
  assert.equal(unifiedStyle.nativeUserSelect,'text');
  assert.equal(unifiedStyle.sourceSyntheticCursor,0);
  assert.equal(unifiedStyle.rootColor,'#839ab5');
  assert.equal(unifiedStyle.hardReturnColor,'rgb(131, 154, 181)');
  assert.equal(unifiedStyle.accent,unifiedStyle.agAccent);
  assert.equal(unifiedStyle.tagSelected,'true');
  assert.equal(unifiedStyle.previewTabSelected,'true');
  // Exposed settings use JSON as the single draft/save source, not a second
  // hidden state. Changing the color while hard returns are off must stick.
  await page.getByTestId('tab-settings').click();
  assert.equal(await page.locator('#source-hard-return-settings').count(),0);
  const settingsPanel=page.locator('#settings-shared');
  assert.equal(await settingsPanel.evaluate(e=>e.version),'0.1.14');
  const settingsSplitter=settingsPanel.locator('.las-divider');
  assert.equal(await settingsSplitter.isVisible(),true);
  const originalSplit=Number(await settingsSplitter.getAttribute('aria-valuenow'));
  await settingsSplitter.focus();await page.keyboard.press('ArrowRight');
  assert.ok(Number(await settingsSplitter.getAttribute('aria-valuenow'))>=originalSplit+1);
  await settingsPanel.evaluate(e=>e.selectSetting('mdHardReturnColor'));
  assert.equal(await settingsPanel.locator('.las-linked-row').count(),1);
  assert.equal(await settingsPanel.evaluate(e=>e.values.mdShowHardReturns),true);
  assert.equal(await settingsPanel.locator('laity-source-surface').count(),1);
  await setSetting(page,'mdShowHardReturns',false);
  await setSetting(page,'mdHardReturnColor','#ff3b30');
  await page.getByTestId('settings-save').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}').mdHardReturnColor==='#ff3b30');
  await page.getByTestId('tab-workbench').click();
  assert.equal(await page.locator('#workbench-source .cm-hard-return-marker').count(),0);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement)
    .getPropertyValue('--ocr2md-hard-return-color').trim()),'#ff3b30');
  await page.getByTestId('tab-settings').click();
  assert.equal(await settingsPanel.evaluate(e=>e.values.mdShowHardReturns),false);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}')).mdHardReturnColor,'#ff3b30');
  await setSetting(page,'mdShowHardReturns',true);
  await page.getByTestId('settings-save').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')||'{}').mdShowHardReturns===true);
  await page.getByTestId('tab-workbench').click();
  await page.waitForFunction(()=>Boolean(document.querySelector('#workbench-source .cm-hard-return-marker')));
  assert.equal(await page.locator('#workbench-source .cm-hard-return-marker').first().evaluate(node=>getComputedStyle(node).color),'rgb(255, 59, 48)');
  assert.equal(await page.locator('#workbench-source .cm-content').evaluate(node=>getComputedStyle(node).caretColor),'rgb(10, 132, 255)');
  await heading.click();
  await page.waitForFunction(()=>Boolean(document.querySelector('#workbench-source')?.dataset.irBlockId));
  const sourceAnchor=await page.locator('#workbench-source').evaluate(e=>({id:e.dataset.irBlockId,page:e.dataset.irPages}));
  assert.ok(sourceAnchor.id&&sourceAnchor.page==='1','AG heading must resolve saved DIRjson PDF page');
  await page.locator('#workbench-preview .v3-clean-preview-target').waitFor({timeout:10000});
  assert.ok(await page.locator('#workbench-preview .v3-clean-preview-target').first().textContent());
  await page.getByTestId('preview-tab-pdf').click();
  // This fixture is a real, text-based PDF ("Page One" / "Page Two").
  // A rendered canvas alone does not allow selection/copy: PDF.js must create
  // the transparent text layer over the page and expose its actual text nodes.
  await page.waitForFunction(()=>[...document.querySelectorAll(
    '#workbench-pdf-canvas .pdfViewer .page .textLayer')].some(layer=>
      layer.textContent?.includes('Page One')&&layer.querySelector('span')
    ),null,{timeout:18000});
  const selectedPdfText=await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#workbench-pdf-canvas .pdfViewer .page .textLayer span')]
      .find(node=>node.textContent?.includes('Page One'));
    if(!span||!span.firstChild)return '';
    const range=document.createRange();range.selectNodeContents(span);
    const selection=window.getSelection();selection?.removeAllRanges();selection?.addRange(range);
    const copied=selection?.toString()??'';selection?.removeAllRanges();
    return copied;
  });
  assert.ok(selectedPdfText.includes('Page One'),
    'embedded PDF text must be selectable via native browser Selection (textLayerMode=1)');
  await page.locator('#workbench-pdf-canvas .ocr2md-pdf-region-overlay').first().waitFor({timeout:15000});
  const overlay=page.locator('#workbench-pdf-canvas .ocr2md-pdf-region-overlay').first();
  const region=await overlay.boundingBox();
  assert.ok(region&&region.width>0&&region.height>0,'PDF OCR source bbox must be visible');
  // Regression: a PDF.js lazy redraw must not recenter a highlighted title
  // after the reader takes control of the scroll wheel.
  const pdfScroll=page.locator('#workbench-pdf-canvas .pdfViewerContainer');
  const before=await pdfScroll.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));
  assert.ok(before.max>100,'2-page PDF must be scrollable in the test viewport');
  await pdfScroll.hover();
  await page.mouse.wheel(0,before.top<before.max-160?480:-480);
  await page.waitForFunction(previous=>{
    const sc=document.querySelector('#workbench-pdf-canvas .pdfViewerContainer');
    return sc&&Math.abs(sc.scrollTop-previous)>80;
  },before.top,{timeout:8000});
  const userTop=await pdfScroll.evaluate(el=>el.scrollTop);
  await page.waitForTimeout(650); // PDF.js pagechanging and pagerendered settle
  assert.ok(Math.abs((await pdfScroll.evaluate(el=>el.scrollTop))-userTop)<24,
    'PDF must not spring back to highlighted title after manual scrolling');
  await page.getByTestId('preview-tab-markdown').click();
  await page.getByTestId('preview-tab-pdf').click();
  await page.waitForTimeout(450);
  assert.ok(Math.abs((await pdfScroll.evaluate(el=>el.scrollTop))-userTop)<55,
    'reopening the PDF tab must not replay an earlier title focus');
  // An exact PDF OCR region click returns to the same chapter heading.
  await heading.click(); // Fresh explicit title selection is allowed to focus again.
  await page.locator('#workbench-pdf-canvas .ocr2md-pdf-region-overlay').first().waitFor({timeout:12000});
  // No cached Playwright geometry: PDF.js can replace the page overlay
  // between asynchronous paint, focus, and a tool round-trip.
  // PDF.js can replace the OCR overlay DOM during text-layer page repaints;
  // a stale Playwright element locator is not a stable click target. Read
  // the live geometry immediately before the actual browser mouse click.
  let clickedPdfTitle=false;
  for(let attempt=0;attempt<3&&!clickedPdfTitle;attempt++){
    const center=await page.evaluate(()=>{
      const overlay=document.querySelector('#workbench-pdf-canvas .ocr2md-pdf-region-overlay');
      if(!(overlay instanceof HTMLElement))return null;
      overlay.scrollIntoView({block:'center',inline:'center'});
      const r=overlay.getBoundingClientRect();
      return {x:r.left+r.width/2,y:r.top+r.height/2};
    });
    assert.ok(center,'PDF OCR source bbox must remain available');
    await page.mouse.click(center.x,center.y);
    await page.waitForTimeout(220);
    clickedPdfTitle=(await page.locator('#pdf-element-locator-status').textContent()||'').includes('PDF → 章节标题');
  }
  assert.ok(clickedPdfTitle,'PDF canvas/text layer click must still navigate to the chapter title');
  await page.waitForFunction(id=>document.querySelector('#workbench-source')?.dataset.irBlockId===id,sourceAnchor.id);
  await page.getByTestId('preview-tab-markdown').click();
  await page.locator('#workbench-preview h1[data-source-line]').first().click();
  await page.locator('#workbench-preview .v3-clean-preview-target').waitFor({timeout:10000});
  assert.equal(fs.readFileSync(path.join(published,names[0]),'utf8').includes('<!-- ocr2md-ir:block='),true);
  // Back to delimitation before idempotent publish checks.
  await nav.selectOption('/ocr2md/Book');
  await publish.waitFor({state:'visible'});
  await publish.click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('无需覆盖'),null,{timeout:25000});
  // Production chapter-cleaning editor must accept real keyboard changes,
  // keep the AG + rendered MD live, and persist only after explicit Save.
  await nav.selectOption('/ocr2md/Book/chapters/'+names[0]);
  await heading.waitFor({timeout:15000});
  await page.waitForFunction(()=>!document.querySelector('#workbench-path-nav')?.disabled && document.querySelector('#workbench-source .cm-content')?.getAttribute('contenteditable')==='true' && document.querySelector('#workbench-source .cm-content')?.textContent?.includes('Chapter One'),null,{timeout:20000});
  const source=page.locator('#workbench-source .cm-content');
  assert.equal(await source.getAttribute('contenteditable'),'true',
    'cleaning source must be directly editable');
  // AG is a read-only index. A tap navigates the panes but must NOT open
  // editing or seize keyboard focus, even when a title is selected.
  await heading.click();
  assert.equal(await heading.getAttribute('role'),null,'AG title must not masquerade as an edit button');
  assert.equal(await heading.getAttribute('contenteditable'),null);
  assert.equal(await page.evaluate(()=>document.activeElement?.matches('#workbench-source .cm-content')),false,
    'AG click must not move keyboard focus to source');
  await page.keyboard.type('X');
  assert.ok(!(await source.textContent()).includes('Chapter OneX'),
    'typing with AG focused must never edit the Markdown source');
  assert.equal(await page.getByTestId('clean-save').isDisabled(),true,
    'AG focus alone cannot dirty the chapter');
  // Edit in the SOURCE pane itself: select the entire Markdown heading line.
  await source.locator('.cm-line').filter({hasText:'# Chapter One'}).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  assert.equal(await page.evaluate(()=>document.activeElement?.matches('#workbench-source .cm-content')),true,
    'clicking source must keep focus in CodeMirror after AG synchronization');
  await page.keyboard.type('# Chapter One corrected');
  await page.waitForFunction(()=>document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Chapter One corrected'),null,{timeout:5500});
  assert.ok((await page.locator('#workbench-preview').textContent()).includes('Chapter One corrected'));
  assert.equal(await page.getByTestId('clean-save').isEnabled(),true);
  assert.ok(!fs.readFileSync(path.join(published,names[0]),'utf8').includes('Chapter One corrected'),
    'unsaved edits must not hit the disk');
  await page.getByTestId('clean-undo').click();
  await page.waitForFunction(()=>!document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Chapter One corrected'));
  await page.getByTestId('clean-redo').click();
  await page.waitForFunction(()=>document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Chapter One corrected'));
  // Add another heading, then remove it through native Backspace. The AG must
  // not recreate a removed # or revive a deleted heading from the old DIRjson.
  await source.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## Newly inserted review heading');
  await page.waitForFunction(()=>document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Newly inserted review heading'));
  await source.locator('.cm-line').filter({hasText:'## Newly inserted review heading'}).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Backspace');
  await page.waitForFunction(()=>!document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Newly inserted review heading'));
  await page.getByTestId('clean-undo').click();
  await page.waitForFunction(()=>document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Newly inserted review heading'),null,{timeout:6000});
  await page.getByTestId('clean-save').click();
  await page.waitForFunction(()=>document.querySelector('#clean-status')?.textContent?.includes('CAS 校验通过'),null,{timeout:25000});
  const savedChapter=fs.readFileSync(path.join(published,names[0]),'utf8');
  assert.ok(savedChapter.includes('Chapter One corrected')&&savedChapter.includes('Newly inserted review heading'));
  await nav.selectOption('/ocr2md/Book');
  await nav.selectOption('/ocr2md/Book/chapters/'+names[0]);
  await page.waitForFunction(()=>!document.querySelector('#workbench-path-nav')?.disabled && document.querySelector('#workbench-source .cm-content')?.getAttribute('contenteditable')==='true' && document.querySelector('#workbench-calibration-grid')?.textContent?.includes('Newly inserted review heading'),null,{timeout:20000});
  assert.equal(await page.getByTestId('clean-save').isDisabled(),true,'reopened saved chapter is clean');
  await nav.selectOption('/ocr2md/Book');
  await publish.waitFor({state:'visible'});
  await publish.click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('新版已覆盖旧章节'),null,{timeout:35000});
  const republished=fs.readFileSync(path.join(published,names[0]),'utf8');
  assert.ok(!republished.includes('Newly inserted review heading'),
    'explicit new publication replaces edited old chapter');
  assert.ok(republished.includes('# Chapter One'),
    'new publisher re-projects from saved DIRjson');
  const backupRoot=path.join(book,'.ocr2md','chapter-backups');
  const backupNames=fs.readdirSync(backupRoot).filter(x=>!x.startsWith('.'));
  assert.equal(backupNames.length,1,'exactly one snapshot backup for overwritten directory');
  const backedUp=path.join(backupRoot,backupNames[0]);
  assert.ok(fs.readFileSync(path.join(backedUp,names[0]),'utf8').includes('Newly inserted review heading'),
    'previous human edits remain recoverable');
  assert.equal(fs.readFileSync(path.join(book,'original.pdf')).equals(pdfBefore),true);
  // A repeated click of an unchanged Obsidian publication is idempotent.
  await publish.click();
  await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('无需覆盖'),null,{timeout:30000});
  assert.equal(fs.readdirSync(backupRoot).length,1,'idempotent retry creates no redundant backups');
  if(process.env.OCR2MD_TEST_PUBLICATION_ONLY==='1'){
    assert.deepEqual(errors,[]);
    assert.ok(posts.filter(p=>p.url.endsWith('/__v3/ir/publish-chapters')).length>=4);
    console.log('V3_PUBLISH_OVERWRITE_BACKUP_PASS',JSON.stringify({
      engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',
      published:names,oldEditsBackedUp:true,newFilesReadBack:true,
      pdfUnchanged:true,repeatIsIdempotent:true,realVaultUntouched:true}));
    await context.close();return;
  }
  // Per-scene overrides flow through the SAME AG/source pair presentation.
  // They cannot make a read-only directory source editable or change saved MD.
  await page.getByTestId('tab-settings').click();
  const scenes=await page.evaluate(()=>structuredClone(
    JSON.parse(localStorage.getItem('ocr2md-v3-directory-settings-v1')).agSourceScenes));
  scenes.directory.sourceFontSize=19;
  scenes.settings.sourceFontSize=18;
  scenes.cleaning.sourceFontSize=22;
  scenes.cleaning.hardReturns=true;
  scenes.cleaning.hardReturnColor='#ca55ab';
  scenes.boundary.sourceFontSize=19;
  scenes.boundary.hardReturns=false;
  scenes.boundary.hardReturnColor='#00ff00';
  await setSetting(page,'agSourceScenes',scenes);
  await page.getByTestId('settings-save').click();
  assert.equal(await settingsPanel.evaluate(e=>e.style.getPropertyValue('--las-source-font-size')),'18px');
  assert.equal(await page.locator('#working-editor .cm-editor').evaluate(e=>getComputedStyle(e).fontSize),'19px');
  assert.equal(await page.locator('#working-editor .cm-content').getAttribute('contenteditable'),'false');
  await page.getByTestId('tab-workbench').click();
  await nav.selectOption('/ocr2md/Book/chapters/'+names[0]);
  await page.waitForFunction(()=>document.querySelector('#workbench-layout')?.dataset.agSourceScene==='cleaning'
    && document.querySelector('#workbench-source .cm-content')?.getAttribute('contenteditable')==='true');
  await page.waitForFunction(()=>{
    const editor=document.querySelector('#workbench-source .cm-editor');
    return editor && getComputedStyle(editor).fontSize==='22px';
  },null,{timeout:12000});
  assert.equal(await page.locator('#workbench-source .cm-editor').evaluate(e=>getComputedStyle(e).fontSize),'22px');
  const scale=await page.locator('#workbench-layout').evaluate(e=>getComputedStyle(e)
    .getPropertyValue('--v3-heading-1-absolute-size').trim());
  assert.equal(scale,String(22*2.125)+'px',
    'AG absolute heading sizes must scale with the selected scene source font');
  assert.equal(await page.locator('#workbench-source .cm-hard-return-marker').first().evaluate(e=>getComputedStyle(e).color),'rgb(202, 85, 171)');
  await nav.selectOption('/ocr2md/Book');
  await page.waitForFunction(()=>document.querySelector('#workbench-layout')?.dataset.agSourceScene==='boundary');
  assert.equal(await page.locator('#workbench-ir-source .cm-editor').evaluate(e=>getComputedStyle(e).fontSize),'19px');
  assert.equal(await page.locator('#workbench-ir-source .cm-hard-return-marker').count(),0);
  assert.ok(!fs.readFileSync(path.join(published,names[0]),'utf8').includes('Newly inserted review heading'));
  assert.deepEqual(errors,[]);
  const publishPosts=posts.filter(post=>post.url.endsWith('/__v3/ir/publish-chapters'));
  assert.ok(publishPosts.length>=4);
  assert.ok(publishPosts.every(post=>post.body.length<1024&&!post.body.includes('archiveBase64')),
    'publication must not upload a large ZIP, send only book + saved hashes');
  console.log('V3_PUBLISH_CHAPTERS_BROWSER_PASS',JSON.stringify({engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium',files:names,sourceGeneration:generation,firstPublish:true,idempotent:true,editsBackedUp:true,overwriteEffective:true,realBookUntouched:true}));
  await context.close();
 }catch(error){console.error(error);process.exitCode=1;}
 finally{if(browser)await browser.close().catch(()=>{});if(server){server.kill();}fs.rmSync(temp,{recursive:true,force:true});}
})();
