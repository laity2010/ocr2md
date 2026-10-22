import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';

const base='http://127.0.0.1:5198';
const evidence='.v6/evidence/wp1';
const testFile='.v6/tests/wp1-document-test.md';
const fixture='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const beforeHash=createHash('sha256').update(readFileSync(fixture)).digest('hex');
mkdirSync(evidence,{recursive:true});
mkdirSync('.v6/tests',{recursive:true});
// Reset only the isolated test document, never the immutable fixture or user work file.
writeFileSync(testFile,readFileSync(fixture));
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port','5198','--strictPort'],{cwd:process.cwd(),env:{...process.env,
    V6_DOCUMENT_PATH:resolve(testFile)},stdio:'ignore'});
let started=false;
try {
  for(let i=0;i<150;i++) {
    try{if((await fetch(base)).ok){started=true;break}}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  assert(started,'isolated CM6 browser test server unavailable');
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-first-run']});
const errors=[];
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>!!window.__v6cm6?.view && document.querySelector('#status')?.textContent.includes('✓ 已加载'),{timeout:20000});
  const initial=await page.evaluate(()=>({length:window.__v6cm6.view.state.doc.length,lines:window.__v6cm6.view.state.doc.lines,doc:window.__v6cm6.view.state.doc.sliceString(0,40)}));
  assert(initial.length>300000,'real sample should be loaded');
  assert(initial.doc.includes('minerujson:block'),'sample is real MinerU JSON Markdown');
  await page.screenshot({path:`${evidence}/desktop.png`,fullPage:true});
  const report=await page.locator('#status').textContent();
  assert(report.includes('大纲'),'CM6 source headings not projected to AG');
  assert.equal(await page.evaluate(()=>window.__v6cm6.cm.getMarkdown()===
    window.__v6cm6.view.state.doc.toString()),true,
    'CMD must return CM6 authoritative Markdown, without a diagnostic shadow');
  // Use CM6's own transaction and history; browser UI remains the same editor.
  const edit=await page.evaluate(()=>{
    const view=window.__v6cm6.view;
    const from=view.state.doc.toString().indexOf('Bufett’s Alpha');
    if (from<0)throw Error('Expected original headline missing');
    view.dispatch({changes:{from,to:from+ 'Bufett’s Alpha'.length,insert:'Buffett’s Alpha'}});
    const edited=view.state.doc.sliceString(from,from+15);
    return {from,edited};
  });
  assert(edit.edited.includes('Buffett'));
  assert.match(await page.locator('#status').textContent(),/未保存/);
  await page.locator('#undo').click();
  assert(await page.evaluate(()=>window.__v6cm6.view.state.doc.sliceString(window.__v6cm6.view.state.doc.toString().indexOf('Bufett’s Alpha'),window.__v6cm6.view.state.doc.toString().indexOf('Bufett’s Alpha')+13)));
  await page.locator('#redo').click();
  const previous=await page.evaluate(()=>{
    const view=window.__v6cm6.view;
    const anchor=view.state.doc.length-1300;
    view.dispatch({selection:{anchor},scrollIntoView:true});
    window.__v6testOriginalView=view;
    return {anchor,length:view.state.doc.length};
  });
  // ScrollIntoView is applied on the next frame, so measure only when settled.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  previous.scrollTop=await page.evaluate(()=>window.__v6cm6.view.scrollDOM.scrollTop);
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('✓ 已保存'));
  const after=await page.evaluate(()=>{
    const v=window.__v6cm6.view;
    return {anchor:v.state.selection.main.anchor,scrollTop:v.scrollDOM.scrollTop,length:v.state.doc.length,sameView:v===window.__v6testOriginalView};
  });
  assert(after.sameView,'save recreated CM6 editor');
  console.log('SAVE_POSITION',JSON.stringify({before:previous.scrollTop,after:after.scrollTop}));
  assert.equal(after.anchor,previous.anchor,'save changed cursor position');
  assert(Math.abs(after.scrollTop-previous.scrollTop)<2,'save changed scroll position');
  assert.equal(after.length,previous.length,'save changed document length');
  assert(existsSync(testFile),'real save did not create disk working copy');
  const disk=readFileSync(testFile,'utf8');
  assert(disk.includes('Buffett’s Alpha'),'disk save missed live edit');
  const memory=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
  assert.equal(disk,memory,'saved bytes differ from CM6 document');
  await page.reload();
  await page.waitForFunction(()=>window.__v6cm6?.view?.state.doc.toString().includes('Buffett’s Alpha'));
  const testAfterReload=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
  assert.equal(testAfterReload,disk,'reloaded bytes differ from saved file');
  await page.setViewportSize({width:1032,height:642});
  await page.screenshot({path:`${evidence}/ipad-viewport.png`,fullPage:true});
  assert.equal(errors.length,0,'JS errors: '+errors.join(';'));
  assert.equal(createHash('sha256').update(readFileSync(fixture)).digest('hex'),beforeHash,'source fixture was modified');
  console.log('BROWSER_TEST_PASS',JSON.stringify({size:initial.length,lines:initial.lines,extract:report,undoRedo:'pass',savedBytes:disk.length,selectionPreserved:true,scrollPreserved:true,refreshRoundTrip:true,sourceFixtureUnchanged:true,screenshots:[`${evidence}/desktop.png`,`${evidence}/ipad-viewport.png`]}));
} finally {await browser.close();}
} finally {server.kill('SIGTERM');}
