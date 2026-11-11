/** Regression: a Mac folder created or removed after opening the picker must
 * be reflected in the tree without reloading the browser or losing selection.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {mkdtemp,mkdir,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium,webkit} from 'playwright';

const url='http://127.0.0.1:5298/labs/lab-frame/';
const root=await mkdtemp(join(tmpdir(),'ocr2md-frame-dir-refresh-'));
await mkdir(join(root,'first'));await mkdir(join(root,'second'));
const dev=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-frame/vite.config.mjs','--host','127.0.0.1','--port','5298','--strictPort'],
  {stdio:'ignore'});
let denied=false;
try{
  for(let i=0;i<80;i++){
    try{if((await fetch(url)).ok)break;}catch{}
    if(i===79)throw Error('Lab Frame Vite did not start');
    await sleep(200);
  }
  for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
    denied=false;
    for(const dirname of ['first','second','added','extra'])await rm(join(root,dirname),{recursive:true,force:true});
    await mkdir(join(root,'first'));await mkdir(join(root,'second'));
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1408,height:1056},hasTouch:true});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/api/workspace/roots',route=>route.fulfill(denied?
        {status:403,body:'Editor authorization required'}:
        {status:200,contentType:'application/json',
          body:JSON.stringify({allowedRoots:[root]})}));
      await page.route('**/api/workspace/browse?*',async route=>{
        if(denied)return route.fulfill({status:403,body:'Editor authorization required'});
        const path=new URL(route.request().url()).searchParams.get('path');
        const children=(await readdir(path,{withFileTypes:true}))
          .filter(entry=>entry.isDirectory()).map(entry=>({name:entry.name,path:join(path,entry.name)}));
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({path,children})});
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.locator('.ocr-ag-module-select').first().selectOption('settings');
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('全局设置已就绪'));
      await page.locator('#settings-workspace .ag-row',{hasText:'dataDirectory'}).click();
      await page.getByRole('button',{name:'打开目录树'}).click();
      const item=path=>page.locator('wa-tree-item').filter({visible:true})
        .and(page.locator('wa-tree-item[data-path="'+path+'"]'));
      const first=item(join(root,'first'));
      await first.waitFor({state:'visible',timeout:16000});
      await first.locator('[part="item"]').first().click();
      const accept=page.getByRole('button',{name:'采用选中目录'});
      await page.waitForFunction(()=>!document.querySelector('[aria-label="采用选中目录"]')?.disabled);
      // Real filesystem mutation while tree is open: no click or navigation.
      await mkdir(join(root,'added'));
      await item(join(root,'added')).waitFor({state:'visible',timeout:10500});
      assert.equal(await first.getAttribute('selected'),'');
      assert.equal(await accept.isEnabled(),true);
      await rm(join(root,'second'),{recursive:true});
      await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
      await item(join(root,'second')).waitFor({state:'detached',timeout:6000});
      // A deleted, currently selected directory must never remain actionable.
      await rm(join(root,'first'),{recursive:true});
      await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
      await first.waitFor({state:'detached',timeout:6000});
      await page.waitForFunction(()=>document.querySelector('[aria-label="采用选中目录"]')?.disabled===true);
      await page.getByRole('button',{name:'关闭目录选择器'}).click();
      await mkdir(join(root,'extra'));
      await page.getByRole('button',{name:'打开目录树'}).click();
      await item(join(root,'extra')).waitFor({state:'visible',timeout:6500});
      // The refresh must no longer depend on Main's unrelated active book
      // resolution, which can fail 422 when a book was renamed on the Mac.
      // While already open, roots is not called on refresh; browse is.
      denied=false;
      const rootsBefore=await page.evaluate(()=>performance.getEntriesByType('resource')
        .filter(entry=>entry.name.includes('/api/workspace/roots')).length);
      await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
      const rootsAfter=await page.evaluate(()=>performance.getEntriesByType('resource')
        .filter(entry=>entry.name.includes('/api/workspace/roots')).length);
      assert.equal(rootsAfter,rootsBefore,
        'Directory content refresh should not repeatedly query Main book roots');
      // Authorization revoked after loading: no stale paths remain in the UI.
      denied=true;
      await page.getByRole('button',{name:'刷新 Mac 目录'}).click();
      await page.waitForFunction(()=>document.querySelectorAll('wa-tree-item').length===0);
      await page.locator('#status').getByText('目录访问需要 Main 的编辑授权',{exact:false}).waitFor();
      assert.equal(await page.locator('#status').getAttribute('data-kind'),'error');
      assert.equal(await accept.isEnabled(),false);
      assert.deepEqual(errors,[]);
      console.log(name+'_MAC_DIRECTORY_REFRESH_PASS',root);
    }finally{await browser.close();}
  }
}finally{
  dev.kill('SIGTERM');
  await rm(root,{recursive:true,force:true});
}
