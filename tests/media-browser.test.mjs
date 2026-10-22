import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
import {buildChapterFiles} from '../ui/chapter-files.js';
import {buildOutline} from '../ui/outline-index.js';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const originalPdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const first=fixture.match(/!\[[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/);
assert(first,'fixture image missing');
const data=Buffer.alloc(800000,0x42);
data.set([255,216,255,224],0);data.set([255,217],data.length-2);
const requests=[];
const upstream=createServer((req,res)=>{
 const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
 if(req.url!=='/image.jpg'||!range){res.writeHead(416).end();return;}
 const start=Number(range[1]),end=Math.min(Number(range[2]),data.length-1);
 requests.push(req.headers.range);
 if(start>end){res.writeHead(416).end();return;}
 const slice=data.subarray(start,end+1);
 res.writeHead(206,{'Content-Type':'image/jpeg','Content-Length':slice.length,
   'Content-Range':`bytes ${start}-${end}/${data.length}`,'ETag':'"fixture-v1"'});
 res.end(slice);
});
await new Promise(done=>upstream.listen(0,'127.0.0.1',done));
const remoteOrigin=`http://127.0.0.1:${upstream.address().port}`;
const target=remoteOrigin+'/image.jpg';
const sample=fixture.replace(first[1],target);
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const pause=ms=>new Promise(done=>setTimeout(done,ms));
mkdirSync('.v6/evidence',{recursive:true});
try{
 for(let i=0;i<engines.length;i++){
  const [name,engine,options]=engines[i];
  const folder=resolve(`.v6/tests/media-${process.pid}-${i}`);
  mkdirSync(folder,{recursive:true});
  const doc=resolve(folder,'book.minerujson.md');
  const authFile=resolve(folder,'test-token');
  const testKey='isolated-media-test-cookie-v6';
  writeFileSync(doc,sample);writeFileSync(authFile,testKey);
  const port=5590+i,base=`http://127.0.0.1:${port}`;
  const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
    env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_PDF_PATH:originalPdf,
      V6_TOKEN_PATH:authFile,V6_MEDIA_TEST_ORIGIN:remoteOrigin,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
  let browser;
  try{
   let listening=false;
   for(let k=0;k<120;k++){
    try{if((await fetch(base+'/healthz')).ok){listening=true;break;}}catch{}await pause(120);
   }
   assert(listening,'isolated server failed to start');
   const headers={Origin:base,Cookie:'v6edit='+testKey,'Content-Type':'application/json'};
   const started=await fetch(base+'/api/media/chunk',{method:'POST',headers,
     body:JSON.stringify({url:target})});
   assert.equal(started.status,200);
   const partial=await started.json();
   assert.equal(partial.state,'partial');assert.equal(partial.bytes,512*1024);
   assert.equal(readFileSync(doc,'utf8'),sample,'partial download must not change Markdown');
   assert(existsSync(resolve(folder,'media')));
   browser=await engine.launch({headless:true,...options});
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.context().addCookies([{name:'v6edit',value:testKey,domain:'127.0.0.1',path:'/'}]);
   await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-checkbox').length===21,null,{timeout:60000});
   await page.locator('#module-select').selectOption('media');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===11,null,{timeout:20000});
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('已下载'),null,{timeout:16000});
   assert.equal(await page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-action').textContent(),'续传');
   await page.screenshot({path:`.v6/evidence/media-before-${name.toLowerCase()}.png`});
   await page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-action').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('本地'),null,{timeout:30000});
   assert.equal(readFileSync(doc,'utf8'),sample,'download must not autosave Markdown');
   const status=await (await fetch(base+'/api/media/status?url='+encodeURIComponent(target))).json();
   assert.equal(status.state,'complete');
   assert.match(status.path,/^media\/[0-9a-f]{24}\.jpg$/);
   const local=await fetch(base+'/'+status.path);
   assert.equal(local.status,200);
   assert.deepEqual(Buffer.from(await local.arrayBuffer()),data);
   assert(requests.includes('bytes=524288-799999'),'Range resume missing');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('image.jpg'),null,{timeout:15000});
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('本地'),null,{timeout:15000});
   await page.locator('#module-select').selectOption('chapter-boundary');
   assert.equal(await page.locator('.ocr-outline-checkbox').count(),21);
   await page.locator('#module-select').selectOption('media');
   await page.screenshot({path:`.v6/evidence/media-after-${name.toLowerCase()}.png`});
   await page.locator('#save').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:22000});
   const updated=readFileSync(doc,'utf8');
   assert(updated.includes(status.path)&&!updated.includes(target));
   const evidence=text=>[...text.matchAll(/<!--\s*minerujson:(?!block:v1:)[\s\S]*?-->/g)].map(x=>x[0]);
   assert.deepEqual(evidence(updated),evidence(sample));
   const chapters=buildChapterFiles(updated,buildOutline(updated),'000');
   assert(chapters.some(ch=>ch.content.includes('../'+status.path)));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#module-select').selectOption('media');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===11,null,{timeout:20000});
   assert((await page.locator('.ocr-media-grid .ag-row[row-index="0"]').textContent()).includes('本地'));
   assert.deepEqual(errors,[]);
   console.log('MEDIA_END_TO_END_PASS',name,JSON.stringify({items:11,partial:partial.bytes,
     path:status.path,undoRedo:true,chapterPath:true,reopened:true}));
  }finally{await browser?.close();server.kill('SIGTERM');}
 }
}finally{upstream.close();}
