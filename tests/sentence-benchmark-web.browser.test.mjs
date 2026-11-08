/** WP3/WP4 end-to-end: the REAL built V6/Lab page and the same split/rebuild
 * implementation; no mock engine and no active user document modifications. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const temp=mkdtempSync(join(tmpdir(),'ocr2md-sentence-web-'));
const runtime=join(temp,'labs','sentence-benchmark','.runtime');
mkdirSync(runtime,{recursive:true});
writeFileSync(join(runtime,'document.md'),'A scratch document. Never the Main document.\n');
writeFileSync(join(runtime,'unlock-token'),'isolated-test-unlock-token-123456');
const port=await new Promise((done,fail)=>{
  const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?fail(e):done(p));});
});
const url='http://127.0.0.1:'+port+'/labs/sentence-benchmark/sentence-benchmark.html';
const server=spawn('python3',['labs/sentence-benchmark/server.py'],{
  cwd:process.cwd(),env:{...process.env,V6_PORT:String(port),
    V6_LAB_RUNTIME:runtime,V6_LAB_UNLOCK_TOKEN_PATH:join(runtime,'unlock-token'),
    V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:''},
  stdio:'ignore'
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;
  for(let i=0;i<130;i++){
    try{if((await fetch('http://127.0.0.1:'+port+'/labs/sentence-benchmark/healthz')).ok){ready=true;break;}}
    catch{}
    await pause(180);
  }
  assert(ready,'V6 isolated Lab service did not start');
  for(const [name,engine,binary] of [
    ['Chrome',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]
  ]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1100,height:850},acceptDownloads:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      assert.equal(response.status(),200,name+' page HTTP 200');
      await page.waitForFunction(()=>document.querySelector('#kpi-roundtrip')?.textContent==='100% PASS',
        null,{timeout:65000});
      assert.equal(await page.locator('#engine-options input:checked').count(),3);
      assert.equal(await page.locator('#sample-select option').count(),3);
      assert.equal(await page.locator('#score-table tbody tr').count(),3);
      await page.locator('#review-filter').selectOption('all');
      assert(await page.locator('#issue-list button').count()>0);
      await page.locator('#approve-issue').click();
      await page.waitForFunction(()=>document.querySelector('#kpi-reviewed')?.textContent.startsWith('1 /'));
      let persisted=await page.evaluate(()=>localStorage.getItem('ocr2md-sentence-benchmark-v1'));
      assert(persisted?.includes('"break":true'),name+' Gold auto saved');
      const [download]=await Promise.all([
        page.waitForEvent('download',{timeout:15000}),page.locator('#export-gold').click()
      ]);
      const gold=JSON.parse(readFileSync(await download.path(),'utf8'));
      assert.equal(gold.schema,'ocr2md-human-gold/v1');
      assert(gold.decisions.length>=1);
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#kpi-reviewed')?.textContent.startsWith('1 /'),
        null,{timeout:65000});
      await page.locator('#review-filter').selectOption('all');
      await page.locator('#clear-issue').click();
      await page.locator('#gold-file').setInputFiles({
        name:'human-gold.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(gold))
      });
      await page.waitForFunction(()=>document.querySelector('#kpi-reviewed')?.textContent.startsWith('1 /'));
      await page.locator('#sample-file').setInputFiles({
        name:'second-document.md',mimeType:'text/markdown',
        buffer:Buffer.from('Dr. Brown visits. The value is 3.14. Another sentence! Done.')
      });
      await page.waitForFunction(()=>document.querySelector('#sample-meta')?.textContent.includes('65 字符')||
        document.querySelector('#sample-select')?.value.startsWith('import-'),null,{timeout:15000});
      assert.equal(await page.locator('#sample-select option').count(),4);
      assert.equal(await page.locator('#kpi-roundtrip').textContent(),'100% PASS');
      await page.locator('#review-filter').selectOption('all');
      await page.locator('#manual-issue').click();
      await page.locator('#manual-chars button').first().click();
      assert((await page.locator('#kpi-reviewed').textContent()).startsWith('1 /'));
      const [report]=await Promise.all([
        page.waitForEvent('download',{timeout:15000}),page.locator('#export-report').click()
      ]);
      assert.equal(JSON.parse(readFileSync(await report.path(),'utf8')).schema,'ocr2md-sentence-score/v1');
      await page.locator('#view-mode').selectOption('full');
      assert(await page.locator('#source-view .breakline').count()>0);
      if(name==='Chrome'){
        await page.locator('#sample-select').selectOption('buffett');
        await page.waitForFunction(()=>document.querySelector('#kpi-roundtrip')?.textContent==='100% PASS',
          null,{timeout:85000});
      }
      assert.deepEqual(errors,[],name+' console exceptions');
      console.log('SENTENCE_LAB_WEB_PASS',JSON.stringify({
        name,engineCount:3,samples:4,persistentGold:true,
        goldImportExport:true,manualBoundary:true,scoreReport:true,
        fullCoverage:true,buffett:name==='Chrome'
      }));
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');
  rmSync(temp,{recursive:true,force:true});
}
