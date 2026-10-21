/** No V6 production document is accessed or initialized by this test. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {chromium,webkit,devices} from 'playwright';

const root=process.cwd();
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const protectedPaths=['packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md',
  '.v6/workspace/buffetts-alpha.minerujson.md','.v6/release/index.html'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const baseline=protectedPaths.map(path=>sha(readFileSync(path)));
const token=readFileSync('.v6/private/editor-token','utf8').trim();
const engines=[['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
  ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let passes=0;
for(const [i,[name,engine,options]] of engines.entries()){
  const port=4520+i,base=`http://127.0.0.1:${port}/`;
  const dir=resolve(`.v6/tests/initialize-${name.toLowerCase()}-${process.pid}`);
  mkdirSync(dir,{recursive:true});
  const doc=join(dir,'mother.md');
  const changed=Buffer.concat([fixture,Buffer.from('\nUNIQUE_TEST_MODIFICATION_FOR_RESET\n')]);
  writeFileSync(doc,changed);
  const generated=join(dir,'chapters');mkdirSync(generated,{recursive:true});
  writeFileSync(join(generated,'other-data.txt'),'MUST NEVER BE DELETED');
  const server=spawn('python3',['scripts/v6_serve.py'],{
    cwd:root,env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,
      V6_STATIC_ROOT:resolve('dist')},stdio:'ignore',
  });
  let browser;
  try{
    let ready=false;
    for(let j=0;j<120;j++){
      try{if((await fetch(base+'healthz')).ok){ready=true;break;}}catch{}
      await sleep(100);
    }
    assert(ready,name+' isolated test server failed');
    const url=base+'api/initialize-document';
    const request=(payload,auth=true,origin=base.slice(0,-1))=>fetch(url,{
      method:'POST',headers:{'Content-Type':'application/json',Origin:origin,
        ...(auth?{Cookie:`v6edit=${token}`}:{})},
      body:JSON.stringify(payload),
    });
    const body={confirmation:'初始化',expectedSha256:sha(changed)};
    assert.equal((await request(body,false)).status,403,'Reset must require authorization');
    assert.equal((await request(body,true,'https://invalid.example')).status,403,'Reset must check origin');
    assert.equal((await request({...body,confirmation:'yes'})).status,400,'Reset requires exact confirmation');
    assert.equal((await request({...body,expectedSha256:'0'.repeat(64)})).status,409,
      'Reset must refuse a changed document');
    assert(readFileSync(doc).equals(changed));
    assert(!existsSync(join(dir,'.initialize-backups')),
      'Failed and unauthorized reset attempts must not create backups');

    browser=await engine.launch({headless:true,...options});
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)
      ?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForFunction(()=>document.querySelectorAll('.ocr-outline-checkbox').length===21 &&
      document.querySelector('#status')?.textContent.includes('已加载'),null,{timeout:45000});
    await page.locator('#build-version').click();
    await page.locator('#engineering-dialog').waitFor({state:'visible'});
    assert.deepEqual(await page.locator('.engineering-menu-actions button').allTextContents(),
      ['初始化数据文档','关闭']);
    await page.locator('#initialize-document').click();
    // Reuse existing editor authorization. Confirmation is still a separate step.
    await page.locator('#unlock-dialog').waitFor({state:'visible'});
    assert(readFileSync(doc).equals(changed),'Menu opening must never initialize');
    await page.locator('#unlock-code').fill(token.slice(0,12));
    await page.locator('#unlock-form button[type="submit"]').click();
    await page.locator('#initialize-dialog').waitFor({state:'visible',timeout:10000});
    assert.equal(await page.locator('#initialize-confirm').isDisabled(),true);
    assert.match(await page.locator('#initialize-dialog').textContent(),/已保存文档会先备份/);
    assert(readFileSync(doc).equals(changed));
    await page.locator('#initialize-phrase').fill('test');
    assert.equal(await page.locator('#initialize-confirm').isDisabled(),true);
    await page.locator('#initialize-phrase').fill('初始化');
    assert.equal(await page.locator('#initialize-confirm').isDisabled(),false);
    await page.locator('#initialize-cancel').click();
    assert(readFileSync(doc).equals(changed),'Cancel must not overwrite document');
    await page.locator('#build-version').click();
    await page.locator('#initialize-document').click();
    await page.locator('#initialize-phrase').fill('初始化');
    const navigation=page.waitForEvent('framenavigated',{
      predicate:f=>f===page.mainFrame() && new URL(f.url()).searchParams.has('initialized'),
      timeout:30000,
    });
    await page.locator('#initialize-confirm').click();
    await navigation;
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('数据文档已初始化')&&
      document.querySelectorAll('.ocr-outline-checkbox').length===21,null,{timeout:35000});
    assert(readFileSync(doc).equals(fixture),'Reset did not restore immutable original');
    const backups=join(dir,'.initialize-backups');
    const filenames=readdirSync(backups);assert.equal(filenames.length,1);
    assert(readFileSync(join(backups,filenames[0])).equals(changed),'Backup did not preserve previous content');
    assert.equal(readFileSync(join(generated,'other-data.txt'),'utf8'),'MUST NEVER BE DELETED');
    assert.equal(await page.locator('#undo').isDisabled(),true,
      'Reset must deliberately restart CM6 undo history');
    assert.deepEqual(errors,[],name+' runtime errors');
    console.log('V6_ENGINEERING_INITIALIZE_PASS',name,JSON.stringify({backup:filenames.length,
      originalBytes:fixture.length,originalRestored:true,generatedFilesUnchanged:true}));

    // An identical reinitialization is a no-op, not another backup.
    const again=await request({confirmation:'初始化',expectedSha256:sha(fixture)});
    assert.equal(again.status,200);
    assert.equal((await again.json()).unchanged,true);
    assert.equal(readdirSync(backups).length,1);
    passes++;
  }finally{if(browser)await browser.close();server.kill('SIGTERM');}
}
assert.equal(passes,2);
assert.deepEqual(protectedPaths.map(p=>sha(readFileSync(p))),baseline,
  'Production or fixture file was modified');
console.log('V6_INITIALIZATION_ISOLATION_PASS');
