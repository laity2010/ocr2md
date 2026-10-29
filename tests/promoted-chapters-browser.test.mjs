/** Former physical-export regression, now verifies the promoted virtual chapter
 * contract: no export, immediate CMD index projections, one mother document,
 * persistent chapter markers, URL restoration, and strict save authorization.
 * Browser and server use disposable fixtures, never the Main/Lab user runtime.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';

const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const hash=b=>createHash('sha256').update(b).digest('hex');
const originalHash=hash(original),pause=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium],['WebKit',webkit]];
for(const [number,[name,engine]] of engines.entries()){
 if(process.env.V6_ONLY_CHROME && name!=='Chrome')continue;
 if(process.env.V6_ONLY_WEBKIT && name!=='WebKit')continue;
 const scratch=mkdtempSync(join(tmpdir(),`ocr2md-virtual-promoted-${name.toLowerCase()}-`));
 const doc=join(scratch,'document.md'),settings=join(scratch,'settings.json'),token=join(scratch,'token');
 writeFileSync(doc,original);writeFileSync(settings,'{"settings":{}}\n');
 const key='VIRTUAL_CHAPTER_TEST_TOKEN_ONLY_'+process.pid;
 writeFileSync(token,key+'\n');
 const port=4511+number,url=`http://127.0.0.1:${port}/`;
 const server=spawn('python3',['scripts/v6_serve.py'],{
  cwd:process.cwd(),env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',
   V6_LAB_ID:'',V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:token,
   V6_STATIC_ROOT:resolve('dist'),V6_LAN_TLS_HOST:'',V6_LAN_LAB_ROUTES:''},stdio:'ignore',
 });
 let browser;
 try{
  let ready=false;
  for(let i=0;i<180;i++){try{if((await fetch(url+'healthz')).ok){ready=true;break}}catch{}await pause(150)}
  assert(ready,`isolated Main server unavailable ${name}`);
  browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1032,height:642},
   hasTouch:name==='WebKit',isMobile:name==='WebKit'});
  const errors=[],writes=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('request',r=>{if(r.url().startsWith(url+'api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.method())});
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
  const source=page.locator('.ocr-source-pane .ocr-lab-file-select');
  const all=page.locator('input[aria-label="章节所有"]');
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length>=3,
   null,{timeout:25000}).catch(async error=>{
    const diagnostic=await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,
      title:document.title,nav:document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.outerHTML?.slice(0,700),
      outline:window.__v6cm6?.outline?.rows?.length,body:document.body.textContent?.slice(0,300)}));
    throw Error('Virtual promoted startup '+JSON.stringify({diagnostic,errors}),{cause:error});
   });
  assert.equal(await page.locator('#module-select').inputValue(),'chapter-boundary');
  assert.equal(await page.locator('#export-chapters').isVisible(),false,'physical export control must not be user-visible');
  assert.equal(await page.locator('.ocr-chapter-link').count(),0,'no physical chapter links');
  const originalOptions=await source.locator('option[value^="virtual:"]').evaluateAll(nodes=>nodes.map(n=>({value:n.value,text:n.textContent})));
  assert(originalOptions.length>=3,'real CMD index must project several virtual chapters');
  assert(originalOptions.every(item=>item.text.startsWith('章节chapter/')));
  await page.locator('#ag-functions-toggle').click();
  assert.equal(await page.locator('#chapter-start-number').inputValue(),'000');
  assert.equal(await source.inputValue(),'document');
  assert(await all.isDisabled(),'章节定界中的 全部 必须勾选置灰');
  assert(await all.isChecked());
  assert(await page.locator('.ocr-outline-grid .ag-row[row-index="1"] .ocr-outline-checkbox').isEnabled(),
    '章节定界必须允许修改后续行的 独立成章');
  assert.equal(await page.locator('.ocr-outline-grid .ag-header-cell[col-id="independent"]').count(),1);
  assert.equal(await page.locator('.ocr-outline-grid .ag-header-cell[col-id="chapterFile"]').count(),0);
  assert.equal(await page.locator('.ocr-outline-grid .ag-header-cell[col-id="virtualChapter"]').count(),1);
  // Renumbering reformats virtual filenames only; no disk writes or markdown edits.
  for(const [value,prefix] of [['0','章节chapter/0-'],['00','章节chapter/00-'],
   ['0000','章节chapter/0000-'],['007','章节chapter/007-'],['00000','章节chapter/00000-']]){
   await page.locator('#chapter-start-number').fill(value);
   await page.waitForFunction(prefix=>[...document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]')]
    .some(el=>el.textContent.startsWith(prefix)),prefix,{timeout:18000});
   await page.locator('#chapter-start-number').blur();
   assert.equal(await page.locator('#chapter-start-number').inputValue(),value);
   assert.equal(hash(readFileSync(doc)),originalHash,'chapter numbering wrote source');
  }
  await page.locator('#chapter-start-number').fill('0025');
  await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]')]
   .some(el=>el.textContent.startsWith('章节chapter/0025-')),{timeout:18000});
  await page.locator('#chapter-start-number').fill('bad');
  assert.equal(await page.locator('#chapter-start-number').getAttribute('aria-invalid'),'true');
  await page.locator('#chapter-start-number').blur();
  assert.equal(await page.locator('#chapter-start-number').inputValue(),'0025');
  assert(await page.locator('.ocr-outline-grid .ag-row[row-index="0"] .ocr-outline-checkbox').isDisabled());
  // Real independent-chapter checkbox changes the mother document only in CM6,
  // and the virtual list must change immediately without an export operation.
  await page.locator('.ocr-outline-grid .ag-row[row-index="1"] .ocr-outline-checkbox').uncheck();
  await page.waitForFunction(old=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===old-1,
   originalOptions.length,{timeout:22000});
  assert.equal(hash(readFileSync(doc)),originalHash,'unsaved CM6 edit wrote the server document');
  assert.match(await page.locator('#status').textContent(),/未保存/);
  assert.equal(await source.locator('option[value^="virtual:"]').count(),originalOptions.length-1);
  assert.equal(await page.locator('.ocr-chapter-link').count(),0);
  await page.locator('#undo').click();
  await page.waitForFunction(old=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===old,
   originalOptions.length,{timeout:22000});
  await page.locator('#redo').click();
  await page.waitForFunction(old=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]').length===old-1,
   originalOptions.length,{timeout:22000});
  const chosen=await source.locator('option[value^="virtual:"]').nth(1).getAttribute('value');
  await page.locator('.ocr-source-pane .ocr-navigation-files .ts-control').click();
  await page.locator(`body>.ocr-navigation-popup-files:visible [data-value="${chosen}"]`).click();
  await page.waitForFunction(value=>new URLSearchParams(location.search).get('view')===value.slice(8),chosen,{timeout:22000});
  assert.equal(await source.inputValue(),chosen);
  assert.equal(await all.isChecked(),false,'file navigation should narrow AG scope');
  await page.locator('#save').click();
  await page.locator('#unlock-dialog').waitFor({state:'visible',timeout:13000});
  await page.locator('#unlock-code').fill(key.slice(0,12));
  await page.locator('#unlock-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:20000});
  const saved=readFileSync(doc,'utf8');
  assert(saved.includes('<!-- ocr2md:chapter:v1'),'saved marker must persist in one mother file');
  assert.equal(writes.filter(method=>method==='PUT').length,1);
  assert(!existsSync(join(scratch,'chapters')),'no physical chapter directory may be exported');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(value=>document.querySelector('.ocr-source-pane .ocr-lab-file-select')?.value===value,
   chosen,{timeout:60000});
  assert.equal(await source.locator('option[value^="virtual:"]').count(),originalOptions.length-1);
  assert.equal(readFileSync(doc,'utf8'),saved,'reload must not rewrite mother doc');
  assert.deepEqual(errors,[],`${name} page errors`);
  assert.equal(hash(original),originalHash);
  console.log('V6_VIRTUAL_CHAPTER_PROMOTION_PASS',name,JSON.stringify({
   source:'one-mother-CM6',originalCount:originalOptions.length,
   afterMerge:originalOptions.length-1,rename:true,invalidInputProtected:true,
   undoRedo:true,saveAndReload:true,restoredChapter:chosen,
   physicalExport:false,errors:errors.length}));
 }finally{
  if(browser)await browser.close();server.kill('SIGTERM');
  rmSync(scratch,{recursive:true,force:true});
 }
}
