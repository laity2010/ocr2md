/** V3 chapter cleaning: real AG Grid + real MD editor in a disposable Mac Vault.
 * No user vault writes, no publishing, and no production server restart. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const repo=path.resolve(__dirname,'../../..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ocr2md-heading-hierarchy-'));
const root=path.join(temp,'ocr2md'),book=path.join(root,'ocr2md/Book');
const staticRoot=path.join(temp,'site');
const port=40000+parseInt(crypto.createHash('sha256').update(temp).digest('hex').slice(0,7),16)%20000;
const base=`http://127.0.0.1:${port}`;
const fixtureMd=['---','title: Clean test','---','# Top title','## Second title','### Third title',
 '#### Fourth title','##### Fifth title','###### Sixth title','```md','# This is code, not a heading','```',
 'A paragraph that is not a heading.',
 '', 'A **bold** and *italic* paragraph with a [link](https://example.com) and a footnote[^1].',
 '', '> Regular quoted source.',
 '', '> [!note] HTML', '> <p>V2 HTML callout body</p>',
 '', '- First list item', '- Second list item',
 '', '| Key | Value |', '| :--- | ---: |', '| Foo | Bar |',
 '', '$x^2 + y^2 = z^2$', '', '$$\\frac{a}{b}$$',
 '', '![diagram](./diagram.png)',
 '', '<div class="chapter-html"><span>Inline HTML preview</span></div>',
 '', '[^1]: A footnote explanation.',
 '', '```math', String.raw`L_t = \frac{TA_t-Cash_t}{Equity_t}`, '```',
 '', '~~~LaTeX', String.raw`\frac{a}{b}`, '~~~',
 '', '```math', String.raw`\frac{bad`, '```',
 '', '```js', String.raw`const latex = "\frac{1}{2}";`, '```',
 '', '```html',
 '<table><tr><td rowspan="2">Stock/Fund Measure</td><td colspan="2">A. Sample Distribution of Sharpe Ratios</td></tr><tr><td>Median</td><td>95th Percentile</td></tr></table>',
 '```',
 '', '```html',
 '<pre><code>HTML syntax example, not a table</code></pre>',
 '```',
 '', '```js',
 'const markup = "<table><tr><td>just code</td></tr></table>";',
 '```',
 '', '~~~HTML',
 '<table><tr><td><img src="https://example.com/tracking.png" onerror="alert(1)">Safe cell</td><td><a href="https://example.org/">link</a></td></tr></table>',
 '~~~',
 '', '```html',
 '<table><tr><td><script>alert(1)</script>Safety cell</td></tr></table>',
 '```',
 ''].join('\n');
const realPath=process.env.OCR2MD_TEST_REAL_FENCED_TABLE_PATH;
const mediaProgressFixture=[
 '[图片来源 1（仅链接，不自动载入）](https://cdn.example.org/good.png?sig=HIDDEN_TEST_TOKEN)',
 '[图片来源 2（仅链接，不自动载入）](https://cdn.example.org/missing.png)',
 '[图片来源 3（仅链接，不自动载入）](https://cdn.example.org/conflict.png)',
 '[图片来源 4（仅链接，不自动载入）](https://cdn.example.org/not-started.png)',
].join('\n');
const md=realPath?fs.readFileSync(realPath,'utf8'):
  process.env.OCR2MD_TEST_MEDIA_PROGRESS==='1'?fixtureMd+'\n'+mediaProgressFixture:fixtureMd;
(async()=>{
 let browser,server;
 try{
  fs.mkdirSync(path.join(book,'chapters'),{recursive:true});
  const {testPdf}=require('./fixturePdf.cjs');
  fs.writeFileSync(path.join(book,'original.pdf'),testPdf());
  const chapterName='01 Clean chapter.md';
  fs.writeFileSync(path.join(book,'chapters',chapterName),md);
  if(process.env.OCR2MD_TEST_LEGACY_NORMALIZE_ONLY==='1'){
    const marker={kind:'ocr2md/editable-chapters-publication',schemaVersion:1,
      book:'/ocr2md/Book',sourceGeneration:'0'.repeat(64),
      files:{[chapterName]:crypto.createHash('sha256').update(md).digest('hex')}};
    fs.writeFileSync(path.join(book,'chapters','.ocr2md-published.v1.json'),JSON.stringify(marker));
  }
  fs.mkdirSync(path.join(staticRoot,'v3-directory','dist'),{recursive:true});
  for(const f of ['index.html','sw.js'])fs.copyFileSync(path.join(repo,'ui-spikes/v3-directory',f),path.join(staticRoot,'v3-directory',f));
  for(const f of fs.readdirSync(path.join(repo,'ui-spikes/v3-directory/dist'))){
   const file=path.join(repo,'ui-spikes/v3-directory/dist',f);
   if(fs.statSync(file).isFile())fs.copyFileSync(file,path.join(staticRoot,'v3-directory/dist',f));
  }
  fs.copyFileSync(path.join(repo,'ui-spikes/v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs'),path.join(staticRoot,'v3-directory/dist/pdf.worker.min.mjs'));
  server=spawn('python3',[path.join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),'--root',root,'--static',staticRoot,'--port',String(port)],{stdio:'ignore'});
  for(let i=0;i<150;i++){
   try{const response=await fetch(base+'/__v3/fs?op=status');if(response.ok)break;}catch{}
   if(i===149)throw Error('fixture server not ready');
   await new Promise(resolve=>setTimeout(resolve,160));
  }
  const accessKey=fs.readFileSync(path.join(temp,'private/access-key'),'utf8').trim();
  browser=await (process.env.OCR2MD_TEST_WEBKIT==='1'?webkit:chromium).launch(
    process.env.OCR2MD_TEST_WEBKIT==='1'?{headless:true}:{channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:process.env.OCR2MD_TEST_IPAD_MENU==='1'?{width:1024,height:768}:{width:1100,height:900},
    ...(process.env.OCR2MD_TEST_MEDIA_PROGRESS==='1'?{serviceWorkers:'block'}:{}),
    ...(process.env.OCR2MD_TEST_IPAD_MENU==='1'?{hasTouch:true}: {})});
  // Fixed Shared Settings assets from the local, deployed Agent Link source:
  // external CDN latency must not make the actual chapter UIC nondeterministic.
  const network=path.resolve(repo,'../agent-link-monitor/web');
  await page.route('https://agent-link.laity.bid/**',async route=>{
    const name=new URL(route.request().url()).pathname;
    const asset=path.resolve(network,'.'+name);
    if(!asset.startsWith(network+'/')||!fs.existsSync(asset))return route.continue();
    const ext=path.extname(asset);
    await route.fulfill({status:200,body:fs.readFileSync(asset),
      contentType:ext==='.css'?'text/css':ext==='.woff2'?'font/woff2':
        ext==='.json'?'application/json':'text/javascript',
      headers:{'access-control-allow-origin':'*'}});
  });
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(String(error)));
  page.on('request',request=>{if(request.url().includes('/__v3/')&&request.method()!=='GET')writes.push(request.method()+':'+request.url());});
  await page.goto(base+'/v3-directory/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#tab-settings')?.dataset.settingsState!=='pending',
    null,{timeout:16000}).catch(async e=>{
    console.error('STARTUP_UIC_DIAG',JSON.stringify({errors, status:await page.locator('#status').textContent(),
      gate:await page.locator('#tab-settings').getAttribute('data-settings-state'),
      connection:await page.locator('#workspace-connection').textContent(),
      resources:await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('settings-panel')||x.name.includes('font')).map(x=>x.name.slice(0,170)))}));
    throw e;
  });
  await page.getByTestId('tab-settings').click();
  await page.locator('#vault-key').fill(accessKey);
  await page.getByTestId('connect-vault').click();
  await page.getByTestId('tab-workspace').click();
  for(const destination of ['/ocr2md/Book']){
   await page.locator(`[data-open-path="${destination}"]`).waitFor({timeout:30000});
   await page.evaluate(p=>{const node=document.querySelector(`[data-open-path="${p}"]`);
    for(let i=0;i<2;i++){
     node.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
     node.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));
    }
   },destination);
   await page.waitForFunction(p=>document.querySelector('#directory-path')?.textContent?.includes(p.split('/').slice(1).join('/')),
    destination,{timeout:20000});
  }
  await page.getByTestId('set-working-directory').click();
  const nav=page.getByTestId('workbench-path-nav');
  await nav.locator('option').filter({hasText:chapterName}).waitFor({state:'attached',timeout:30000});
  await nav.selectOption('/ocr2md/Book/chapters/'+chapterName);
  writes.length=0; // Ignore authentication requests; audit only cleaning interactions.
  if(process.env.OCR2MD_TEST_MEDIA_PROGRESS==='1'){
    let mockText=md;
    const attempted=[];
    const allOk=process.env.OCR2MD_TEST_MEDIA_ALL_OK==='1';
    const recoverConflict=process.env.OCR2MD_TEST_MEDIA_RESYNC==='1';
    const chapterFile=path.join(book,'chapters',chapterName);
    const currentFile=()=>{
      const stat=fs.statSync(chapterFile,{bigint:true});
      return {workspaceId:'obsidian-ocr2md',path:'/ocr2md/Book/chapters/'+chapterName,
        kind:'file',size:Number(stat.size),nodeId:`inode:${stat.dev}:${stat.ino}`,
        revision:`${stat.dev}:${stat.ino}:${stat.mtimeNs}:${stat.ctimeNs}:${stat.size}`};
    };
    await page.route('**/__v3/chapters/media/download',async route=>{
      const body=route.request().postDataJSON();
      const name=new URL(body.sourceUrl).pathname.split('/').at(-1);
      attempted.push(name);
      if(name==='good.png'||allOk||(recoverConflict&&name==='not-started.png')){
        await new Promise(resolve=>setTimeout(resolve,650));
        const ordinal=['good.png','missing.png','conflict.png','not-started.png'].indexOf(name)+1;
        mockText=mockText.replace(
          `[图片来源 ${ordinal}（仅链接，不自动载入）](${body.sourceUrl})`,
          `![图片来源 ${ordinal}](imgs/${name})`);
        const sha256=crypto.createHash('sha256').update(mockText).digest('hex');
        if(recoverConflict)fs.writeFileSync(chapterFile,mockText,'utf8');
        await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
          saved:true,path:body.book+'/chapters/'+body.filename,
          file:recoverConflict?currentFile():{nodeId:body.nodeId,revision:body.expectedRevision},
          workingText:mockText,sha256,localPath:'imgs/'+name,
          fileName:name,mediaSizeBytes:8,mimeType:'image/png'})});
      }else{
        if(recoverConflict&&name==='conflict.png'){
          const stat=fs.statSync(chapterFile);
          fs.utimesSync(chapterFile,stat.atime,new Date(stat.mtimeMs+2500));
        }
        await route.fulfill({status:name==='missing.png'?502:409,contentType:'application/json',
          body:JSON.stringify(name==='missing.png'
            ?{code:'EOFFLINE',error:'图片来源获取或保存失败：媒体下载失败：HTTP 404'}
            :{code:'ECONFLICT',error:'章节 CAS 版本已变化，拒绝覆盖'})});
      }
    });
    const select=page.getByTestId('wb-clean-modules');
    await select.selectOption('媒体');
    assert.equal(await page.getByTestId('wb-media-download-progress').count(),0);
    assert.equal(await page.getByTestId('wb-media-download-report').count(),0);
    await page.getByRole('columnheader',{name:'下载状态'}).waitFor({timeout:15000});
    assert.equal(await page.getByRole('columnheader',{name:'下载状态'}).count(),1);
    assert.equal(await page.getByRole('columnheader',{name:'失败原因'}).count(),1);
    const states=page.locator('#workbench-calibration-grid [data-media-download-state]');
    const reasons=page.locator('#workbench-calibration-grid [data-media-download-reason]');
    await page.waitForFunction(()=>[...document.querySelectorAll(
      '#workbench-calibration-grid [data-media-download-state]')]
      .some(item=>item.textContent?.trim()==='未下载'),null,{timeout:18000});
    const initial=await states.allTextContents();
    assert.ok(initial.includes('未下载'));
    await page.evaluate(()=>{
      const node=document.querySelector('#v3-activity-summary [data-module-status="workbench"]');
      window.__ocr2mdMediaProgressSamples=[];
      new MutationObserver(()=>window.__ocr2mdMediaProgressSamples.push({
        level:node.dataset.level,text:node.querySelector('[data-activity-value]')?.textContent,
        visible:getComputedStyle(node).display!=='none'
      })).observe(node,{attributes:true,childList:true,characterData:true,subtree:true});
    });
    await page.getByTestId('wb-clean-download-media').click();
    await page.waitForFunction(flags=>{
      const item=document.querySelector('#v3-activity-summary [data-module-status="workbench"]');
      return item?.dataset.summary?.includes('未处理 '+(flags.ok||flags.recover?'0':'1'))&&
        item?.dataset.summary?.includes(flags.ok||flags.recover?'已结束':'已中止');
    },{ok:allOk,recover:recoverConflict},{timeout:40000}).catch(async err=>{
        console.error('MEDIA_PROGRESS_DIAG',JSON.stringify({
          attempted,errors,states:await states.allTextContents(),
          reasons:await reasons.allTextContents(),
          activity:await page.locator('#v3-activity-summary [data-module-status="workbench"]').getAttribute('data-summary')}));
        throw err;
      });
    assert.deepEqual(attempted,allOk||recoverConflict?
      ['good.png','missing.png','conflict.png','not-started.png']:
      ['good.png','missing.png','conflict.png']);
    const logs=await page.evaluate(()=>window.__ocr2mdMediaProgressSamples);
    assert.ok(logs.some(x=>x.level==='busy'&&x.text?.includes('1/4')),
      'running progress appears in the top status bar');
    const activity=page.locator('#v3-activity-summary [data-module-status="workbench"]');
    assert.equal(await activity.isVisible(),true);
    assert.equal(await activity.getAttribute('data-level'),allOk?'ready':'error');
    assert.match(await activity.getAttribute('data-summary'),allOk?
      /成功 4，失败 0，未处理 0/:recoverConflict?
      /成功 2，失败 2，未处理 0/:/成功 1，失败 2，未处理 1/);
    const outcomes=await states.allTextContents();
    assert.equal(outcomes.filter(x=>x==='已下载').length,allOk?4:recoverConflict?2:1);
    assert.equal(outcomes.filter(x=>x==='失败').length,allOk?0:2);
    assert.equal(outcomes.filter(x=>x==='未处理').length,allOk||recoverConflict?0:1);
    const rowReasons=await reasons.allTextContents();
    if(!allOk){
      assert.ok(rowReasons.some(x=>x.includes('HTTP 404')));
      assert.ok(rowReasons.some(x=>x.includes('CAS')));
      if(recoverConflict)
        assert.ok(rowReasons.some(x=>x.includes('章节正文未变')),
          'metadata-only conflict must be recovered and recorded in AG');
    }
    assert.ok(!rowReasons.join(' ').includes('HIDDEN_TEST_TOKEN'));
    assert.equal(await page.getByTestId('wb-clean-download-media').isEnabled(),!allOk);
    await select.selectOption('表格');
    assert.equal(await activity.isHidden(),true,'completed media status must not leak into another module');
    await select.selectOption('媒体');
    assert.equal(await activity.isVisible(),true,'returning to media shows the last task status');
    assert.equal(fs.readFileSync(chapterFile,'utf8'),recoverConflict?mockText:md);
    assert.deepEqual(errors,[]);
    console.log(recoverConflict?'V3_MEDIA_CONFLICT_SAFE_CONTINUATION_PASS':'V3_MEDIA_PROGRESS_AG_COLUMNS_PASS',JSON.stringify({
      engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',
      attempted,success:allOk?4:recoverConflict?2:1,failed:allOk?0:2,
      unprocessed:allOk||recoverConflict?0:1,
      topStatus:true,agReasons:true}));
    return;
  }
  if(process.env.OCR2MD_TEST_CLEAN_TOOLBAR_ONLY==='1'){
    const menu=page.getByTestId('wb-clean-modules');
    const rows=page.locator('#workbench-calibration-grid .ag-row');
    await menu.waitFor({state:'visible',timeout:12000});
    assert.equal(await menu.evaluate(n=>n.tagName),'SELECT','native Safari menu');
    assert.deepEqual(await menu.locator('option').evaluateAll(options=>
      options.map(o=>[o.value,o.textContent.trim()])),[
        ['章节标题','章节清洗 · 章节标题'],['媒体','章节清洗 · 媒体'],
        ['表格','章节清洗 · 表格'],['LaTeX','章节清洗 · LaTeX']
      ]);
    assert.equal(await menu.inputValue(),'章节标题');
    assert.equal(await page.locator('#panel-workbench').getAttribute('data-work-mode'),'cleaning');
    assert.equal(await menu.evaluate(node=>{
      const option=node.options[0],selectStyle=getComputedStyle(node),optionStyle=getComputedStyle(option);
      return selectStyle.colorScheme==='dark'&&optionStyle.color!==optionStyle.backgroundColor;
    }),true,'native Safari picker options have nontransparent contrasting colors');
    assert.equal(await menu.evaluate(node=>{
      const left=node.getBoundingClientRect().left;
      return [...node.parentElement.children]
        .filter(e=>!e.hidden&&getComputedStyle(e).display!=='none')
        .every(e=>e===node||e.getBoundingClientRect().left>=left);
    }),true,'native module select is first on the AG toolbar');
    assert.equal(await page.locator('#wb-clean-normalize-ob').count(),0);
    const invisible=async()=>{for(const id of ['ir-heading-filters','ir-sequence-start-control'])
      assert.equal(await page.locator('#'+id).isHidden(),true,id+' is delimitation-only');};
    await invisible();
    assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isVisible(),true);
    assert.equal(await page.getByTestId('wb-clean-download-media').isHidden(),true);
    assert.equal(await rows.count(),6);
    await menu.selectOption('媒体');
    await page.waitForFunction(()=>document.querySelectorAll('#workbench-calibration-grid .ag-row').length===1);
    assert.equal(await menu.inputValue(),'媒体');
    await invisible();
    assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isHidden(),true);
    assert.equal(await page.getByTestId('wb-clean-download-media').isVisible(),true);
    assert.equal(await page.getByTestId('wb-clean-download-media').isDisabled(),true);
    // Regression for the iPad screenshot: an async IR stage render can reset
    // hidden=false after cleaning opens. The mode boundary must win anyway.
    await page.evaluate(()=>{
      for(const id of ['ir-heading-filters','ir-sequence-start-control','ir-ocr-source-choice'])
        document.getElementById(id).hidden=false;
    });
    for(const id of ['ir-heading-filters','ir-sequence-start-control','ir-ocr-source-choice'])
      assert.equal(await page.locator('#'+id).isVisible(),false,id+' may not leak from IR');
    await page.evaluate(()=>{
      for(const id of ['ir-heading-filters','ir-sequence-start-control','ir-ocr-source-choice'])
        document.getElementById(id).hidden=true;
    });
    await menu.selectOption('表格');
    await page.waitForFunction(()=>document.querySelectorAll('#workbench-calibration-grid .ag-row').length===3);
    assert.equal(await menu.inputValue(),'表格');
    await invisible();
    assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isHidden(),true);
    assert.equal(await page.getByTestId('wb-clean-download-media').isHidden(),true);
    await menu.selectOption('LaTeX');
    await page.waitForFunction(()=>document.querySelectorAll('#workbench-calibration-grid .ag-row').length>=4);
    assert.equal(await menu.inputValue(),'LaTeX');
    await invisible();
    assert.equal(await page.getByTestId('wb-clean-download-media').isHidden(),true);
    await menu.selectOption('章节标题');
    assert.equal(await rows.count(),6);
    assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isVisible(),true);
    await invisible();
    assert.deepEqual(writes,[],'module changes must not write to the vault');
    assert.deepEqual(errors,[]);
    console.log('V3_CLEAN_MODULE_TOOLBAR_PASS',JSON.stringify({
      media:1,tables:3,engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',
      iPadTouch:process.env.OCR2MD_TEST_IPAD_MENU==='1',writes:0,normalizationButton:false}));
    return;
  }
  if(process.env.OCR2MD_TEST_LEGACY_NORMALIZE_ONLY==='1'){
    const button=page.getByTestId('wb-clean-normalize-ob');
    await button.waitFor({state:'visible'});
    await page.waitForFunction(()=>!document.getElementById('wb-clean-normalize-ob')?.disabled);
    const current=fs.readFileSync(path.join(book,'chapters',chapterName),'utf8');
    assert.equal(current,md);
    page.once('dialog',dialog=>dialog.accept());
    await button.click();
    await page.waitForFunction(()=>document.getElementById('clean-save')?.disabled===false);
    assert.equal(await button.isDisabled(),true,'normalization is idempotent within one document');
    assert.equal(await page.getByTestId('clean-undo').isEnabled(),true);
    assert.equal(fs.readFileSync(path.join(book,'chapters',chapterName),'utf8'),md,
      'normalization first stages draft; user file untouched');
    await page.getByTestId('clean-undo').click();
    await page.waitForFunction(()=>!document.getElementById('wb-clean-normalize-ob')?.disabled);
    assert.equal(await page.getByTestId('clean-save').isDisabled(),true);
    await page.getByTestId('clean-redo').click();
    assert.equal(await button.isDisabled(),true);
    assert.equal(await page.getByTestId('clean-save').isEnabled(),true);
    await page.getByTestId('clean-save').click();
    await page.waitForFunction(()=>document.getElementById('clean-status')?.textContent?.includes('章节已保存（CAS 校验通过）'),null,{timeout:20000}).catch(async e=>{
      console.error('NORMALIZE_SAVE_DIAG',JSON.stringify({status:await page.getByTestId('clean-status').textContent(),errors,writes}));
      throw e;
    });
    const saved=fs.readFileSync(path.join(book,'chapters',chapterName),'utf8');
    assert.ok(saved.includes('$$\n'),'native Obsidian display math');
    assert.equal(saved.includes('```math'),false);
    assert.equal(saved.includes('```html'),false);
    assert.ok(saved.includes('<table>'));
    assert.equal(saved.split('\n').length,md.split('\n').length,
      'physical chapter source-line anchors preserved');
    assert.ok(saved.includes('ocr2md-latex-pending'),
      'table-contained TeX must remain visible and editable');
    assert.ok(writes.some(w=>w.includes('/__v3/chapters/commit')),
      'explicit CAS save must run after manual confirmation');
    assert.equal(writes.filter(w=>w.includes('/__v3/chapters/commit')).length,1);
    // A newly re-opened published chapter, not just the in-memory draft,
    // must render normal Obsidian table/math without the MinerU fence shim.
    await nav.selectOption('/ocr2md/Book');
    await page.waitForFunction(()=>document.querySelector('#workbench-path-nav')?.value==='/ocr2md/Book');
    await nav.selectOption('/ocr2md/Book/chapters/'+chapterName);
    await page.waitForFunction(()=>document.querySelector('#workbench-preview')?.querySelectorAll('table').length===7
      && document.querySelector('#workbench-preview')?.querySelectorAll('.katex-display').length>=12,null,{timeout:23000});
    const reopened=await page.getByTestId('workbench-preview').evaluate(root=>({
      tables:root.querySelectorAll('table').length,
      math:root.querySelectorAll('.katex-display').length,
      legacyMath:root.querySelectorAll('.ocr2md-fenced-math').length,
      codeFences:[...root.querySelectorAll('pre code')].filter(e=>e.textContent?.includes('\\mathsf')).length,
    }));
    assert.deepEqual(reopened,{tables:7,math:12,legacyMath:0,codeFences:0});
    assert.equal(await button.isDisabled(),true,'reopened normalized chapter has no MinerU fences');
    assert.equal(await page.getByTestId('clean-save').isDisabled(),true,'reopened file is clean');
    assert.deepEqual(errors,[]);
    console.log('V3_LEGACY_CHAPTER_OBSIDIAN_NORMALIZATION_PASS',JSON.stringify({
      engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',
      undoRedo:true,sourceLinesPreserved:true,explicitSave:true,
      oldChapterPreservedUntilSave:true,pendingEquationsKept:true,
      previewUpdated:true,reopened}));
    return;
  }
  if(process.env.OCR2MD_TEST_CANONICAL_ONLY==='1'){
    const preview=page.getByTestId('workbench-preview');
    await page.waitForFunction(()=>document.querySelectorAll('#workbench-preview table').length>=7,null,{timeout:40000});
    const r=await preview.evaluate(root=>({
      tables:root.querySelectorAll('table').length,
      katex:root.querySelectorAll('.katex-display').length,
      fractions:root.querySelectorAll('.mfrac').length,
      snippets:root.querySelectorAll('pre code').length,
      imageLinks:[...root.querySelectorAll('a')].filter(a=>a.textContent?.includes('仅链接')).length,
      uploadedImages:root.querySelectorAll('img').length,
    }));
    assert.equal(r.tables,7,'all Obsidian HTML tables native');
    assert.ok(r.katex>=12,'Obsidian $$ math renders natively with V2 renderer');
    assert.ok(r.fractions>0);
    assert.equal(r.snippets,0,'no MinerU HTML or math code fences survive');
    assert.ok(r.imageLinks>=12);
    assert.equal(r.uploadedImages,0,'remote images remain inert until downloaded');
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log('V3_OBSIDIAN_CANONICAL_PREVIEW_PASS',JSON.stringify({
      engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',...r}));
    return;
  }
  if(realPath){
    const preview=page.getByTestId('workbench-preview');
    await page.waitForFunction(()=>document.querySelectorAll('#workbench-preview table').length>=7,null,{timeout:50000});
    const actual=await preview.evaluate(root=>({
      tableCount:root.querySelectorAll('table').length,
      firstTable:root.querySelector('table')?.innerText?.slice(0,110),
      firstLine:root.querySelector('.md-html-block:has(table)')?.dataset.sourceLine,
      codeFences:root.querySelectorAll('pre>code').length,
      imgCount:root.querySelectorAll('img').length,
      remoteImgCount:[...root.querySelectorAll('img')].filter(img=>/^https?:\/\//i.test(img.getAttribute('src')||'')).length,
      sourceLinks:[...root.querySelectorAll('a')].filter(a=>a.textContent?.includes('仅链接')).length,
    }));
    const formulas=await preview.evaluate(root=>({
      fenceMath:root.querySelectorAll('.ocr2md-fenced-math').length,
      nativeMath:root.querySelectorAll('.katex-display').length,
      katex:root.querySelectorAll('.ocr2md-fenced-math .katex-display').length,
      errors:root.querySelectorAll('.ocr2md-fenced-math-error').length,
      firstMathLine:root.querySelector('.ocr2md-fenced-math')?.closest('[data-source-line]')?.getAttribute('data-source-line'),
      firstHasFraction:!!root.querySelector('.ocr2md-fenced-math .mfrac'),
      mathCodeFences:[...root.querySelectorAll('pre code')].filter(c=>c.textContent?.includes('\\mathsf')).length,
    }));
    if(formulas.fenceMath){
      assert.equal(formulas.fenceMath,12,'all twelve legacy Buffett math fences must render');
      assert.equal(formulas.katex,12);
      assert.equal(formulas.errors,0);
      assert.equal(formulas.firstMathLine,'127');
      assert.equal(formulas.firstHasFraction,true);
      assert.equal(formulas.mathCodeFences,0);
    }else{
      assert.ok(formulas.nativeMath>=12,'published Obsidian math renders without MinerU fences');
    }
    assert.equal(actual.tableCount,7,'all seven original Buffett tables must render');
    assert.ok(actual.firstTable.includes('Stock/Fund Measure'));
    assert.equal(actual.firstLine,formulas.fenceMath?'86':'85','source-line anchors must follow the current published MD representation');
    assert.ok(actual.sourceLinks>=7,'original table/figure provenance links remain');
    assert.equal(actual.remoteImgCount,0,'preview must not automatically fetch remote images');
    if(process.env.OCR2MD_TEST_MEDIA_LATEX_MODULES==='1'){
      const menu=page.getByTestId('wb-clean-modules');
      assert.equal(await page.locator('#wb-clean-normalize-ob').count(),0,
        'Obsidian normalization is handled at publish time, not a cleaning button');
      assert.equal(await menu.inputValue(),'章节标题');
      assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isVisible(),true);
      await menu.selectOption('媒体');
      const rows=page.locator('#workbench-calibration-grid .ag-row');
      await page.waitForFunction(()=>document.querySelectorAll('#workbench-calibration-grid .ag-row').length>=1);
      const mediaCount=await rows.count();
      assert.ok(mediaCount>=1,'media shows image sources, not HTML tables');
      assert.equal(await menu.inputValue(),'媒体');
      assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isHidden(),true);
      assert.equal(await page.getByTestId('wb-clean-download-media').isVisible(),true);
      const pendingCount=Number(/[（(](\d+)[）)]/.exec(await page.getByTestId('wb-clean-download-media').innerText())?.[1]);
      assert.ok(Number.isSafeInteger(pendingCount)&&pendingCount<=mediaCount,
        'download button counts only external image sources');
      await rows.first().click();
      assert.ok(await page.locator('#workbench-source .cm-editor').count()>0);
      await menu.selectOption('表格');
      await page.waitForFunction(()=>document.querySelectorAll('#workbench-calibration-grid .ag-row').length===7);
      const tableCount=await rows.count();
      assert.equal(tableCount,7,'HTML tables have their own AG module');
      assert.equal(await menu.inputValue(),'表格');
      assert.equal(await page.getByTestId('wb-clean-heading-numbers-label').isHidden(),true);
      assert.equal(await page.getByTestId('wb-clean-download-media').isHidden(),true);
      await menu.selectOption('LaTeX');
      await page.waitForFunction(()=>document.querySelectorAll('#workbench-calibration-grid .ag-row').length>=12);
      const latexCount=await page.locator('#workbench-calibration-grid .ag-row').count();
      assert.ok(latexCount>=12);
      assert.equal(await page.getByTestId('wb-clean-download-media').isHidden(),true);
      await menu.selectOption('章节标题');
      assert.equal(await page.getByTestId('wb-clean-heading-numbers').isVisible(),true);
      assert.deepEqual(writes,[],'module scan cannot download anything');
      assert.deepEqual(errors,[]);
      console.log('V3_CLEAN_MEDIA_TABLE_LATEX_MODULES_PASS',JSON.stringify({mediaCount,tableCount,latexCount,
        downloadsTriggered:0,engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium'}));
      return;
    }
    assert.equal(fs.readFileSync(path.join(book,'chapters',chapterName),'utf8'),md,
      'actual book MD bytes must remain intact in disposable vault');
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log('V3_BUFFETT_7_FENCED_TABLES_RENDER_PASS',JSON.stringify({
      engine:process.env.OCR2MD_TEST_WEBKIT?'webkit':'chromium',
      actual,formulas,sourceUnchanged:true,zeroWrites:true}));
    return;
  }
  const grid=page.getByTestId('workbench-calibration-grid');
  const titles=grid.locator('.v3-clean-heading-cell');
  await titles.first().waitFor({timeout:30000});
  assert.equal(await titles.count(),6,'fenced headings and YAML must not enter AG');
  assert.equal(await grid.getByRole('columnheader',{name:'MD 层级'}).count(),1);
  assert.equal(await grid.getByRole('columnheader',{name:'章节标题'}).count(),1);
  const details=await titles.evaluateAll(nodes=>nodes.map(e=>({
   level:e.dataset.headingLevel,text:e.textContent,indent:parseInt(e.style.paddingInlineStart||'0'),
   color:getComputedStyle(e).color,font:getComputedStyle(e).fontSize,
   height:e.closest('[role="row"]')?.getBoundingClientRect().height
  })));
  assert.deepEqual(details.map(d=>Number(d.level)),[1,2,3,4,5,6]);
  assert.deepEqual(details.map(d=>d.indent),[0,14,28,42,56,70]);
  assert.ok(details.every((d,i)=>d.text.includes(`${'#'.repeat(i+1)} ${['Top','Second','Third','Fourth','Fifth','Sixth'][i]} title`)));
  assert.ok(details[0].height>=details[5].height,'heading row heights use configured V3 typography');
  assert.notEqual(details[0].font,details[5].font,'heading font size uses H1-H6 settings');
  // V2 Markdown renderer + V2 CSS must both govern chapter cleaning. This
  // checks the actual workbench preview, not a synthetic Markdown string.
  const preview=page.getByTestId('workbench-preview');
  const math=preview.locator('.ocr2md-fenced-math');
  assert.equal(await math.count(),2,'valid math/latex fences must render as KaTeX');
  assert.equal(await math.locator('.katex-display').count(),2);
  assert.equal(await math.locator('.mfrac').count(),2,'fractions must be typeset');
  assert.equal(await preview.locator('.ocr2md-fenced-math-error').count(),1,
    'invalid OCR math must show an explicit error instead of false success');
  const mathIndex=md.split('\n').findIndex(line=>line.startsWith('L_t ='))+1;
  assert.equal(await math.first().locator('xpath=ancestor::*[@data-source-line][1]').getAttribute('data-source-line'),String(mathIndex));
  assert.ok((await preview.locator('.ocr2md-fenced-math-error').textContent()).includes('核对 PDF'));
  assert.ok((await preview.locator('pre code').allTextContents()).some(x=>x.includes('const latex')),
    'JavaScript code containing LaTeX stays code');
  const tables=preview.locator('.md-html-block table');
  assert.equal(await tables.count(),3,'only isolated fenced HTML tables become real elements');
  const first=await tables.first().evaluate(e=>({
    rows:e.querySelectorAll('tr').length,
    rowspan:e.querySelector('td')?.getAttribute('rowspan'),
    colspan:e.querySelector('tr:first-child td:nth-child(2)')?.getAttribute('colspan'),
    content:e.textContent}));
  assert.equal(first.rows,2);
  assert.equal(first.rowspan,'2');assert.equal(first.colspan,'2');
  assert.ok(first.content.includes('Stock/Fund Measure'));
  const tableLine=md.split('\n').findIndex(line=>line.startsWith('<table><tr><td rowspan'))+1;
  assert.equal(await tables.first().locator('xpath=ancestor::div[contains(@class,"md-html-block")]').getAttribute('data-source-line'),String(tableLine),
    'rendered HTML table keeps its original physical source line');
  assert.ok((await preview.locator('pre code').allTextContents()).some(x=>x.includes('HTML syntax example, not a table')),
    'non-table HTML fences remain code');
  assert.ok((await preview.locator('pre code').allTextContents()).some(x=>x.includes('const markup')),
    'JS fences remain code');
  assert.equal(await preview.locator('table img,table a,table script,table style').count(),0,
    'HTML table rendering must not fetch external media or execute active content');
  assert.equal(await preview.locator('.md-html-block table [style],.md-html-block table [onerror]').count(),0);
  for(const [selector,label] of [
    ['h1','h1'],['h6','h6'],['p strong','bold'],['p em','italic'],
    ['a[href="https://example.com"]','link'],['blockquote:not(.ocr2md-callout)','quote'],
    ['blockquote.ocr2md-callout .ocr2md-callout__title','callout'],
    ['ul>li','list'],['table>thead','table'],['pre code','fenced code'],
    ['.katex','inline LaTeX'],['.katex-display','display LaTeX'],
    ['.ocr2md-footnote-ref','footnote'],['img[alt="diagram"]','image'],
    ['.md-html-block .chapter-html','HTML block'],
  ]){
    assert.ok(await preview.locator(selector).count()>0,`V2 renderer must preserve ${label}`);
  }
  const style=await preview.evaluate(root=>{
    const sample=selector=>root.querySelector(selector);
    const css=selector=>getComputedStyle(sample(selector));
    return {
      paragraphMarginTop:parseFloat(css('p:not(.md-html-block p)').marginTop),
      paragraphColor:css('p').color,
      paragraphFont:css('p').fontFamily,
      headingMarginTop:parseFloat(css('h2').marginTop),
      headingColor:css('h2').color,
      linkColor:css('a[href="https://example.com"]').color,
      quoteBorder:css('blockquote:not(.ocr2md-callout)').borderLeftWidth,
      calloutBorder:css('blockquote.ocr2md-callout').borderLeftWidth,
      tableBorder:css('table th').borderTopWidth,
      codeBackground:css('pre').backgroundColor,
      footnoteRadius:css('.ocr2md-footnote-ref').borderRadius,
      imageMaxWidth:css('img[alt="diagram"]').maxWidth,
      katexOverflow:css('.katex-display').overflowX,
      scrollWidth:root.scrollWidth,clientWidth:root.clientWidth,
    };
  });
  assert.ok(style.paragraphMarginTop>=12,
    `V2 uses normal 1em paragraph spacing, not V3 global 5px: ${JSON.stringify(style)}`);
  assert.ok(style.headingMarginTop>=10,'V2 heading margins cannot inherit V3 global 0px');
  assert.ok(style.quoteBorder==='3px');
  assert.ok(style.calloutBorder==='1px');
  assert.equal(style.tableBorder,'1px');
  assert.equal(style.katexOverflow,'auto');
  assert.equal(style.imageMaxWidth,'100%');
  assert.equal(style.footnoteRadius,'999px');
  assert.ok(style.paragraphFont.includes('Sarasa')||style.paragraphFont.includes('Laity'),
    'V3 custom Sarasa family remains active with V2 element styles');
  assert.equal(await page.getByTestId('preview-tab-markdown').getAttribute('aria-selected'),'true');
  const callout=preview.locator('blockquote.ocr2md-callout');
  assert.equal(await callout.getAttribute('data-collapsed'),'false');
  await callout.locator('.ocr2md-callout__title').click();
  assert.equal(await callout.getAttribute('data-collapsed'),'true');
  await callout.locator('.ocr2md-callout__title').click();
  assert.equal(await callout.getAttribute('data-collapsed'),'false');
  assert.equal(fs.readFileSync(path.join(book,'chapters',chapterName),'utf8'),md,
    'callout collapse is presentation-only');
  if(process.env.OCR2MD_TEST_PREVIEW_V2_ONLY==='1'){
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log('V3_CLEANING_V2_PREVIEW_ELEMENTS_PASS',JSON.stringify({
      engine:process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium',style,
      calloutToggle:true,zeroVaultWrites:true}));
    return;
  }

  assert.ok(details.every(d=>d.text.startsWith('(')),'numbering checked by default');
  await page.getByTestId('wb-clean-heading-numbers').uncheck();
  assert.ok((await titles.allTextContents()).every(text=>!text.startsWith('(')),'checkbox hides only numbering');
  assert.equal(fs.readFileSync(path.join(book,'chapters',chapterName),'utf8'),md,'display-only toggle leaves MD intact');
  await titles.nth(3).click();
  await page.waitForFunction(()=>document.querySelector('#workbench-preview')?.dataset.cleanFocusLine==='7');
  const focused=page.locator('#workbench-preview .v3-clean-preview-target');
  assert.ok((await focused.textContent()).includes('Fourth title'));
  // Clicking another preview heading must move AG and the source selection,
  // not leave an old PDF or preview selection active.
  await page.locator('#workbench-preview h2[data-source-line]').click();
  await page.waitForFunction(()=>document.querySelector('#workbench-preview')?.dataset.cleanFocusLine==='5');
  assert.ok((await focused.textContent()).includes('Second title'));
  assert.equal(await page.locator('#workbench-source').getAttribute('data-ir-block-id'),null,
    'without saved DIRjson and an exact marker, PDF position must not be invented');
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[],'reading and toggling headings must not write vault files');
  console.log('V3_CHAPTER_HEADING_HIERARCHY_PASS',JSON.stringify({levels:details.map(d=>d.level),numbering:'toggle',source:'unchanged'}));
 }finally{
  if(browser)await browser.close().catch(()=>{});
  if(server)server.kill();
  fs.rmSync(temp,{recursive:true,force:true});
 }
})().catch(error=>{console.error('V3_CHAPTER_HEADING_HIERARCHY_FAIL',error);process.exitCode=1;});
