/** Built Main shell integration, original user document unaffected. */
import assert from'node:assert/strict';
import{spawn}from'node:child_process';
import{mkdtempSync,writeFileSync,readFileSync,rmSync}from'node:fs';
import{join,resolve}from'node:path';
import{tmpdir}from'node:os';
import{createServer}from'node:net';
import{chromium,webkit}from'playwright';
import{selectModule}from'./navigation-ui.test-helper.mjs';
import{extractTextBlocks,segmentSentences,planSentenceMarks}from'../ui/cmd-sentences.js';
import{formatAnnotation}from'../ui/cmd-annotations.js';
const raw=['<!-- minerujson:block:v1:0:0 -->','','This is the first sentence. The second sentence follows.','','<!-- minerujson:source:v1','{"evidence":true}','-->'].join('\n');
const candidates=segmentSentences(extractTextBlocks(raw,{bodyEnd:raw.indexOf('<!-- minerujson:source:v1')}));
const plans=planSentenceMarks(raw,candidates,[]);
const source=[...plans].sort((a,b)=>b.at-a.at).reduce((s,p)=>s.slice(0,p.at)+formatAnnotation(p.tag,p.attributes)+s.slice(p.at),raw);
const sleep=t=>new Promise(done=>setTimeout(done,t));
const getPort=()=>new Promise((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p));});});
for(const [name,engine]of[['Chromium',chromium],['iPad-WebKit',webkit]]){
  const temp=mkdtempSync(join(tmpdir(),'ocr2md-sentence-translation-shell-'));
  const doc=join(temp,'document.md'),settings=join(temp,'settings.json'),token=join(temp,'token');
  writeFileSync(doc,source);writeFileSync(settings,'{}');writeFileSync(token,'sentence-translation-isolated');
  const port=await getPort();const base='http://127.0.0.1:'+port;
  const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),stdio:'ignore',env:{...process.env,
    V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,
    V6_TOKEN_PATH:token,V6_LAN_TLS_HOST:'',V6_STATIC_ROOT:resolve('dist')}});
  let browser;
  try{
    let ready=false;for(let i=0;i<160;i++){
      try{ready=(await fetch(base+'/healthz')).ok;if(ready)break;}catch{}
      await sleep(130);
    }assert(ready,'test server not ready');
    browser=await engine.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1280,height:880}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:65000});
    await page.locator('#editor .cm-content').waitFor({state:'visible',timeout:65000});
    await selectModule(page,'sentence-translation');
    await page.locator('.ocr-sentence-translation-grid .ag-row').first().waitFor({state:'visible',timeout:65000});
    assert.equal(await page.locator('.ocr-sentence-translation-grid .ag-row').count(),2);
    assert.equal(await page.locator('#module-select').inputValue(),'sentence-translation');
    const [download]=await Promise.all([
      page.waitForEvent('download'),page.getByRole('button',{name:'导出分句翻译任务'}).click()
    ]);
    assert.match(download.suggestedFilename(),/^ocr2md-sentences-/);
    const task=JSON.parse(readFileSync(await download.path(),'utf8'));
    assert.deepEqual(task.sentences.map(x=>x.source),['This is the first sentence.','The second sentence follows.']);
    assert(!JSON.stringify(task).includes('minerujson'));
    const reply={schema:task.schema,sourceVersion:task.sourceVersion,
      sentences:task.sentences.map(x=>({sid:x.sid,source:x.source,checked:x.source,
        translation:'译文：'+x.source}))};
    await page.locator('.ocr-sentence-translation-toolbar input[type=file]').setInputFiles({
      name:'returned.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(reply))});
    await page.waitForFunction(()=>document.querySelector('.ocr-sentence-translation-grid')?.textContent?.includes('译文：The second sentence follows.'));
    assert.equal(readFileSync(doc,'utf8'),source,'AI import must not auto-write the actual document');
    assert.deepEqual(errors,[],'module integration must not throw');
    console.log('SENTENCE_TRANSLATION_SHELL_PASS',name,'independent AG + AI JSON export/import + 2 rows + no source mutation');
  }finally{await browser?.close();server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
}
