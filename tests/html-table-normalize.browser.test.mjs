/** User-clicked three-part table conversion via AG -> Layout -> scoped CMD -> Save.
 * Uses a fresh server and disposable document for each browser, never user's.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {scanHtmlElements} from '../ui/cmd-html-elements.js';
import {groupHtmlElements} from '../ui/html-element-groups.js';
const original=[
  '<!-- minerujson:block:v1:0:0 -->','# First Chapter','','Table 1. OCR caption remains outside','',
  '<table><tr><td>One &amp; Two</td></tr></table>','','Notes: OCR original stays here.','',
  '<!-- minerujson:block:v1:1:0 -->','# Second Chapter','','<table>',
  '<tr><td>Second chapter</td></tr>','</table>','',
  '<figure class="table-block">',
  '<figcaption>Existing verified title</figcaption>',
  '<table><tr><td>Already formatted</td></tr></table>',
  '<div class="table-notes">Verified notes</div>',
  '</figure>','',
  '<!-- minerujson:source:v1',
  '<table><tr><td>PROTECTED EVIDENCE</td></tr></table>','-->',''
].join('\n');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
for(const [index,[name,engine]] of [['Chrome',chromium],['iPad WebKit',webkit]].entries()){
  const dir=mkdtempSync(join(tmpdir(),'ocr2md-html-table-'));
  const doc=join(dir,'mother.md'),settings=join(dir,'settings.json'),auth=join(dir,'token');
  writeFileSync(doc,original);writeFileSync(settings,'{"settings":{}}\n');writeFileSync(auth,'table-isolated-key');
  const port=5943+index,base='http://127.0.0.1:'+port;
  const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{
    ...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',
    V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,
    V6_STATIC_ROOT:resolve('dist'),
  },stdio:'ignore'});
  let browser;
  try{
    let up=false;
    for(let i=0;i<180;i++){
      try{up=(await fetch(base+'/healthz')).ok;if(up)break;}catch{}
      await delay(110);
    }
    assert(up,'isolated document server missing');
    browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1100,height:750},
      hasTouch:name.includes('WebKit'),isMobile:name.includes('WebKit')});
    await context.addCookies([{name:'v6edit',value:'table-isolated-key',domain:'127.0.0.1',path:'/'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    const element=page.locator('.ocr-lab-element-select');
    await element.waitFor({state:'attached',timeout:60000});
    await element.evaluate(el=>{el.value='html';el.dispatchEvent(new Event('change',{bubbles:true}));});
    await page.locator('.ocr-html-elements-grid .ag-row').first().waitFor({timeout:30000});
    assert.equal(await page.locator('#html-normalize-tables').count(),1);
    // Chapter-only action: only the first standalone table gets placeholders.
    const files=page.locator('.ocr-source-pane .ocr-source-file-select');
    const chapter=await files.locator('option[value^="virtual:"]').first().getAttribute('value');
    assert(chapter,'virtual chapter option missing');
    await files.evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},chapter);
    await page.waitForFunction(()=>document.querySelector('.ocr-all-chapters-control input')?.checked===false,
      null,{timeout:25000});
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#html-normalize-tables').click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('【待填写：表格标题】'),
      null,{timeout:25000});
    assert.equal(readFileSync(doc,'utf8'),original,'implicit disk save');
    const content=()=>page.locator('#editor .cm-content').textContent();
    assert.equal((await content()).split('【待填写：表格标题】').length-1,1,'chapter-only conversion');
    await page.locator('#undo').click();
    await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent
      .includes('【待填写：表格标题】'),null,{timeout:22000});
    await page.locator('#redo').click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('【待填写：表格标题】'),null,{timeout:22000});
    // All-scope action should add only the remaining standalone table.
    await page.locator('.ocr-all-chapters-control input').check();
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#html-normalize-tables').click();
    await delay(1100);
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:30000});
    const persisted=readFileSync(doc,'utf8');
    assert.equal((persisted.match(/<figure class="table-block">/g)||[]).length,3);
    assert.equal((persisted.match(/【待填写：表格标题】/g)||[]).length,2);
    assert.equal((persisted.match(/【待填写：表格注释及来源】/g)||[]).length,2);
    assert(persisted.includes('Table 1. OCR caption remains outside'));
    assert(persisted.includes('Notes: OCR original stays here.'));
    assert(persisted.includes('<table><tr><td>One &amp; Two</td></tr></table>'));
    assert(persisted.includes('<table>\n<tr><td>Second chapter</td></tr>\n</table>'));
    assert(persisted.includes('<figcaption>Existing verified title</figcaption>'));
    assert.equal(persisted.slice(persisted.indexOf('<!-- minerujson:source:v1')),
      original.slice(original.indexOf('<!-- minerujson:source:v1')));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.ocr-lab-element-select').evaluate(el=>{
      el.value='html';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.locator('.ocr-html-elements-grid .ag-row').first().waitFor({timeout:20000});
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#html-normalize-tables').click();
    await delay(150);
    assert.equal(readFileSync(doc,'utf8'),persisted,'repeat conversion must be idempotent');
    assert.deepEqual(errors,[],name+' browser errors');
    console.log('HTML_TABLE_BROWSER_PASS',name,JSON.stringify({converted:2,chapterAndAll:true,
      undoRedo:true,saveReload:true,idempotent:true,evidenceProtected:true}));
  }finally{await browser?.close();server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
}
