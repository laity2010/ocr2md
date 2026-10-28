import {selectModule} from './navigation-ui.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {chromium,webkit,devices} from 'playwright';
import {buildChapterFiles} from '../ui/chapter-files.js';
import {buildOutline} from '../ui/outline-index.js';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const originalPdf=resolve('.v6/workspace/buffetts-alpha.original.pdf');
const first=fixture.match(/!\[[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/);
assert(first,'fixture image missing');
// Generate a genuine large JPEG so native browser preview and resumable
// Range transfer are tested against the *same* decodable image.
mkdirSync('.v6/tests',{recursive:true});
const tinyPng=resolve('.v6/tests/media-thumbnail-fixture.png');
const tinyJpeg=resolve('.v6/tests/media-thumbnail-fixture.jpg');
function pngChunk(kind,content){
 const type=Buffer.from(kind),length=Buffer.alloc(4);length.writeUInt32BE(content.length);
 const body=Buffer.concat([type,content]);let crc=0xffffffff;
 for(const byte of body){
   crc^=byte;
   for(let i=0;i<8;i++)crc=(crc>>>1)^(crc&1?0xedb88320:0);
 }
 const checksum=Buffer.alloc(4);checksum.writeUInt32BE((crc^0xffffffff)>>>0);
 return Buffer.concat([length,body,checksum]);
}
const side=1024,raw=randomBytes(side*(side*3+1));
for(let y=0;y<side;y++)raw[y*(side*3+1)]=0;
const dimensions=Buffer.alloc(13);
dimensions.writeUInt32BE(side,0);dimensions.writeUInt32BE(side,4);
dimensions[8]=8;dimensions[9]=2;
writeFileSync(tinyPng,Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),
 pngChunk('IHDR',dimensions),pngChunk('IDAT',deflateSync(raw)),
 pngChunk('IEND',Buffer.alloc(0))]));
execFileSync('sips',['-s','format','jpeg','-s','formatOptions','best',tinyPng,'--out',tinyJpeg],{stdio:'ignore'});
const data=readFileSync(tinyJpeg);
assert(data.length>512*1024,'test JPEG must span multiple resumable chunks');

const requests=[];
const upstream=createServer((req,res)=>{
 const range=/^bytes=(\d+)-(\d+)$/.exec(req.headers.range||'');
 if(req.url!=='/image.jpg'){res.writeHead(404).end();return;}
 if(!range){ // Browser native <img> requests the preview, not a download chunk.
   requests.push('thumbnail');
   res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':data.length});
   res.end(data);return;
 }
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
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  if(process.env.V6_ONLY_CHROME&&name!=='Chrome')continue;
  const folder=resolve(`.v6/tests/media-${process.pid}-${i}`);
  mkdirSync(folder,{recursive:true});
  const doc=resolve(folder,'book.minerujson.md');
  const authFile=resolve(folder,'test-token');
  const testKey='isolated-media-test-cookie-v6';
  writeFileSync(doc,sample);writeFileSync(authFile,testKey);
  // Two detached local files: one is used only by a published chapter,
  // the other is not referenced by *any* managed Markdown document.
  const mediaDir=resolve(folder,'media');mkdirSync(mediaDir,{recursive:true});
  const chapterUsed='media/'+('1'.repeat(24))+'.jpg';
  const orphan='media/'+('2'.repeat(24))+'.jpg';
  for(const file of [chapterUsed,orphan])writeFileSync(resolve(folder,file),data);
  const publishedDir=resolve(folder,'chapters');mkdirSync(publishedDir,{recursive:true});
  const publishedName='000-media-fixture.md';
  writeFileSync(resolve(publishedDir,publishedName),'![chapter-only](../'+chapterUsed+')\n');
  writeFileSync(resolve(publishedDir,'manifest.json'),JSON.stringify({files:[{name:publishedName}]}));
  const port=5590+i,base=`http://127.0.0.1:${port}`;
  const launch=()=>spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
    env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_PDF_PATH:originalPdf,
      // Never read the Main book selection when running disposable media tests.
      V6_SETTINGS_PATH:resolve(folder,'isolated-settings.json'),
      V6_TOKEN_PATH:authFile,V6_MEDIA_TEST_ORIGIN:remoteOrigin,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
  let server=launch();
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
   // A durable transfer must recover from a process restart, not merely
   // from two requests served by one in-memory downloader instance.
   await new Promise(done=>{server.once('exit',done);server.kill('SIGTERM');});
   server=launch();
   let restarted=false;
   for(let k=0;k<100;k++){
     try{if((await fetch(base+'/healthz')).ok){restarted=true;break;}}catch{}await pause(120);
   }
   assert(restarted,'server failed to resume after restart');
   const persistedPart=await (await fetch(base+'/api/media/status?url='+encodeURIComponent(target))).json();
   assert.equal(persistedPart.bytes,512*1024);
   const inventory=await (await fetch(base+'/api/media/inventory')).json();
   assert.deepEqual(inventory.files.map(f=>f.path),[chapterUsed,orphan]);
   assert.deepEqual(inventory.chapterReferences,[chapterUsed]);
   // Unauthorized callers and arbitrary internal network destinations are
   // never permitted to create a media download.
   const unauth=await fetch(base+'/api/media/chunk',{method:'POST',headers:{Origin:base,
      'Content-Type':'application/json'},body:JSON.stringify({url:target})});
   assert.equal(unauth.status,403);
   const blocked=await fetch(base+'/api/media/chunk',{method:'POST',headers,
      body:JSON.stringify({url:'https://169.254.169.254/internal.jpg'})});
   assert.equal(blocked.status,422);
   assert.equal((await fetch(base+'/media/malicious.svg')).status,404);
   browser=await engine.launch({headless:true,...options});
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.context().addCookies([{name:'v6edit',value:testKey,domain:'127.0.0.1',path:'/'}]);
   const thumbnailRequests=[];
   page.on('request',request=>{if(request.url()===target)thumbnailRequests.push(request.url());});
   await page.route('**/*',route=>{
     const link=route.request().url();
     return link.startsWith(base)||link===target?route.continue():route.abort();
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-checkbox').length===21,null,{timeout:60000});
   const inactiveImages=await page.locator('.ocr-media-grid .ocr-media-thumb').evaluateAll(
     images=>images.filter(image=>image.hasAttribute('src')).length);
   assert.equal(inactiveImages,0,'hidden Media thumbnails have src before activation');
   await selectModule(page,'media');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===13,null,{timeout:20000});
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('已下载'),null,{timeout:16000});
   assert.equal(await page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-action').textContent(),'续传');
   // The iPad AG virtualizes unpinned columns as the horizontal scroller
   // moves. Return the real user viewport to the left so the adoption column
   // is actually mounted before counting its 13 status markers.
   await page.locator('.ocr-media-grid .ag-body-horizontal-scroll-viewport').evaluate(el=>{
     el.scrollLeft=0;
     el.dispatchEvent(new Event('scroll',{bubbles:true}));
   });
   const adoption=page.locator('.ocr-media-grid .ocr-media-adoption');
   await adoption.first().waitFor({state:'attached',timeout:14000});
   assert.equal(await adoption.filter({hasText:'未采用'}).count(),1);
   assert.equal(await adoption.filter({hasText:'已采用'}).count(),12);
   assert.equal(await adoption.filter({hasText:'未采用'}).first().getAttribute('data-adopted'),'no');
   assert.equal(await adoption.filter({hasText:'已采用'}).first().getAttribute('data-adopted'),'yes');
   const adoptedHeader=page.locator('.ocr-media-grid .ag-header-cell[col-id="adopted"]');
   const statusHeader=page.locator('.ocr-media-grid .ag-header-cell[col-id="status"]');
   await adoptedHeader.locator('.ag-header-cell-filter-button').click();
   const selectAdoption=page.locator('.ocr-enum-filter');
   await selectAdoption.locator('[data-filter-value="已采用"] input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===1,null,{timeout:7000});
   assert((await page.locator('.ocr-media-grid .ag-row').textContent()).includes(orphan));
   assert.equal(await adoption.filter({hasText:'未采用'}).count(),1);
   await selectAdoption.locator('[data-filter-value="all"] input').check();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===13,null,{timeout:7000});
   await adoptedHeader.locator('.ag-header-cell-filter-button').click();
   await statusHeader.locator('.ag-header-cell-filter-button').click();
   const statusValues=await page.locator('.ocr-enum-filter .ocr-enum-filter-option').allTextContents();
   assert(statusValues.some(s=>s.includes('部分下载')),'missing stable partial-download filter value');
   assert(statusValues.some(s=>s.includes('本地')),'missing local-file filter value');
   await page.locator('.ocr-enum-filter [data-filter-value="部分下载"] input').uncheck();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===12,null,{timeout:7000});
   await page.locator('.ocr-enum-filter [data-filter-value="all"] input').check();
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===13,null,{timeout:7000});
   await statusHeader.locator('.ag-header-cell-filter-button').click();
   const header=page.locator('.ocr-media-grid .ag-header-cell[col-id="preview"]');
   assert.equal(await header.count(),1,'Media AG preview column is missing');
   assert.equal((await header.textContent()).trim(),'预览');
   assert(await header.evaluate(el=>Boolean(el.closest('.ag-grid-pinned-left-cells'))),
     'Media preview column is not pinned to left');
   const thumbnail=page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-thumb');
   await page.waitForFunction(()=>{
     const img=document.querySelector('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-thumb');
     return img?.complete && img.naturalWidth>0;
   },null,{timeout:14000});
   assert.equal(await thumbnail.getAttribute('loading'),'lazy');
   assert.equal(await thumbnail.getAttribute('decoding'),'async');
   assert.equal(await thumbnail.getAttribute('referrerpolicy'),'no-referrer');
   assert.equal(await thumbnail.getAttribute('src'),target);
   assert(thumbnailRequests.length>0,'remote image preview did not load');
   assert.equal(await page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-preview-link').getAttribute('target'),'_blank');
   await page.screenshot({path:`.v6/evidence/media-before-${name.toLowerCase()}.png`});
   // Active virtual chapters are CMD write boundaries, not download errors.
   // The first image is outside this short chapter; save the file without
   // changing an out-of-scope Markdown link, then adopt it in full view.
   const firstImageLine=sample.lastIndexOf('\n',sample.indexOf(target))+1;
   assert(firstImageLine>0,'test fixture needs a pre-image chapter boundary');
   await page.evaluate(to=>document.dispatchEvent(new CustomEvent('ocr2md:wp4-virtual-scope',{
     detail:{scope:{id:'fixture:before-image',from:0,to}}
   })),firstImageLine);
   await page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-action').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-action')?.textContent==='采用',null,{timeout:30000});
   assert.equal(readFileSync(doc,'utf8'),sample,'out-of-scope download must not change Markdown');
   const scopeStatus=await page.locator('#status').textContent();
   assert(scopeStatus.includes('图片下载成功'),
     'completed image must not be reported as failed when its link is outside chapter: '+scopeStatus);
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('ocr2md:wp4-virtual-scope',{
     detail:{scope:null}
   })));
   await page.locator('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-action').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('本地'),null,{timeout:30000});
   assert.equal(readFileSync(doc,'utf8'),sample,'download must not autosave Markdown');
   const status=await (await fetch(base+'/api/media/status?url='+encodeURIComponent(target))).json();
   assert.equal(status.state,'complete');
   assert.match(status.path,/^media\/[0-9a-f]{24}\.jpg$/);
   await page.waitForFunction(path=>{
     const img=document.querySelector('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-thumb');
     return img?.getAttribute('src')==='/'+path && img.complete && img.naturalWidth>0;
   },status.path,{timeout:25000});
   const local=await fetch(base+'/'+status.path);
   assert.equal(local.status,200);
   assert.deepEqual(Buffer.from(await local.arrayBuffer()),data);
   assert(requests.includes('bytes=524288-1048575'),'Range resume missing');
   await page.locator('#undo').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('image.jpg'),null,{timeout:15000});
   // Undo leaves the completed local file on disk but now unreferenced.
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ocr-media-adoption[data-adopted="no"]').length===2,null,{timeout:9000});
   await page.locator('#redo').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('本地'),null,{timeout:15000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ocr-media-adoption[data-adopted="no"]').length===1,null,{timeout:9000});
   await selectModule(page,'chapter-boundary');
   assert((await page.locator('.ocr-outline-checkbox').count())>0);
   assert((await page.locator('#status').textContent()).includes('大纲21项'));
   await selectModule(page,'media');
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
   await selectModule(page,'media');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-media-grid .ag-row').length===13,null,{timeout:20000});
   assert((await page.locator('.ocr-media-grid .ag-row[row-index="0"]').textContent()).includes('本地'));
   await page.waitForFunction(path=>{
     const img=document.querySelector('.ocr-media-grid .ag-row[row-index="0"] .ocr-media-thumb');
     return img?.getAttribute('src')==='/'+path && img.naturalWidth>0;
   },status.path,{timeout:25000});
   assert.deepEqual(errors,[]);
   console.log('MEDIA_END_TO_END_PASS',name,JSON.stringify({items:13,unused:1,chapterOnly:1,filters:'adopted+status',partial:partial.bytes,
     path:status.path,preview:'lazy remote → local',undoRedo:true,chapterPath:true,reopened:true}));
  }finally{await browser?.close();server.kill('SIGTERM');}
 }
}finally{upstream.close();}
