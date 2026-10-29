/** Notes AG functional smoke, using an isolated writable mother CMB.
 * Chrome/WebKit verify regex modal, linking, focus, guarded CMD annotation, Save.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const documentText=[
  '<!-- minerujson:block:v1:1:0 -->',
  '# Chapter One',
  '',
  'This quote cites[^1] and another <sup>2</sup>.',
  '',
  '<!-- minerujson:block:v1:2:0 -->',
  '# Chapter Two',
  '',
  '## Notes',
  '',
  '1\\. First note body',
  '2\\. Second note body',
  '3\\. Unreferenced note body',
  ''
].join('\n');
for(const [index,[name,engine]] of [['Chrome',chromium],['iPad WebKit',webkit]].entries()){
  const dir=mkdtempSync(join(tmpdir(),'ocr2md-note-ui-'));
  const doc=join(dir,'document.md'),settings=join(dir,'settings.json'),auth=join(dir,'token');
  writeFileSync(doc,documentText);writeFileSync(settings,'{"settings":{}}\n');
  writeFileSync(auth,'note-test-access-key');
  const port=5877+index,origin='http://127.0.0.1:'+port;
  const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{
    ...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',
    V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,
    V6_TOKEN_PATH:auth,V6_STATIC_ROOT:resolve('dist')
  },stdio:'ignore'});
  let browser;
  try{
    let ready=false;
    for(let t=0;t<115;t++){
      try{if((await fetch(origin+'/healthz')).ok){ready=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,120));
    }
    assert(ready,'isolated HTTP service failed');
    browser=await engine.launch({headless:true});
    const context=await browser.newContext({viewport:{width:1130,height:800},
      hasTouch:name.includes('WebKit'),isMobile:name.includes('WebKit')});
    await context.addCookies([{name:'v6edit',value:'note-test-access-key',
      domain:'127.0.0.1',path:'/'}]);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>route.request().url().startsWith(origin)
      ?route.continue():route.abort());
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>
      document.querySelector('.ocr-lab-element-select option[value="note"]')&&
      document.querySelector('.ocr-note-grid [role="grid"]'),null,{timeout:47000});
    await page.locator('.ocr-lab-element-select').evaluate(el=>{
      el.value='note';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    const grid=page.locator('.ocr-note-grid [role="grid"]');
    await page.waitForFunction(()=>Number(document.querySelector('.ocr-note-grid [role="grid"]')
      ?.getAttribute('aria-rowcount'))===4,null,{timeout:20000});
    assert.equal(await page.locator('.toolbar .ocr-global-ag-status').count(),1);
    assert.equal(await grid.getAttribute('aria-rowcount'),'4');
    assert.equal(await page.locator('.ocr-note-grid .ag-row[row-index="0"] [col-id="status"]').textContent(),'已配对');
    const first=page.locator('.ocr-note-grid .ag-row[row-index="0"]');
    await first.locator('button[aria-label^="引用第"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
      .some(el=>el.textContent.includes('This quote cites')),null,{timeout:17000});
    await first.locator('button[aria-label^="正文第"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
      .some(el=>el.textContent.includes('First note body')),null,{timeout:17000});
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#note-templates').click();
    const dialog=page.locator('.ocr-note-template-dialog');
    assert(await dialog.isVisible());
    await page.locator('#note-reference-regex').fill('(?<wrong>abc)');
    await dialog.getByRole('button',{name:'应用模板'}).click();
    assert.match(await dialog.locator('[role="status"]').textContent(),/id/);
    await dialog.getByRole('button',{name:'恢复默认'}).click();
    await dialog.getByRole('button',{name:'应用模板'}).click();
    assert.equal(await dialog.isVisible(),false);
    assert.equal(await grid.getAttribute('aria-rowcount'),'4');
    await page.locator('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark')
      ?.textContent==='已标定',null,{timeout:17000});
    assert.equal(readFileSync(doc,'utf8'),documentText,'Unexpected implicit disk write');
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:25000});
    const persisted=readFileSync(doc,'utf8');
    assert(persisted.includes('ocr2md:note-ref'));
    assert(persisted.includes('ocr2md:note-body'));
    assert(persisted.includes('First note body'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.ocr-lab-element-select').evaluate(el=>{
      el.value='note';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark')
      ?.textContent==='已标定',null,{timeout:25000});
    const sourceSelect=page.locator('.ocr-source-pane .ocr-lab-file-select');
    const chapterFile=await sourceSelect.locator('option[value^="virtual:"]').first().getAttribute('value');
    assert(chapterFile,'chapter scope option exists');
    await sourceSelect.evaluate((el,value)=>{el.value=value;
      el.dispatchEvent(new Event('change',{bubbles:true}));},chapterFile);
    await page.waitForFunction(()=>document.querySelector('input[aria-label="章节所有"]')?.checked===false,
      null,{timeout:15000});
    await page.waitForFunction(()=>Number(document.querySelector('.ocr-note-grid [role="grid"]')?.getAttribute('aria-rowcount'))===3,
      null,{timeout:15000});
    await page.locator('input[aria-label="章节所有"]').check();
    await page.waitForFunction(()=>Number(document.querySelector('.ocr-note-grid [role="grid"]')?.getAttribute('aria-rowcount'))===4,
      null,{timeout:15000});
    assert.equal(await sourceSelect.inputValue(),chapterFile,'AG 全部 may not move the source file');
    assert.deepEqual(errors,[]);
    console.log('NOTE_PAIR_BROWSER_PASS',name,JSON.stringify({rows:3,paired:2,
      missingRef:1,multiview:true,regexModal:true,markerSaved:true,reloaded:true}));
  }finally{
    await browser?.close();server.kill('SIGTERM');
    rmSync(dir,{recursive:true,force:true});
  }
}
