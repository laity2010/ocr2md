/** Browser acceptance: actual PDF child-chip gesture absorbs a 3-child parent.
 * Save to a disposable fixture and require exact CM6-generated Markdown bytes.
 * Never modifies a real user document or the original PDF.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,readCMDBlockChains} from '../ui/cmd-block-chains.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const initial=toMarkdown(raw);
const plan=planCMDReparentPBS(initial,'p4b0','p4b1s1');
assert.deepEqual(plan.memberIds,['p4b1s3','p4b1s4','p4b1s5']);
const expected=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
  assert.equal(text.slice(e.from,e.to),e.expected);
  return text.slice(0,e.from)+e.insert+text.slice(e.to);
},initial);
assert.equal(toMineruJSON(expected),raw);
const dir=mkdtempSync(join(tmpdir(),'ocr2md-multi-child-acceptance-'));
const doc=join(dir,'document.md');writeFileSync(doc,initial);
const port=await new Promise((ok,fail)=>{
  const s=createServer();s.once('error',fail);
  s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?fail(e):ok(p));});
});
const base=`http://127.0.0.1:${port}/`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAB_ID:'',V6_LAN_TLS_HOST:'',
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist'),V6_SETTINGS_PATH:join(dir,'settings.json'),
  V6_TOKEN_PATH:join(dir,'token')},stdio:'ignore'});
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const center=r=>({clientX:r.x+r.width/2,clientY:r.y+r.height/2});
let browser;
try {
  let ready=false;
  for(let i=0;i<180;i++){try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}await sleep(150);}
  assert(ready,'isolated PDF server unavailable');
  browser=await chromium.launch({headless:true,...(chromeExecutable()?{executablePath:chromeExecutable()}:{})});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:900}});
  page.setDefaultTimeout(28000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  assert.equal((await page.goto(base,{waitUntil:'domcontentloaded',timeout:70000})).status(),200);
  console.log('MULTI_STEP','page');
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:95000});
  await page.locator('#module-select').evaluate(el=>{el.value='text-block';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(count=>document.querySelector('#status')?.textContent?.includes('PBS '+count),
    readCMDBlockChains(initial).atoms.length,{timeout:65000});
  await selectPreview(page,'pdf');
  console.log('MULTI_STEP','PDF/text-block ready');
  const from=page.locator('.ocr-pdf-block-cover[data-block-id="p4b0"] > .ocr-pdf-block-ctrl');
  const to=page.locator('.ocr-pdf-block-fragment[data-subblock-id="p4b1s1"] > .ocr-pdf-subblock-chip');
  await from.waitFor({state:'attached',timeout:50000});
  await to.scrollIntoViewIfNeeded({timeout:35000});
  const fr=await from.boundingBox(),tr=await to.boundingBox();
  assert(fr&&tr,'p4b0 and p4b1s1 labels must render');
  console.log('MULTI_RECTS',JSON.stringify({from:fr,to:tr}));
  const touch={bubbles:true,pointerId:732,pointerType:'touch',button:0,isPrimary:true};
  await from.dispatchEvent('pointerdown',{...touch,...center(fr)});
  await page.locator('.ocr-pdf-block-drag-source').waitFor({state:'attached',timeout:7000});
  await page.locator('body').dispatchEvent('pointermove',{...touch,...center(tr)});
  const rail=page.locator('.ocr-pdf-block-drop-guide');
  await rail.waitFor({state:'attached',timeout:7000});
  const hit=await page.locator('.ocr-pdf-status').textContent();
  console.log('MULTI_HOVER',hit);
  assert(hit.includes('p4b1s1'),'wrong drop target');
  const zone=rail.locator('[data-placement="child"]');
  const zr=await zone.boundingBox();assert(zr);
  await page.locator('body').dispatchEvent('pointermove',{...touch,...center(zr)});
  await page.locator('body').dispatchEvent('pointerup',{...touch,...center(zr)});
  await page.waitForTimeout(9000);
  console.log('MULTI_AFTER_DROP_DIAG',JSON.stringify(await page.evaluate(()=>({
    pdfStatus:document.querySelector('.ocr-pdf-status')?.textContent,
    globalStatus:document.querySelector('#status')?.textContent,
    p4b0Count:document.querySelectorAll('.ocr-pdf-block-cover[data-block-id="p4b0"]').length,
    covers:[...document.querySelectorAll('.ocr-pdf-block-cover')].filter(n=>n.dataset.blockId?.startsWith('p4b1')||n.dataset.originId?.startsWith('p4b0')).map(n=>({id:n.dataset.blockId,origin:n.dataset.originId,sub:[...n.querySelectorAll('[data-subblock-id]')].map(x=>x.dataset.subblockId)})).slice(0,20),
    children:[...document.querySelectorAll('[data-subblock-id]')].filter(n=>n.dataset.subblockId?.startsWith('p4b1')).map(n=>n.dataset.subblockId).slice(0,20),
    row:[...document.querySelectorAll('.ocr-text-block-grid .ag-row')].filter(n=>n.getAttribute('row-id')?.startsWith('p4b1')).map(n=>n.getAttribute('row-id'))
  }))));
  await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p4b0"]')&&
    ['p4b1s3','p4b1s4','p4b1s5'].every((id,i)=>document.querySelector(
      `.ocr-pdf-block-cover[data-block-id="${id}"][data-origin-id="p4b0s${i}"]`)),
    null,{timeout:65000});
  console.log('MULTI_DROP_STATUS',await page.locator('#status').textContent());
  assert.equal(readFileSync(doc,'utf8'),initial,'must not autosave');
  assert.equal(errors.length,0,'JS errors: '+errors.join(';'));
  await page.locator('#undo').evaluate(el=>el.click());
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-block-cover[data-block-id="p4b0"]')&&
    !document.querySelector('.ocr-pdf-block-cover[data-block-id="p4b1s3"]'),
    null,{timeout:55000});
  console.log('MULTI_STEP','undo PASS');
  await page.locator('#redo').evaluate(el=>el.click());
  await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-block-cover[data-block-id="p4b0"]')&&
    document.querySelector('.ocr-pdf-block-cover[data-block-id="p4b1s5"]'),null,{timeout:55000});
  console.log('MULTI_STEP','redo PASS');
  await page.locator('#save').evaluate(el=>el.click());
  // Production intentionally rejects unauthenticated saves. Unlock ONLY the
  // disposable isolated test server with the token it generated in this dir.
  await page.waitForFunction(()=>document.querySelector('#unlock-dialog')?.open,
    null,{timeout:15000});
  const unlockCode=readFileSync(join(dir,'token'),'utf8').trim().slice(0,12);
  await page.locator('#unlock-code').fill(unlockCode);
  await page.locator('#unlock-form button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
    null,{timeout:45000});
  let saved=false;
  for(let i=0;i<180;i++){if(readFileSync(doc,'utf8')===expected){saved=true;break;}await sleep(250);}
  if(!saved){const actual=readFileSync(doc,'utf8');console.log('MULTI_SAVE_DIFF',JSON.stringify({actualBytes:actual.length,expectedBytes:expected.length,same:actual===expected,status:await page.locator('#status').textContent()}));}
  assert(saved,'actual CM6 edited document saved bytes must equal full CMD expected source');
  assert.equal(toMineruJSON(readFileSync(doc,'utf8')),raw,'original JSON must be byte-exact');
  console.log('PDF_MULTI_CHILD_ABSORB_BROWSER_PASS Chrome p4b0 into p4b1s1',{children:plan.memberIds,sourceByteExact:true,undo:true,redo:true,originalOCR:true});
}finally{try{await browser?.close();}catch{}server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
