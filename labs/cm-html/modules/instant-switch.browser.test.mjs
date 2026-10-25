/** In-place V6 chapter switching. Reuse one CM6/Dockview/AG/PDF instance.
 * Real on-disk chapter save must not overwrite the mother or sibling.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const root=process.cwd();const liveRoot=process.env.OCR_LAB_RUNTIME||resolve('labs/cm-html/.runtime');
const staticRoot=process.env.OCR_LAB_BUILD||resolve('labs/cm-html/.runtime/spa-review-build');
const engines=[['Chrome',chromium,{viewport:{width:1280,height:830}}],
  ['iPad WebKit',webkit,{viewport:{width:1024,height:768},isMobile:true,hasTouch:true,deviceScaleFactor:2}]];
const delay=n=>new Promise(done=>setTimeout(done,n));
for(const [i,[name,engine,context]] of engines.entries()){
  const data=mkdtempSync(join(liveRoot,'spa-e2e-'));const port=4894+i;
  const base=`http://127.0.0.1:${port}/labs/cm-html/`;
  cpSync(join(liveRoot,'document.md'),join(data,'document.md'));
  cpSync(join(liveRoot,'chapter'),join(data,'chapter'),{recursive:true});
  const code=randomBytes(20).toString('hex');writeFileSync(join(data,'code'),code+'\n',{mode:0o600});
  const args=['labs/cm-html/modules/chapter-server-launch.py'];
  const server=spawn('python3',args,{cwd:root,stdio:'ignore',env:{...process.env,
    V6_PORT:String(port),V6_DOCUMENT_PATH:join(data,'document.md'),V6_TOKEN_PATH:join(data,'key'),
    V6_SETTINGS_PATH:join(data,'settings.json'),V6_LAB_UNLOCK_TOKEN_PATH:join(data,'code'),
    V6_STATIC_ROOT:staticRoot,V6_LAB_RUNTIME:liveRoot}});
  let browser;
  try{
    let up=false;for(let n=0;n<90;n++){try{if((await fetch(base+'healthz')).ok){up=true;break;}}catch{}await delay(150);}
    assert(up,'Lab server did not start');
    browser=await engine.launch({headless:true});const page=await browser.newPage(context);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let mainDocumentRequests=0;page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/labs/cm-html/'))mainDocumentRequests++;});
    const original=readFileSync(join(data,'document.md'),'utf8');
    const manifest=JSON.parse(readFileSync(join(data,'chapter/manifest.json'),'utf8'));
    assert(manifest.files.length>=2);
    const [a,b]=manifest.files.slice(0,2).map(x=>x.name);
    const siblingOriginal=readFileSync(join(data,'chapter',b),'utf8');
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const menu=page.locator('.ocr-source-pane .ocr-lab-file-select');
    await page.waitForFunction(()=>document.querySelectorAll('.ocr-source-pane .ocr-lab-file-select option[value^="chapter:"]').length>=2,null,{timeout:25000});
    // Exact DOM object reference identity proves that page, editor, AG and
    // PDF viewer have NOT been reloaded or recreated between selections.
    await page.evaluate(()=>{window.__labStable={
      pageToken:{},editor:document.querySelector('#editor .cm-editor'),
      outline:document.querySelector('.ocr-outline-grid'),
      pdf:document.querySelector('.ocr-pdf-pane'),
      dockview:document.querySelector('#workspace .dv-dockview'),
    };});
    const assertIdentity=async()=>{
      const identity=await page.evaluate(()=>{
        const s=window.__labStable;
        return Boolean(s&&s.editor===document.querySelector('#editor .cm-editor')
          &&s.outline===document.querySelector('.ocr-outline-grid')
          &&s.pdf===document.querySelector('.ocr-pdf-pane')
          &&s.dockview===document.querySelector('#workspace .dv-dockview'));
      });assert(identity,'A native workspace component was recreated');
    };
    async function typeMarker(marker){
      const editor=page.locator('#editor .cm-content');
      await editor.click();await page.keyboard.press('ControlOrMeta+Home');
      await page.keyboard.insertText(marker+'\n');
      await page.waitForFunction(m=>document.querySelector('#editor .cm-content')?.textContent.includes(m),marker,{timeout:10000});
    }
    const motherMarker='SPA_MOTHER_DRAFT_'+name.replace(/\W/g,'_');
    const chapterMarker='SPA_CHAPTER_SAVE_'+name.replace(/\W/g,'_');
    await typeMarker(motherMarker);
    await menu.selectOption('chapter:'+a);
    await page.waitForURL(u=>u.searchParams.get('chapter')===a,{timeout:18000});
    await assertIdentity();
    assert(!(await page.locator('#editor .cm-content').innerText()).includes(motherMarker),'Draft leaked into chapter');
    await typeMarker(chapterMarker);
    await page.locator('#save').click();
    await page.locator('#unlock-dialog').waitFor({state:'visible',timeout:6000});
    await page.locator('#unlock-code').fill(code.slice(0,12));
    await page.locator('#unlock-form button[type=submit]').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:15000});
    assert(readFileSync(join(data,'chapter',a),'utf8').includes(chapterMarker),'Current chapter did not persist');
    assert.equal(readFileSync(join(data,'document.md'),'utf8'),original,'Mother overwritten by chapter');
    assert.equal(readFileSync(join(data,'chapter',b),'utf8'),siblingOriginal,'Sibling overwritten');
    await menu.selectOption('document');
    await page.waitForURL(u=>!u.searchParams.has('chapter'),{timeout:18000});
    await assertIdentity();
    assert((await page.locator('#editor .cm-content').innerText()).includes(motherMarker),'Mother unsaved draft disappeared');
    assert(!(await page.locator('#editor .cm-content').innerText()).includes(chapterMarker),'Chapter content leaked into mother');
    await page.locator('#undo').click();
    assert(!(await page.locator('#editor .cm-content').innerText()).includes(motherMarker),'Mother undo history not independent');
    assert.equal(await page.locator('#redo').isDisabled(),false,'Mother redo history lost on switch');
    await page.locator('#redo').click();
    assert.equal(await page.locator('#redo').isDisabled(),true,'Redo event not applied');
    // WebKit/CM6 virtualizes offscreen source lines. Persist to the isolated
    // test document and examine the *entire* resulting text, not innerText.
    await page.locator('#save').click();
    await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:15000});
    assert(readFileSync(join(data,'document.md'),'utf8').includes(motherMarker),
      'Mother redo history did not restore original insertion');
    assert(readFileSync(join(data,'chapter',a),'utf8').includes(chapterMarker));
    assert.equal(readFileSync(join(data,'chapter',b),'utf8'),siblingOriginal);
    await menu.selectOption('chapter:'+a);
    await page.waitForURL(u=>u.searchParams.get('chapter')===a,{timeout:18000});
    await assertIdentity();
    assert((await page.locator('#editor .cm-content').innerText()).includes(chapterMarker),'Saved chapter text missing');
    assert((await page.locator('#module-select').inputValue())==='media');
    assert.equal(await page.locator('.ocr-outline-pane .ocr-lab-ag-toolbar #module-select').isVisible(),true);
    assert.equal(mainDocumentRequests,1,'HTML page was reloaded on file switch');
    assert.deepEqual(errors,[]);
    console.log('SPA_INSTANT_SWITCH_PASS',name,JSON.stringify({noPageReload:true,reusedEditorAGPdf:true,
      motherDraft:true,independentUndo:true,chapterSaved:true,siblingAndMotherUnchanged:true}));
    await page.close();
  }finally{if(browser)await browser.close();server.kill('SIGTERM');rmSync(data,{recursive:true,force:true});}
}
