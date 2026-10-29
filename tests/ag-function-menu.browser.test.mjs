/** Unified AG functions dropdown + global scope status; isolated CMD fixture.
 * Real Chrome and iPad WebKit, no user document or Settings mutation.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const dir=mkdtempSync(join(tmpdir(),'ocr2md-ag-functions-'));
const documentPath=join(dir,'document.md'),settingsPath=join(dir,'settings.json');
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
writeFileSync(documentPath,fixture);writeFileSync(settingsPath,'{"settings":{}}\n');
const port=5997,origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{
  ...process.env,V6_DOCUMENT_PATH:documentPath,V6_SETTINGS_PATH:settingsPath
},stdio:'ignore'});
const choose=async (page,module)=>page.locator('#module-select').evaluate((el,next)=>{
  el.value=next;el.dispatchEvent(new Event('change',{bubbles:true}));
},module);
const chooseFile=async (page,file)=>page.locator('.ocr-source-pane .ocr-lab-file-select').evaluate((el,next)=>{
  el.value=next;el.dispatchEvent(new Event('change',{bubbles:true}));
},file);
try{
  let ready=false;
  for(let n=0;n<120;n++){
    try{if((await fetch(origin)).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,120));
  }
  assert(ready,'isolated dev server unavailable');
  for(const [name,engine,context] of [
    ['Chrome',chromium,{viewport:{width:1250,height:800}}],
    ['iPad-WebKit',webkit,{viewport:{width:1032,height:642},isMobile:true,hasTouch:true}]
  ]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage(context);
      const errors=[],writes=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('request',r=>{
        if(r.url().includes('/api/')&& !['GET','HEAD'].includes(r.method()))writes.push(r.method());
      });
      await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
      const button=page.locator('#ag-functions-toggle'),popup=page.locator('#ag-functions-menu');
      await button.waitFor({state:'visible',timeout:45000});
      await page.waitForFunction(()=>window.__v6cm6?.outline?.rows?.length>=5,null,{timeout:38000});
      const info=page.locator('.toolbar .ocr-global-ag-status');
      assert.equal(await page.locator('.ocr-lab-ag-toolbar .ocr-all-chapters-status').count(),0,
        'AG status text remains in AG toolbar');
      assert.equal(await info.count(),1,'global status must own the AG status');
      assert.equal(await button.isDisabled(),false,'Mother title has numbering function');
      assert.equal(await popup.isVisible(),false);
      await button.click();
      assert(await popup.isVisible());
      assert(await page.locator('#chapter-start-number').isVisible());
      assert.equal(await page.locator('#export-chapters').isVisible(),false);
      await page.locator('#chapter-start-number').fill('007');
      await page.locator('#chapter-start-number').blur();
      assert.equal(await page.locator('#chapter-start-number').inputValue(),'007');
      await page.keyboard.press('Escape');
      assert.equal(await popup.isVisible(),false);
      for(const [module,actions] of [
        ['media',['media-refresh','media-download-all']],
        ['latex',['latex-refresh','latex-normalize']]
      ]){
        await choose(page,module);
        await page.waitForFunction(expected=>document.querySelector('.ocr-lab-element-select')?.value===expected,
          module,{timeout:12000});
        assert.equal(await button.isDisabled(),false,module+' functions should enable dropdown');
        assert.equal(await popup.isVisible(),false,'switch must dismiss stale menu');
        await button.click();
        for(const id of actions)assert(await page.locator('#'+id).isVisible(),
          module+' missing '+id);
        for(const id of module==='media'?['latex-normalize','latex-refresh']:
          ['media-refresh','media-download-all'])
          assert.equal(await page.locator('#'+id).isVisible(),false,'leaked action '+id);
        // Trigger a read-only scan through the original button handler.
        await page.locator('#'+actions[0]).click();
        assert.equal(await popup.isVisible(),false,'function click should close menu');
        assert.equal(await button.getAttribute('aria-expanded'),'false');
      }
      await choose(page,'note');
      assert.equal(await button.isDisabled(),false,'Notes has template function');
      await button.click();
      assert(await page.locator('#note-templates').isVisible());
      assert(await page.locator('#note-convert-all').isVisible());
      assert.equal(await page.locator('#latex-normalize').isVisible(),false);
      await page.locator('#note-templates').click();
      assert(await page.locator('.ocr-note-template-dialog').isVisible());
      await page.locator('.ocr-note-template-dialog').getByRole('button',{name:'取消'}).click();
      await choose(page,'chapter-boundary');
      await page.waitForFunction(()=>document.querySelector('.ocr-lab-element-select')?.value==='chapter-boundary',
        null,{timeout:12000});
      const option=await page.locator('.ocr-source-pane .ocr-lab-file-select option[value^="virtual:"]')
        .first().getAttribute('value');
      assert(option,'virtual chapter file missing');
      await chooseFile(page,option);
      await page.waitForFunction(()=>document.querySelector('#ag-functions-toggle')?.disabled===true,
        null,{timeout:15000});
      assert.equal(await popup.isVisible(),false);
      await page.locator('input[aria-label="章节所有"]').check();
      assert(await info.isVisible(),'scope status should appear in global status row');
      assert.match(await info.textContent(),/CMD · 全部章节 · \d+ 项/);
      assert(!await button.isEnabled(),'Title virtual chapter has no menu: dropdown must be disabled');
      await choose(page,'media');
      assert.equal(await button.isDisabled(),false,'Media functions re-enabled after virtual change');
      await button.click();
      await choose(page,'latex');
      await page.waitForFunction(()=>document.querySelector('#ag-functions-menu')?.hidden===true,
        null,{timeout:15000});
      assert.equal(await button.getAttribute('aria-expanded'),'false');
      assert.equal(await info.count(),1);
      assert.equal(await page.locator('.ocr-lab-ag-toolbar .ocr-all-chapters-status').count(),0);
      assert.deepEqual(errors,[],name+' browser errors');
      assert.deepEqual(writes,[],name+' should not write draft or settings');
      console.log('AG_FUNCTIONS_STATUS_PASS',name,JSON.stringify({
        titleNumbering:true,mediaMenu:true,latexMenu:true,disabledWithoutFunctions:true,
        statusInGlobal:true,originalHandlers:true,errors,writes
      }));
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');
  assert.equal(readFileSync(documentPath,'utf8'),fixture,'test modified user-like document');
  rmSync(dir,{recursive:true,force:true});
}
