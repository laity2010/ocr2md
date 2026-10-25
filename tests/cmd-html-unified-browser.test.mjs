/** CMD's single HTML I/O must handle standard tags, custom tags and comments. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,webkit,devices} from 'playwright';
const bytes=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
mkdirSync('.v6/tests',{recursive:true});
const docFile=resolve(`.v6/tests/cmd-unified-html-${process.pid}.md`);
writeFileSync(docFile,bytes);
const port=5291,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
 '--port',String(port),'--strictPort'],{env:{...process.env,V6_DOCUMENT_PATH:docFile},stdio:'ignore'});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const engines=[['Chrome',chromium,{executablePath:chromium.executablePath()}],
 ['iPad WebKit',webkit,{executablePath:webkit.executablePath()}]];
try{
 let available=false;
 for(let i=0;i<150;i++){try{if((await fetch(url)).ok){available=true;break}}catch{}await sleep(130)}
 assert(available,'isolated server did not start');
 for(const [name,engine,launch] of engines){
  const browser=await engine.launch({headless:true,...launch});
  try{
   const page=await browser.newPage({...devices['iPad Pro 11 landscape'],viewport:{width:1032,height:642}});
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:55000});
   await page.waitForFunction(()=>window.__v6cm6?.cm && window.__v6cm6.outline?.rows.length===21,
     null,{timeout:65000});
   const result=await page.evaluate(async()=>{
     const {cm}=window.__v6cm6;
     const {decodeMarker,encodeMarker}=await import('/chapter-markers.js');
     const original=cm.markdown,originalDoc=cm.doc;
     const beforeLine=window.__v6cm6.outline.rows[3].sourceLine;
     const samples=[
       '<table><tr><td>cell</td></tr></table>',
       '<ocr2md-test data-a="1"></ocr2md-test>',
       '<!-- ocr2md:chapter:v1 id="mineru:2:3:0" independent="1" -->',
     ];
     const readings=[];
     for(let i=0;i<samples.length;i++){
       const place=cm.writeHtml({html:samples[i],beforeLine:i===0?beforeLine:beforeLine+1,
         replaceLine:i===0?null:beforeLine});
       const read=cm.readHtml(place.line);
       readings.push({same:read?.html===samples[i],syntax:read?.syntax||[],line:read?.line,
         marker:decodeMarker(read?.html||'')});
     }
     const quoted=cm.writeHtml({html:samples[1],beforeLine:beforeLine+1,replaceLine:beforeLine,quotePrefix:'>'});
     const quotedRead=cm.readHtml(quoted.line);
     const commentPlace=cm.writeComment({text:'chapter:v1 test="yes"',
       beforeLine:beforeLine+1,replaceLine:beforeLine,quotePrefix:'>'});
     const commentRead=cm.readHtml(commentPlace.line);
     const semantic=decodeMarker(samples[2]);
     const older=decodeMarker('<ocr2md-chapter data-id="mineru:2:3:0" data-independent="1"></ocr2md-chapter>');
     const output=encodeMarker(semantic.id,semantic.independent);
     const changed=cm.markdown!==original;
     cm.loadMarkdown(original);
     return {readings,quotedSame:quotedRead?.html==='>'+samples[1],
       commentSame:commentRead?.html==='><!-- chapter:v1 test="yes" -->',
       commentSyntax:commentRead?.syntax||[],sameSemantics:older.id===semantic.id&&
         older.independent===semantic.independent,
       encodingIsHtmlComment:output===samples[2],changed,
       restored:cm.markdown===original,docIdentity:cm.doc!==originalDoc,
       hasConversionControls:typeof (await import('/chapter-markers.js')).convertMarkers==='function'};
   });
   assert(result.readings.every(v=>v.same),`${name} HTML roundtrip failed: ${JSON.stringify(result.readings)}`);
   assert(result.readings.every(v=>v.syntax.length>0),`${name} CM syntax lost: ${JSON.stringify(result.readings)}`);
   assert(result.quotedSame&&result.commentSame&&result.sameSemantics&&result.encodingIsHtmlComment);
   assert(result.changed&&result.restored&&result.docIdentity);
   assert(!result.hasConversionControls,'no two-format business conversion API in main V6');
   assert.deepEqual(errors,[]);
   console.log('CMD_UNIFIED_HTML_PASS',name,JSON.stringify({forms:'standard/custom/comment',
     syntax:result.readings.map(v=>v.syntax),blockquote:true,chapterSemantics:true,
     conversionPipeline:false,documentRestored:true,jsErrors:errors.length}));
  }finally{await browser.close()}
 }
 assert.deepEqual(readFileSync(docFile),bytes,'test modified disk Markdown');
}finally{server.kill('SIGTERM');unlinkSync(docFile)}
