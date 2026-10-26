/** WP7 existing authorized global Save and reopen, on a dedicated trial
 * runtime whose document was seeded with a verified merge candidate.
 *
 * This test DOES mutate the WP7 trial copy twice, NEVER original/fixture
 * workspaces. It must return the trial copy to candidate SHA at the end.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium,webkit} from 'playwright';
const origin=process.env.WP7_TEST_ORIGIN;
const dir=process.env.WP7_TRIAL_DIR;
if(!origin||!dir)throw Error('Use explicit WP7_TEST_ORIGIN / WP7_TRIAL_DIR');
const candidate=readFileSync(join(dir,'candidate.md'),'utf8');
const expectedHash=createHash('sha256').update(candidate).digest('hex');
const key=readFileSync(join(dir,'private','test-unlock'),'utf8').trim();
const trialFile=join(dir,'document.md');
const token='WP7_SINGLE_SAVE_REOPEN_261026';
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const [name,engine,opts] of [
 ['Chrome',chromium,{viewport:{width:1250,height:830}}],
 ['iPad WebKit',webkit,{viewport:{width:1032,height:768},hasTouch:true,isMobile:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  assert.equal(hash(readFileSync(trialFile,'utf8')),expectedHash,'trial must begin exact candidate');
  const context=await browser.newContext(opts),page=await context.newPage();
  const errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{const u=new URL(r.url());
    if(u.pathname.endsWith('/api/document')&&r.method()==='PUT')requests.push('save');
    if(u.pathname.endsWith('/api/document')&&u.searchParams.has('chapter'))requests.push('physical');
  });
  // Exact same server access check as original save button. Separate lab-only
  // authorization code, never any production credential.
  const auth=await context.request.post(origin+'/labs/cm-html/api/unlock',{
    data:{code:key},headers:{Origin:origin}});
  assert.equal(auth.status(),200,'independent save authorization failed');
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>{
    window.__wp7Port=e.detail.getCMD();window.__wp7Read=e.detail.getMarkdown;
  }));
  await page.goto(origin+'/labs/cm-html/',{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>window.__wp7Port?.getIndex?.(),null,{timeout:25000});
  assert.equal(await page.evaluate(()=>window.__wp7Read().length),candidate.length);
  const first=await page.evaluate(()=>{
    const x=window.__wp7Port.getIndex(),reviews=x.queryElements({type:'latex'});
    return {chapters:x.chapters.length,reviews:reviews.filter(r=>r.status==='latex').length,
      reviewIds:reviews.filter(r=>r.status==='latex').map(r=>r.reviewId).sort(),
      headings:x.queryElements({type:'heading'}).length,
      media:x.queryElements({type:'media'}).length};
  });
  assert.deepEqual([first.chapters,first.reviews,first.headings,first.media],[6,38,19,11]);
  assert.equal(new Set(first.reviewIds).size,38);
  await page.locator('input[aria-label="CMD 虚拟索引"]').check();
  await page.locator('input[aria-label="章节所有"]').uncheck();
  const selector=page.locator('.ocr-wp3-chapter-select');
  const owner=await selector.locator('option').nth(1).getAttribute('value');
  await selector.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}))},owner);
  await page.waitForFunction(id=>window.__wp7Port.getChapter(id),owner,{timeout:14000});
  const safeRow=page.locator('.cm-content .cm-line').filter({hasText:/Warren Bufet/}).first();
  await safeRow.click();
  await page.keyboard.type(token);
  await page.waitForFunction(x=>window.__wp7Read().includes(x),token,{timeout:15000});
  assert.equal(hash(readFileSync(trialFile,'utf8')),expectedHash,
    'typing unexpectedly wrote to disk before global Save');
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
    null,{timeout:20000});
  await page.waitForFunction(x=>window.__wp7Read().includes(x),token,{timeout:20000});
  const changed=readFileSync(trialFile,'utf8');
  assert(changed.includes(token),'global save did not persist source');
  assert.equal(changed.replace(token,''),candidate,'save changed more than one approved insertion');
  assert.equal(requests.filter(s=>s==='save').length,1,'not exactly one global save');
  await page.reload({waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>window.__wp7Port?.getIndex?.()&&
    window.__wp7Read().includes('WP7_SINGLE_SAVE_REOPEN_261026'),
  null,{timeout:25000});
  assert.equal(await page.evaluate(()=>window.__wp7Port.getIndex()
    .queryElements({type:'latex'}).filter(x=>x.status==='latex').length),38,
  'reopen lost migrated formula reviews');
  const currentReviews=await page.evaluate(()=>window.__wp7Port.getIndex()
    .queryElements({type:'latex'}).filter(x=>x.status==='latex')
    .map(x=>x.reviewId).sort());
  assert.deepEqual(currentReviews,first.reviewIds,'review identity drift on reload');
  // Undo history intentionally belongs to this new CM6 session; restore the
  // single test insertion using the exact CMD transaction port + global save.
  const restored=await page.evaluate(value=>{
    const port=window.__wp7Port,source=window.__wp7Read(),at=source.indexOf(value);
    if(at<0)throw Error('WP7 expected test edit missing');
    port.replaceRanges([{from:at,to:at+value.length,expected:value,insert:''}]);
    return window.__wp7Read();
  },token);
  assert.equal(restored,candidate);
  await page.locator('#save').click();
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
    null,{timeout:20000});
  assert.equal(hash(readFileSync(trialFile,'utf8')),expectedHash,'trial restore failed');
  await page.reload({waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>window.__wp7Port?.getIndex?.(),null,{timeout:24000});
  assert.equal(await page.evaluate(()=>window.__wp7Read()),candidate);
  assert.deepEqual(errors,[],'browser errors');
  assert(!requests.includes('physical'),'trial browser navigated to exported chapter');
  assert.equal(requests.filter(s=>s==='save').length,2);
  console.log('WP7_SINGLE_SAVE_REOPEN_PASS',name,JSON.stringify({
    savedCandidateSHA:expectedHash,reviewed:38,chapterCount:6,
    originalReviewIdsPreserved:true,oneSavePerEdit:true,reopenPersisted:true,
    finalTrialRestored:true,noPhysicalChapterLoads:true,
  }));
 }finally{await browser.close();}
}
