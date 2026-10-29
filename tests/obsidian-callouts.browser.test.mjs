/** Actual browser, original CM6 source, native details toggling and repaint.
 * Test Vite serves a disposable Markdown, not the user's document.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const source=[
  '<!-- minerujson:block:v1:0:0 -->','# Callouts Test','','',
  '> [!note]- Private translation','> This is the **hidden** paragraph.','>','> - one','> - two','',
  '> [!tip]+ Visible initially','> This is the expanded body.','',
  '> [!warning] Fixed, not collapsible','> Always visible paragraph.','',
  '> [!quote]- Parent','> > [!question]+ Child','> > Deep nested text.','',
  '> [! ds]- spaced compatibility','> A hidden translation.','',
  '> Plain blockquote','> Not a callout.','',
  '```md','> [!note]- literal code','```','',
  'A normal paragraph after the blocks.', '',
  '<!-- minerujson:block:v1:1:0 -->','# Later Chapter','',
  '> [!info]- Chapter-scoped','> Not in first chapter.','',
  '<!-- minerujson:source:v1','<sup>evidence only</sup>','-->','',
].join('\n');
const tmp=mkdtempSync(join(tmpdir(),'ocr2md-callouts-'));
const doc=join(tmp,'mother.md'),settings=join(tmp,'settings.json'),auth=join(tmp,'auth');writeFileSync(doc,source);writeFileSync(settings,'{}');writeFileSync(auth,'callout-test-key');
const port=5979,base='http://127.0.0.1:'+port;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,V6_PORT:String(port),V6_BIND:'127.0.0.1',V6_LAN_TLS_HOST:'',V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:settings,V6_TOKEN_PATH:auth,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore'});
try{
 let ready=false;
 for(let i=0;i<180;i++){
   try{ready=(await fetch(base+'/healthz')).ok;if(ready)break;}catch{}
   await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert(ready,'isolated Vite server failed');
 for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad WebKit',webkit,true]]){
   const browser=await engine.launch({headless:true});
   try{
    const context=await browser.newContext({viewport:{width:mobile?820:1050,height:740},hasTouch:mobile,isMobile:mobile});
    await context.addCookies([{name:'v6edit',value:'callout-test-key',domain:'127.0.0.1',path:'/'}]);
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:60000});
    await page.locator('.ocr-markdown details.ocr-callout').first().waitFor({timeout:50000});
    const details=page.locator('.ocr-markdown details.ocr-callout');
    assert.equal(await details.count(),6,'note/tip/quote/child/ds/info should fold');
    const note=details.filter({has:page.locator('summary',{hasText:'Private translation'})});
    assert.equal(await note.count(),1);
    assert.equal(await note.getAttribute('open'),null);
    assert.equal(await page.locator('.ocr-markdown aside.ocr-callout').count(),1);
    assert(await page.locator('.ocr-markdown blockquote').filter({hasText:'Plain blockquote'}).count());
    assert(!await page.locator('.ocr-markdown').innerText().then(x=>x.includes('minerujson:source')));
    const summary=note.locator('summary');
    const body=note.locator('.ocr-callout-content');
    assert.equal(await body.evaluate(el=>el.getBoundingClientRect().height),0);
    const focusBefore=await page.evaluate(()=>window.__v6cm6?.scrollState?.focusTarget??null);
    await summary.click();
    await page.waitForFunction(()=>document.querySelector('details.ocr-callout[data-callout="note"]')?.open,
      null,{timeout:10000});
    assert((await body.boundingBox())?.height>0);
    assert.equal(await page.evaluate(()=>window.__v6cm6?.scrollState?.focusTarget??null),focusBefore,
      'toggling title must not trigger source/PDF navigation');
    // The static production service does not publish development-only CM6
    // window diagnostics. Native folding is tested without private globals.
    // Edit the real CM6 document to exercise preview repaint without any
    // development-only globals or separate rendering pipeline.
    const heading=page.locator('#editor .cm-line').filter({hasText:'Callouts Test'}).first();
    await heading.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' updated');
    await page.waitForFunction(()=>document.querySelector('.ocr-markdown h1')?.textContent
      .includes('updated'),null,{timeout:22000});
    assert.equal(await note.evaluate(el=>el.open),true,'preview repaint lost reader fold choice');
    await summary.click();
    await page.waitForFunction(()=>!document.querySelector('details.ocr-callout[data-callout="note"]')?.open,
      null,{timeout:10000});
    assert.equal(await body.evaluate(el=>el.getBoundingClientRect().height),0);
    const expanded=details.filter({has:page.locator('summary',{hasText:'Visible initially'})});
    assert.equal(await expanded.evaluate(el=>el.open),true);
    await expanded.locator('summary').click();
    assert.equal(await expanded.evaluate(el=>el.open),false,'+ must remain foldable');
    assert.equal(await page.locator('.ocr-markdown [data-callout="ds"]').count(),1);
    assert.equal(await page.locator('.ocr-markdown [data-callout="question"]').count(),1);
    assert.equal(await page.locator('.ocr-markdown .ocr-callout').first().getAttribute('data-source-start'),'5');
    assert.deepEqual(errors,[],name+' browser errors');
    assert.equal(readFileSync(doc,'utf8'),source,'preview action wrote disk');
    console.log('OB_CALLOUT_BROWSER_PASS',name,JSON.stringify({foldable:6,ordinaryQuote:true,
      nativeToggle:true,noFocusJump:true,collapsedBodyHidden:true,repaintPreservesChoice:true,docUnchanged:true}));
   }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');assert.equal(readFileSync(doc,'utf8'),source);rmSync(tmp,{recursive:true,force:true});}
