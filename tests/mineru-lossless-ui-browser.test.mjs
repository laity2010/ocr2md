/** New lossless comments must stay invisible in MD preview and leave AG
 * headings, original PDF and CM6 editing/scrolling behaviors intact. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
import {buildOutline} from '../ui/outline-index.js';
const file=resolve('.v6/tests/staged-lossless-alpha.md');
const staged=readFileSync(file,'utf8');
const old=readFileSync('.v6/workspace/buffetts-alpha.minerujson.md','utf8');
const expectedHeadings=buildOutline(old).length;
assert.equal(buildOutline(staged).length,expectedHeadings,'staging altered heading index');
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<engines.length;i++){
 const [name,engine,launch]=engines[i],port=5280+i;
 const url=`http://127.0.0.1:${port}/`;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
  V6_PORT:String(port),V6_DOCUMENT_PATH:file,V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
  V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser;
 try{
  let up=false;for(let j=0;j<100;j++){try{if((await fetch(url+'healthz')).ok){up=true;break}}catch{}await pause(140)}
  assert(up,'isolated server did not start');
  browser=await engine.launch({headless:true,...launch});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>document.querySelectorAll('.ag-row').length>=10&&
    document.querySelector('.cm-content[contenteditable="true"]')&&
    document.querySelector('.ocr-markdown')?.textContent?.includes('Bufett'),null,{timeout:80000});
  const state=await page.evaluate(()=>({
    mdLength:document.querySelector('.cm-content').textContent?.length,
    agRowCount:document.querySelectorAll('.ag-row').length,
    visibleComments:document.querySelector('.ocr-markdown').textContent?.includes('minerujson:discarded:v1:'),
    headingCount:document.querySelectorAll('.ag-row').length,
    blocks:document.querySelectorAll('.ocr-markdown [data-source-start]').length,
    title:document.querySelector('.ag-row[row-index="0"] [col-id="title"]')?.textContent,
    pdfLoading:document.querySelector('.ocr-pdf-status')?.textContent,
  }));
  assert.equal(state.agRowCount,expectedHeadings);
  assert.equal(state.visibleComments,false,'PDF discarded raw text exposed in rendered MD preview');
  assert(state.title?.includes('Bufett'),`unexpected AG title ${state.title}`);
  await page.locator('.ocr-preview-mode').selectOption('pdf');
  await page.locator('.ag-row[row-index="3"] [col-id="title"]').click();
  await page.waitForFunction(()=>document.querySelector('.ocr-pdf-region-overlay[data-pdf-page="3"]'),
    null,{timeout:23000});
  assert.deepEqual(errors,[],`${name} browser errors`);
  assert.equal(readFileSync(file,'utf8'),staged,'test changed staged document');
  console.log('MINERU_LOSSLESS_UI_PASS',name,JSON.stringify({ag:state.agRowCount,title:state.title,
    previewHidesEvidence:!state.visibleComments,pdfLocated:true,errors:errors.length}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM')}
}
