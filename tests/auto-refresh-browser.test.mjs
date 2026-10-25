import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'playwright';
const base='http://127.0.0.1:4397/';
const file='.v6/tests/auto-refresh.md';
const version=JSON.parse(readFileSync('dist/release-version.json')).version;
const code=readFileSync('.v6/private/editor-token','utf8').slice(0,12);
const browser=await chromium.launch({executablePath:chromium.executablePath(),headless:true});
async function prepare(){
 const p=await browser.newPage({viewport:{width:1032,height:730}});let redirects=0;let reported=version;
 await p.route('**/healthz',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:reported})}));
 p.on('framenavigated',f=>{if(f===p.mainFrame())redirects++});
 await p.goto(base);await p.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('保存需授权'));
 return {p,setVersion:v=>reported=v,count:()=>redirects};
}
async function until(callback,ms=12000){const end=Date.now()+ms;while(!callback()&&Date.now()<end)await new Promise(r=>setTimeout(r,200));assert(callback(),'timed out');}
try {
 const clean=await prepare();clean.setVersion('v6-20991231-235959');await until(()=>clean.count()>=2);clean.setVersion(version);
 console.log('CLEAN_AUTO_RELOAD_OK',clean.count());
 writeFileSync(file,readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md'));
 const dirty=await prepare();
 await dirty.p.locator('.cm-content').click({position:{x:70,y:50}});
 await dirty.p.keyboard.type('SAVED-RELOAD-TEST');
 await dirty.p.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('未保存'));
 dirty.setVersion('v6-20991231-235959');
 await dirty.p.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('新版本待更新'),{timeout:12000});
 assert.equal(dirty.count(),1);assert((await dirty.p.locator('.cm-content').innerText()).includes('SAVED-RELOAD-TEST'));
 await dirty.p.screenshot({path:'.v6/evidence/auto-refresh/dirty-protected.png'});
 await dirty.p.locator('#save').click();await dirty.p.locator('#unlock-code').fill(code);
 await dirty.p.locator('#unlock-form button[type=submit]').click();
 await until(()=>dirty.count()>=2);dirty.setVersion(version);
 await dirty.p.waitForFunction(()=>document.querySelector('.cm-content')?.textContent.includes('SAVED-RELOAD-TEST'));
 assert(readFileSync(file,'utf8').includes('SAVED-RELOAD-TEST'));
 console.log('V6_AUTO_REFRESH_PASS',JSON.stringify({version,cleanReload:true,dirtyProtected:true,saveThenReload:true}));
} finally {await browser.close();}
