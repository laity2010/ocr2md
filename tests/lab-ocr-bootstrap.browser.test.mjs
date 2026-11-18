/** Lab-OCR standalone startup probe. Real WebKit/Chromium must show build
 * version before heavy modules and surface module import failure with retry.
 * Entire test runs on isolated Vite fixture; no real books or server edits.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5479;
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
try{
  let up=false;
  for(let i=0;i<150;i++){
    try{if((await fetch(url)).ok){up=true;break;}}catch{}await sleep(150);
  }
  assert(up,'Vite did not start '+log.slice(-1400));
  for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]
    .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||process.env.LAB_OCR_TEST_BROWSER===name)){
    const browser=await browserType.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1200,height:875},hasTouch:true});
      await page.route('**/boot.js*',async route=>route.fulfill({status:503,
        contentType:'text/javascript',body:'// simulated unavailable module'}));
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.documentElement.dataset.ocrLabBoot==='failed',
        null,{timeout:12000});
      const failed=await page.evaluate(()=>({version:document.querySelector('#build-version').textContent,
        status:document.querySelector('#status').textContent,
        retry:document.querySelector('#boot-retry').getBoundingClientRect().width>0}));
      assert.notEqual(failed.version,'00000000-0000','badge updated before heavy modules');
      assert.match(failed.status,/组件加载失败/,'failed ESM import is visible');
      assert(failed.retry,'real user retry is visible');
      // One automatic fresh-document retry, without an endless reload loop.
      await page.waitForFunction(()=>location.search.includes('boot-retry=1')&&
        document.documentElement.dataset.ocrLabBoot==='failed',null,{timeout:10000});
      await page.unroute('**/boot.js*');
      await page.getByRole('button',{name:'重新加载'}).click();
      await page.waitForFunction(()=>document.documentElement.dataset.ocrLabBoot==='ready',
        null,{timeout:25000});
      await page.waitForFunction(()=>document.querySelector('.ocr-outline-pane')!=null,
        null,{timeout:9000});
      assert.notEqual(await page.locator('#build-version').innerText(),'00000000-0000');
      // Simulate failure of the FIRST entry module, before any ESM has run.
      // The plain classic watchdog in HTML must remain operational.
      const noEntry=await browser.newPage({viewport:{width:1200,height:875},hasTouch:true});
      try{
        await noEntry.route('**/entry.js*',route=>route.abort('failed'));
        await noEntry.goto(url,{waitUntil:'domcontentloaded'});
        await noEntry.waitForFunction(()=>document.querySelector('#status')?.textContent
          .includes('BOOT_SCRIPT_ERROR'),null,{timeout:22000});
        assert.equal(await noEntry.locator('#build-version').innerText(),'00000000-0000');
        assert(await noEntry.getByRole('button',{name:'重新加载'}).isVisible());
        await noEntry.waitForFunction(()=>location.search.includes('boot-retry=1'),
          null,{timeout:7000});
        await noEntry.unroute('**/entry.js*');
        await noEntry.getByRole('button',{name:'重新加载'}).click();
        await noEntry.waitForFunction(()=>document.documentElement.dataset.ocrLabBoot==='ready',
          null,{timeout:25000});
      }finally{await noEntry.close();}
      console.log(`LAB_OCR_BOOTSTRAP_RECOVERY_PASS ${name}`,JSON.stringify({
        version:failed.version,errorVisible:true,retry:true,entryFailure:true,workspace:true}));
    }finally{await browser.close();}
  }
}finally{vite.kill('SIGTERM');}
