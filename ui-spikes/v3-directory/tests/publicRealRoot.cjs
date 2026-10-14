/** Public iPad/Mac production read-only smoke. Never changes real vault data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const url='https://ocr2md.laity.bid/v3-directory/';
const keyPath=process.env.OCR2MD_V3_KEY_FILE;
const key=keyPath && fs.existsSync(keyPath) ? fs.readFileSync(keyPath,'utf8').trim():'';
const doubleTapRow=async (page,itemPath)=>{
  for(let i=0;i<2;i++) await page.locator(`[data-open-path="${itemPath}"]`).evaluate(button=>{
    button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
    button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
  });
};
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    for(const config of [{name:'iPad',width:834,height:1194},{name:'iPhone',width:390,height:844}]){
      const context=await browser.newContext({viewport:{width:config.width,height:config.height},isMobile:true,hasTouch:true});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      assert.equal(response.status(),200);
      assert.equal(await page.getByRole('tab').count(),2);
      await page.getByTestId('tab-settings').tap();
      const configGrid=page.getByTestId('shared-settings-grid');
      await configGrid.locator('.ag-row').first().waitFor({timeout:30000});
      assert.ok(await configGrid.locator('.ag-row').count()>=10,'v2 shared config component is visible');
      assert.equal(await page.locator('#table-config-editor .cm-content').count(),1);
      const configWidth=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(configWidth.scroll<=configWidth.viewport,'settings overflow on '+config.name+': '+JSON.stringify(configWidth));
      await page.getByTestId('connect-vault').waitFor({timeout:30000});
      await page.locator('#vault-key').fill(key);
      await page.getByTestId('connect-vault').tap();
      await page.getByTestId('tab-workspace').tap();
      assert.equal(await page.locator('#directory-search').count(),0);
      assert.equal(await page.getByTestId('working-source-editor').locator('.cm-editor').count(),1,'shared v2 source editor');
      assert.equal(await page.locator('#v3-workspace-splitter[role=separator]').count(),1);
      assert.equal(await page.locator('#v3-workspace-splitter').isVisible(),config.width>=761);
      const panes=await page.evaluate(()=>({
        grid:document.querySelector('.directory-grid-pane').getBoundingClientRect().toJSON(),
        source:document.querySelector('.directory-source-pane').getBoundingClientRect().toJSON(),
      }));
      if(config.width>=761) assert.ok(panes.source.x>=panes.grid.right,'iPad side-by-side AG+source');
      else assert.ok(panes.source.y>=panes.grid.bottom,'iPhone stacked AG+source');
      await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/',null,{timeout:30000});
      await page.locator('[data-open-path="/ocr2md"]').waitFor({timeout:30000});
      assert.equal(await page.getByTestId('directory-parent').count(),1);
      assert.equal(await page.getByTestId('directory-parent').isDisabled(),true);
      const entries=await page.locator('[data-open-path]').evaluateAll(nodes=>nodes.map(x=>x.dataset.openPath));
      assert.ok(entries.includes('/ocr2md'));
      assert.ok(entries.includes('/books'));
      assert.ok(entries.includes('/tools'));
      assert.ok(!entries.some(x=>x?.startsWith('/.obsidian')));
      await page.locator('[data-open-path="/ocr2md"]').tap();
      assert.equal(await page.getByTestId('directory-path').textContent(),'Obsidian/ocr2md/');
      assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('"类型": "目录"'));
      await doubleTapRow(page,'/ocr2md');
      await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md');
      await page.getByTestId('directory-loading').waitFor({state:'hidden'});
      // Verify the real file created via localhost can be read via the public
      // Chrome/Safari-style browser path. No production files are modified.
      const vaultProofDir=process.env.OCR2MD_V3_PROOF_DIR;
      if (vaultProofDir) {
        const proofNames=fs.readdirSync(vaultProofDir).filter(x=>x.startsWith('v3-mac-real-vault-proof-20261008-')&&x.endsWith('.md'));
        assert.ok(proofNames.length>0,'Expected real proof note in Mac vault');
        const proofName=proofNames.sort().at(-1);
        const proofBody=fs.readFileSync(require('node:path').join(vaultProofDir,proofName),'utf8');
        const proofItem=page.locator('#directory-list [data-kind="file"]').filter({hasText:proofName});
        for(let n=0;n<15 && await proofItem.count()===0;n++) {
          if(await page.getByTestId('directory-more').isHidden())break;
          await page.getByTestId('directory-more').click();
        }
        await proofItem.waitFor({timeout:30000});
        await proofItem.tap();
        await page.waitForFunction(expected=>document.querySelector('#working-editor .cm-content')?.textContent?.includes(expected),
          'Mac 本地写入',{timeout:30000});
        assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes(proofName));
        assert.ok((await page.locator('#working-editor .cm-content').textContent()).includes('选中行详细信息'));
        assert.equal(await page.locator('#source-item-name,#source-item-metadata,#source-note').count(),0);
        assert.equal(await page.locator('#working-editor .cm-content').getAttribute('contenteditable'),'false');
        await page.locator('#file-actions summary').tap();
        await page.getByTestId('read-file').tap();
        await page.waitForFunction(expected=>document.querySelector('#file-content')?.value===expected,proofBody,{timeout:30000});
        // Workbench must open the actual Mac Vault directory and directly
        // reuse v2 CalibrationGrid, WorkingEditor, BasicMarkdownPreview.
        await page.getByTestId('set-working-directory').tap();
        await page.getByTestId('tab-workbench').waitFor({state:'visible',timeout:30000});
        assert.equal(await page.getByTestId('tab-workbench').getAttribute('aria-selected'),'true');
        assert.equal(await page.getByTestId('workbench-row-splitter').isVisible(),true);
        assert.equal(await page.getByTestId('workbench-column-splitter').isVisible(),config.width>=761);
        assert.equal(await page.getByTestId('workbench-mobile-splitter').isVisible(),config.width<761);
        const geometry=await page.evaluate(()=>({
          grid:document.querySelector('.workbench-grid-pane').getBoundingClientRect().toJSON(),
          right:document.querySelector('.workbench-right-pane').getBoundingClientRect().toJSON(),
          source:document.querySelector('.workbench-source-pane').getBoundingClientRect().toJSON(),
          preview:document.querySelector('.workbench-preview-pane').getBoundingClientRect().toJSON(),
        }));
        if(config.width>=761)assert.ok(geometry.right.x>=geometry.grid.right,'wide iPad grid/source resizable columns');
        else assert.ok(geometry.right.y>=geometry.grid.bottom,'narrow iPhone stacked AG and source/preview');
        assert.ok(geometry.preview.y>=geometry.source.bottom,'v2 editor preview height splitter visible');
        assert.equal(await page.getByTestId('preview-tab-pdf').count(),1);
        assert.equal(await page.getByTestId('workbench-pdf-file').count(),1);
        assert.equal(await page.locator('#workbench-pdf-canvas').count(),1);
        assert.ok((await page.getByTestId('workbench-ocr-json-status').textContent()).includes('OCR JSON'));
        // Production verification is read-only. PDF auto-loads only if a
        // real PDF exists; otherwise its selector remains safely disabled.
        const pdfCount=await page.locator('#workbench-pdf-file option').count();
        if(pdfCount===1) assert.equal(await page.getByTestId('workbench-pdf-file').isDisabled(),true);
        await page.getByTestId('workbench-file').selectOption('/ocr2md/'+proofName);
        await page.waitForFunction(expected=>document.querySelector('#workbench-source .cm-content')?.textContent?.includes(expected),
          'Mac 本地写入',{timeout:30000});
        await page.waitForFunction(expected=>document.querySelector('#workbench-preview')?.textContent?.includes(expected),
          'Mac 本地写入',{timeout:30000});
        assert.equal(await page.locator('#workbench-source .cm-content').getAttribute('contenteditable'),'false');
        assert.ok((await page.getByTestId('workbench-status').textContent()).includes('只读'));
        console.log(config.name+' V3_REAL_MAC_VAULT_V2_WORKBENCH_READ_ONLY_PASS');
        await page.getByTestId('tab-workspace').tap();
        console.log(config.name+' REAL_PRODUCTION_MD_PUBLIC_BROWSER_READBACK_PASS');
      }
      // Optional explicit acceptance: run one REAL remote write through the
      // same v3 page, then delete only the unique probe created by this test.
      if (config.name === 'iPad' && process.env.OCR2MD_V3_PUBLIC_WRITE_PROBE === 'yes') {
        const targetDir = process.env.OCR2MD_V3_PROOF_DIR;
        assert.ok(targetDir,'Explicit probe needs a trusted Mac directory to verify against');
        const filename='v3-public-write-proof-'+Date.now()+'.md';
        const marker='# iPad public HTTP real-write smoke\nUnique verified file';
        await page.locator('#create-name').fill(filename);
        await page.locator('#file-content').fill(marker);
        await page.getByTestId('create-file').tap();
        const item=page.locator('#directory-list [data-kind="file"]').filter({hasText:filename});
        await item.waitFor({timeout:30000});
        const filepath=require('node:path').join(targetDir,filename);
        assert.equal(fs.readFileSync(filepath,'utf8'),marker);
        await item.tap();
        page.once('dialog',dialog=>dialog.accept());
        await page.getByTestId('remove').tap();
        await page.waitForFunction(name=>![...document.querySelectorAll('#directory-list [data-kind="file"]')].some(node=>node.textContent?.includes(name)),filename,{timeout:30000});
        assert.equal(fs.existsSync(filepath),false);
        console.log('iPad PUBLIC_REAL_MAC_VAULT_REMOTE_WRITE_AND_CLEANUP_PASS');
      }
      const size=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.ok(size.scrollWidth<=size.viewport,JSON.stringify(size));
      assert.deepEqual(errors,[]);
      console.log(`${config.name} PUBLIC_REAL_MAC_VAULT_READ_ONLY_PASS root=obsidian-ocr2md:/ overflow=0`);
      await context.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error('PUBLIC_REAL_ROOT_SMOKE_FAILED',e);process.exitCode=1});
