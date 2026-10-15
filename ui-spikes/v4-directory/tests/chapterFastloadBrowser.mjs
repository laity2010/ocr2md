/** Browser/UIC: precomputed chapter cache never uploads full DIRjson.
 * The real 224-block book is copied into a disposable authenticated Vault.
 * No POST can touch the user's Obsidian directory. */
import {chromium,webkit} from '../../../../web-component-platform/node_modules/playwright/index.mjs';
import {readFileSync,writeFileSync,mkdirSync,cpSync,existsSync,rmSync,mkdtempSync} from 'node:fs';
import {resolve,join,dirname,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('ui-spikes/v4-directory'),repo=resolve('.');
const original=process.env.V4_FASTLOAD_SOURCE||
  '/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha';
const book='/ocr2md/Bufett’s Alpha';
const folder=mkdtempSync(join(tmpdir(),'ocr2md-cache-browser-'));
const vaultroot=join(folder,'ocr2md'),physical=join(vaultroot,'ocr2md','Bufett’s Alpha');
const originalPointer=join(original,'.ocr2md','ir-current.v1.json');
const pointer=JSON.parse(readFileSync(originalPointer));
const generation=pointer.archiveSha256;
const archive=join(original,'.ocr2md','ir-versions',generation+'.zip');
mkdirSync(join(physical,'.ocr2md','ir-versions'),{recursive:true});
cpSync(originalPointer,join(physical,'.ocr2md','ir-current.v1.json'));
cpSync(archive,join(physical,'.ocr2md','ir-versions',generation+'.zip'));
const source=spawnSync('python3',['-c',`import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);i=json.loads(z.read('document-ir.v1.json'));print(json.dumps([i['pdf']['path'],i['ocr']['path']]))`,archive],{encoding:'utf8'});
if(source.status!==0)throw Error('Could not read fixture IR source names: '+source.stderr);
for(const logical of JSON.parse(source.stdout)){
  const relative=logical.slice(book.length+1),dest=join(physical,relative);
  mkdirSync(dirname(dest),{recursive:true});cpSync(join(original,relative),dest);
}
const prep=spawnSync('python3',['-c',`
import sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from v3_mac_vault import V3MacVault
from v3_ir_work_cache import prepare_work_cache
from v3_ir_persistence import materialize_version
vault=V3MacVault(Path(sys.argv[2]),Path(sys.argv[3]))
source=Path(sys.argv[2])/'ocr2md'/'Bufett’s Alpha'/'.ocr2md'/'ir-versions'/(sys.argv[5]+'.zip')
materialize_version(vault,sys.argv[4],sys.argv[5],source.read_bytes())
print(prepare_work_cache(vault,{'book':sys.argv[4],'expectedGeneration':sys.argv[5]}))
`,join(repo,'ui-spikes/v2'),vaultroot,join(folder,'private','access-key'),book,generation],{encoding:'utf8',timeout:65000});
assert.equal(prep.status,0,'Cannot prepare isolated work cache: '+prep.stderr);
const port=await new Promise((ok,fail)=>{
 const s=createServer();s.once('error',fail);
 s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p))});
});
const server=spawn('python3',[join(repo,'ui-spikes/v2/tests/v3MacVaultServeFixture.py'),
 '--root',vaultroot,'--static',folder,'--port',String(port)],{stdio:['ignore','pipe','pipe']});
const base=`http://127.0.0.1:${port}/v4-directory/`;
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json',
 '.css':'text/css','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.svg':'image/svg+xml'};
const keyfile=join(folder,'private','access-key');
const pause=ms=>new Promise(ok=>setTimeout(ok,ms));
try{
  for(let i=0;i<100&&!existsSync(keyfile);i++)await pause(100);
  assert.ok(existsSync(keyfile),'auth fixture did not start');
  const key=readFileSync(keyfile,'utf8').trim();
  for(const [name,engine] of [['webkit',webkit],['chromium',chromium]]){
    if(process.env.V4_FASTLOAD_ENGINE&&process.env.V4_FASTLOAD_ENGINE!==name)continue;
    console.log('V4_FASTLOAD_ENGINE_START',name);
    const browser=await engine.launch(name==='chromium'?{headless:true,channel:'chrome'}:{headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1100,height:750}});
      const errors=[],requests=[],writes=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',req=>{
        const url=new URL(req.url());if(url.pathname.startsWith('/__v3/')){
          requests.push(url.pathname+(url.pathname==='/__v3/ir/cache'?'?'+url.searchParams.get('part'):''));
          if(req.method()!=='GET')writes.push(url.pathname);
        }
      });
      await page.addInitScript(k=>{sessionStorage.setItem('ocr2md-v4-workspace-access-key',k)},key);
      await page.route(base+'**',async route=>{
        const rel=decodeURIComponent(new URL(route.request().url()).pathname.slice('/v4-directory/'.length))||'index.html';
        if(rel.startsWith('/')||rel.split('/').includes('..'))return route.abort();
        try{return route.fulfill({status:200,contentType:mime[extname(rel)]||'application/octet-stream',
          body:readFileSync(join(root,rel))})}
        catch{return route.fulfill({status:404,body:'missing asset'})}
      });
      await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
      console.log('V4_FASTLOAD_NAVIGATED',name);
      await page.waitForFunction(()=>window.__ocr2mdV4?.phase==='ready',null,{timeout:90000});
      console.log('V4_FASTLOAD_APP_READY',name);
      await page.getByTestId('tab-workspace').click();
      const target=page.locator('[data-open-path="'+book+'"]');
      await target.waitFor({timeout:30000});await target.dblclick();
      await page.getByTestId('workspace-set-root').click();
      await page.waitForFunction(()=>document.querySelector('#workbench-ir-source')?.dataset.irRestoreSource==='chapter-work-cache',null,{timeout:90000});
      console.log('V4_FASTLOAD_CACHE_READY',name);
      const baselineReads=requests.filter(r=>r==='/__v3/ir').length;
      assert.equal(baselineReads,0,'cache hit must transfer ZERO complete DIRjson snapshots');
      assert.ok(requests.some(r=>r==='/__v3/ir/cache?index'));
      assert.ok(requests.some(r=>r==='/__v3/ir/cache?md'));
      await page.waitForFunction(()=>document.querySelector('#boundary-pdf-view')?.dataset.pdfPhase==='ready',null,{timeout:45000});
      assert.ok((await page.locator('#workbench-ir-grid [role=row]').count())>1,'AG should be visible');
      assert.ok((await page.locator('#workbench-ir-source').textContent()).length>1000,'whole-book markdown must be visible');
      assert.equal(await page.getByTestId('boundary-edit-full').isVisible(),true);
      assert.equal(await page.getByTestId('boundary-cache-prepare').isVisible(),false);
      await page.getByTestId('ir-only-h1').uncheck();
      const check=page.locator('#workbench-ir-grid .chapter-standalone-input:not(:disabled)').first();
      await check.waitFor({state:'visible',timeout:16000});
      const before=await check.isChecked();
      if(before)await check.uncheck();else await check.check();
      assert.equal(await check.isChecked(),!before);
      assert.equal(requests.filter(r=>r==='/__v3/ir').length,0,'small mapping edit caused full DIRjson read');
      assert.equal(writes.length,0,'normal entry and checkbox cannot write');
      page.on('dialog',d=>void d.accept());
      await page.getByTestId('global-save').click();
      await page.waitForFunction(()=>document.querySelector('#ir-status')?.textContent?.includes('CAS 读回一致'),null,{timeout:35000});
      assert.ok(writes.includes('/__v3/ir/markings/commit'));
      assert.ok(!writes.includes('/__v3/ir/commit'),'small marks cannot upload a DIRjson ZIP');
      const marker=readFileSync(join(physical,'.ocr2md','chapters-map.v1.json'),'utf8');
      assert.ok(JSON.parse(marker).markings.segments.length>=1);
      await page.getByTestId('boundary-edit-full').click();
      await page.waitForTimeout(12000);
      console.log('FASTLOAD_HYDRATE_DIAGNOSTIC',JSON.stringify({engine:name,status:await page.locator('#ir-status').textContent(),restore:await page.locator('#workbench-ir-source').getAttribute('data-ir-restore-source'),requests:requests.slice(-18),errors}));
      await page.waitForFunction(()=>document.querySelector('#workbench-ir-source')?.dataset.irRestoreSource==='saved-dirjson',null,{timeout:18000});
      assert.ok(requests.includes('/__v3/ir'),'explicit source edit mode must hydrate full DIRjson on demand');
      assert.equal(await page.locator('#workbench-ir-source .cm-content').getAttribute('contenteditable'),'true');
      assert.deepEqual(errors,[]);
      console.log('V4_FASTLOAD_BROWSER_PASS',JSON.stringify({engine:name,cacheHitFullIrReads:baselineReads,
        blocks:224,smallMarksWrites:writes.filter(x=>x==='/__v3/ir/markings/commit').length,
        uploadedIrZip:writes.includes('/__v3/ir/commit'),fullHydratedOnDemand:true,
        sourceCachePartReads:requests.filter(x=>x.startsWith('/__v3/ir/cache')).length,
        originalVaultWrites:0}));
      await page.close();
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');
  rmSync(folder,{recursive:true,force:true});
}
