import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';
const root=process.cwd(),fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const files=['packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  '.v6/workspace/buffetts-alpha.minerujson.md','.v6/release/index.html'];
const hash=b=>createHash('sha256').update(b).digest('hex');
const hashes=files.map(f=>hash(readFileSync(f)));
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
  ['WebKit',webkit,{executablePath:webkit.executablePath()}]];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
for(const [n,[name,engine,options]] of engines.entries()){
 if(process.env.V6_ONLY_CHROME && name!=='Chrome')continue;
 if(process.env.V6_ONLY_WEBKIT && name!=='WebKit')continue;
 const port=4511+n,url=`http://127.0.0.1:${port}/`;
 const work=resolve(`.v6/tests/promoted-${name.toLowerCase()}-${process.pid}`);
 mkdirSync(work,{recursive:true});
 const doc=join(work,'document.md');writeFileSync(doc,fixture);
 const chapters=join(work,'chapters');assert(!existsSync(chapters));
 const server=spawn('python3',['scripts/v6_serve.py'],{
  cwd:root,env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore',
 });
 let browser;
 try{
  let ready=false;
  for(let t=0;t<130;t++){
   try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}await wait(150);
  }
  assert(ready,`V6 test server ${name} not ready`);
  assert.equal((await fetch(url+'api/export-chapters',{method:'POST',headers:{'Origin':url.slice(0,-1)},body:'{}'})).status,403);
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
  const grid=page.locator('.ag-row[row-index="1"]');
  await page.locator('.ocr-chapter-checkbox-hit').first().waitFor({state:'visible',timeout:50000});
  const first=await page.locator('.ag-row[row-index="0"] [col-id="chapterFile"]').textContent();
  const second=await grid.locator('[col-id="chapterFile"]').textContent();
  assert.notEqual(first,second);
  assert(first.startsWith('000-'),name+' default chapter start must be 000');
  assert(second.startsWith('001-'),name+' second chapter must be 001');
  assert.deepEqual(await page.locator('#module-select option').allTextContents(),['章节定界','媒体','LaTeX','全局设置']);
  assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
  assert.deepEqual(await page.locator('#module-actions button').allTextContents(),['导出章节']);
  assert.equal(await page.locator('#chapter-start-number').inputValue(),'000');
  assert.equal(await page.locator('#inspect').count(),0);
  // Leading zeros are formatting, not numeric noise. Each width is visible
  // immediately and remains unchanged after blur, with no CM6 transaction.
  for(const [input,firstFile,secondFile] of [
    ['0','0-','1-'], ['00','00-','01-'],
    ['0000','0000-','0001-'],['007','007-','008-'],
    ['00000','00000-','00001-'],
  ]){
    await page.locator('#chapter-start-number').fill(input);
    await page.waitForFunction(([a,b])=>{
      const text=i=>document.querySelector(`.ag-row[row-index="${i}"] [col-id="chapterFile"]`)?.textContent;
      return text(0)?.startsWith(a)&&text(1)?.startsWith(b);
    },[firstFile,secondFile],{timeout:12000});
    await page.locator('#chapter-start-number').blur();
    assert.equal(await page.locator('#chapter-start-number').inputValue(),input,
      `width lost after blur: ${input}`);
  }
  const originalSource=readFileSync(doc);
  await page.locator('#chapter-start-number').fill('0025');
  await page.waitForFunction(()=>{
    const file=index=>document.querySelector(`.ag-row[row-index="${index}"] [col-id="chapterFile"]`)?.textContent;
    return file(0)?.startsWith('0025-') && file(1)?.startsWith('0026-');
  },null,{timeout:12000});
  assert(readFileSync(doc).equals(originalSource),
    'renumber must never write the Markdown');
  assert(!(/未保存/.test(await page.locator('#status').textContent())),
    'renumber must not mark Markdown dirty');
  await page.locator('#chapter-start-number').fill('bad');
  assert.equal(await page.locator('#chapter-start-number').getAttribute('aria-invalid'),'true');
  assert((await page.locator('.ag-row[row-index="0"] [col-id="chapterFile"]').textContent()).startsWith('0025-'));
  await page.locator('#chapter-start-number').blur();
  assert.equal(await page.locator('#chapter-start-number').inputValue(),'0025');
  assert.equal(await page.locator('.ag-row[row-index="0"] input.ocr-outline-checkbox').isDisabled(),true);
  await grid.locator('.ocr-outline-checkbox').uncheck();
  await page.waitForFunction(()=>{
    const r0=document.querySelector('.ag-row[row-index="0"] [col-id="chapterFile"]')?.textContent;
    const r1=document.querySelector('.ag-row[row-index="1"] [col-id="chapterFile"]')?.textContent;
    return r0&&r0===r1;
  },null,{timeout:16000});
  assert(!existsSync(chapters));
  assert.match(await page.locator('#status').textContent(),/未保存/);
  assert.equal(await page.locator('#marker-format,#inspect,#parse-report').count(),0);
  await page.locator('#save').click();
  await page.locator('#unlock-dialog').waitFor({state:'visible',timeout:10000});
  const code=readFileSync('.v6/private/editor-token','utf8').trim().slice(0,12);
  await page.locator('#unlock-code').fill(code);
  await page.locator('#unlock-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:15000});
  assert(readFileSync(doc,'utf8').includes('<!-- ocr2md:chapter:v1'));
  assert.equal(await page.locator('.ocr-chapter-link').count(),0);
  await page.locator('#export-chapters').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已导出20个章节'),null,{timeout:25000});
  assert(existsSync(chapters));
  const manifest=JSON.parse(readFileSync(join(chapters,'manifest.json'),'utf8'));
  assert.equal(manifest.files.length,20);
  assert(manifest.files[0].name.startsWith('0025-'));
  assert(manifest.files[1].name.startsWith('0026-'));
  assert(manifest.files.at(-1).name.startsWith('0044-'));
  assert.equal(manifest.sourceSha256,hash(readFileSync(doc)));
  assert.equal(readdirSync(chapters).length,21);
  const url0=await page.locator('.ag-row[row-index="0"] .ocr-chapter-link').getAttribute('href');
  assert(url0.startsWith('/api/chapters/'));
  const result=await page.evaluate(path=>fetch(path).then(async r=>({status:r.status,text:await r.text()})),url0);
  assert.equal(result.status,200);
  assert(result.text.includes('## Bufett’s Alpha'));
  assert(!result.text.includes('minerujson:source:v1:'));
  console.log('V6_PROMOTED_CHAPTER_EXPORT_PASS',name,JSON.stringify({count:manifest.files.length,filename:manifest.files[0].name,firstChars:result.text.length}));
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('.ag-row[row-index="0"] .ocr-chapter-link').waitFor({state:'visible',timeout:25000});
  assert.equal(await page.locator('#chapter-start-number').inputValue(),'0025',
    'exported numbering must preserve four digits on reopening');
  // Changing ONLY start number invalidates the old export, never modifies source.
  const savedSource=readFileSync(doc);
  // Same numeric 25 but removing a leading zero must invalidate old links.
  await page.locator('#chapter-start-number').fill('025');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-chapter-link').length===0 &&
    document.querySelector('.ag-row[row-index="0"] [col-id="chapterFile"]')?.textContent.startsWith('025-'),
    null,{timeout:12000});
  await page.locator('#chapter-start-number').blur();
  assert.equal(await page.locator('#chapter-start-number').inputValue(),'025');
  assert(readFileSync(doc).equals(savedSource));
  await page.locator('#chapter-start-number').fill('0025');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-chapter-link').length>0,
    null,{timeout:12000});
  await page.locator('.ag-row[row-index="2"] input.ocr-outline-checkbox').uncheck();
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-chapter-link').length===0,null,{timeout:20000});
  await page.locator('#export-chapters').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已导出19个章节'),null,{timeout:25000});
  const secondManifest=JSON.parse(readFileSync(join(chapters,'manifest.json'),'utf8'));
  assert.equal(secondManifest.files.length,19);
  assert(secondManifest.files[0].name.startsWith('0025-'));
  assert(secondManifest.files.at(-1).name.startsWith('0043-'));
  assert.equal(readdirSync(chapters).length,20);
  // Confirm no accidental mutation of the main workspace/fixture.
  assert.deepEqual(files.map(f=>hash(readFileSync(f))),hashes);
  assert.deepEqual(errors,[],name+' page errors');
  await page.screenshot({path:`.v6/evidence/promoted-chapters-${name.toLowerCase()}.png`,timeout:12000});
  console.log('V6_PROMOTED_CHAPTER_REOPEN_REEXPORT_PASS',name);
 }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
console.log('V6_PROMOTION_ISOLATION_PASS');
