/** Browser A/B optimistic save regression for a STRICTLY isolated Lab fixture.
 * Zero access to production, explicit opt-in source document under Lab runtime.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'';
const dir=resolve(process.env.OCR_LAB_FIXTURE_DIR||'/not-set');
if(!/^http:\/\/127\.0\.0\.1:\d+\/labs\/cm-html\/$/.test(base)||
  !/\/ocr2md-v6\/labs\/cm-html\/\.runtime\/boundary-regression-[^/]+$/.test(dir))
 throw Error('Reject non-isolated Lab CAS destination');
const code=readFileSync(dir+'/unlock','utf8').trim().slice(0,12);
const file=dir+'/document.md';
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
 const original=readFileSync(file,'utf8');
 const browser=await engine.launch({headless:true});
 try{
  const pages=[],requests=[],errors=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1300,height:840}});
   const r=await context.request.post(base+'api/unlock',{
     data:{code},headers:{Origin:new URL(base).origin}
   });
   assert.equal(r.status(),200,'Isolated Lab authorization failed');
   const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',res=>{
     if(res.request().method()==='PUT'&&new URL(res.url()).pathname.endsWith('/api/document'))
       requests.push({editor:i,status:res.status()});
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForSelector('#editor .cm-editor',{timeout:25000});
   pages.push(page);
  }
  const [a,b]=pages;
  const edit=async(page,marker)=>{
    const editor=page.locator('#editor .cm-content');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+Home');
    await page.keyboard.insertText(marker+' ');
    await page.waitForFunction(m=>document.querySelector('#editor .cm-content')?.textContent.includes(m),marker,{timeout:10000});
    assert.equal(await page.locator('#undo').isDisabled(),false);
  };
  const markerA='WCP_CAS_A_'+name;
  const markerB='WCP_CAS_B_'+name;
  await edit(a,markerA);await edit(b,markerB);
  assert.equal(readFileSync(file,'utf8'),original,'Draft edited disk before save');
  await a.locator('#save').click();
  await a.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:18000});
  const firstSaved=readFileSync(file,'utf8');
  assert(firstSaved.includes(markerA)&&firstSaved.replace(markerA+' ','')===original);
  await b.locator('#save').click();
  await b.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('保存冲突'),null,{timeout:18000});
  assert.equal(readFileSync(file,'utf8'),firstSaved,'Stale editor overwrote A');
  assert.equal(await b.locator('#undo').isDisabled(),false);
  await b.locator('#editor .cm-content').click();
  await b.keyboard.press('ControlOrMeta+Home');
  assert((await b.locator('#editor .cm-content').textContent()).includes(markerB),
    'Stale editor lost local draft');
  await a.locator('#undo').click();
  await a.waitForFunction(marker=>!document.querySelector('#editor .cm-content')?.textContent.includes(marker),markerA,{timeout:13000});
  await a.locator('#save').click();
  await a.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:18000});
  assert.equal(readFileSync(file,'utf8'),original,'Restored fixture is different');
  assert.deepEqual(requests.filter(x=>x.editor===0).map(x=>x.status),[200,200]);
  assert.deepEqual(requests.filter(x=>x.editor===1).map(x=>x.status),[412]);
  assert.deepEqual(errors,[]);
  console.log('WCP_CAS_TWO_EDITOR_PASS',name,JSON.stringify({A:[200,200],B:[412],
    draftProtected:true,undoRetained:true,fixtureRestored:true,jsErrors:0}));
 }finally{await browser.close();}
}
