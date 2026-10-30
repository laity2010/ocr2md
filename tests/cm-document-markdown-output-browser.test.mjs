/** CMD returns the sole CM6 Markdown source without legacy output projections. */
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const sample=fixture.toString('utf8');
assert.equal((sample.match(/^<!-- minerujson:end:v1:/gm)||[]).length,0);
const documentPath=resolve(`.v6/tests/cmd-output-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});
writeFileSync(documentPath,fixture);
const port=5277,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),
    env:{...process.env,V6_DOCUMENT_PATH:documentPath},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const browsers=[['Chrome',chromium,{executablePath:chromeExecutable()}],
 ['iPad WebKit',webkit,{executablePath:webkitExecutable()}]];
try {
 let ready=false;
 for(let i=0;i<140;i++){
  try{if((await fetch(url)).ok){ready=true;break}}catch{}
  await delay(130);
 }
 assert(ready,'isolated Vite server did not start');
 for(const [name,browserEngine,launch] of browsers){
  const browser=await browserEngine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)
     ?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
   await page.waitForFunction(()=>window.__v6cm6?.cm?.getMarkdown &&
     window.__v6cm6?.outline?.rows?.length===21,null,{timeout:85000});
   const result=await page.evaluate(async()=>{
    const {cm}=window.__v6cm6;
    const before=cm.doc;
    const original=cm.markdown;
    const raw=cm.getMarkdown();
    const anchors=(raw.match(/^<!-- minerujson:block:v1:/gm)||[]).length;
    const originalEnds=(original.match(/^<!-- minerujson:end:v1:/gm)||[]).length;
    const dirtyAfter=window.__v6cm6.dirty;
    const {CMDocument}=await import('/cm-document.js');
    const container=document.createElement('div');
    container.style.display='none';document.body.append(container);
    const synthetic='Beginning\n\n<!-- minerujson:end:v1:0:0 -->\n\n<!-- minerujson:block:v1:0:1 -->\n';
    const independent=new CMDocument({parent:container,markdown:synthetic});
    const smallOutput=independent.getMarkdown();
    const smallDocIntact=independent.doc.toString()===synthetic;
    independent.destroy();container.remove();
    return {rawIsOriginal:raw===original,originalEnds,anchors,
      originalUnchanged:cm.markdown===original,docIdentityUnchanged:cm.doc===before,
      dirtyAfter,smallOutput,smallDocIntact};
   });
   assert.equal(result.rawIsOriginal,true);
   assert.equal(result.originalEnds,0);
   assert.equal(result.anchors,224);
   assert(result.originalUnchanged&&result.docIdentityUnchanged);
   assert.equal(result.dirtyAfter,false);
   assert(result.smallOutput.includes('<!-- minerujson:end:v1:0:0 -->'),
     'CMD must never mutate legacy bytes implicitly');
   assert(result.smallDocIntact);
   assert.deepEqual(errors,[],'unexpected browser errors');
   console.log('CMD_SINGLE_SOURCE_PASS',name,JSON.stringify({blocks:result.anchors,
     ends:result.originalEnds,rawAndEditorUnchanged:true,dirty:false,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.deepEqual(readFileSync(documentPath),fixture,'test wrote its own source fixture');
}finally{server.kill('SIGTERM');unlinkSync(documentPath)}
