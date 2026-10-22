/** Clipboard image -> authorized Media file -> CMD paste transaction. No live data. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {homedir} from 'node:os';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const imageSource=resolve('.v6/tests/paste-image-source.png');
const imageJpeg=resolve('.v6/tests/paste-image-valid.jpg');
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
writeFileSync(imageSource,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9hCeEEsAAAAASUVORK5CYII=','base64'));
execFileSync('sips',['-s','format','jpeg',imageSource,'--out',imageJpeg],{stdio:'ignore'});
const bytes=readFileSync(imageJpeg);
const localPath='media/'+createHash('sha256').update(bytes).digest('hex').slice(0,24)+'.jpg';
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
 ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
for(let i=0;i<engines.length;i++){
 const [name,engine,options]=engines[i];
 const root=resolve('.v6/tests/paste-'+process.pid+'-'+i);mkdirSync(root,{recursive:true});
 const doc=resolve(root,'book.md'),auth=resolve(root,'token');
 const key='test-only-paste-auth';
 writeFileSync(doc,fixture);writeFileSync(auth,key);
 const port=5593+i,base=`http://127.0.0.1:${port}`;
 const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',
   env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_TOKEN_PATH:auth,V6_STATIC_ROOT:resolve('dist')}});
 let browser;
 try{
  let up=false;for(let n=0;n<140;n++){try{if((await fetch(base+'/healthz')).ok){up=true;break;}}catch{}await pause(100);}
  assert(up,'isolated paste service unavailable');
  const origin={Origin:base,'Content-Type':'image/jpeg'};
  const noAuth=await fetch(base+'/api/media/paste',{method:'POST',headers:origin,body:bytes});
  assert.equal(noAuth.status,403);
  const bad=await fetch(base+'/api/media/paste',{method:'POST',headers:{...origin,Cookie:'v6edit='+key,
    'Content-Type':'image/png'},body:bytes});
  assert.equal(bad.status,422,'image MIME/signature mismatch must not save');
  assert.equal(readFileSync(doc,'utf8'),fixture);
  browser=await engine.launch({headless:true,...options});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('PASTE_PAGE_ERROR',name,error.message);});
  page.on('console',message=>{if(message.type()==='error')console.log('PASTE_CONSOLE_ERROR',name,message.text());});
  await page.context().addCookies([{name:'v6edit',value:key,domain:'127.0.0.1',path:'/'}]);
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(3500);
  console.log('PASTE_BOOT',name,JSON.stringify(await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,hasCM:!!document.querySelector('.cm-content'),outline:document.querySelectorAll('.ocr-outline-checkbox').length,body:document.body.textContent.slice(0,150)}))));
  await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-checkbox').length>0,null,{timeout:6000});
  const cm=page.locator('.cm-content');
  await cm.click();
  const result=await page.evaluate(base64=>{
    const binary=atob(base64);
    const u8=Uint8Array.from(binary,c=>c.charCodeAt(0));
    const data=new DataTransfer();
    data.items.add(new File([u8],'screenshot.jpg',{type:'image/jpeg'}));
    const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data});
    const ok=document.querySelector('.cm-content').dispatchEvent(event);
    return {prevented:!ok,items:data.items.length};
  },bytes.toString('base64'));
  assert.equal(result.prevented,true,'CM6 image paste should suppress native text insertion');
  await page.waitForFunction(path=>document.querySelector('.cm-content')?.textContent.includes('![]('+path+')'),localPath,
    {timeout:20000});
  assert.equal(readFileSync(doc,'utf8'),fixture,'CMD edits remain unsaved until global Save');
  const media=await fetch(base+'/'+localPath);
  assert.equal(media.status,200);assert.deepEqual(Buffer.from(await media.arrayBuffer()),bytes);
  const inventory=await (await fetch(base+'/api/media/inventory')).json();
  assert.equal(inventory.files.filter(f=>f.path===localPath).length,1);
  await page.locator('#undo').click();
  await page.waitForFunction(path=>!document.querySelector('.cm-content')?.textContent.includes('![]('+path+')'),localPath,
    {timeout:12000});
  await page.locator('#redo').click();
  await page.waitForFunction(path=>document.querySelector('.cm-content')?.textContent.includes('![]('+path+')'),localPath,
    {timeout:12000});
  await page.locator('#module-select').selectOption('media');
  await page.waitForFunction(path=>{
    const nodes=[...document.querySelectorAll('.ocr-media-grid .ag-row')];
    return nodes.some(el=>el.textContent.includes(path)&&el.textContent.includes('已采用'));
  },localPath,{timeout:16000});
  await page.screenshot({path:`.v6/evidence/media-paste-${name.toLowerCase()}.png`});
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:20000});
  const written=readFileSync(doc,'utf8');
  const label='![]('+localPath+')';
  assert.equal(written.split(label).length,2,'exactly one Markdown image inserted');
  assert.equal(written.replace(label,''),fixture,'only requested paste range was modified');
  // The server deduplicates identical image bytes by hash; no shadow copy.
  const again=await fetch(base+'/api/media/paste',{method:'POST',headers:{...origin,Cookie:'v6edit='+key},body:bytes});
  assert.equal(again.status,200);assert.equal((await again.json()).path,localPath);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(path=>document.querySelector('.cm-content')?.textContent.includes('![]('+path+')'),localPath,
    {timeout:25000});
  assert.deepEqual(errors,[],name+' page errors');
  console.log('MEDIA_PASTE_PASS',name,JSON.stringify({path:localPath,undoRedo:true,saveReload:true,
    noOverwrite:true,rejectUnauth:true,rejectBadMime:true}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
