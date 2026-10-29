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
  'This quote cites\\<sup>1\\</sup> and another <sup>2</sup>.',
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
    // Simulate an iPad/Mac browser that applied and saved the original default.
    // The app must transparently migrate only that shipped default, not custom.
    await context.addInitScript(()=>{
      const key='ocr2md:note-pair-templates:v1';
      if(localStorage.getItem(key))return;
      localStorage.setItem(key,JSON.stringify({
        reference:String.raw`(?:\[\^|<sup\s*>)(?<id>[0-9]{1,3}|[A-Za-z][A-Za-z0-9_-]{0,12})(?:\]|</sup\s*>)`,
        body:String.raw`^[ \t]*(?:\[\^)?(?<id>[0-9]{1,3})(?:\]:|\\?\.)[ \t]+(?<content>[^\r\n]+)`
      }));
    });
    await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>
      document.querySelector('.ocr-lab-element-select option[value="note"]')&&
      document.querySelector('.ocr-note-grid [role="grid"]'),null,{timeout:47000});
    const assertPreviewToolbar=async stage=>{
      const state=await page.evaluate(()=>{
        const toolbar=document.querySelector('.ocr-preview-switchbar');
        const picker=toolbar?.querySelector('.ts-wrapper.ocr-navigation-preview');
        const split=toolbar?.querySelector('.ocr-preview-split-toggle');
        const preview=document.querySelector('.ocr-preview-pane');
        if(!toolbar||!picker||!split||!preview)return null;
        const t=toolbar.getBoundingClientRect(),p=picker.getBoundingClientRect(),
          s=split.getBoundingClientRect(),owner=preview.getBoundingClientRect();
        const top=document.elementFromPoint(p.left+Math.min(12,p.width/2),p.top+p.height/2);
        return {toolbar:[t.x,t.y,t.width,t.height],picker:[p.x,p.y,p.width,p.height],
          split:[s.x,s.y,s.width,s.height],owner:[owner.x,owner.y,owner.width,owner.height],
          topIsPicker:top===picker||picker.contains(top),
          display:getComputedStyle(toolbar).display,visibility:getComputedStyle(toolbar).visibility};
      });
      assert(state,stage+' preview toolbar not mounted');
      assert(state.toolbar[2]>160&&state.toolbar[3]>=27,stage+' preview toolbar vanished');
      assert(state.picker[2]>=100&&state.picker[3]>=25,stage+' preview mode picker hidden');
      assert(state.split[2]>30&&state.split[3]>10,stage+' split PDF control hidden');
      assert(state.topIsPicker,stage+' preview picker covered by another pane');
      assert.equal(state.display,'flex');
      assert.equal(state.visibility,'visible');
    };
    await page.locator('.ocr-lab-element-select').evaluate(el=>{
      el.value='note';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await assertPreviewToolbar('note mode selected');
    const grid=page.locator('.ocr-note-grid [role="grid"]');
    await page.waitForFunction(()=>Number(document.querySelector('.ocr-note-grid [role="grid"]')
      ?.getAttribute('aria-rowcount'))===7,null,{timeout:20000});
    assert.equal(await page.locator('.toolbar .ocr-global-ag-status').count(),1);
    assert.equal(await grid.getAttribute('aria-rowcount'),'7');
    const migrated=await page.evaluate(()=>{
      const parsed=JSON.parse(localStorage.getItem('ocr2md:note-pair-templates:v1'));
      return {reference:parsed.reference,
        escapedMatch:!!new RegExp(parsed.reference).exec('\\<sup>1\\</sup>')};
    });
    assert(migrated.escapedMatch,'original browser default was not migrated');
    const firstReference=page.locator('.ocr-note-grid .ag-row[row-index="0"]');
    const firstBody=page.locator('.ocr-note-grid .ag-row[row-index="1"]');
    assert.equal(await firstReference.locator('[col-id="kind"]').textContent(),'注引');
    assert.equal(await firstBody.locator('[col-id="kind"]').textContent(),'注文');
    assert.equal(await firstReference.locator('[col-id="number"]').textContent(),'1');
    assert.equal(await firstBody.locator('[col-id="number"]').textContent(),'');
    assert.equal(await firstReference.locator('[col-id="status"]').textContent(),'待转换');
    const pendingColor=await firstReference.locator('.ocr-note-status').evaluate(el=>getComputedStyle(el).color);
    assert.equal(pendingColor,'rgb(219, 188, 127)','unconverted matched note must be amber');
    const missing=page.locator('.ocr-note-grid .ag-row[row-index="4"]');
    assert.equal(await missing.locator('[col-id="status"]').textContent(),'缺引用');
    assert.equal(await missing.locator('[col-id="kind"]').textContent(),'注引');
    const missingColor=await missing.locator('.ocr-note-status').evaluate(el=>getComputedStyle(el).color);
    assert.equal(missingColor,'rgb(219, 188, 127)','missing note status must be amber');
    const first=page.locator('.ocr-note-grid .ag-row[row-index="0"]');
    await first.locator('button[aria-label^="注引第"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
      .some(el=>el.textContent.includes('This quote cites')),null,{timeout:17000});
    // Clicking the body row itself locates the body, not its matching reference.
    await firstBody.locator('[col-id="text"]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
      .some(el=>el.textContent.includes('First note body')),null,{timeout:17000});
    await firstBody.locator('button[aria-label^="注文第"]').click();
    assert.equal(await firstBody.locator('[col-id="line"]').textContent(),'11');
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
    assert.equal(await grid.getAttribute('aria-rowcount'),'7');
    await page.locator('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark')
      ?.textContent==='已转换',null,{timeout:17000});
    assert.equal(await page.locator('.ocr-note-grid .ag-row[row-index="0"] [col-id="status"]').textContent(),'已转换');
    const convertedColor=await page.locator('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-status')
      .evaluate(el=>getComputedStyle(el).color);
    assert.equal(convertedColor,'rgb(167, 192, 128)','converted note must be green');
    assert.equal(readFileSync(doc,'utf8'),documentText,'Unexpected implicit disk write');
    const inEditor=await page.evaluate(()=>document.querySelector('#editor .cm-content')?.textContent);
    assert(inEditor.includes('ocr2md:note-ref'));
    assert(inEditor.includes('ocr2md:note-body'));
    assert(inEditor.includes('<!--ocr2md:note-ref id="1"-->[^1]'));
    assert(inEditor.includes('[^1]: First note body'));
    // The converted ref, definition and both CMD tags must undo in one step.
    await page.locator('#undo').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark')
      ?.textContent==='转换标定',null,{timeout:15000});
    const undone=await page.locator('#editor .cm-content').textContent();
    assert(undone.includes('cites\\<sup>1\\</sup>')&&
      undone.includes('1\\. First note body')&&
      !undone.includes('ocr2md:note-ref')&&!undone.includes('ocr2md:note-body'),
      'one Undo must restore the original citation, definition and remove both tags');
    await page.locator('#redo').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark')
      ?.textContent==='已转换',null,{timeout:15000});
    const redone=await page.locator('#editor .cm-content').textContent();
    assert(redone.includes('<!--ocr2md:note-ref id="1"-->[^1]'));
    assert(redone.includes('[^1]: First note body'));
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:25000});
    const persisted=readFileSync(doc,'utf8');
    assert(persisted.includes('ocr2md:note-ref'));
    assert(persisted.includes('ocr2md:note-body'));
    assert.match(persisted,/cites<!--ocr2md:note-ref id="1"-->\[\^1\]/);
    assert.match(persisted,/<!--ocr2md:note-body id="1"-->\n\[\^1\]: First note body/);
    assert(!persisted.includes('1\\. First note body'));
    assert(persisted.includes('<sup>2</sup>'),'unreviewed note 2 was modified');
    assert(persisted.includes('First note body'));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.ocr-lab-element-select').evaluate(el=>{
      el.value='note';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-mark')
      ?.textContent==='已转换',null,{timeout:25000});
    const sourceSelect=page.locator('.ocr-source-pane .ocr-lab-file-select');
    const chapterFile=await sourceSelect.locator('option[value^="virtual:"]').first().getAttribute('value');
    assert(chapterFile,'chapter scope option exists');
    await sourceSelect.evaluate((el,value)=>{el.value=value;
      el.dispatchEvent(new Event('change',{bubbles:true}));},chapterFile);
    await page.waitForFunction(()=>document.querySelector('input[aria-label="章节所有"]')?.checked===false,
      null,{timeout:15000});
    await page.waitForFunction(()=>Number(document.querySelector('.ocr-note-grid [role="grid"]')?.getAttribute('aria-rowcount'))===5,
      null,{timeout:15000});
    await page.locator('input[aria-label="章节所有"]').check();
    await page.waitForFunction(()=>Number(document.querySelector('.ocr-note-grid [role="grid"]')?.getAttribute('aria-rowcount'))===7,
      null,{timeout:15000});
    assert.equal(await sourceSelect.inputValue(),chapterFile,'AG 全部 may not move the source file');
    // Current selected virtual chapter remains unchanged while AG All
    // authorizes one atomic conversion of all remaining matched notes.
    assert.equal(await page.locator('.ocr-note-grid .ag-row[row-index="2"] [col-id="status"]').textContent(),'待转换');
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#note-convert-all').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="2"] [col-id="status"]')
      ?.textContent==='已转换',null,{timeout:17000});
    assert.equal(await sourceSelect.inputValue(),chapterFile);
    assert.equal(readFileSync(doc,'utf8'),persisted,'bulk conversion wrote disk before Save');
    const convertedBulk=await page.locator('#editor .cm-content').textContent();
    assert(convertedBulk.includes('<!--ocr2md:note-ref id="2"-->[^2]'));
    // The selected virtual chapter intentionally hides the body, which lives
    // in another chapter. Verify complete CMD bytes after the explicit Save.
    await page.locator('#undo').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="2"] [col-id="status"]')
      ?.textContent==='待转换',null,{timeout:17000});
    await page.locator('#redo').click();
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="2"] [col-id="status"]')
      ?.textContent==='已转换',null,{timeout:17000});
    await page.locator('#ag-functions-toggle').click();
    await page.locator('#note-convert-all').click(); // no-op: idempotent
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),
      null,{timeout:25000});
    await assertPreviewToolbar('after note bulk conversion and Save');
    const bulkSaved=readFileSync(doc,'utf8');
    assert.equal((bulkSaved.match(/<!--ocr2md:note-ref id="2"-->/g)||[]).length,1);
    assert.equal((bulkSaved.match(/<!--ocr2md:note-body id="2"-->/g)||[]).length,1);
    assert(bulkSaved.includes('[^2]: Second note body'));
    assert(bulkSaved.includes('3\\. Unreferenced note body'),
      'unpaired note must never convert');
    // A deliberate duplicated note in an isolated fixture must display red
    // conflict status. No user document is touched.
    writeFileSync(doc,bulkSaved+'\n1\\. Duplicate note body\n');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('.ocr-lab-element-select').evaluate(el=>{
      el.value='note';el.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await page.waitForFunction(()=>document.querySelector('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-status-conflict'),
      null,{timeout:22000});
    const conflictColor=await page.locator('.ocr-note-grid .ag-row[row-index="0"] .ocr-note-status-conflict')
      .evaluate(el=>getComputedStyle(el).color);
    assert.equal(conflictColor,'rgb(230, 126, 128)','duplicate number must show red');
    assert.deepEqual(errors,[]);
    console.log('NOTE_PAIR_BROWSER_PASS',name,JSON.stringify({groups:3,rows:6,paired:2,
      missingRef:1,twoClickableRows:true,pairedGreen:true,missingAmber:true,conflictRed:true,
      multiview:true,regexModal:true,markerSaved:true,reloaded:true}));
  }finally{
    await browser?.close();server.kill('SIGTERM');
    rmSync(dir,{recursive:true,force:true});
  }
}
