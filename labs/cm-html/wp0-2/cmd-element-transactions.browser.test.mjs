/** WP6: same source via one CMD port, three business write operations.
 * Headings: writeAnnotation, LaTeX: editAnnotations, Media: replaceRanges.
 * Validates single-CM6-undo per write, stable reviewed ID, stale write
 * rejection, readonly archive, scoped writes and AG index coherence.
 */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=process.env.OCR_LAB_TEST_URL||'http://127.0.0.1:4412/labs/cm-html/';
const choose=async(locator,value)=>locator.evaluate((e,v)=>{
  e.value=v;e.dispatchEvent(new Event('change',{bubbles:true}));
},value);
for(const [name,engine,options] of [
  ['Chrome',chromium,{viewport:{width:1250,height:830}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}],
]){
 const browser=await engine.launch({headless:true});
 try{
  const page=await browser.newPage(options);
  const errors=[],writes=[],physical=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{
    const url=new URL(req.url());
    if(!['GET','HEAD'].includes(req.method())&&url.pathname.includes('/api/'))writes.push(req.method()+' '+url.pathname);
    if(url.pathname.endsWith('/api/document')&&url.searchParams.has('chapter'))physical.push(url.toString());
  });
  await page.addInitScript(()=>document.addEventListener('ocr2md:wp3-ag-ready',e=>{
    window.__wp6Port=e.detail.getCMD();
    window.__wp6GetText=e.detail.getMarkdown;
    window.__wp6Ag=e.detail.views;
  }));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
  await page.waitForFunction(()=>window.__wp6Port?.queryElements, null,{timeout:30000});
  const original=await page.evaluate(()=>window.__wp6GetText());
  const originalChecksum=await page.evaluate(()=>window.__wp6GetText().length);
  const undo=page.locator('#undo');
  const redo=page.locator('#redo');
  const controls=page.locator('input[aria-label="CMD 虚拟索引"]');
  await controls.check();
  const all=page.locator('input[aria-label="章节所有"]');
  const chapter=page.locator('.ocr-wp3-chapter-select');
  const elements=page.locator('.ocr-lab-element-select');
  // All original three AG instances must share the one CMD read source.
  const initial=await page.evaluate(()=>({
    chapters:window.__wp6Port.getIndex().chapters.length,
    heading:window.__wp6Port.queryElements({type:'heading'}).length,
    latex:window.__wp6Port.queryElements({type:'latex'}).length,
    media:window.__wp6Port.queryElements({type:'media'}).length,
  }));
  assert.deepEqual(initial,{chapters:6,heading:19,latex:42,media:11});
  await all.uncheck();
  const ids=await chapter.locator('option').evaluateAll(a=>a.map(x=>x.value));
  await choose(chapter,ids[1]);
  const forbidden=await page.evaluate(()=>{
    const cmd=window.__wp6Port;
    const first=cmd.queryElements({type:'media',chapter:cmd.getIndex().chapters[0].id})[0];
    const source=window.__wp6GetText();
    const before=cmd.transactionCount;
    let reason='';
    try{cmd.replaceRanges([{from:first.from,to:first.to,
      expected:source.slice(first.from,first.to),insert:'media/0123456789abcdef01234567.png'}]);}
    catch(error){reason=error.message;}
    return {reason,unchanged:window.__wp6GetText()===source,
      transactions:cmd.transactionCount-before};
  });
  assert.match(forbidden.reason,/virtual chapter boundary/);
  assert(forbidden.unchanged&&forbidden.transactions===0);
  // A stale action must not silently edit an identical substring elsewhere.
  const stale=await page.evaluate(()=>{
    const cmd=window.__wp6Port;
    const row=cmd.queryElements({type:'latex',chapter:cmd.getIndex().chapters[1].id})[0];
    const source=window.__wp6GetText();
    try{cmd.editAnnotations([{action:'text',from:row.from,to:row.to,
      expected:'NOT_CURRENT_MATH',insert:'WRONG'}],{expectedSource:source});return false;}
    catch(error){return /changed|Invalid/i.test(error.message);}
  });
  assert(stale);
  // Actual LaTeX review via the original business AG dropdown: tests both
  // planner semantics and unified port, one CM6 transaction and Undo.
  await choose(elements,'latex');
  const select=page.locator('.ocr-latex-review-select').first();
  await select.waitFor({state:'visible',timeout:25000});
  const before=await page.evaluate(()=>window.__wp6Port.transactionCount);
  await choose(select,'忽略');
  await page.waitForFunction(initial=>window.__wp6Port.transactionCount===initial+1,before,{timeout:23000});
  await page.waitForFunction(()=>window.__wp6Port.queryElements({type:'latex',
    chapter:window.__wp6Port.getIndex().chapters[1].id}).some(r=>r.status==='忽略'),null,{timeout:18000});
  const reviewed=await page.evaluate(()=>window.__wp6Port.queryElements({type:'latex',
    chapter:window.__wp6Port.getIndex().chapters[1].id}).find(r=>r.status==='忽略'));
  assert.match(reviewed.id,/^latex:[a-f0-9]{16}$/);
  const changed=await page.evaluate(()=>window.__wp6GetText());
  assert.notEqual(changed,original);
  await undo.click();
  await page.waitForFunction(reference=>window.__wp6GetText()===reference,original,{timeout:18000});
  await redo.click();
  await page.waitForFunction(reference=>window.__wp6GetText()===reference,changed,{timeout:18000});
  const rereview=await page.evaluate(id=>window.__wp6Port.getIndex().getElement(id),reviewed.id);
  assert.equal(rereview?.status,'忽略','Confirmed formula lost its persistent ID');
  await undo.click();
  await page.waitForFunction(reference=>window.__wp6GetText()===reference,original,{timeout:18000});
  // Media hyperlink replacement through the SAME transaction port, while
  // keeping original AG renderer and chapter scope.
  const media=await page.evaluate(()=>{
    const cmd=window.__wp6Port,chapter=cmd.getIndex().chapters[1];
    return cmd.queryElements({type:'media',chapter:chapter.id})[0];
  });
  assert(media);
  const mediaEdit=await page.evaluate(row=>{
    const cmd=window.__wp6Port,source=window.__wp6GetText();
    const newUrl='media/0123456789abcdef01234567.png';
    const before=cmd.transactionCount;
    cmd.replaceMediaReferences([{from:row.from,to:row.to,
      expected:source.slice(row.from,row.to),insert:newUrl}]);
    return {before,after:cmd.transactionCount,source:window.__wp6GetText(),newUrl};
  },media);
  assert.equal(mediaEdit.after,mediaEdit.before+1);
  assert.equal(mediaEdit.source.length,original.length-media.to+media.from+mediaEdit.newUrl.length);
  assert.equal((await page.evaluate(()=>window.__wp6Port.queryElements({type:'media',
    chapter:window.__wp6Port.getIndex().chapters[1].id}).length)),5);
  await undo.click();
  await page.waitForFunction(reference=>window.__wp6GetText()===reference,original,{timeout:18000});
  // Strict read-only tail, even when outside the per-chapter viewport.
  await all.check();
  const evidence=await page.evaluate(()=>{
    const cmd=window.__wp6Port,index=cmd.getIndex();
    const before=window.__wp6GetText();let reason='';
    try{cmd.replaceRanges([{from:index.bodyEnd+2,to:index.bodyEnd+2,
      expected:'',insert:'CORRUPT_EVIDENCE'}]);}
    catch(error){reason=error.message;}
    return {reason,sourceUnchanged:window.__wp6GetText()===before};
  });
  assert.match(evidence.reason,/evidence tail/);
  assert(evidence.sourceUnchanged);
  // Two simultaneously selected chapters in one transaction must reject all,
  // including the otherwise valid in-scope element.
  await all.uncheck();
  const atomic=await page.evaluate(()=>{
    const cmd=window.__wp6Port,idx=cmd.getIndex(),src=window.__wp6GetText();
    const inside=idx.queryElements({chapter:idx.chapters[1].id,type:'media'})[0];
    const outside=idx.queryElements({chapter:idx.chapters[0].id,type:'media'})[0];
    let reason='';
    try{cmd.replaceRanges([inside,outside].map(r=>({
      from:r.from,to:r.to,expected:src.slice(r.from,r.to),insert:'media/0123456789abcdef01234567.png'
    })));}
    catch(error){reason=error.message;}
    return {reason,unchanged:window.__wp6GetText()===src};
  });
  assert.match(atomic.reason,/virtual chapter boundary/);
  assert(atomic.unchanged);
  assert.equal(await page.evaluate(()=>window.__wp6GetText()),original);
  // Heading boundary checkbox's existing CMD.writeAnnotation path also uses
  // this port. Reclassify one existing boundary; undo must recover every
  // element's former chapter identity without editing their own markers.
  await controls.uncheck();
  const boundary=await page.evaluate(()=>{
    const cmd=window.__wp6Port,source=window.__wp6GetText();
    const marker=cmd.readAnnotations({tag:'ocr2md:chapter:v1'})
      .find(x=>x.attributes.independent==='0');
    if(!marker)throw Error('Missing persisted mergeable chapter CMD marker');
    const before=cmd.transactionCount;
    cmd.writeAnnotation({target:marker,tag:'ocr2md:chapter:v1',
      attributes:{...marker.attributes,independent:'1'},spaced:true});
    return {before,after:cmd.transactionCount,chapters:cmd.getIndex().chapters.length,
      text:window.__wp6GetText(),source};
  });
  assert.equal(boundary.after,boundary.before+1);
  assert.equal(boundary.chapters,7,'CMD boundary reclassification not reflected in index');
  assert.notEqual(boundary.text,original);
  await undo.click();
  await page.waitForFunction(reference=>window.__wp6GetText()===reference,original,{timeout:18000});
  assert.equal(await page.evaluate(()=>window.__wp6Port.getIndex().chapters.length),6);
  assert.equal(await page.evaluate(()=>window.__wp6GetText()),original);
  assert.equal(originalChecksum,original.length);
  assert.deepEqual(errors,[]);
  assert.deepEqual(writes,[]);
  assert.deepEqual(physical,[]);
  console.log('WP6_SINGLE_CMD_TRANSACTION_PASS',name,JSON.stringify({
    chapters:6,heading:19,latex:42,media:11,reviewId:reviewed.id,
    reviewUndoRedo:true,mediaUndo:true,chapterUndo:true,atomicReject:true,forbiddenScope:true,
    protectedEvidence:true,allSourceRestored:true,networkWrites:0,
  }));
 }finally{await browser.close();}
}
