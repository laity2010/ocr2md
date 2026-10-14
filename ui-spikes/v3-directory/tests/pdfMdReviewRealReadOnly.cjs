/** WP7 real Buffett audit view smoke. Must never write human decisions. */
const assert=require('node:assert/strict');
const {chromium}=require('../../v2/node_modules/@playwright/test');
const root='/ocr2md/Bufett’s Alpha';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1200,height:900}});
  const page=await context.newPage(),errors=[],writes=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('/__v3/fs')&&r.method()!=='GET')writes.push(r.method());});
  try{
    await page.goto('http://127.0.0.1:4176/v3-directory/',{waitUntil:'domcontentloaded',timeout:30000});
    const open=async path=>{
      await page.locator(`[data-open-path="${path}"]`).waitFor({timeout:30000});
      await page.evaluate(path=>{const button=document.querySelector(`[data-open-path="${path}"]`);
        for(let i=0;i<2;i++){button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));
          button.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:i+1}));}},path);
    };
    /* default home is already /ocr2md */
    await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md/ocr2md',null,{timeout:30000});
    await open(root);
    await page.waitForFunction(p=>document.querySelector('#directory-path')?.textContent==='Obsidian/ocr2md'+p,root,{timeout:30000});
    await page.getByTestId('set-working-directory').click();
    await page.waitForFunction(()=>document.querySelector('#pdf-element-locator-status')?.textContent?.includes('已校验映射 224 项'),null,{timeout:90000});
    await page.locator('#wb-module-menu > summary').click();
    await page.getByTestId('workbench-mode-review').click();
    await page.waitForFunction(()=>document.querySelector('#pdf-md-review-status')?.textContent?.includes('已审核 0 / 224 项'),null,{timeout:25000});
    await page.getByTestId('workbench-review-grid').getByRole('row').nth(1).waitFor();
    assert.equal(await page.getByTestId('pdf-md-review-save').isDisabled(),true);
    assert.equal(await page.getByTestId('workbench-mode-review').getAttribute('aria-pressed'),'true');
    assert.equal(await page.getByTestId('workbench-calibration-grid').isHidden(),true);
    await page.locator('#wb-module-menu > summary').click();
    await page.getByTestId('workbench-mode-text').click();
    assert.equal(await page.getByTestId('workbench-calibration-grid').isVisible(),true);
    assert.equal(await page.getByTestId('workbench-review-panel').isHidden(),true);
    assert.deepEqual(writes,[],'real read-only inspection must never save a review');
    assert.deepEqual(errors,[]);
    console.log('WP7_REAL_REVIEW_READ_ONLY_BROWSER_PASS rows=224 pending=0 saveDisabled=1 sourceMutations=0');
  }finally{await context.close();await browser.close();}
})().catch(e=>{console.error('WP7_REAL_REVIEW_READ_ONLY_BROWSER_FAIL',e);process.exitCode=1;});
