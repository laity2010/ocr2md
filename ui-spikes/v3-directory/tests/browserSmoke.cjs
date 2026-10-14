const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { chromium } = require('../../v2/node_modules/@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '../../..');
const root = path.join(repo, 'ui-spikes/v3-directory');
const port = 4291;
const url = `http://127.0.0.1:${port}/`;
const wait = ms => new Promise(ok => setTimeout(ok,ms));
(async () => {
  assert.ok(fs.existsSync(path.join(root,'dist/app.js')), 'build the demo before testing');
  const server = spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','-d',root],
    { stdio: 'ignore' });
  let browser;
  try {
    let alive=false;
    for(let i=0;i<25;i++){
      try {const res=await fetch(url);if(res.ok){alive=true;break;}}catch{}
      await wait(100);
    }
    assert.ok(alive, 'fixture HTTP server should start');
    browser = await chromium.launch({ headless: true, channel: 'chrome' });
    const page = await browser.newPage({viewport:{width:950,height:800}});
    let navigations=0;
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
    await page.goto(url);
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'));
    assert.equal(await page.locator('#directory-list .line').count(),3);
    for(const rootFolder of ['/ocr2md','/阅读','/学习']) {
      assert.equal(await page.locator('[data-open-path="'+rootFolder+'"]').count(),1);
    }
    await page.locator('[data-open-path="/阅读"]').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'示例成品.md'}).waitFor();
    await page.getByTestId('directory-parent').click();
    await page.locator('[data-open-path="/ocr2md"]').click();
    assert.equal(await page.locator('#directory-list [data-kind="directory"]').count(),2);
    await page.locator('#create-name').fill('审计目录');
    await page.getByTestId('create-folder').click();
    await page.locator('[data-open-path="/ocr2md/审计目录"]').waitFor();
    await page.locator('#create-name').fill('批注.md');
    await page.getByTestId('create-file').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'批注.md'}).waitFor();
    await page.getByTestId('directory-refresh').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'批注.md'}).click();
    await page.locator('#target').fill('更名.md');
    await page.getByTestId('rename').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'更名.md'}).waitFor();
    // Copy -> move to another folder -> delete, all without touching disk.
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'更名.md'}).click();
    await page.locator('#target').fill('复制.md');
    await page.getByTestId('copy-file').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'复制.md'}).waitFor();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'复制.md'}).click();
    await page.locator('#destination').fill('/ocr2md/示例书A');
    await page.getByTestId('move').click();
    await page.locator('[data-open-path="/ocr2md/示例书A"]').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'复制.md'}).waitFor();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'复制.md'}).click();
    page.once('dialog', dialog => dialog.accept());
    await page.getByTestId('remove').click();
    await page.waitForFunction(() => ![...document.querySelectorAll('#directory-list [data-kind="file"]')].some(el => el.textContent?.includes('复制.md')));
    await page.getByTestId('directory-parent').click();
    await page.locator('#dirty').check();
    await page.locator('#mount-select').selectOption('vault-secondary');
    await page.getByTestId('switch-workspace').click();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('未保存'));
    assert.match(await page.getByTestId('directory-path').innerText(), /^vault-primary:\/ocr2md$/);
    await page.locator('#dirty').uncheck();
    await page.getByTestId('switch-workspace').click();
    await page.waitForFunction(() => document.querySelector('#directory-path')?.textContent === 'vault-secondary:/');
    assert.equal(await page.locator('[data-open-path="/ocr2md"]').count(),1);
    await page.locator('#mount-select').selectOption('vault-primary');
    await page.getByTestId('switch-workspace').click();
    await page.locator('[data-open-path="/ocr2md"]').click();
    assert.equal(await page.locator('#directory-list [data-kind="file"]').filter({hasText:'更名.md'}).count(),1);
    assert.equal(navigations,1,'switching workspace must not reload the page');
    await browser.close(); browser=undefined;
    console.log('v3Directory browser smoke passed (create, rename, copy, move, delete, dirty guard, workspace switch, no reload)');
  } finally {
    if(browser)await browser.close();
    server.kill('SIGTERM');
  }
})().catch(e=>{ console.error(e);process.exitCode=1; });
