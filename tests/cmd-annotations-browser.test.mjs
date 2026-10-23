/** Generic CMD comment annotation interface: real CM6 state, isolated fixture. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import {homedir} from 'node:os';
import {scanAnnotations,parseAnnotation,formatAnnotation} from '../ui/cmd-annotations.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const original='Intro\n> <!-- ocr2md:chapter:v1 id="h01" independent="1" -->\n> # Chapter\nProse <!--ocr2md:latex id=abc review=latex-->$x$ after.\n<!-- minerujson:test:v1\n<!--cdm:fake id="hidden"-->\n-->\nFinal';
assert.equal(scanAnnotations(original).some(x=>x.tag==='cdm:fake'),false,'do not scan comments inside evidence');
assert.equal(scanAnnotations(original).filter(x=>x.tag.startsWith('ocr2md:')).length,2);
assert.equal(parseAnnotation('<!-- note -->'),null);
assert.equal(parseAnnotation('<!--cdm:v1 id="one" id="two"-->'),null);
assert.equal(parseAnnotation('<!--cdm:v1 weird stuff-->'),null);
assert.equal(parseAnnotation('<!--cdm:v1 id="abc" data="x" -->')?.attributes.id,'abc');
assert.throws(()=>formatAnnotation('cdm:v1',{key:'line\nbreak'}));
assert.throws(()=>formatAnnotation('cdm:v1',{'bad key':'x'}));
const encoded=formatAnnotation('cdm:v1',{id:10,review:'已核实',error:'a--b & "x" <y>'});
assert.deepEqual(parseAnnotation(encoded)?.attributes,{id:'10',review:'已核实',error:'a--b & "x" <y>'});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5465','--strictPort'],{stdio:'ignore'});
const url='http://127.0.0.1:5465/';
try{
 let ready=false;
 for(let i=0;i<150;i++){try{if((await fetch(url)).ok){ready=true;break}}catch{}await sleep(130)}
 assert(ready,'isolated Vite unavailable');
 for(const [name,engine,launch] of [
   ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
   ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]]){
   const browser=await engine.launch({headless:true,...launch});
   try{
     const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
     await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
     const result=await page.evaluate(async initial=>{
       const {CMDocument}=await import('/cm-document.js');
       const host=document.createElement('div');host.style.height='160px';
       document.body.append(host);
       const cm=new CMDocument({parent:host,markdown:initial});
       try{
         const chapters=cm.readAnnotations({tag:'ocr2md:chapter:v1'});
         const latex=cm.readAnnotations({tag:'ocr2md:latex',attributes:{review:'latex'}})[0];
         const untouched=cm.getMarkdown();
         let blocked=false;
         try{cm.writeAnnotation({tag:'cdm:v1',attributes:{id:'bad'},at:cm.markdown.indexOf('hidden')})}catch{blocked=true}
         const at=cm.markdown.indexOf('$x$');
         const annotation=cm.writeAnnotation({tag:'cdm:v1',attributes:{id:'e01',error:'ocr--bad'},at});
         const inline=cm.markdown.slice(annotation.to,annotation.to+3)==='$x$';
         const filtered=cm.readAnnotations({tag:'cdm:v1',attributes:{error:'ocr--bad'}});
         const updated=cm.writeAnnotation({tag:'cdm:v1',attributes:{id:'e01',error:'none',review:'通过'},target:annotation});
         const insideQuote=chapters[0].line===2&&chapters[0].from===initial.indexOf('<!-- ocr2md:chapter');
         let staleBlocked=false;
         try{cm.removeAnnotation(annotation)}catch{staleBlocked=true}
         cm.removeAnnotation(updated);
         const sourceRestored=cm.markdown===untouched;
         // Ordinary paragraphs and quote prefixes are untouched by all writes.
         const neighbors=cm.markdown.includes('> # Chapter')&&cm.markdown.includes('Prose <!--ocr2md:latex');
         // No owned secondary document or attributes storage: source must have changed during insert.
         const revision=cm.doc.length;
         return {readChapter:chapters.length===1,readLatex:Boolean(latex)&&latex.attributes.id==='abc',
           blocked,inline,filtered:filtered.length===1,updated:updated.attributes.review==='通过',
           insideQuote,staleBlocked,sourceRestored,neighbors,revision};
       }finally{cm.destroy();host.remove()}
     },original);
     assert(result.readChapter&&result.readLatex&&result.blocked&&result.inline&&result.filtered&&
       result.updated&&result.insideQuote&&result.staleBlocked&&result.sourceRestored&&result.neighbors,
       `${name} CMD contract failed: ${JSON.stringify(result)}`);
     assert.deepEqual(errors,[],name+' page exceptions');
     console.log('CMD_ANNOTATIONS_PASS',name,JSON.stringify(result));
   }finally{await browser.close()}
 }
}finally{server.kill('SIGTERM')}
