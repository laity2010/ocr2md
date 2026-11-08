/** Lab hub + independent translation reviewer, real built pages and I/O. */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';

const root=mkdtempSync(join(tmpdir(),'ocr2md-translation-lab-'));
const runtime=join(root,'labs','sentence-benchmark','.runtime');
const input=join(runtime,'translation-review','input');
mkdirSync(input,{recursive:true});
const md=['<!-- cmd:block:v1 id="p0b0" -->','Hello world.',
  '<!-- cmd:block:v1 id="p0b1" -->','Apples is red.'].join('\n');
const sha=createHash('sha256').update(md).digest('hex');
const prose=(id,phrase)=>{
  const from=md.indexOf(phrase);
  return {id,blockId:id.slice(0,4),type:'sentence',elementType:'paragraph',
    decision:'auto',from,to:from+phrase.length,sourceRanges:[{from,to:from+phrase.length}],
    original:phrase,corrected:null,translation:null};
};
const baseline={schema:'ocr2md-translation-units/v1',sourceSha256:sha,
  coordinate:'UTF-16 source offsets in unchanged CMD',rows:[
    prose('p0b0-s001','Hello world.'),prose('p0b1-s001','Apples is red.')
  ]};
const translated=(first,second,firstZh,secondZh)=>({...baseline,
  rows:baseline.rows.map((r,i)=>({...r,corrected:i?second:first,
    translation:i?secondZh:firstZh}))});
writeFileSync(join(runtime,'document.md'),md);
writeFileSync(join(runtime,'unlock-token'),'isolated-test-unlock-token-123456');
writeFileSync(join(input,'document.md'),md);
writeFileSync(join(input,'translation-units.json'),JSON.stringify(baseline));
writeFileSync(join(input,'translated-gpt.json'),JSON.stringify(
  translated('Hello world.','Apples are red.','你好，世界。','苹果是红色的。')));
writeFileSync(join(input,'translated-grok.json'),JSON.stringify(
  translated('Hello world.','Apples have red skin.','你好，世界！','苹果的表皮是红色的。')));
const port=await new Promise((resolve,reject)=>{
  const listener=createServer();listener.once('error',reject);
  listener.listen(0,'127.0.0.1',()=>{
    const value=listener.address().port;
    listener.close(error=>error?reject(error):resolve(value));
  });
});
const base=`http://127.0.0.1:${port}/labs/sentence-benchmark/`;
const server=spawn('python3',['labs/sentence-benchmark/server.py'],{
  cwd:process.cwd(),env:{...process.env,V6_PORT:String(port),
    V6_LAB_RUNTIME:runtime,V6_LAB_UNLOCK_TOKEN_PATH:join(runtime,'unlock-token'),
    V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:''},stdio:'ignore'
});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
  let ready=false;
  for(let i=0;i<150;i++){
    try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
    await pause(150);
  }
  assert(ready,'isolated Lab server failed to start');
  const served=await fetch(base+'api/translation-review-data');
  assert.equal(served.status,200);
  const actual=await served.json();
  assert.deepEqual(Object.keys(actual.translations).sort(),['gpt','grok']);
  assert.equal(actual.baseline.sourceSha256,sha);
  for(const [name,browserType,binary] of [
    ['Chromium',chromium,chromeExecutable()],
    ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]
  ]){
    const browser=await browserType.launch({headless:true,
      ...(binary?{executablePath:binary}:{})});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
        viewport:{width:1150,height:850}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
      await page.getByRole('heading',{name:'实验工作台'}).waitFor();
      assert.equal(await page.locator('.lab-home-card').count(),2);
      assert.equal(await page.locator('#lab-sentence').getAttribute('href'),'./sentence-benchmark.html');
      await page.locator('#lab-translation').click();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent
        .includes('已读取独立校译文件'),null,{timeout:45000});
      assert.equal(await page.locator('.ocr-sb-pane').count(),3);
      assert.equal(await page.locator('.ocr-sb-pane .cm-editor').count(),3);
      assert.equal(await page.locator('#record-picker option').count(),2);
      assert.equal(await page.locator('#record-count').textContent(),'1 / 2');
      assert(await page.locator('.ocr-sb-pane[data-engine="original"] .cm-content')
        .textContent().then(x=>x.includes('Hello world.')));
      assert(await page.locator('.ocr-sb-pane').nth(1).textContent().then(x=>x.includes('苹果是红色的。')));
      assert(await page.locator('.ocr-sb-pane').nth(2).textContent().then(x=>x.includes('苹果的表皮是红色的。')));
      await page.locator('#record-picker').selectOption('p0b1-s001');
      assert.equal(await page.locator('#record-count').textContent(),'2 / 2');
      assert.equal(await page.locator('.ocr-tr-current').count(),3,
        'all three panes highlight one shared record');
      await page.locator('#filter-mode').selectOption('english-diff');
      assert.equal(await page.locator('#record-picker option').count(),1);
      assert.equal(await page.locator('#record-count').textContent(),'1 / 1');
      await page.locator('a[href="./lab-home.html"]').click();
      await page.getByRole('heading',{name:'实验工作台'}).waitFor();
      await page.locator('#lab-sentence').click();
      await page.locator('#workspace .cm-editor').first().waitFor({timeout:45000});
      assert.equal(await page.locator('a[href="./lab-home.html"]').count(),1);
      assert.deepEqual(errors,[],name+' browser errors: '+errors.join('; '));
      console.log(name+': Lab home -> translation -> home -> sentence, 3 panes OK');
    }finally{await browser.close();}
  }
  assert.equal(readFileSync(join(input,'document.md'),'utf8'),md,
    'Lab browsing must not change original source');
  console.log('PASS: independent Lab navigation and translation comparison');
}finally{
  server.kill('SIGTERM');
  await pause(250);
  rmSync(root,{recursive:true,force:true});
}
