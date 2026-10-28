/** Regression for a real book with 11 downloaded files and 11 remote links.
 * One AG row per source image; adoption happens through CMD, not new downloads.
 * Uses only disposable files and does NOT change the actual workspace book.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,extname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';

const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const urls=[...source.matchAll(/!\[[^\]\n]*\]\((https?:\/\/[^\s)]+)\)/g)].map(match=>match[1]);
assert.equal(urls.length,11,'fixture must have 11 original image references');
const basePort=5967;
for(const [i,[name,engine]] of [['Chrome',chromium],['WebKit',webkit]].entries()){
 const dir=mkdtempSync(join(tmpdir(),'ocr2md-media-preadopt-'));
 const doc=join(dir,'book.minerujson.md'),auth=join(dir,'edit-token');
 const settings=join(dir,'settings.json');
 const media=join(dir,'media');
 const cookie='media-preadopt-fixture';
 mkdirSync(media);writeFileSync(doc,source);writeFileSync(auth,cookie);
 const local=urls.map(url=>{
   const filename=createHash('sha256').update(url).digest('hex').slice(0,24)+extname(new URL(url).pathname);
   // A completed local JPEG is not re-downloaded or decoded by this fixture.
   writeFileSync(join(media,filename),Buffer.from([0xff,0xd8,0xff,0xd9]));
   return 'media/'+filename;
 });
 const port=basePort+i,origin='http://127.0.0.1:'+port;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),
   env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',
     V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,
     V6_PDF_PATH:resolve('.v6/workspace/buffetts-alpha.original.pdf'),
     V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
 let browser;
 try{
   let ready=false;
   for(let n=0;n<120;n++){
     try{if((await fetch(origin+'/healthz')).ok){ready=true;break;}}catch{}
     await new Promise(r=>setTimeout(r,120));
   }
   assert(ready,'isolated server did not start');
   const inventory=await (await fetch(origin+'/api/media/inventory')).json();
   const statuses=[];
   for(const url of urls)statuses.push(
     await (await fetch(origin+'/api/media/status?url='+encodeURIComponent(url))).json());
   if(statuses.some(status=>status.state!=='complete'))console.log('PREEXISTING_SERVER_DIAG',name,
     JSON.stringify({inventory:inventory.files?.map(x=>x.path),
       states:statuses.map((x,i)=>({i,state:x.state,path:x.path}))}));
   assert.equal(statuses.filter(status=>status.state==='complete').length,11,
     'pre-existing remote assets must all be complete in the isolated book');
   browser=await engine.launch({headless:true});
   const ctx=await browser.newContext({viewport:{width:1360,height:840}});
   await ctx.addCookies([{name:'v6edit',value:cookie,domain:'127.0.0.1',path:'/'}]);
   const page=await ctx.newPage();
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
     const url=route.request().url();
     return url.startsWith(origin)?route.continue():route.abort();
   });
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-checkbox').length===21,
     null,{timeout:55000});
   await page.locator('#module-select').evaluate(el=>{
     el.value='media';el.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('待采用 11') &&
     Number(document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount'))===12,
     null,{timeout:25000}).catch(async error=>{
       const diag=await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,
         module:document.querySelector('#module-select')?.value,
         count:document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount'),
         adoption:[...document.querySelectorAll('.ocr-media-adoption')].map(x=>x.textContent),
         rows:document.querySelector('.ocr-media-grid')?.textContent?.slice(0,420)}));
       console.log('PREEXISTING_DIAG',name,JSON.stringify({diag,errors}));throw error;
     });
   const header=page.locator('.ocr-media-grid [role="grid"]');
   assert.equal(await header.getAttribute('aria-rowcount'),'12','11 images must have exactly 11 AG rows');
   assert.equal(await page.locator('input[aria-label="章节所有"]').isChecked(),true);
   assert((await page.locator('#status').textContent()).includes('待采用 11'));
   // The existing local files are enough: the download endpoint must return
   // 'complete' without external network access, then CMD adopts them.
   await page.locator('#media-download-all').click();
   await page.waitForFunction(()=>!document.querySelector('#media-download-all')?.disabled &&
     Number(document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount'))===12 &&
     [...document.querySelectorAll('.ocr-media-adoption')].every(node=>node.textContent==='已采用'),
     null,{timeout:45000});
   assert.equal(readFileSync(doc,'utf8'),source,'adoption must not auto-save');
   // The browser source is the single unsaved CMD document.
   await page.locator('#save').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
     null,{timeout:25000});
   const after=readFileSync(doc,'utf8');
   for(const url of urls)assert(!after.includes(url),'remote reference remains');
   for(const path of local)assert(after.includes(path),'local reference missing');
   assert.equal([...after.matchAll(/!\[[^\]\n]*\]\(media\/[0-9a-f]{24}\.jpg\)/g)].length,11);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.locator('#module-select').evaluate(el=>{
     el.value='media';el.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>Number(document.querySelector('.ocr-media-grid [role="grid"]')?.getAttribute('aria-rowcount'))===12 &&
     document.querySelector('.ocr-media-grid .ag-row[row-index="0"]')?.textContent.includes('已采用'),
     null,{timeout:25000});
   assert.deepEqual(errors,[]);
   console.log('MEDIA_PREEXISTING_ADOPTION_PASS',name,JSON.stringify({rows:11,preexisting:11,savedLocal:11,reloaded:true}));
 }finally{
   await browser?.close();
   server.kill('SIGTERM');
   rmSync(dir,{recursive:true,force:true});
 }
}
