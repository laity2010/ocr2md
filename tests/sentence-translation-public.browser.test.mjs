/** Three public API direct checks, Chrome/WebKit, in isolated Vite fixture.
 * No real user document, translation API, CMD editor or save endpoint.
 */
import assert from 'node:assert/strict';
import{createServer}from'vite';
import{chromium,webkit}from'playwright';
import{chromeExecutable,webkitExecutable}from'./platform.test-helper.mjs';
const vite=await createServer({configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0}});
await vite.listen();const base=vite.resolvedUrls.local[0];
try{
for(const[name,engine,options]of[['Chromium',chromium,{executablePath:chromeExecutable()}],
  ['WebKit',webkit,{executablePath:webkitExecutable()}]]){
  if(process.env.V6_ONLY_CHROME&&name!=='Chromium')continue;
  if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
  const browser=await engine.launch({headless:true,...options,acceptDownloads:true});
  try{
    const page=await browser.newPage({acceptDownloads:true});
    await page.goto(base+'tests/sentence-translation-public.fixture.html',{waitUntil:'domcontentloaded'});
    const stats=await page.evaluate(async()=>{
      const core=await import('/ui/sentence-translation-core.js');
      const {createSentenceTranslationModule}=await import('/ui/sentence-translation-module.js');
      const check=(truth,label)=>{if(!truth)throw Error('ST_PUBLIC: '+label);};
      let source='First $x+1$ sentence. Second sentence.',statuses=[];
      const rows=[{id:'s-a1',from:0,to:21,line:1,
        text:'First $x+1$ sentence.',fragments:[{from:0,to:21,text:'First $x+1$ sentence.',blockId:'p0b0'}]},
        {id:'s-b2',from:22,to:38,line:1,text:'Second sentence.',
          fragments:[{from:22,to:38,text:'Second sentence.',blockId:'p0b0'}]}];
      const prepared=core.prepareSentenceTranslationTask(source,rows);
      check(prepared.task.sentences.length===2,'ST01 sentence task count');
      check(prepared.task.sentences[0].source==='First sentence.','ST01 math excluded');
      const reply={schema:prepared.task.schema,sourceVersion:prepared.task.sourceVersion,
        sentences:prepared.task.sentences.map(r=>({sid:r.sid,source:r.source,
          checked:r.source,translation:'译文：'+r.source}))};
      const verified=core.validateSentenceTranslationReply(prepared,reply,source);
      check(verified.accepted===0&&verified.rows.length===2,'ST02 review-only results');
      const host=document.getElementById('translation-host');
      const instance=createSentenceTranslationModule(host,{readSource:()=>source,
        readSentences:()=>rows,getChapter:()=>({from:0,to:source.length}),
        onStatus:message=>statuses.push(message)});
      instance.setActive(true);
      check(host.querySelectorAll('.ag-row').length===2,'ST03 independent AG rows');
      instance.importResponse(reply);
      check(host.textContent.includes('译文：First sentence.'),'ST03 reviewer displays AI translation');
      check(instance.count('all')===2,'ST03 semantic count');
      check(!host.querySelector('textarea'), 'ST03 does not own editor');
      window.__stContract={instance,reply,getSource:()=>source,
        updateSource:val=>{source=val;instance.refresh();}};
      return {exports:['prepareSentenceTranslationTask','validateSentenceTranslationReply',
        'createSentenceTranslationModule'],rows:verified.rows.length,reviewed:true};
    });
    assert.equal(stats.rows,2);
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.getByRole('button',{name:'导出分句翻译任务'}).click()]);
    assert.match(download.suggestedFilename(),/^ocr2md-sentences-/);
    const json=await page.evaluate(()=>window.__stContract.instance.exportTask());
    assert.equal(json.sentences.length,2);
    const response=await page.evaluate(()=>window.__stContract.reply);
    await page.locator('input[type=file]').setInputFiles({name:'checked.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(response))});
    await page.waitForFunction(()=>document.querySelector('.ocr-sentence-translation-grid')?.textContent?.includes('译文：Second sentence.'));
    const stale=await page.evaluate(()=>{
      window.__stContract.updateSource('Different source.');
      try{window.__stContract.instance.importResponse(window.__stContract.reply);return false;}
      catch(e){return /原文已变化|版本|失效/.test(e.message);}
    });
    assert(stale,'ST02 prevents importing a stale task after source modification');
    await page.evaluate(()=>window.__stContract.instance.dispose());
    console.log('SENTENCE_TRANSLATION_PUBLIC_PASS',name,JSON.stringify(stats),'stale source guarded, AG review only, downloaded JSON');
  }finally{await browser.close();}
}
}finally{await vite.close();}
