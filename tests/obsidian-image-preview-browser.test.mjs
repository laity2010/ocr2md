/** Obsidian image sizing remains a read-only Markdown projection. */
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9hCeEEsAAAAASUVORK5CYII=','base64');
const fileName='a'.repeat(24)+'.png';
const local='media/'+fileName;
const suffix=[
 '## Obsidian Image Size Test',
 `![[${local}|180]]`,
 `![[${local}|170x110]]`,
 `![description|160x90](${local})`,
 `![](${local}|140)`,
 `![150](${local})`,
 `![plain](${local})`,
 `\`![[${local}|190]]\``,
 `![[notes.md|150]]`,
].join('\n\n');
const source=fixture+'\n\n'+suffix+'\n';
const engines=[['Chrome',chromium,{executablePath:chromeExecutable()}],
 ['WebKit',webkit,{executablePath:webkitExecutable()}]];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
mkdirSync('.v6/evidence',{recursive:true});
for(let i=0;i<engines.length;i++){
 const [name,engine,launch]=engines[i];
 const root=resolve(`.v6/tests/image-preview-${process.pid}-${i}`);
 mkdirSync(root+'/media',{recursive:true});
 const doc=root+'/book.md';
 writeFileSync(doc,source);writeFileSync(root+'/'+local,png);
 const port=5601+i,url=`http://127.0.0.1:${port}/`;
 const server=spawn('python3',['scripts/v6_serve.py'],{
   cwd:process.cwd(),stdio:'ignore',
   env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,
     V6_STATIC_ROOT:resolve('dist')}});
 let browser;
 try{
  let ready=false;
  for(let n=0;n<120;n++){
   try{if((await fetch(url+'healthz')).ok){ready=true;break;}}catch{}await sleep(100);
  }
  assert(ready,'isolated V6 image preview server unavailable');
  browser=await engine.launch({headless:true,...launch});
  const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.querySelector('.ocr-markdown')?.textContent.includes('Obsidian Image Size Test'),
    null,{timeout:45000});
  const images=await page.locator(`.ocr-markdown img[src="${local}"]`).evaluateAll(nodes=>nodes.map(img=>({
    width:img.getAttribute('width'),height:img.getAttribute('height'),alt:img.alt,
    style:img.getAttribute('style'),loading:img.loading,decoding:img.decoding,
  })));
  assert.equal(images.length,6,'all six Obsidian/Markdown examples must display images');
  assert.deepEqual(images.map(x=>[x.width,x.height]),[
    ['180',null],['170','110'],['160','90'],['140',null],['150',null],[null,null]
  ],name+' Obsidian image dimension parse');
  assert.deepEqual(images.map(x=>x.alt),['a'.repeat(24)+'.png','a'.repeat(24)+'.png',
    'description','','','plain']);
  assert(images.every(x=>x.loading==='lazy'&&x.decoding==='async'));
  assert.equal(await page.locator('.ocr-markdown code').filter({hasText:`![[${local}|190]]`}).count(),1,
    'inline code must not be parsed into an image');
  assert((await page.locator('.ocr-markdown').textContent()).includes('![[notes.md|150]]'),
    'non-image wikilink must remain untouched');
  const explicit=page.locator(`.ocr-markdown img[width="170"][height="110"]`);
  await explicit.scrollIntoViewIfNeeded();
  await page.waitForFunction(path=>{
    const img=document.querySelector(`.ocr-markdown img[width="170"][height="110"]`);
    return img?.complete && img.naturalWidth===1;
  },local,{timeout:17000});
  const height=await explicit.evaluate(el=>getComputedStyle(el).height);
  assert.equal(height,'110px','explicit height must override image height:auto style');
  assert.equal(await page.locator('.ocr-markdown img[src$="%7C140"]').count(),0,
    'the size is not part of the fetched image filename');
  assert.equal((await (await fetch(url+'api/document')).text()),source,
    'preview must never change CMD source');
  await page.screenshot({path:`.v6/evidence/obsidian-image-preview-${name.toLowerCase()}.png`});
  assert.deepEqual(errors,[],name+' JS errors');
  console.log('OBSIDIAN_IMAGE_PREVIEW_PASS',name,JSON.stringify({images:images.length,
    widths:images.map(x=>x.width),height,sanitized:true,sourceUnchanged:true}));
 }finally{await browser?.close();server.kill('SIGTERM');}
}
