/** CMD quote indentation must preserve stable anchor identity and editor history. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
import {buildOutline} from '../ui/outline-index.js';
import {buildChapterFiles} from '../ui/chapter-files.js';

const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const raw=fixture.toString();
const path=resolve(`.v6/tests/quote-indent-${process.pid}.md`);
mkdirSync('.v6/tests',{recursive:true});mkdirSync('.v6/evidence',{recursive:true});writeFileSync(path,fixture);
const port=5263,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{
  env:{...process.env,V6_DOCUMENT_PATH:path},stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const engines=[['Chrome',chromium,{}],['iPad WebKit',webkit,{}]];
try{
 let up=false;
 for(let i=0;i<140;i++){try{if((await fetch(url)).ok){up=true;break}}catch{}await sleep(150)}
 assert(up,'isolated Vite server not ready');
 for(const [name,engine,launch] of engines){
  if(process.env.V6_ONLY_CHROME && name!=='Chrome')continue;
  if(process.env.V6_ONLY_WEBKIT && name!=='iPad WebKit')continue;
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   // Vite does not implement the production /healthz endpoint. Keep the
   // automatic-update probe on-origin and deterministic in both browsers.
   await page.route('**/healthz',route=>route.fulfill({status:200,
     contentType:'application/json',body:'{}'}));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:52000});
   await page.waitForFunction(()=>window.__v6cm6?.outline?.rows.length===21 &&
     window.__v6cm6?.pdf?.anchors?.length===224,null,{timeout:75000});
   assert.equal(await page.locator('#quote-indent').count(),0);
   assert.equal(await page.locator('#quote-outdent').count(),0);
   const menu=page.locator('.ocr-source-line-menu');
   const quoteAction=async direction=>{
     const before=await page.evaluate(()=>{
       const s=window.__v6cm6.view.state.selection;
       return s.ranges.map(r=>({anchor:r.anchor,head:r.head}));
     });
     if(!await menu.isVisible()){
       // CM6 virtualizes the gutter: newly selected offscreen lines need
       // scrollIntoView before their active-line button exists in the DOM.
       await page.evaluate(()=>{const v=window.__v6cm6.view;
         v.dispatch({selection:v.state.selection,scrollIntoView:true});
         const position=v.state.selection.main.head;
         const block=v.lineBlockAt(position);
         v.scrollDOM.scrollTop=Math.max(0,block.top-v.scrollDOM.clientHeight/2);
       });
       await sleep(200);
       const gutter=page.locator('#editor .ocr-source-caret-line-button');
       await gutter.waitFor({timeout:12000});
       if(name==='iPad WebKit')await gutter.tap();else await gutter.click();
     }
     assert(await menu.isVisible(),'source gutter menu should stay available');
     const afterOpen=await page.evaluate(()=>{
       const s=window.__v6cm6.view.state.selection;
       return s.ranges.map(r=>({anchor:r.anchor,head:r.head}));
     });
     assert.deepEqual(afterOpen,before,'opening gutter menu lost the source selection');
     const beforeAction=await page.evaluate(()=>{
       const view=window.__v6cm6.view,s=view.state.selection.main,doc=view.state.doc;
       const start=doc.lineAt(s.from).number;
       const end=doc.lineAt(s.empty?s.to:Math.max(s.from,s.to-1)).number;
       const marker=document.querySelector('#editor .ocr-source-caret-line-button');
       return {start,end,count:end-start+1,
         summary:document.querySelector('.ocr-source-line-menu-summary')?.textContent,
         markerY:marker?.getBoundingClientRect().top??null,
         scrollTop:view.scrollDOM.scrollTop,
         headLine:doc.lineAt(s.head).number,
         reverse:s.anchor>s.head};
     });
     const expected=beforeAction.count>1||beforeAction.count===1&&before.some(r=>r.anchor!==r.head)?
       `已选 ${beforeAction.count} 行 · 第 ${beforeAction.start}${beforeAction.start===beforeAction.end?'':`–${beforeAction.end}`} 行`:
       `未选区 · 光标第 ${beforeAction.headLine} 行`;
     assert.equal(beforeAction.summary,expected,'menu range summary does not match the CMD selection');
     const label=direction===1?'>+ 增加引用层级':'>− 减少引用层级';
     const command=menu.getByRole('menuitem',{name:label,exact:true});
     if(name==='iPad WebKit')await command.tap();else await command.click();
     await sleep(140); // allow CM6's measured gutter/layout pass to settle
     assert(await menu.isVisible(),'quote action closed the menu unexpectedly');
     const afterAction=await page.evaluate(()=>{
       const view=window.__v6cm6.view;
       const marker=document.querySelector('#editor .ocr-source-caret-line-button');
       return {markerY:marker?.getBoundingClientRect().top??null,
         summary:document.querySelector('.ocr-source-line-menu-summary')?.textContent,
         scrollTop:view.scrollDOM.scrollTop};
     });
     assert.equal(afterAction.summary,expected,'menu summary drifted after prefix edit');
     if(beforeAction.markerY!==null&&afterAction.markerY!==null)
       assert(Math.abs(afterAction.markerY-beforeAction.markerY)<=5,
         `caret gutter floated: before=${JSON.stringify(beforeAction)} after=${JSON.stringify(afterAction)}`);
   };
   await page.screenshot({path:`.v6/evidence/quote-indent-toolbar-${name==='Chrome'?'chrome':'ipad-webkit'}.png`});
   const old=await page.evaluate(()=>{
     const v=window.__v6cm6.view;
     const row=window.__v6cm6.outline.rows[11];
     const from=v.state.doc.line(row.sourceLine-2).from;
     const to=v.state.doc.line(row.sourceLine).to;
     const before=v.state.doc.sliceString(from,to);
     v.dispatch({selection:{anchor:from,head:to},scrollIntoView:true});
     return {from,to,line:row.sourceLine,rowId:row.id,before,
      startLine:row.sourceLine-2,endLine:row.sourceLine};
   });
   assert(old.line>100);
   assert.match(old.before,/minerujson:block:v1:/);
   await sleep(240);
   const scrollBefore=await page.evaluate(()=>window.__v6cm6.view.scrollDOM.scrollTop);
   await quoteAction(1);
   const plus=await page.evaluate(({rowId,line})=>{
     const m=window.__v6cm6,doc=m.view.state.doc;
     const text=doc.toString(),head=m.outline.rows.find(row=>row.id===rowId);
     const offset=doc.line(line).from;
     return {text,selection:m.view.state.selection.main,heading:head,
       anchors:m.pdf.anchors,scroll:m.view.scrollDOM.scrollTop,
       editedLineVisible:m.view.visibleRanges.some(range=>range.from<=offset&&range.to>=offset),
       dirty:m.dirty};
   },old);
   // Regression: clicking a source button must NOT collapse or trim the range.
   // The next press must still affect every originally selected line.
   assert(plus.selection.to>plus.selection.from,'quote+ collapsed the original multi-line selection');
   assert.equal(plus.text.split('\n')[old.startLine-1].startsWith('>'),true);
   assert.equal(plus.text.split('\n')[old.endLine-1].startsWith('>'),true);
   const selectedLines=await page.evaluate(()=>{
     const v=window.__v6cm6.view,s=v.state.selection.main;
     return {start:v.state.doc.lineAt(s.from).number,end:v.state.doc.lineAt(s.to).number};
   });
   assert.deepEqual(selectedLines,{start:old.startLine,end:old.endLine},
     'quote+ lost the selected source lines');
   // UI and API must recognize the same source identity after quoting.
   assert(plus.dirty);assert.equal(buildOutline(plus.text).length,21);
   const quotedRows=buildOutline(plus.text);
   assert.deepEqual(quotedRows.map(r=>r.id),buildOutline(raw).map(r=>r.id));
   assert.deepEqual(quotedRows.map(r=>r.pdfPage),buildOutline(raw).map(r=>r.pdfPage));
   assert.equal(buildChapterFiles(plus.text,quotedRows).length,21);
   assert.equal((plus.text.match(/^<!-- minerujson:block:v1:/gm)||[]).length,223);
   assert.equal((plus.text.match(/^> ?<!-- minerujson:block:v1:/gm)||[]).length,1);
   assert.equal(plus.anchors.length,224);
   const [,targetPage,targetBlock]=old.rowId.split(':').map(Number);
   assert(plus.anchors.some(a=>a.pageIndex===targetPage&&a.blockIndex===targetBlock),
     'PDF must still resolve the quoted block source identity');
   assert(plus.editedLineVisible && plus.scroll>500,`indent lost the edited line ${name}: ${scrollBefore} -> ${plus.scroll}`);
   await quoteAction(1);
   const twiceState=await page.evaluate(()=>{
     const view=window.__v6cm6.view,s=view.state.selection.main;
     return {text:view.state.doc.toString(),fromLine:view.state.doc.lineAt(s.from).number,
       toLine:view.state.doc.lineAt(s.to).number,nonempty:!s.empty};
   });
   const twice=twiceState.text;
   assert(twiceState.nonempty,'second >+ collapsed selection');
   assert.equal(twiceState.fromLine,old.startLine);
   assert.equal(twiceState.toLine,old.endLine);
   for(let line=old.startLine;line<=old.endLine;line++)
     assert(twice.split('\n')[line-1].startsWith('>>'),`second quote+ skipped selected line ${line}`);
   assert.equal((twice.match(/^>> ?<!-- minerujson:block:v1:/gm)||[]).length,1);
   await page.locator('#undo').click();
   const onceAgain=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
   assert.equal(onceAgain,plus.text,'undo must revert exactly one indentation operation');
   await quoteAction(-1);
   const minusState=await page.evaluate(()=>{
     const v=window.__v6cm6.view,s=v.state.selection.main;
     return {text:v.state.doc.toString(),start:v.state.doc.lineAt(s.from).number,
       end:v.state.doc.lineAt(s.to).number,empty:s.empty};
   });
   const unquoted=minusState.text;
   assert(!minusState.empty,'quote- collapsed selection');
   assert.equal(minusState.start,old.startLine);
   assert.equal(minusState.end,old.endLine);
   assert.equal(unquoted,raw,'outdent must be inverse of indent');
   await page.locator('#undo').click();
   assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),plus.text);
   await page.locator('#redo').click();
   assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),raw);
   // Disable the separate preview's scroll-sync leader before jumping the
   // programmatic cursor hundreds of lines away in this UI-specific test.
   await page.evaluate(()=>window.__v6cm6.setScrollSyncEnabled(false));
   // A collapsed selection applies to one line and preserves selection mapping.
   const lineCase=await page.evaluate(()=>{
     const cm=window.__v6cm6.cm;
     const line=cm.doc.line(93),pos=line.from+Math.min(5,line.length);
     cm.view.dispatch({selection:{anchor:pos}});
     const before=cm.doc.line(93).text;
     return {pos,before};
   });
   await quoteAction(1);
   const afterLine=await page.evaluate(()=>({text:window.__v6cm6.cm.doc.line(93).text,
     cursor:window.__v6cm6.view.state.selection.main.head}));
   assert.equal(afterLine.text,'>'+lineCase.before);
   assert.equal(afterLine.cursor,lineCase.pos+1);
   await quoteAction(-1);
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.doc.line(93).text),lineCase.before);
   // Reverse, multi-line selections survive any number of consecutive
   // layer operations. A touch tap follows the real iPad event path.
   const nested=await page.evaluate(()=>{
     const v=window.__v6cm6.view,doc=v.state.doc;
     const from=doc.line(93).from,to=doc.line(95).to;
     const originals=[93,94,95].map(n=>doc.line(n).text);
     v.dispatch({selection:{anchor:to,head:from},scrollIntoView:true});
     return {fromLine:93,toLine:95,originals};
   });
   await sleep(180);
   for(let depth=1;depth<=3;depth++){
     await quoteAction(1);
     const snapshot=await page.evaluate(()=>{
       const v=window.__v6cm6.view,s=v.state.selection.main;
       return {lines:[93,94,95].map(n=>v.state.doc.line(n).text),
         fromLine:v.state.doc.lineAt(s.from).number,
         toLine:v.state.doc.lineAt(s.to).number,
         reversed:s.anchor>s.head,empty:s.empty};
     });
     assert.deepEqual(snapshot.lines,nested.originals.map(line=>'>'.repeat(depth)+line));
     assert.equal(snapshot.fromLine,93);
     assert.equal(snapshot.toLine,95);
     assert(snapshot.reversed&&!snapshot.empty,'repeated >+ changed reverse selection');
   }
   for(let depth=2;depth>=0;depth--){
     await quoteAction(-1);
     const snapshot=await page.evaluate(()=>{
       const v=window.__v6cm6.view,s=v.state.selection.main;
       return {lines:[93,94,95].map(n=>v.state.doc.line(n).text),
         fromLine:v.state.doc.lineAt(s.from).number,
         toLine:v.state.doc.lineAt(s.to).number,
         reversed:s.anchor>s.head,empty:s.empty};
     });
     assert.deepEqual(snapshot.lines,nested.originals.map(line=>'>'.repeat(depth)+line));
     assert.equal(snapshot.fromLine,93);
     assert.equal(snapshot.toLine,95);
     assert(snapshot.reversed&&!snapshot.empty,'repeated >- changed reverse selection');
   }
   // A selection inside the compressed MinerU source must be refused intact.
   const guarded=await page.evaluate(()=>{
     const cm=window.__v6cm6.cm,doc=cm.doc;
     const line=doc.toString().split('\n').findIndex(l=>l.startsWith('<!-- minerujson:source:v1:'))+1;
     cm.view.dispatch({selection:{anchor:doc.line(line+1).from}});
     return {source:cm.markdown,position:line};
   });
   await quoteAction(1);
   const guardResult=await page.evaluate(()=>({text:window.__v6cm6.cm.markdown,
     status:document.querySelector('#status').textContent}));
   assert.equal(guardResult.text,guarded.source);
   assert.match(guardResult.status,/证据注释不能修改/);
   // Mark a quoted heading from AG: the generated chapter comment must use
   // the same quote depth and remain associated with its stable MinerU ID.
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__v6cm6?.outline?.rows.length===21,null,{timeout:70000});
   await page.evaluate(()=>{
     const cm=window.__v6cm6.cm,row=window.__v6cm6.outline.rows[11];
     cm.view.dispatch({selection:{anchor:cm.doc.line(row.sourceLine).from}});
     cm.adjustQuoteIndent(1);
   });
   await page.evaluate(()=>window.__v6cm6.outline.api.ensureIndexVisible(11,'middle'));
   await page.locator('.ag-row[row-index="11"] input.ocr-outline-checkbox').uncheck();
   await page.waitForFunction(()=>window.__v6cm6?.cm?.markdown.includes('ocr2md:chapter:v1 id="mineru:'),null,{timeout:16000});
   const quoteMarker=await page.evaluate(()=>{
     const doc=window.__v6cm6.cm.doc;
     return Array.from({length:doc.lines},(_,i)=>doc.line(i+1).text)
       .find(line=>line.includes('ocr2md:chapter:v1 id="mineru:'));
   });
   assert.match(quoteMarker,/^> ?<!-- ocr2md:chapter:v1 id="mineru:/,
     'AG must insert quoted chapter marker beside quoted heading');
   assert.deepEqual(errors,[],`${name} browser errors`);
   console.log('QUOTE_INDENT_PASS',name,JSON.stringify({titleLine:old.line,
     quotedBlock:true,outline:quotedRows.length,PDF:true,chapterIndex:true,
     undoOneStep:true,metadataProtected:true,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.deepEqual(readFileSync(path),fixture,'test wrote the isolation fixture');
}finally{server.kill('SIGTERM');unlinkSync(path)}
