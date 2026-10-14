/** Canonical Sarasa Fixed SC typography across host + shared settings surfaces. */
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium,webkit}=require('../../v2/node_modules/@playwright/test');
const root=path.resolve(__dirname,'..');
const publicRoot=path.resolve(root,'../../../agent-link-monitor/web');
const port=30000+Math.floor(Math.random()*28000);
const url=`http://127.0.0.1:${port}/index.html`;
const engine=process.env.OCR2MD_TEST_WEBKIT==='1'?'webkit':'chromium';
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1','--directory',root],{stdio:'ignore'});
(async()=>{let browser;
try{
 for(let i=0;i<90;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,120));}
 browser=await (engine==='webkit'?webkit:chromium).launch(engine==='webkit'?{headless:true}:{channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1080,height:780}});
 const errors=[];let remoteFontLoads=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://agent-link.laity.bid/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   const file=path.resolve(publicRoot,'.'+pathname);
   if(!file.startsWith(publicRoot+'/')||!fs.existsSync(file))return route.continue();
   const extension=path.extname(file);
   if(extension==='.woff2')remoteFontLoads++;
   const mime=extension==='.woff2'?'font/woff2':extension==='.css'?'text/css':extension==='.json'?'application/json':'text/javascript';
   let content=fs.readFileSync(file);
   // Force an actual web-font fetch rather than local() shortcut on Mac.
   if(pathname.endsWith('/sarasa-ui.css')){
     const css=content.toString('utf8');
     content=Buffer.from(css.replace(/local\("Sarasa Fixed SC"\), local\("Sarasa-Fixed-SC-Regular"\),/,'').replace(/local\("Sarasa Fixed SC"\),\s*local\("Sarasa-Fixed-SC-Regular"\),/,'').trim());
   }
   await route.fulfill({status:200,contentType:mime,headers:{'Access-Control-Allow-Origin':'*'},body:content});
 });
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.getByTestId('tab-settings').click();
 await page.waitForFunction(()=>document.querySelector('#settings-shared')?.dataset.ready==='true'
   && document.querySelector('#settings-shared')?.dataset.sourceReady==='true',null,{timeout:20000});
 const result=await page.evaluate(async()=>{
   const font='Laity Sarasa Fixed SC';
   await document.fonts.load(`13px "${font}"`,'设置组件 · 中文参数与源码');
   await document.fonts.ready;
   const panel=document.querySelector('#settings-shared');
   const computed=selector=>getComputedStyle(document.querySelector(selector)).fontFamily;
   const nested=panel.querySelector('laity-source-surface');
   return {
     fontAvailable:document.fonts.check(`13px "${font}"`,'设置组件 · 中文参数'),
     body:computed('body'),button:computed('.v3-top-row button'),
     appGrid:computed('#directory-list'),
     panel:computed('#settings-shared'),
     agCell:computed('#settings-shared .ag-cell'),
     preview:computed('#settings-shared .las-preview-note'),
     source:getComputedStyle(nested.shadowRoot.querySelector('.cm-scroller')).fontFamily,
     input:computed('#vault-key'),
     faceSheet:!!document.getElementById('laity-sarasa-ui-font-v1'),
     loadedFaces:[...document.fonts].filter(face=>face.family===font&&face.status==='loaded').length,
     faceName:font,
   };
 });
 assert.equal(result.fontAvailable,true);
 assert.equal(result.faceSheet,true);
 for(const [key,value] of Object.entries(result)){
   if(!['fontAvailable','faceSheet','faceName','loadedFaces'].includes(key))assert.ok(value.includes(result.faceName),`${key}: ${value}`);
 }
 assert.ok(remoteFontLoads>=1||result.loadedFaces>=1,
   'Sarasa must have a loaded font face even if cache/local font avoids a WOFF2 request');
 assert.deepEqual(errors,[]);
 console.log('V3_SARASA_FONT_CONSISTENCY_PASS',JSON.stringify({engine,face:result.faceName,remoteFontLoads,areas:['body','button','appGrid','panel','agCell','preview','source','input']}));
}catch(e){console.error('V3_SARASA_FONT_CONSISTENCY_FAIL',e);process.exitCode=1;}
finally{await browser?.close();server.kill('SIGTERM');}
})();
