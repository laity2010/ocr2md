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
  '<!-- minerujson:block:v1:0:0 -->','# Chapter One','','Paragraph alpha has a cursor here. '+('Long line wraps in Markdown view. '.repeat(7)),'',
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
    const menu=page.locator('.ocr-source-line-menu');
    assert.equal(await page.locator('.ocr-source-line-trigger').count(),0,'old toolbar button remained');
    await page.locator('#editor .cm-line').filter({hasText:'Paragraph alpha has a cursor'}).click();
    await page.keyboard.press('End');
    const button=page.locator('#editor .ocr-source-caret-line-button');
    await button.waitFor({timeout:30000});
    assert.equal(await button.count(),1,'exactly the caret line must become a button');
    assert.equal(await button.getAttribute('data-line'),'4','active button is not caret line');
    assert.equal(await page.locator('#editor .cm-lineNumbers button').count(),1);
    assert.equal(await page.locator('#editor .cm-lineNumbers .cm-gutterElement').filter({hasText:/^\s*2\s*$/}).count(),1,
      'inactive line number should remain plain text');
    await button.click();
    assert(await menu.isVisible());
    assert.equal(await menu.getByRole('menuitem').count(),4,'menu must include fence, Callout and quote +/-');
    assert.equal((await menu.getByRole('menuitem').first().textContent()).trim(),'插入 Callout');
    assert.equal((await menu.locator('.ocr-source-line-menu-summary').textContent()).trim(),
      '未选区 · 光标第 4 行');
    const placement=await page.evaluate(()=>{
      const button=document.querySelector('#editor .ocr-source-caret-line-button');
      const menu=document.querySelector('.ocr-source-line-menu');
      const a=button.getBoundingClientRect(),b=menu.getBoundingClientRect();
      const textLine=[...document.querySelectorAll('#editor .cm-line')]
        .find(node=>node.textContent.includes('Paragraph alpha has a cursor'));
      const c=textLine.getBoundingClientRect();
      return {buttonRight:a.right,buttonTop:a.top,menuLeft:b.left,menuTop:b.top,
        menuBottom:b.bottom,lineTop:c.top,lineBottom:c.bottom,
        placement:menu.dataset.placement,lineHeight:c.height,menuHeight:b.height};
    });
    assert(Math.abs(placement.menuLeft-placement.buttonRight)<15,'menu not anchored beside caret gutter');
    assert(placement.lineHeight>25,'test line should soft-wrap on screen');
    assert(placement.menuTop>=placement.lineBottom+6 ||
      placement.menuBottom<=placement.lineTop-6,
      'popup covers edited source line: '+JSON.stringify(placement));
    // Quote changes expand and collapse source text while the menu stays open.
    // The menu must continue clearing the whole wrapped caret line.
    for(const label of ['>+ 增加引用层级','>− 减少引用层级']){
      await menu.getByRole('menuitem',{name:label,exact:true}).click();
      await page.waitForTimeout(170); // deferred wrapped-line height correction
      assert(await menu.isVisible(),'quote action closed the gutter menu');
      const geometry=await page.evaluate(()=>{
        const rect=[...document.querySelectorAll('#editor .cm-line')]
          .find(node=>node.textContent.includes('Paragraph alpha has a cursor'))
          .getBoundingClientRect();
        const popup=document.querySelector('.ocr-source-line-menu').getBoundingClientRect();
        return {lineTop:rect.top,lineBottom:rect.bottom,popupTop:popup.top,popupBottom:popup.bottom};
      });
      assert(geometry.popupTop>=geometry.lineBottom+6 ||
        geometry.popupBottom<=geometry.lineTop-6,
        'popup moved over edited line: '+JSON.stringify(geometry));
    }
    await page.keyboard.press('Escape');
    assert.equal(await menu.isVisible(),false);
    await page.locator('#editor .cm-line').filter({hasText:'Paragraph beta remains intact'}).click();
    await page.keyboard.press('End');
    assert.equal(await button.count(),1);
    assert.equal(await button.getAttribute('data-line'),'9','button did not follow caret');
    assert.equal(await page.locator('#editor .cm-lineNumbers .cm-gutterElement').filter({hasText:/^\s*4\s*$/}).count(),1,
      'previous caret line must return to plain number');
    await page.locator('#editor .cm-line').filter({hasText:'Paragraph alpha has a cursor'}).click();
    await page.keyboard.press('End');
    await button.click();
    await menu.getByRole('menuitem',{name:'插入 Callout'}).click();
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
    // One command only, repeated invocation inserts another folded callout.
    await button.click();
    assert.equal(await menu.getByRole('menuitem').count(),4);
    await menu.getByRole('menuitem',{name:'插入 Callout'}).click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .split('[!note]- 标题').length===3,null,{timeout:12000});
    // New fence action with no selection: create a syntactically complete
    // blank Markdown code fence with the caret between its delimiters.
    await page.locator('#editor .cm-line').filter({hasText:'Paragraph beta remains intact.'}).click();
    await page.keyboard.press('End');
    await button.click();
    assert.equal(await menu.getByRole('menuitem').count(),4);
    await menu.getByRole('menuitem',{name:'插入围栏块'}).click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('```'),null,{timeout:12000});
    // Select the original entire beta paragraph, then wrap it. Gutter click
    // must preserve that selection until the CMD edit plan is submitted.
    await page.locator('#editor .cm-line').filter({hasText:'Paragraph beta remains intact.'}).click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await button.click();
    assert.match(await menu.locator('.ocr-source-line-menu-summary').textContent(),/已选 1 行/);
    await menu.getByRole('menuitem',{name:'插入围栏块'}).click();
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('Paragraph beta remains intact.'),null,{timeout:12000});
    assert.equal(readFileSync(doc,'utf8'),original,'pre-Save disk changes');
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:22000});
    const saved=readFileSync(doc,'utf8');
    assert(saved.includes('[!note]- 标题'));
    assert.equal(saved.split('[!note]- 标题').length-1,2);
    assert(saved.includes('```\nParagraph beta remains intact.\n```'),
      'selected content not wrapped by a valid fence');
    assert(saved.includes('```\n\n```'), 'empty fence was not inserted');
    assert(saved.includes('Paragraph beta remains intact.'));
    assert(saved.slice(saved.indexOf('<!-- minerujson:source:v1'))
      .includes('originalEvidence'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#editor .ocr-source-caret-line-button').waitFor({timeout:20000});
    await page.waitForFunction(()=>document.querySelector('#editor .cm-content')?.textContent
      .includes('[!note]- 标题'),null,{timeout:17000});
    assert.deepEqual(errors,[],name+' browser errors');
    console.log('SOURCE_LINE_CALLOUT_BROWSER_PASS',name,
      JSON.stringify({singleActiveGutterButton:true,fourMenuItems:true,emptyFence:true,selectedFence:true,nonOverlappingWrappedLine:true,anchoredPopup:true,undoRedo:true,
        explicitSave:true,reload:true,evidenceUnchanged:true}));
  }finally{await browser?.close();server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true});}
}
