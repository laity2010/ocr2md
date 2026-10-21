import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,copyFileSync,mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {chromium,webkit,devices} from 'playwright';
const fixture='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md';
const original=readFileSync(fixture);
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});
const testFile='.v6/tests/workspace-header-test.md';copyFileSync(fixture,testFile);
const port=5238,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{
  env:{...process.env,V6_DOCUMENT_PATH:process.cwd()+'/'+testFile},stdio:'ignore',
});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
try{
 let ready=false;
 for(let i=0;i<150;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await sleep(130);}
 assert(ready,'V6 test server did not start');
 for(const [name,engine,options] of engines){
  const browser=await engine.launch({headless:true,...options});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.__v6cm6?.outline?.rows?.length===21 &&
     document.querySelector('.ocr-markdown [data-source-start]'),null,{timeout:50000});
   const info=await page.evaluate(()=>{
    const api=window.__v6cm6.dockview;
    return Object.fromEntries(['outline','source','preview'].map(id=>{
      const group=api.getPanel(id).group;
      const container=group.element;
      const header=container.querySelector('.dv-tabs-and-actions-container');
      const content=container.querySelector('.dv-content-container');
      const rect=el=>{const r=el?.getBoundingClientRect();return r&&{y:r.y,h:r.height,b:r.bottom};};
      return [id,{hidden:group.header.hidden,header:rect(header),content:rect(content),
        group:rect(container),tabText:header?.textContent?.trim(),
        headerDisplay:header&&getComputedStyle(header).display,
      }];
    }));
   });
   console.log('V6_WORKSPACE_HEADERS',name,JSON.stringify(info));
   for(const id of ['outline','source']){
    assert.equal(info[id].hidden,true,`${id} header not hidden`);
    assert(info[id].content?.h>220,`${id} content invisible`);
    assert(Math.abs(info[id].content.y-info[id].group.y)<3,`${id} left a titlebar gap`);
   }
   assert.equal(info.preview.hidden,false,'preview tab must remain visible');
   assert(info.preview.header?.h>20,'preview header collapsed');
   assert(info.preview.content.y>=info.preview.header.b-2,'preview must keep titlebar');
   assert.equal(await page.locator('.ocr-outline-checkbox').count(),21);
   assert.deepEqual(errors,[],name+' runtime errors');
   await page.screenshot({path:`.v6/evidence/workspace-headers-${name.toLowerCase()}.png`,timeout:25000});
   console.log('V6_WORKSPACE_HEADER_PASS',name);
  }finally{await browser.close();}
 }
 assert(readFileSync(fixture).equals(original));
}finally{server.kill('SIGTERM');}
