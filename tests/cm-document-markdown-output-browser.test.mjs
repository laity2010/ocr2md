/** CMD read-only Markdown projection: raw and optional MinerU end-free output. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const sample=fixture.toString('utf8');
assert.equal((sample.match(/^<!-- minerujson:end:v1:/gm)||[]).length,224);
const documentPath=resolve(`.v6/tests/cmd-output-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});
writeFileSync(documentPath,fixture);
const port=5277,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),
    env:{...process.env,V6_DOCUMENT_PATH:documentPath},stdio:'ignore'});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const browsers=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['iPad WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
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
    const explicitRaw=cm.getMarkdown({omitMineruEnd:false});
    const projected=cm.getMarkdown({omitMineruEnd:true});
    const expected=original.replace(/^<!-- minerujson:end:v1:\d+:\d+ -->[ \t]*(?:\r?\n(?:\r?\n)?|$)/gm,'');
    const originalEnds=(original.match(/^<!-- minerujson:end:v1:/gm)||[]).length;
    const outputEnds=(projected.match(/^<!-- minerujson:end:v1:/gm)||[]).length;
    const anchors=(projected.match(/^<!-- minerujson:block:v1:/gm)||[]).length;
    const dirtyAfter=window.__v6cm6.dirty;
    // Exercise this CMD class independently on a small hand-authored document.
    const {CMDocument}=await import('/cm-document.js');
    const container=document.createElement('div');
    container.style.display='none';document.body.append(container);
    const synthetic='Beginning\n\n<!-- minerujson:end:v1:0:0 -->\n\n<!-- minerujson:block:v1:0:1 -->\n\n'+
      'Literal <!-- minerujson:end:v1:0:2 --> inside text\n\n<!-- minerujson:end:v1:0:3 -->\n';
    const independent=new CMDocument({parent:container,markdown:synthetic});
    const smallOutput=independent.getMarkdown({omitMineruEnd:true});
    const smallRaw=independent.getMarkdown();
    const smallDocIntact=independent.doc.toString()===synthetic;
    independent.destroy();container.remove();
    return {rawIsOriginal:raw===original,explicitRawIsOriginal:explicitRaw===original,
      projectedMatches:projected===expected,originalEnds,outputEnds,anchors,
      originalUnchanged:cm.markdown===original,docIdentityUnchanged:cm.doc===before,
      sourceStillContainsEnds:cm.doc.toString().includes('minerujson:end:v1:0:0'),
      dirtyAfter,smallOutput,smallRawUnchanged:smallRaw===synthetic,smallDocIntact};
   });
   assert.equal(result.rawIsOriginal,true);
   assert.equal(result.explicitRawIsOriginal,true);
   assert.equal(result.projectedMatches,true);
   assert.equal(result.originalEnds,224);assert.equal(result.outputEnds,0);
   assert.equal(result.anchors,224);
   assert(result.originalUnchanged&&result.docIdentityUnchanged&&result.sourceStillContainsEnds);
   assert.equal(result.dirtyAfter,false);
   assert(result.smallOutput.includes('Literal <!-- minerujson:end:v1:0:2 --> inside text'));
   assert(!result.smallOutput.includes('<!-- minerujson:end:v1:0:0 -->'));
   assert(!result.smallOutput.includes('<!-- minerujson:end:v1:0:3 -->'));
   assert(result.smallRawUnchanged&&result.smallDocIntact);
   assert.deepEqual(errors,[],'unexpected browser errors');
   console.log('CMD_MARKDOWN_OUTPUT_PASS',name,JSON.stringify({blocks:result.anchors,
     originalEnds:result.originalEnds,outputEnds:result.outputEnds,
     rawAndEditorUnchanged:true,dirty:false,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.deepEqual(readFileSync(documentPath),fixture,'test wrote its own source fixture');
}finally{server.kill('SIGTERM');unlinkSync(documentPath)}
