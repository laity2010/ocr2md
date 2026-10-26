// Legacy business contract test: dispatch a native selection on the hidden
// source select. Real Tom Select touch/menu interaction has its own E2E test.
const chooseNative=async(locator,value)=>locator.evaluate((el,v)=>{
  el.value=v;
  el.dispatchEvent(new Event('input',{bubbles:true}));
  el.dispatchEvent(new Event('change',{bubbles:true}));
},value);

/** Exercise all 3 existing element AGs against two distinct bounded chapters.
 * The test uses an isolated copy and the original atomic chapter exporter.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,cpSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const cwd=process.cwd();
const runtime=process.env.OCR_LAB_RUNTIME||resolve('labs/cm-html/.runtime');
const assets=process.env.OCR_LAB_BUILD||resolve('labs/cm-html/.runtime/chapter-elements-final');
const names=['ALPHA','BETA'];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const engines=[['Chrome',chromium,{viewport:{width:1250,height:820}}],
 ['iPad WebKit',webkit,{viewport:{width:1024,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}]];
for(const [i,[engineName,engine,options]] of engines.entries()){
 const directory=mkdtempSync(join(runtime,'triple-scan-'));
 const port=4891+i;
 const base=`http://127.0.0.1:${port}/labs/cm-html/`;
 cpSync(join(runtime,'document.md'),join(directory,'document.md'));
 cpSync(join(runtime,'chapter'),join(directory,'chapter'),{recursive:true});
 // The same source exporter atomically updates chapter content + SHA manifest.
 const py=String.raw`
from pathlib import Path
import sys, re
sys.path.insert(0,sys.argv[1]);import v6_chapters as v
v.chapter_dir=lambda doc:Path(doc).parent/'chapter'
v.CHAPTER_NAME=re.compile(r'[0-9]{1,6}-[\w-]{1,110}\.cmd\.chapter\.md')
doc=Path(sys.argv[2]);manifest=v.read_manifest(doc)
assert len(manifest['files'])>=2
files=[]
for idx,row in enumerate(manifest['files']):
    text=v.read_chapter(doc,row['name']).decode('utf8')
    if idx<2:
        tag=['ALPHA','BETA'][idx]
        text=f'# QA_TRIPLE_TITLE_{tag}\n\n![QA_MEDIA_{tag}](https://assets.invalid/QA_MEDIA_{tag}.png)\n\n$$\nx_{{QA_{tag}}}=1\n$$\n\n'+text
    files.append({'name':row['name'],'content':text})
v.export(doc,{'sourceSha256':manifest['sourceSha256'],'files':files})
print('VALID_FIXTURE',manifest['files'][0]['name'],manifest['files'][1]['name'])
`;
 execFileSync('python3',['-c',py,resolve('scripts'),join(directory,'document.md')],{cwd});
 const manifest=JSON.parse(readFileSync(join(directory,'chapter/manifest.json'),'utf8'));
 const chapters=manifest.files.slice(0,2).map(x=>x.name);
 const server=spawn('python3',['labs/cm-html/modules/chapter-server-launch.py'],{cwd,
   env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:join(directory,'document.md'),
     V6_TOKEN_PATH:join(directory,'test-secret'),V6_SETTINGS_PATH:join(directory,'settings.json'),
     V6_STATIC_ROOT:assets,V6_LAB_RUNTIME:runtime},stdio:'ignore'});
 let browser;
 try{
   let started=false;
   for(let attempt=0;attempt<85;attempt++){
     try{if((await fetch(base+'healthz')).ok){started=true;break;}}catch{}await delay(180);
   }
   assert(started,'Lab service unavailable');
   browser=await engine.launch({headless:true});
   const page=await browser.newPage(options);
   const errors=[];let pageLoads=0;
   page.on('pageerror',err=>errors.push(err.message));
   page.on('request',req=>{if(req.resourceType()==='document')pageLoads++;});
   await page.goto(base,{waitUntil:'domcontentloaded'});
   const fileMenu=page.locator('.ocr-source-pane .ocr-lab-file-select');
   await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="chapter:"]').length>=2,null,{timeout:27000});
   const moduleMenu=page.locator('.ocr-lab-ag-toolbar .ocr-lab-element-select');
   for(let ix=0;ix<2;ix++){
     const tag=names[ix],chapter=chapters[ix];
     await chooseNative(fileMenu,'chapter:'+chapter);
     await page.waitForURL(u=>u.searchParams.get('chapter')===chapter,{timeout:16000});
     const remembered=ix===0?'chapter-boundary':'media';
     await page.waitForFunction(expected=>document.querySelector('#module-select')?.value===expected,remembered,{timeout:12000});
     assert.equal(await moduleMenu.inputValue(),remembered,'AG element dropdown reset on chapter switch');
     assert.deepEqual(await moduleMenu.locator('option:not([hidden])').allTextContents(),['标题','媒体','LaTeX']);
     const grids=[['chapter-boundary','.ocr-outline-grid','QA_TRIPLE_TITLE_'],
       ['media','.ocr-media-pane','QA_MEDIA_'],['latex','.ocr-latex-pane','QA_']];
     for(const [mode,pane,marker] of grids){
       await chooseNative(moduleMenu,mode);
       const target=page.locator('.ocr-outline-pane '+pane);
       await target.waitFor({state:'visible',timeout:16000});
       await page.waitForFunction(({selector,expected})=>document.querySelector(selector)?.textContent.includes(expected),
         {selector:'.ocr-outline-pane '+pane,expected:marker+tag},{timeout:16000});
       const text=await target.innerText();
       assert(text.includes(marker+tag),`Wrong ${mode} rows in ${tag} chapter`);
       // AG Grid's virtualized row transition on iPad may briefly display the
       // outgoing chapter while replacing large row sets. Wait for completion;
       // within one chapter, the thumbnail identity check below forbids flash.
       await page.waitForFunction(({selector,own,old})=>{
         const body=document.querySelector(selector)?.textContent||'';
         return body.includes(own)&&!body.includes(old);
       },{selector:'.ocr-outline-pane '+pane,own:marker+tag,old:marker+names[1-ix]},
         {timeout:6500});
     }
     // Once the media pane is painted, visiting another element category
     // must not tear down and recreate its thumbnails. This specifically
     // catches the iPad flash caused by unconditional AG redrawRows().
     await chooseNative(moduleMenu,'media');
     await page.waitForFunction(()=>document.querySelector('.ocr-media-grid .ocr-media-thumb')!==null,null,{timeout:12000});
     await page.waitForTimeout(650); // allow pending media status/inventory fetches
     const before=await page.evaluate(()=>{
       window.__mediaPreviewElement=document.querySelector('.ocr-media-grid .ocr-media-thumb');
       return window.__mediaPreviewElement?.getAttribute('src');
     });
     await chooseNative(moduleMenu,'chapter-boundary');
     await chooseNative(moduleMenu,'media');
     await page.waitForTimeout(350);
     assert(await page.evaluate(()=>window.__mediaPreviewElement===document.querySelector('.ocr-media-grid .ocr-media-thumb')),
       'Media preview image DOM was recreated on module switch (visible flash)');
     assert.equal(await page.locator('.ocr-media-grid .ocr-media-thumb').first().getAttribute('src'),before);
   }
   await chooseNative(fileMenu,'document');
   await page.waitForURL(u=>!u.searchParams.has('chapter'),{timeout:16000});
   assert.equal(await moduleMenu.isVisible(),false);
   assert.equal(await page.locator('.ocr-lab-ag-toolbar #export-chapters').isVisible(),true);
   assert.equal(pageLoads,1,'Navigating chapters reloaded HTML');
   assert.deepEqual(errors,[]);
   console.log('CHAPTER_TRIPLE_SCAN_PASS',engineName,JSON.stringify({files:2,elementViews:3,sourceIsolation:true,pageLoads}));
 }finally{if(browser)await browser.close();server.kill('SIGTERM');rmSync(directory,{recursive:true,force:true});}
}
