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
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
  ['iPad WebKit',webkit,{executablePath:webkit.executablePath()}]];
try{
 let up=false;
 for(let i=0;i<140;i++){try{if((await fetch(url)).ok){up=true;break}}catch{}await sleep(150)}
 assert(up,'isolated Vite server not ready');
 for(const [name,engine,launch] of engines){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:52000});
   await page.waitForFunction(()=>window.__v6cm6?.outline?.rows.length===21 &&
     window.__v6cm6?.pdf?.anchors?.length===224,null,{timeout:75000});
   assert.equal(await page.locator('#quote-indent').count(),1);
   assert.equal(await page.locator('#quote-outdent').count(),1);
   await page.screenshot({path:`.v6/evidence/quote-indent-toolbar-${name==='Chrome'?'chrome':'ipad-webkit'}.png`});
   const old=await page.evaluate(()=>{
     const v=window.__v6cm6.view;
     const row=window.__v6cm6.outline.rows[11];
     const from=v.state.doc.line(row.sourceLine-2).from;
     const to=v.state.doc.line(row.sourceLine).to;
     const before=v.state.doc.sliceString(from,to);
     v.dispatch({selection:{anchor:from,head:to},scrollIntoView:true});
     return {from,to,line:row.sourceLine,rowId:row.id,before};
   });
   assert(old.line>100);
   assert.match(old.before,/minerujson:block:v1:/);
   await sleep(240);
   const scrollBefore=await page.evaluate(()=>window.__v6cm6.view.scrollDOM.scrollTop);
   await page.locator('#quote-indent').click();
   const plus=await page.evaluate(({rowId,line})=>{
     const m=window.__v6cm6,doc=m.view.state.doc;
     const text=doc.toString(),head=m.outline.rows.find(row=>row.id===rowId);
     const offset=doc.line(line).from;
     return {text,selection:m.view.state.selection.main,heading:head,
       anchors:m.pdf.anchors,scroll:m.view.scrollDOM.scrollTop,
       editedLineVisible:m.view.visibleRanges.some(range=>range.from<=offset&&range.to>=offset),
       dirty:m.dirty};
   },old);
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
   await page.locator('#quote-indent').click();
   const twice=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
   assert.equal((twice.match(/^>> ?<!-- minerujson:block:v1:/gm)||[]).length,1);
   await page.locator('#undo').click();
   const onceAgain=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
   assert.equal(onceAgain,plus.text,'undo must revert exactly one indentation operation');
   await page.locator('#quote-outdent').click();
   const unquoted=await page.evaluate(()=>window.__v6cm6.view.state.doc.toString());
   assert.equal(unquoted,raw,'outdent must be inverse of indent');
   await page.locator('#undo').click();
   assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),plus.text);
   await page.locator('#redo').click();
   assert.equal(await page.evaluate(()=>window.__v6cm6.view.state.doc.toString()),raw);
   // A collapsed selection applies to one line and preserves selection mapping.
   const lineCase=await page.evaluate(()=>{
     const cm=window.__v6cm6.cm;
     const line=cm.doc.line(93),pos=line.from+Math.min(5,line.length);
     cm.view.dispatch({selection:{anchor:pos}});
     const before=cm.doc.line(93).text;
     return {pos,before};
   });
   await page.locator('#quote-indent').click();
   const afterLine=await page.evaluate(()=>({text:window.__v6cm6.cm.doc.line(93).text,
     cursor:window.__v6cm6.view.state.selection.main.head}));
   assert.equal(afterLine.text,'>'+lineCase.before);
   assert.equal(afterLine.cursor,lineCase.pos+1);
   await page.locator('#quote-outdent').click();
   assert.equal(await page.evaluate(()=>window.__v6cm6.cm.doc.line(93).text),lineCase.before);
   // A selection inside the compressed MinerU source must be refused intact.
   const guarded=await page.evaluate(()=>{
     const cm=window.__v6cm6.cm,doc=cm.doc;
     const line=doc.toString().split('\n').findIndex(l=>l.startsWith('<!-- minerujson:source:v1:'))+1;
     cm.view.dispatch({selection:{anchor:doc.line(line+1).from}});
     return {source:cm.markdown,position:line};
   });
   await page.locator('#quote-indent').click();
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
     quotedBlock:true,outline:quotedRows.length,PDF:true,chapterExport:true,
     undoOneStep:true,metadataProtected:true,errors:errors.length}));
  }finally{await browser.close()}
 }
 assert.deepEqual(readFileSync(path),fixture,'test wrote the isolation fixture');
}finally{server.kill('SIGTERM');unlinkSync(path)}
