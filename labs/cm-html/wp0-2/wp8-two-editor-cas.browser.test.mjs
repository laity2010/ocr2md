/** Two independently authenticated real browser editors, same disk and stale
 * ETag; 412 MUST leave B's CM6 draft/history in memory. Trial fixture only.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const origin=process.env.WP7_TEST_ORIGIN, dir=process.env.WP7_TRIAL_DIR;
if(!origin||!dir||!dir.endsWith('/wp7-trial'))throw Error('Explicit WP7 isolated trial required');
const candidate=readFileSync(join(dir,'candidate.md'),'utf8');
const target=join(dir,'document.md');
const hash=s=>createHash('sha256').update(s).digest('hex');
const key=readFileSync(join(dir,'private','test-unlock'),'utf8').trim();
for(const [label,browserType] of [['Chromium',chromium],['WebKit',webkit]]){
 assert.equal(readFileSync(target,'utf8'),candidate,'test fixture not restored');
 const browser=await browserType.launch({headless:true});
 try {
  const pages=[], requests=[], errors=[];
  for(let i=0;i<2;i++){
   const context=await browser.newContext({viewport:{width:1250,height:820}});
   const auth=await context.request.post(origin+'/labs/cm-html/api/unlock',{
      data:{code:key},headers:{Origin:origin}});
   assert.equal(auth.status(),200);
   const page=await context.newPage();pages.push(page);
   page.on('pageerror',e=>errors.push(e.message));
   page.on('response',res=>{if(res.request().method()==='PUT'&&
      new URL(res.url()).pathname.endsWith('/api/document'))
      requests.push({editor:i,status:res.status()});});
   await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>{
     window.__wp8Read=e.detail.getMarkdown;
     window.__wp8GetCMD=e.detail.getCMD;
   }));
   await page.goto(origin+'/labs/cm-html/',{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.__wp8GetCMD?.()?.getIndex?.()?.chapters?.length===6,
     null,{timeout:25000});
   assert.equal(await page.evaluate(()=>window.__wp8Read()),candidate);
  }
  const [a,b]=pages, tA='WP8_EDITOR_A_261026',tB='WP8_EDITOR_B_261026';
  const edit=async(page,token)=>{
    await page.locator('input[aria-label="CMD 虚拟索引"]').check();
    await page.locator('input[aria-label="章节所有"]').uncheck();
    const sel=page.locator('.ocr-wp3-chapter-select');
    const ch=await sel.locator('option').nth(1).getAttribute('value');
    await sel.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},ch);
    const line=page.locator('.cm-content .cm-line').filter({hasText:/Warren Bufet/}).first();
    await line.click();
    await page.keyboard.type(token);
    await page.waitForFunction(value=>window.__wp8Read().includes(value),token,{timeout:14000});
  };
  await edit(a,tA);
  await edit(b,tB);
  assert.equal(readFileSync(target,'utf8'),candidate,'typed data saved without clicking Save');
  await a.locator('#save').click();
  await a.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:22000});
  const sourceA=readFileSync(target,'utf8');
  assert(sourceA.includes(tA)&&sourceA.replace(tA,'')===candidate);
  await b.locator('#save').click();
  await b.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('保存冲突'),
      null,{timeout:22000});
  assert.equal(readFileSync(target,'utf8'),sourceA,'B overwrote A despite stale revision');
  const inB=await b.evaluate(value=>({
    hasLocal:window.__wp8Read().includes(value),
    error:document.querySelector('#status')?.textContent,
    canUndo:!document.querySelector('#undo')?.disabled,
  }),tB);
  assert(inB.hasLocal&&inB.canUndo&&inB.error.includes('保存冲突'));
  await a.locator('#undo').click();
  await a.waitForFunction(original=>window.__wp8Read()===original,candidate,{timeout:18000});
  await a.locator('#save').click();
  await a.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:19000});
  assert.equal(hash(readFileSync(target,'utf8')),hash(candidate));
  assert.deepEqual(requests.filter(x=>x.editor===0).map(x=>x.status),[200,200]);
  assert.deepEqual(requests.filter(x=>x.editor===1).map(x=>x.status),[412]);
  assert.deepEqual(errors,[]);
  console.log('WP8_REAL_TWO_BROWSER_CONFLICT_PASS',label,JSON.stringify({
    firstSaved:200,staleSave:412,unsavedDraftKept:true,undoKept:true,
    sameDocument:true,restoredCandidateSha:hash(candidate)}));
 } finally {
  await browser.close();
  assert.equal(hash(readFileSync(target,'utf8')),hash(candidate));
 }
}
