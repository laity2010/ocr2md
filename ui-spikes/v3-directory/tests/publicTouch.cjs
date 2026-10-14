const assert = require('node:assert/strict');
const { chromium } = require('../../v2/node_modules/@playwright/test');
const url = 'https://ocr2md.laity.bid/v3-directory/';
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    for (const spec of [{name:'iPad',width:834,height:1194},{name:'iPhone',width:390,height:844}]) {
      const ctx = await browser.newContext({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      const page = await ctx.newPage();
      const errors = [], writes = [];
      page.on('pageerror', e=>errors.push(e.message));
      page.on('request', req=>{if(!['GET','HEAD'].includes(req.method()))writes.push(req.url());});
      const resp=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
      assert.equal(resp.status(),200);
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'),{timeout:25000});
      assert.equal(await page.getByTestId('directory-path').innerText(),'vault-primary:/');
      for(const dir of ['/ocr2md','/阅读','/学习']) assert.equal(await page.locator(`[data-open-path="${dir}"]`).count(),1);
      await page.locator('[data-open-path="/ocr2md"]').tap();
      await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent === 'vault-primary:/ocr2md');
      for(const dir of ['/ocr2md/示例书A','/ocr2md/示例书B']) assert.equal(await page.locator(`[data-open-path="${dir}"]`).count(),1);
      await page.locator('#create-name').fill('ipad-wp2');
      await page.getByTestId('create-folder').tap();
      await page.locator('[data-open-path="/ocr2md/ipad-wp2"]').waitFor();
      await page.locator('[data-open-path="/ocr2md/ipad-wp2"]').tap();
      await page.locator('#create-name').fill('check.md');
      await page.getByTestId('create-file').tap();
      await page.locator('#directory-list [data-kind="file"]').filter({hasText:'check.md'}).waitFor();
      await page.getByTestId('directory-parent').tap();
      await page.locator('#dirty').check();
      await page.locator('#mount-select').selectOption('vault-secondary');
      await page.getByTestId('switch-workspace').tap();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'));
      assert.equal(await page.getByTestId('directory-path').innerText(),'vault-primary:/ocr2md');
      await page.locator('#dirty').uncheck();
      await page.getByTestId('switch-workspace').tap();
      await page.waitForFunction(()=>document.querySelector('#directory-path')?.textContent==='vault-secondary:/');
      const geom=await page.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
      assert.equal(errors.length,0,errors.join('; '));
      // Cloudflare's independent browser RUM beacon can POST /cdn-cgi/rum.
      // Verify that NO ocr2md or workspace write endpoint is contacted.
      const workspaceWrites = writes.filter(u => !new URL(u).pathname.startsWith('/cdn-cgi/rum'));
      assert.deepEqual(workspaceWrites, [], 'Fixture must not issue application write requests');
      assert.ok(geom.scrollWidth<=geom.viewport,'No horizontal overflow');
      console.log(`${spec.name} Vault Root public touch PASS status=${resp.status()} viewport=${geom.viewport} overflow=0 writes=0 pageErrors=0`);
      await ctx.close();
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error('PUBLIC_VAULT_TOUCH_FAILED',e);process.exitCode=1;});
