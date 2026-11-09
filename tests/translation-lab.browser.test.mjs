/** WP2: actual AG Grid + CM6 prompt + JSON upload/download in Chrome/WebKit.
 * Isolated translator SQLite and loopback server; no user's Main/CMD/AI files.
 */
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {chromium,webkit,devices} from 'playwright';
import {chromeExecutable} from './platform.test-helper.mjs';
const dir=mkdtempSync(join(tmpdir(),'ocr2md-wp2-translation-'));
const runtime=join(dir,'labs','translation-lab','.runtime');mkdirSync(runtime,{recursive:true});
const token=join(runtime,'unlock');writeFileSync(token,'wp2-only-test-unlock-123456');
const port=await new Promise((resolve,reject)=>{
 const server=createServer();server.once('error',reject);
 server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(e=>e?reject(e):resolve(p));});
});
const base=`http://127.0.0.1:${port}/labs/translation-lab/`;
const process=spawn('python3',['labs/translation-lab/server.py'],{
 cwd:globalThis.process.cwd(),env:{...globalThis.process.env,V6_PORT:String(port),
   V6_LAB_RUNTIME:runtime,V6_LAB_UNLOCK_TOKEN_PATH:token,V6_LAN_TLS_HOST:''},stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=[(id,txt,from)=>({id,blockId:'p1b0',type:'sentence',elementType:'paragraph',
 decision:'auto',from,to:from+txt.length,sourceRanges:[{from,to:from+txt.length}],
 original:txt,corrected:null,translation:null})];
const old={schema:'ocr2md-translation-units/v1',sourceSha256:'a'.repeat(64),
 coordinate:'UTF-16',rows:[source[0]('s1','Alpha.',0),source[0]('s2','Beta.',10)]};
const revised={...old,rows:[source[0]('s1','Alpha.',100),source[0]('s2','Beta changed.',200)]};
const oldAI={...old,rows:old.rows.map(row=>({...row,corrected:row.original,translation:'中文 '+row.id}))};
const upload=(page,object)=>page.locator('#json-file').setInputFiles({name:'input.json',
 mimeType:'application/json',buffer:Buffer.from(JSON.stringify(object))});
const get=async route=>(await(await fetch(base+'api/translation-lab/'+route)).json());
try{
 let ok=false;
 for(let i=0;i<100;i++){try{if((await fetch(base+'healthz')).ok){ok=true;break;}}catch{}await pause(150);}
 assert(ok,'Translation Lab backend not ready');
 for(const [name,engine,binary,ai] of [
   ['Chrome',chromium,chromeExecutable(),'gpt'],
   ['iPad-WebKit',webkit,globalThis.process.env.OCR2MD_WEBKIT_PATH||webkit.executablePath(),'grok']]){
   const browser=await engine.launch({headless:true,...(binary?{executablePath:binary}:{})});
   try{
    const page=await browser.newPage({...devices['iPad Pro 11 landscape'],
       viewport:{width:1194,height:834},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'translation-lab.html',{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>/SQLite 已就绪|已连接 SQLite/.test(document.querySelector('#global-status')?.textContent||''),null,{timeout:60000});
    if(ai==='gpt'){
      await page.locator('#import-sentences').click();await upload(page,old);
      await page.waitForFunction(()=>document.querySelector('#table-meta')?.textContent.includes('2 条'),null,{timeout:20000});
      await page.locator('#work-tabs [data-tab="replies"]').click();
      await page.locator('#import-history').click();await upload(page,oldAI);
      await page.waitForFunction(()=>document.querySelector('[data-ai="gpt"] .count')?.textContent.includes('2 / 2'),null,{timeout:20000});
      await page.locator('#import-sentences').click();await upload(page,revised);
      await page.waitForFunction(()=>document.querySelector('[data-ai="gpt"] .count')?.textContent.includes('1 / 2'),null,{timeout:20000});
      assert.equal((await get('state')).rows.find(r=>r.id==='s1').changeType,'unchanged');
      assert.equal((await get('state')).rows.find(r=>r.id==='s2').changeType,'source_changed');
    }else{
      await page.locator('[data-ai="grok"]').click();
      await page.waitForFunction(()=>document.querySelector('#work-ai-name')?.textContent.includes('Grok'),null,{timeout:15000});
    }
    await page.locator('#filter-mode').selectOption('missing');
    await page.waitForFunction(()=>document.querySelector('#table-meta')?.textContent.includes('条符合当前过滤'),null,{timeout:15000});
    const before=(await get('state?ai='+ai)).providers.find(x=>x.aiId===ai);
    await page.locator('#work-tabs [data-tab="prompt"]').click();
    await page.locator('#prompt-editor .cm-content').click();
    await page.keyboard.press('Meta+A');
    await page.keyboard.type('请检查 OCR 原文，保留数字，译为准确的简体中文。');
    await page.locator('#save-prompt').click();
    await page.waitForFunction(()=>document.querySelector('#global-status')?.textContent.startsWith('保存 Prompt ·'),null,{timeout:20000});
    const afterPrompt=(await get('state?ai='+ai)).prompts[ai];
    assert(afterPrompt.body.includes('保留数字'));
    await page.locator('#work-tabs [data-tab="tasks"]').click();
    const [taskFile]=await Promise.all([page.waitForEvent('download',{timeout:30000}),
                                     page.locator('#export-task').click()]);
    const task=JSON.parse(readFileSync(await taskFile.path(),'utf8'));
    assert.equal(task.aiId,ai);assert.equal(task.promptVersion,afterPrompt.promptVersion);
    assert.equal(task.rows.length,before.missing);
    assert(task.rows.length>0);
    const item=task.rows[0];
    const reply={schema:'ocr2md-ai-translation-reply/v1',taskId:task.taskId,
      aiId:ai,unitVersion:task.unitVersion,promptVersion:task.promptVersion,
      rows:[{id:item.id,original:item.original,corrected:item.original,
             translation:'AI 新译文 '+item.id}]};
    await page.locator('#work-tabs [data-tab="replies"]').click();
    await page.locator('#import-reply').click();await upload(page,reply);
    await page.waitForFunction(()=>document.querySelector('#reply-info')?.textContent.includes('本次接收 1 条'),null,{timeout:20000});
    await page.locator('#publish-table').click();
    await page.waitForFunction(()=>document.querySelector('#global-status')?.textContent.startsWith('发布译表 ·'),null,{timeout:20000});
    const published=await get('published?ai='+ai);
    assert.equal(published.total,2);
    assert.equal(published.covered,before.covered+1);
    assert.equal(published.missing,2-published.covered);
    assert.equal(errors.length,0,errors.join('\n'));
    console.log('WP2_TRANSLATION_BROWSER_PASS',name,JSON.stringify({ai,unitCount:published.total,
      covered:published.covered,missing:published.missing,promptVersion:afterPrompt.promptVersion.slice(0,12)}));
   }finally{await browser.close();}
 }
}finally{
 process.kill('SIGTERM');await pause(550);
 rmSync(dir,{recursive:true,force:true});
}
