/** Normal (not Playwright-intercepted) WebKit PDF stream: zoom, mode switches and
 * page navigation are independent from the intentional warm-up blockade test.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {webkit,devices} from 'playwright';
import {selectPreview} from './navigation-ui.test-helper.mjs';
import {createHash} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const original=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const pdfHash=hash(readFileSync(original));
const root=resolve('.v6/tests'),port=4686,url=`http://127.0.0.1:${port}/`;
mkdirSync(root,{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const doc=resolve(root,`normal-webkit-${process.pid}.md`);
writeFileSync(doc,fixture);
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{
  ...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_PDF_PATH:original,
  V6_SETTINGS_PATH:resolve(root,`normal-webkit-${process.pid}.settings.json`),V6_STATIC_ROOT:resolve('dist'),
}});
let browser;
try{
 let ready=false;for(let i=0;i<120;i++){try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,130));}
 assert(ready,'WebKit isolated server unavailable');
 browser=await webkit.launch({headless:true});
 const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Do not call page.route() on local PDF requests: PDF.js canvas zoom must
 // consume the real stream, not a Playwright-replayed response.
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent==='就绪',null,{timeout:55000});
 await selectPreview(page,'pdf');
 await page.locator('.ocr-pdf-page').fill('3');await page.locator('.ocr-pdf-page').press('Enter');
 await page.waitForFunction(()=>document.querySelector('.ocr-pdf-page')?.value==='3',null,{timeout:16000});
 await page.screenshot({path:'.v6/evidence/wp2-normal-webkit-before-zoom.png'});
 const before=await page.locator('.ocr-pdf-zoom').textContent();
 await page.locator('.ocr-pdf-plus').click({timeout:16000});
 const after=await page.locator('.ocr-pdf-zoom').textContent();
 assert.notEqual(before,after,'real WebKit PDF zoom did not change');
 await selectPreview(page,'md');
 assert.equal(await page.locator('.ocr-preview-mode').inputValue(),'md');
 await selectPreview(page,'pdf');
 assert.equal(await page.locator('.ocr-pdf-zoom').textContent(),after);
 await page.locator('.ocr-pdf-page').fill('8');await page.locator('.ocr-pdf-page').press('Enter');
 await page.waitForFunction(()=>document.querySelector('.ocr-pdf-page')?.value==='8',null,{timeout:14000});
 assert.deepEqual(errors,[]);assert.equal(hash(readFileSync(doc)),hash(fixture));
 assert.equal(hash(readFileSync(original)),pdfHash);
 await page.screenshot({path:'.v6/evidence/wp2-normal-webkit-after-zoom.png'});
 console.log('PDF_NORMAL_WEBKIT_PASS',{before,after,switched:'pdf→md→pdf',page8:true,errors:0});
}finally{if(browser)await browser.close();server.kill('SIGTERM');}
