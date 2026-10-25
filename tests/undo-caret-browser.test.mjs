/** Undo/redo must not navigate from CM6 to the AG-selected heading. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';

const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const file=resolve(`.v6/tests/undo-caret-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});writeFileSync(file,original);
const port=5284,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{
  cwd:process.cwd(),env:{...process.env,V6_DOCUMENT_PATH:file},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
  ['iPad WebKit',webkit,{executablePath:webkit.executablePath()}]];
const snapshot=page=>page.evaluate(()=>{
  const v=window.__v6cm6.view,offset=v.state.selection.main.head;
  return {offset,line:v.state.doc.lineAt(offset).number,scrollTop:v.scrollDOM.scrollTop,
    focusSequence:window.__v6cm6.scrollState.focusTarget?.sequence||0,
    focusOrigin:window.__v6cm6.scrollState.focusTarget?.origin,
    dirty:window.__v6cm6.dirty,redoDisabled:document.querySelector('#redo').disabled};
});
try{
  let up=false;for(let i=0;i<160;i++){
    try{if((await fetch(url)).ok){up=true;break}}catch{}await sleep(130)
  }assert(up,'isolated Vite server did not start');
  for(const [name,engine,launch] of engines){
    const browser=await engine.launch({headless:true,...launch});
    try{
      const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
      const errors=[];page.on('pageerror',err=>errors.push(err.message));
      await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
      await page.waitForFunction(()=>window.__v6cm6?.outline?.rows.length>=19 &&
        window.__v6cm6?.scrollSync?.anchorCount>170,null,{timeout:75000});
      const target=await page.evaluate(async()=>{
        const v=window.__v6cm6.view;
        const row=window.__v6cm6.outline.rows[11];
        const line=v.state.doc.line(row.sourceLine);
        const offset=Math.min(line.to,line.from+8);
        v.dispatch({selection:{anchor:offset},scrollIntoView:true});v.focus();
        await new Promise(r=>setTimeout(r,500));
        return {offset,line:line.number};
      });
      assert(target.line>300,'need a test edit far from document start');
      await page.keyboard.insertText('Q');
      await sleep(320);
      const beforeUndo=await snapshot(page);
      assert(beforeUndo.dirty,'typed edit should mark document dirty');
      assert.equal(beforeUndo.line,target.line);
      assert(beforeUndo.scrollTop>1000,'edit must be scrolled away from document start');
      await page.locator('#undo').click();
      await sleep(700);
      const afterUndo=await snapshot(page);
      assert.equal(afterUndo.line,target.line,'undo moved cursor to another line');
      assert.equal(afterUndo.offset,target.offset,'undo lost original edit insertion caret');
      assert.equal(afterUndo.dirty,false,'undo failed to restore original document');
      assert(Math.abs(afterUndo.scrollTop-beforeUndo.scrollTop)<90,
        `undo unexpectedly scrolled source: ${beforeUndo.scrollTop} -> ${afterUndo.scrollTop}`);
      assert.equal(afterUndo.focusSequence,beforeUndo.focusSequence,'undo issued a new AG navigation');
      assert(!afterUndo.redoDisabled,'redo should remain available');
      await page.locator('#redo').click();
      await sleep(700);
      const afterRedo=await snapshot(page);
      assert.equal(afterRedo.line,target.line,'redo moved caret from edited line');
      assert.equal(afterRedo.offset,beforeUndo.offset,'redo failed to restore edited caret');
      assert(Math.abs(afterRedo.scrollTop-beforeUndo.scrollTop)<90,
        'redo unexpectedly scrolled away from edited text');
      assert.equal(afterRedo.focusSequence,beforeUndo.focusSequence,'redo issued new AG navigation');
      assert(afterRedo.dirty,'redo did not reapply edit');
      // A checkbox changes a distant heading while the editor's caret is at
      // offset zero. Undo must not emit a second AG jump or pull source to top.
      await page.reload({waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.__v6cm6?.outline?.rows.length>=19 &&
        window.__v6cm6?.scrollSync?.anchorCount>170,null,{timeout:75000});
      await page.evaluate(()=>window.__v6cm6.outline.api.ensureIndexVisible(10,'middle'));
      await page.locator('.ag-row[row-index="10"] input.ocr-outline-checkbox').first().click();
      await sleep(750);
      const beforeMarkerUndo=await snapshot(page);
      assert(beforeMarkerUndo.scrollTop>500,'AG checkbox must navigate to a later block');
      await page.locator('#undo').click();
      await sleep(750);
      const afterMarkerUndo=await snapshot(page);
      assert.equal(afterMarkerUndo.focusSequence,beforeMarkerUndo.focusSequence,
        'undo of AG edit emitted an unwanted AG navigation');
      assert(Math.abs(afterMarkerUndo.scrollTop-beforeMarkerUndo.scrollTop)<90,
        `undo of AG annotation unexpectedly scrolled: ${beforeMarkerUndo.scrollTop} -> ${afterMarkerUndo.scrollTop}`);
      assert.deepEqual(errors,[]);
      console.log('UNDO_CARET_PASS',name,JSON.stringify({line:target.line,
        beforeScroll:beforeUndo.scrollTop,undoScroll:afterUndo.scrollTop,redoScroll:afterRedo.scrollTop,
        markerBefore:beforeMarkerUndo.scrollTop,markerUndo:afterMarkerUndo.scrollTop,
        caretOnEdit:true,AGNavigationOnHistory:false,errors:errors.length}));
    }finally{await browser.close()}
  }
  assert.deepEqual(readFileSync(file),original,'test modified persisted document');
}finally{server.kill('SIGTERM');unlinkSync(file)}
