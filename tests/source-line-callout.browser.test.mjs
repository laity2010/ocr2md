/** Chrome/WebKit: source line number button & CM gutter menu writes only
 * through CMD to one live CM6, with Undo/Redo, Save, no accidental move.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const original=[
  '<!-- minerujson:block:v1:0:0 -->','# Chapter One','','Paragraph alpha has a cursor here.','',
  '<!-- minerujson:block:v1:1:0 -->','# Chapter Two','','Paragraph beta remains intact.','',
  '<!-- minerujson:source:v1','{"originalEvidence":true}','-->','',
].join('\n');
const sleep=t=>new Promise(r=>setTimeout(r,t));
for(const [idx,[name,engine]] of [['Chrome',chromium],['iPad WebKit',webkit]].entries()){
  const dir=mkdtempSync(join(tmpdir(),'ocr2md-callout-source-'));
  const doc=join(dir,'document.md'),settings=join(dir,'settings.json'),auth=join(dir,'token');
  writeFileSync(doc,original);writeFileSync(settings,'{}');writeFileSync(auth,'source-callout-test-key');
  const port=5985+idx,base='http://127.0.0.1:'+port;
  const server=spawn('python3',['scripts/v6_serve.py'],{
    cwd:process.cwd(),stdio:'ignore',env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',
      V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,
      V6_STATIC_ROOT:resolve('dist')}});
  let browser;
  try{
    let ready=false;
    for(let i=0;i<150;i++){
      try{ready=(await fetch(base+'/healthz')).ok;if(ready)break;}catch{}
      await sleep(100);
    }
    assert(ready,'isolated server not ready');
    browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1120,height:760},
      hasTouch:name.includes('WebKit'),isMobile:name.includes('WebKit')});
    await context.addCookies([{name:'v6edit',value:'source-callout-test-key',domain:'127.0.0.1',path:'/'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:50000});
    const menu=page.locator('.ocr-source-line-menu'),trigger=page.getByRole('button',{name:'行号菜单'});
    await trigger.waitFor({timeout:50000});
    await page.locator('#editor .cm-line').filter({hasText:'Paragraph alpha has a cursor'}).click();
    await page.keyboard.press('End');
    await trigger.click();
    assert(await menu.isVisible());
    const initialLabel=await menu.locator('.ocr-source-line-menu-title').textContent();
    assert.match(initialLabel,/第 4 行/,'toolbar must use caret line');
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(),false);
    // Gutter click from a different line may open the menu but must not move caret.
    const gutter=page.locator('#editor .cm-lineNumbers .cm-gutterElement').filter({hasText:/^\s*2\s*$/}).first();
    assert(await gutter.count(),'real CM6 line gutter missing');
    await gutter.click();
    assert(await menu.isVisible(),'clicking CM6 line number did not open menu');
    assert.match(await menu.locator('.ocr-source-line-menu-title').textContent(),/第 4 行/,
      'clicking gutter silently changed the cursor');
    await menu.getByRole('menuitem',{name:'插入 Callout · 默认隐藏'}).click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note]- 标题'),null,{timeout:18000});
    await page.waitForFunction(()=>[...document.querySelectorAll('.ocr-markdown details.ocr-callout summary')]
      .some(el=>el.textContent.trim()==='标题'),null,{timeout:18000});
    assert.equal(readFileSync(doc,'utf8'),original,'insertion silently saved');
    const content=()=>page.locator('#editor .cm-content').textContent();
    assert((await content()).includes('Paragraph alpha has a cursor here.'));
    assert((await content()).includes('[!note]- 标题'));
    assert((await content()).includes('Paragraph beta remains intact.'));
    await page.locator('#undo').click();
    await page.waitForFunction(()=>!document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note]- 标题'),null,{timeout:12000});
    await page.locator('#redo').click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note]- 标题'),null,{timeout:12000});
    // Button can insert different variants at the CURRENT caret, no shadow doc.
    await trigger.click();
    await menu.getByRole('menuitem',{name:'插入 Callout · 默认展开'}).click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note]+ 标题'),null,{timeout:12000});
    await trigger.click();
    await menu.getByRole('menuitem',{name:'插入 Callout · 常显'}).click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note] 标题'),null,{timeout:12000});
    assert.equal(readFileSync(doc,'utf8'),original,'pre-Save disk changes');
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:22000});
    const saved=readFileSync(doc,'utf8');
    assert(saved.includes('[!note]- 标题'));
    assert(saved.includes('[!note]+ 标题'));
    assert(saved.includes('[!note] 标题'));
    assert(saved.includes('Paragraph beta remains intact.'));
    assert(saved.slice(saved.indexOf('<!-- minerujson:source:v1'))
      .includes('originalEvidence'));
    await page.reload({waitUntil:'domcontentloaded'});
    await trigger.waitFor({timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note]- 标题'),null,{timeout:17000});
    assert.deepEqual(errors,[],name+' browser errors');
    console.log('SOURCE_LINE_CALLOUT_BROWSER_PASS',name,
      JSON.stringify({gutterOpen:true,caretUnchanged:true,threeModes:true,undoRedo:true,
        explicitSave:true,reload:true,evidenceUnchanged:true}));
  }finally{await browser?.close();server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
}
