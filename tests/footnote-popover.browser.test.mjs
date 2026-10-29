/** Footnote reader: Floating UI on sanitized markdown-it footnotes.
 * Test touch/desktop, virtual-chapter notes, no hash jump, CMD unchanged.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const source=[
  '<!-- minerujson:block:v1:1:0 -->',
  '# Chapter One','',
  'Reading[^1] in place, then a second reference[^1].',
  '',
  'Many words in the main chapter that must not scroll away.',
  '',
  ...Array.from({length:55},(_,i)=>`Chapter body paragraph ${i+1}. `+
    'A long text keeps the note definition far away from the cited paragraph. '.repeat(4)),
  '',
  '<!-- minerujson:block:v1:2:0 -->',
  '# Notes','',
  '<!--ocr2md:note-body id="1"-->',
  '[^1]: This note contains **bold** and [an external link](https://example.org).',
  '',
  '# End',
  ''
].join('\n');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-footnote-read-'));
const file=join(dir,'document.md');writeFileSync(file,source);
const port=5927,origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),env:{
  ...process.env,V6_DOCUMENT_PATH:file
},stdio:'ignore'});
try{
  let ready=false;
  for(let i=0;i<130;i++){
    try{if((await fetch(origin)).ok){ready=true;break}}catch{}
    await new Promise(r=>setTimeout(r,120));
  }
  assert(ready,'Vite test server unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({
        viewport:{width:1032,height:642},
        hasTouch:mobile,isMobile:mobile,
      });
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
      await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
      const ref=page.locator('.ocr-preview-md-scroll sup.footnote-ref a[href="#fn1"]').first();
      await ref.waitFor({state:'visible',timeout:50000});
      assert.equal(await page.locator('.ocr-markdown li#fn1').count(),1);
      assert.equal(await page.locator('.ocr-footnote-popover').count(),1);
      await ref.scrollIntoViewIfNeeded();
      if(!mobile){
        await ref.hover();
        await page.locator('.ocr-footnote-popover').waitFor({state:'visible',timeout:2000});
        await page.mouse.move(0,0);
        await page.locator('.ocr-footnote-popover').waitFor({state:'hidden',timeout:2000});
      }
      const initial=await page.evaluate(()=>({
        hash:location.hash,
        top:document.querySelector('.ocr-preview-md-scroll').scrollTop,
      }));
      await ref.click();
      const card=page.locator('.ocr-footnote-popover');
      await card.waitFor({state:'visible'});
      assert.match(await card.locator('.ocr-footnote-card-content').textContent(),/This note contains bold/);
      assert.equal(await card.locator('.ocr-footnote-card-content strong').textContent(),'bold');
      assert.equal(await card.locator('a.footnote-backref').count(),0);
      const after=await page.evaluate(()=>({
        hash:location.hash,top:document.querySelector('.ocr-preview-md-scroll').scrollTop,
        rect:(()=>{const r=document.querySelector('.ocr-footnote-popover').getBoundingClientRect();
          return {left:r.left,top:r.top,right:r.right,bottom:r.bottom}})()
      }));
      assert.equal(after.hash,initial.hash,'reader navigated hash');
      assert.equal(after.top,initial.top,'reader scrolled body');
      assert(after.rect.left>=0&&after.rect.right<=1032&&
        after.rect.top>=0&&after.rect.bottom<=642,'Floating UI did not stay within viewport');
      // A second instance of same reference uses the same single card.
      const repeated=page.locator('.ocr-preview-md-scroll sup.footnote-ref a[href="#fn1"]').last();
      await repeated.click();
      assert.equal(await card.count(),1);
      assert(await card.isVisible());
      await page.keyboard.press('Escape');
      assert.equal(await card.isVisible(),false);
      await ref.click();
      await card.getByRole('button',{name:'关闭注释'}).click();
      assert.equal(await card.isVisible(),false);
      // Explicit, not incidental, source navigation is allowed.
      await ref.click();
      assert(await card.getByRole('button',{name:'定位注文'}).isVisible());
      await card.getByRole('button',{name:'定位注文'}).click();
      await page.waitForFunction(()=>[...document.querySelectorAll('#editor .cm-outline-focused-line')]
        .some(el=>el.textContent.includes('This note contains')),null,{timeout:15000});
      assert.equal(await card.isVisible(),false);
      const back=page.getByRole('button',{name:'↩ 返回注引'});
      assert.equal(await back.isVisible(),true,'no return action after note jump');
      const arrived=await page.evaluate(()=>{
        const pane=document.querySelector('.ocr-preview-md-scroll');
        const note=pane.querySelector('li#fn1');
        const n=note.getBoundingClientRect(),p=pane.getBoundingClientRect();
        return {top:pane.scrollTop,inReader:n.top>=p.top&&n.top<p.bottom,
          focus:window.__v6cm6.scrollState.focusTarget};
      });
      assert(arrived.top>initial.top+80,'locate note did not scroll preview');
      assert(arrived.inReader,'note definition is still off-screen');
      assert.equal(arrived.focus.origin,'footnote-reader');
      await back.click();
      assert.equal(await back.isVisible(),false,'returned annotation button stays visible');
      const returned=await page.evaluate(()=>({
        top:document.querySelector('.ocr-preview-md-scroll').scrollTop,
        line:window.__v6cm6.scrollState.focusTarget.sourceLine,
        focus:document.activeElement?.getAttribute('href'),
      }));
      assert(Math.abs(returned.top-initial.top)<3,'return did not restore original reading scroll');
      assert.equal(returned.line,4,'return did not focus original citation source line');
      assert.equal(returned.focus,'#fn1','return did not restore reference keyboard focus');
      // Rendering a virtual chapter must resolve the definition outside it.
      const select=page.locator('.ocr-source-pane .ocr-lab-file-select');
      const value=await select.locator('option[value^="virtual:"]').first().getAttribute('value');
      assert(value,'no virtual chapter');
      await select.evaluate((el,next)=>{
        el.value=next;el.dispatchEvent(new Event('change',{bubbles:true}));
      },value);
      await page.waitForFunction(()=>document.querySelector('.ocr-preview-md-scroll sup.footnote-ref a[href="#fn1"]')&&
        document.querySelector('.ocr-markdown li#fn1'),null,{timeout:20000});
      const virtualRef=page.locator('.ocr-preview-md-scroll sup.footnote-ref a[href="#fn1"]').first();
      await virtualRef.scrollIntoViewIfNeeded();
      const virtualTop=await page.locator('.ocr-preview-md-scroll').evaluate(e=>e.scrollTop);
      await virtualRef.click();
      assert.match(await card.textContent(),/This note contains/);
      assert.equal(await page.locator('.ocr-preview-md-scroll').evaluate(e=>e.scrollTop),virtualTop);
      const noteLine=source.split('\n').findIndex(line=>line.startsWith('[^1]:'))+1;
      assert.equal(await page.locator('.ocr-markdown li#fn1').getAttribute('data-source-start'),String(noteLine));
      await card.getByRole('button',{name:'定位注文'}).click();
      await page.waitForFunction(()=>document.querySelector('.ocr-preview-md-scroll').scrollTop>120);
      assert.equal(await back.isVisible(),true,'virtual chapter lost return navigation');
      await back.click();
      assert(Math.abs((await page.locator('.ocr-preview-md-scroll').evaluate(e=>e.scrollTop))-virtualTop)<3,
        'virtual return did not restore original scroll');
      assert.deepEqual(errors,[],name+' JS errors');
      assert.equal(readFileSync(file,'utf8'),source,'reader changed CMD source');
      console.log('FOOTNOTE_READER_PASS',name,JSON.stringify({
        originalHashPreserved:true,scrollPreserved:true,virtualChapter:true,
        sourceLineMapped:true,singleCard:true,desktopHover:!mobile,
      }));
    }finally{await browser.close();}
  }
}finally{
  server.kill('SIGTERM');
  assert.equal(readFileSync(file,'utf8'),source);
  rmSync(dir,{recursive:true,force:true});
}
