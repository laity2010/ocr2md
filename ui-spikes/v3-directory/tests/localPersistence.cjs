/** Browser integration gate: physical browser IndexedDB, reload, second tab, offline. */
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const path = require('node:path');
const {chromium} = require('../../v2/node_modules/@playwright/test');
const port = 4292;
const root = path.resolve(__dirname, '..');
const url = process.env.WP2_PUBLIC_URL || `http://127.0.0.1:${port}/`;
const delay = ms => new Promise(r=>setTimeout(r,ms));
(async () => {
  const server = process.env.WP2_PUBLIC_URL ? null : spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','-d',root],{stdio:'ignore'});
  let browser;
  try {
    let alive=false;
    for(let i=0;i<30;i++){try{const r=await fetch(url);if(r.ok){alive=true;break}}catch{}await delay(100)}
    assert.ok(alive,'Local server must start');
    browser=await chromium.launch({channel:'chrome',headless:true});
    const context=await browser.newContext({viewport:{width:834,height:1194},isMobile:true,hasTouch:true});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'),null,{timeout:20000});
    const ready = await page.evaluate(async()=>{
      const reg=await navigator.serviceWorker.ready;
      return reg.active?.state;
    });
    assert.ok(['activated','activating'].includes(ready),'Offline shell must register');
    await page.locator('[data-open-path="/ocr2md"]').click();
    await page.locator('#create-name').fill('真实本地目录');
    await page.getByTestId('create-folder').click();
    await page.locator('[data-open-path="/ocr2md/真实本地目录"]').waitFor();
    await page.locator('[data-open-path="/ocr2md/真实本地目录"]').click();
    await page.locator('#create-name').fill('local.md');
    await page.locator('#file-content').fill('# iPad 本地持久化测试\n保存后刷新必须不丢\n');
    await page.getByTestId('create-file').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'local.md'}).waitFor();
    const browserStored = await page.evaluate(async()=>{
      const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('ocr2md-v3-local-vault-review-v1');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
      const tx=db.transaction('vaults','readonly');
      const record=await new Promise((resolve,reject)=>{const q=tx.objectStore('vaults').get('vault-primary');q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
      db.close();
      const file=record?.data?.nodes?.find(n=>n.path==='/ocr2md/真实本地目录/local.md');
      return {exists:!!file,text:file?new TextDecoder().decode(file.bytes):null};
    });
    assert.deepEqual(browserStored,{exists:true,text:'# iPad 本地持久化测试\n保存后刷新必须不丢\n'});
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'));
    await page.locator('[data-open-path="/ocr2md"]').click();
    await page.locator('[data-open-path="/ocr2md/真实本地目录"]').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'local.md'}).click();
    await page.getByTestId('read-file').click();
    await page.waitForFunction(()=>document.querySelector('#file-content')?.value.includes('保存后刷新必须不丢'));
    assert.equal(await page.locator('#file-content').inputValue(),browserStored.text);
    console.log('REAL_IDB_PERSISTENCE_AFTER_RELOAD_OK');

    const second = await context.newPage();
    await second.goto(url);
    await second.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'));
    await second.locator('[data-open-path="/ocr2md"]').click();
    await second.locator('[data-open-path="/ocr2md/真实本地目录"]').click();
    assert.equal(await second.locator('#directory-list [data-kind="file"]').filter({hasText:'local.md'}).count(),1);
    console.log('REAL_IDB_SECOND_TAB_PERSISTENCE_OK');

    // Make sure the service worker controls the page before going offline.
    await page.reload();
    await page.waitForFunction(()=>navigator.serviceWorker.controller !== null,{timeout:12000});
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'),null,{timeout:15000});
    await page.locator('[data-open-path="/ocr2md"]').click();
    await page.locator('[data-open-path="/ocr2md/真实本地目录"]').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'local.md'}).click();
    await page.getByTestId('read-file').click();
    await page.waitForFunction(()=>document.querySelector('#file-content')?.value.includes('保存后刷新必须不丢'));
    console.log('REAL_IDB_OFFLINE_RELOAD_AND_READ_OK');
    await page.locator('#create-name').fill('offline-saved.md');
    await page.locator('#file-content').fill('离线写入已保存');
    await page.getByTestId('create-file').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'offline-saved.md'}).waitFor();
    await page.reload({waitUntil:'domcontentloaded',timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已打开本机 IndexedDB'));
    await page.locator('[data-open-path="/ocr2md"]').click();
    await page.locator('[data-open-path="/ocr2md/真实本地目录"]').click();
    await page.locator('#directory-list [data-kind="file"]').filter({hasText:'offline-saved.md'}).click();
    await page.getByTestId('read-file').click();
    await page.waitForFunction(()=>document.querySelector('#file-content')?.value === '离线写入已保存');
    console.log('REAL_IDB_OFFLINE_WRITE_AND_RELOAD_OK');
    assert.deepEqual(errors,[]);
    await context.setOffline(false);
    await context.close();
    console.log('V3_BROWSER_LOCAL_STORAGE_VERIFIED');
  } finally {
    if(browser)await browser.close();
    server?.kill('SIGTERM');
  }
})().catch(e=>{console.error('LOCAL_STORAGE_TEST_FAILED',e);process.exitCode=1});
