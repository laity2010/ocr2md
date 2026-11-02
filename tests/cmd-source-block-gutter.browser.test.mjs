/** WCP27 visual regression: CMD comments already display PBS identity.
 * No duplicate ID column is added next to CodeMirror line numbers.
 * Verify old and newly converted source without editing any disk document. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {chromeExecutable} from './platform.test-helper.mjs';
const oldSource=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const modern=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const work=mkdtempSync(join(tmpdir(),'ocr2md-cmd-no-duplicate-gutter-'));
const doc=join(work,'document.md');writeFileSync(doc,modern);
const port=await new Promise((ok,fail)=>{const server=createServer();server.once('error',fail);
  server.listen(0,'127.0.0.1',()=>{const p=server.address().port;
    server.close(e=>e?fail(e):ok(p));});});
const url=`http://127.0.0.1:${port}/`;
const host=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{...process.env,
  V6_DOCUMENT_PATH:doc,V6_PDF_PATH:join(work,'no-pdf.pdf')},stdio:'ignore'});
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
 let ready=false;for(let i=0;i<180;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await wait(160);}
 assert(ready,'isolated Vite preview did not start');
 for(const [name,engine,binary] of [['Chrome',chromium,chromeExecutable()],
   ['iPad-WebKit',webkit,process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath()]]){
  if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
  const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__v6cm6?.cm?.readSource()?.includes('<!-- cmd:block:v1 id="p0b0" -->'),null,{timeout:90000});
   for(const source of [modern,oldSource]){
    if(source!==modern)await page.evaluate(s=>window.__v6cm6.cm.loadMarkdown(s),source);
    await page.waitForFunction(s=>window.__v6cm6.cm.readSource()===s,source,{timeout:10000});
    const result=await page.evaluate(()=>({
      lineNumbers:document.querySelectorAll('.ocr-cm-source .cm-lineNumbers').length,
      extra:document.querySelectorAll('.ocr-cmd-block-id-gutter,.ocr-cmd-block-id').length,
      text:window.__v6cm6.cm.readSource(),
      atoms:window.__v6cm6.cm.queryBlockChains().atoms.length,
    }));
    assert.equal(result.lineNumbers,1,'native CM6 line numbers remain visible');
    assert.equal(result.extra,0,'no second PBS badge beside line numbers');
    assert.equal(result.text,source,'source annotations are not modified');
    assert.equal(result.atoms,source===modern?267:224);
   }
   assert.deepEqual(errors,[]);
   assert.equal(readFileSync(doc,'utf8'),modern,'browser operations never save the disk fixture');
   console.log('CMD_SOURCE_NO_DUPLICATE_BADGES_PASS',name,{legacyParents:224,newPBS:267,lineNumbers:true,noDiskWrite:true});
  }finally{await browser.close();}
 }
}finally{host.kill('SIGTERM');rmSync(work,{recursive:true,force:true});}
