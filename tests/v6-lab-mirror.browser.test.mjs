/** Same business flow against Main and Lab from the SAME Git worktree.
 * Run after both `npm run build` variants and source-module parity proof.
 * Never touches the hosted Lab .runtime or Main .v6 user documents.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {chromium,webkit} from 'playwright';

const root=process.cwd(),name=process.env.OCR_LAB_NAME||'cm-html';
assert(/^[a-z][a-z0-9-]{0,31}$/.test(name));
execFileSync('node',['scripts/v6_lab_parity_check.mjs',name],{cwd:root,stdio:'inherit'});
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const settings=JSON.stringify({settings:{}},null,2)+'\n';
// Never remove an existing runtime. The mirror should be a fresh test worktree,
// distinct from the hosted deployment's persistent user data.
const rt=resolve(`labs/${name}/.runtime`);
assert(!existsSync(rt),'Refuse to modify existing Lab runtime in mirror worktree');
const scratch=mkdtempSync(join(tmpdir(),'ocr2md-lab-main-flow-'));
mkdirSync(join(rt,'private'),{recursive:true});
const labDoc=join(rt,'document.md'),labSettings=join(rt,'settings.json');
const mainDoc=join(scratch,'document.md'),mainSettings=join(scratch,'settings.json');
writeFileSync(labDoc,fixture);writeFileSync(labSettings,settings);
writeFileSync(join(rt,'private','test-code'),'MIRROR_TEST_SECRET_ONLY\n');
writeFileSync(mainDoc,fixture);writeFileSync(mainSettings,settings);
const hosts=[
 {kind:'Main',port:5992,path:'/',env:{V6_LAB_ID:'',V6_DOCUMENT_PATH:mainDoc,V6_SETTINGS_PATH:mainSettings,V6_TOKEN_PATH:join(scratch,'main-auth'),V6_STATIC_ROOT:resolve('dist')},script:'scripts/v6_serve.py'},
 {kind:'Lab',port:5993,path:`/labs/${name}/`,env:{V6_LAB_ID:name,V6_STATIC_ROOT:resolve(`labs/${name}/dist`),V6_LAB_UNLOCK_TOKEN_PATH:join(rt,'private','test-code')},script:`labs/${name}/server.py`}
];
const procs=[];
try{
 for(const h of hosts){
  const proc=spawn('/usr/bin/python3',[h.script],{cwd:root,
    env:{...process.env,...h.env,V6_PORT:String(h.port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_LAB_LAN_ORIGIN:''},stdio:'ignore'});
  procs.push(proc);
  let online=false;
  for(let i=0;i<180;i++){
    try{const resp=await fetch(`http://127.0.0.1:${h.port}${h.path}healthz`);if(resp.ok){online=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,125));
  }
  assert(online,`${h.kind} isolated server failed`);
  const r=await fetch(`http://127.0.0.1:${h.port}${h.path}api/document`);
  assert.equal(r.status,200);assert.equal(await r.text(),fixture);
  assert(r.headers.get('etag'),'Save revision missing');
 }
 assert.equal((await fetch('http://127.0.0.1:5993/api/document')).status,404,
   'Lab must reject unprefixed document API');
 for(const [nameBrowser,engine] of [['Chrome',chromium],['iPad-WebKit',webkit]]){
  for(const h of hosts){
   const browser=await engine.launch({headless:true});
   try{
    const p=await browser.newPage({viewport:nameBrowser==='iPad-WebKit'?{width:1024,height:768}:{width:1440,height:900},
      isMobile:nameBrowser==='iPad-WebKit',hasTouch:nameBrowser==='iPad-WebKit'});
    const errors=[],writes=[];
    p.on('pageerror',e=>errors.push(e.message));
    p.on('request',r=>{if(r.url().includes('/api/')&&!['GET','HEAD'].includes(r.method()))writes.push(r.url())});
    await p.goto(`http://127.0.0.1:${h.port}${h.path}`,{waitUntil:'domcontentloaded',timeout:55000});
    await p.locator('.ocr-source-pane .ocr-navigation-files .ts-control').waitFor({state:'visible',timeout:48000});
    await p.locator('.ocr-lab-ag-toolbar .ocr-navigation-elements .ts-control').waitFor({state:'visible',timeout:15000});
    await p.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').waitFor({state:'visible',timeout:15000});
    const select=p.locator('.ocr-source-pane .ocr-lab-file-select');
    await p.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane option[value^="virtual:"]').length>=3,null,{timeout:25000});
    const chapterCount=await select.locator('option[value^="virtual:"]').count();
    const all=p.locator('input[aria-label="章节所有"]');
    assert(await all.isEnabled());
    await all.uncheck();assert.equal(await all.isChecked(),false);
    assert.equal(await select.inputValue(),'document');
    await all.check();
    const choice=await select.locator('option[value^="virtual:"]').nth(1).getAttribute('value');
    await select.evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}))},choice);
    await p.waitForFunction(v=>location.search.includes(encodeURIComponent(v.slice(8)))||new URLSearchParams(location.search).has('view'),choice,{timeout:19000});
    await p.locator('.ocr-navigation-files .ts-control').first().click();
    await p.locator('body>.ocr-navigation-popup-files:visible [data-value="settings"]').click();
    await p.locator('#settings-workspace .ocr-navigation-files .ts-control').waitFor({state:'visible',timeout:19000});
    assert.equal(await p.locator('#settings-workspace .ocr-lab-file-select').inputValue(),'settings');
    assert.equal(await select.inputValue(),'settings');
    assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
    console.log('LAB_MIRROR_BUSINESS_PASS',h.kind,nameBrowser,JSON.stringify({chapterCount,checkbox:true,settings:'settings',writes:0,errors:0}));
   }finally{await browser.close()}
  }
 }
}finally{
 for(const proc of procs)proc.kill('SIGTERM');
 assert.equal(readFileSync(labDoc,'utf8'),fixture);
 assert.equal(readFileSync(mainDoc,'utf8'),fixture);
 assert.equal(readFileSync(labSettings,'utf8'),settings);
 assert.equal(readFileSync(mainSettings,'utf8'),settings);
 rmSync(scratch,{recursive:true,force:true});
 rmSync(rt,{recursive:true,force:true});
}
