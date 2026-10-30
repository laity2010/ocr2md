import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';
/** Frozen pre-upgrade OCR formulas -> one comment + native $ / $$.
 * Uses isolated in-browser CM6, not a writable production document.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {chromium,webkit} from 'playwright';
const original=readFileSync('tests/fixtures/latex-legacy-display.md','utf8');
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5471','--strictPort'],{stdio:'ignore'});
try{
 let ready=false;
 for(let i=0;i<125;i++){
  try{if((await fetch('http://127.0.0.1:5471/')).ok){ready=true;break}}catch{}
  await new Promise(done=>setTimeout(done,140));
 }
 assert(ready,'test Vite not ready');
 for(const [name,engine,options] of [
  ['Chrome',chromium,{executablePath:chromeExecutable()}],
  ['WebKit',webkit,{executablePath:webkitExecutable()}]]){
  const browser=await engine.launch({headless:true,...options});
  try{
    const page=await browser.newPage({viewport:{width:1140,height:740}});
    await page.goto('http://127.0.0.1:5471/',{waitUntil:'domcontentloaded'});
    const result=await page.evaluate(async source=>{
      const {CMDocument}=await import('/cm-document.js');
      const {history,undo,redo}=await import('/@id/@codemirror/commands');
      const {scanAnnotations}=await import('/cmd-annotations.js');
      const {findLatex}=await import('/latex-scan.js');
      const {findReviewMarkers,planNormalizeReviewedInline,planReviewAnnotations}=await import('/latex-review-markers.js');
      const {renderMarkdown}=await import('/markdown-preview.js');
      const host=document.createElement('div');document.body.append(host);
      const cm=new CMDocument({parent:host,markdown:source,extensions:[history()]});
      const parsed=editor=>{
        const text=editor.markdown;
        const formulas=findLatex(text).map(r=>({...r,raw:text.slice(r.from,r.to)}));
        findReviewMarkers(text,formulas,editor.readAnnotations());
        return formulas;
      };
      try{
        const before=parsed(cm);
        const contents=before.map(r=>r.content);
        const ids=before.map(r=>r.reviewMarker?.id);
        const ops=planNormalizeReviewedInline(cm.markdown,before);
        cm.editAnnotations(ops,{expectedSource:source});
        const revised=cm.markdown;
        const after=parsed(cm);
        const html=renderMarkdown(revised);
        const endCount=scanAnnotations(revised).filter(r=>r.tag==='/ocr2md:latex').length;
        const lines=revised.split('\n');
        const annotatedLines=lines.filter(l=>l.includes('<!--ocr2md:latex'));
        const oneLineStarts=[...revised.matchAll(/<!--ocr2md:latex[^>\n]+-->\${1,2}/g)];
        const allOneLine=oneLineStarts.length===8&&annotatedLines.length===7;
        const displayMath=after.filter(r=>r.kind==='独立'&&r.status==='latex'&&r.syntax==='$$');
        const lineNumbers=after.map(r=>r.line);
        const idempotent=planNormalizeReviewedInline(revised,after).length===0;
        const undoOk=undo(cm.view)&&cm.markdown===source;
        const redoOk=redo(cm.view)&&cm.markdown===revised;
        const first=parsed(cm).find(r=>r.kind==='独立'&&r.status==='latex');
        cm.editAnnotations(planReviewAnnotations(cm.markdown,first,'忽略'),{expectedSource:cm.markdown});
        const ignored=parsed(cm).find(r=>r.status==='忽略');
        const ignoreOk=ignored?.raw.startsWith(String.fromCharCode(96).repeat(3)+'math')??false;
        if(ignored)cm.editAnnotations(planReviewAnnotations(cm.markdown,ignored,'latex'),{expectedSource:cm.markdown});
        const restoreOk=parsed(cm).filter(r=>r.status==='latex').length===8;
        const fresh='\n'+String.fromCharCode(96).repeat(3)+'math\nx+y\n'+String.fromCharCode(96).repeat(3)+'\n';
        const childHost=document.createElement('div');document.body.append(childHost);
        const child=new CMDocument({parent:childHost,markdown:fresh,extensions:[history()]});
        let newSource,newUndo;
        try{
          const row=parsed(child)[0];
          child.editAnnotations(planReviewAnnotations(child.markdown,row,'latex','fedcba9876543210'),{expectedSource:fresh});
          newSource=child.markdown;
          newUndo=undo(child.view)&&child.markdown===fresh;
        }finally{child.destroy();childHost.remove();}
        const noEnd=newSource.includes('<!--ocr2md:latex')&&!newSource.includes('<!--/ocr2md:latex');
        const newLine=newSource.trim().split('\n')[0];
        return {beforeCount:before.length,afterCount:after.length,confirmed:after.filter(r=>r.status==='latex').length,
          bodySame:JSON.stringify(contents)===JSON.stringify(after.map(r=>r.content)),
          idsSame:JSON.stringify(ids)===JSON.stringify(after.map(r=>r.reviewMarker?.id)),
          endCount,allOneLine,display:displayMath.length,idempotent,undoOk,redoOk,
          previewDisplay:html.includes('katex-display'),previewInline:html.includes('ocr-reviewed-inline-latex'),
          ignoreOk,restoreOk,newUndo,noEnd,newLine,lineNumbers,rows:annotatedLines.map(l=>l.slice(0,125))};
      }finally{cm.destroy();host.remove();}
    },original);
    assert.equal(result.beforeCount,8,name+' input');
    assert.equal(result.afterCount,8,name+' output');
    assert.equal(result.confirmed,8,name+' confirmed');
    assert.equal(result.display,6,name+' standalone');
    assert(result.bodySame&&result.idsSame&&result.endCount===0&&result.allOneLine&&result.idempotent&&
      result.undoOk&&result.redoOk&&result.previewDisplay&&result.previewInline&&result.ignoreOk&&
      result.restoreOk&&result.newUndo&&result.noEnd,
      name+' failed '+JSON.stringify(result).slice(0,1800));
    assert.match(result.newLine,/^<!--ocr2md:latex[^>\n]+-->\$\$x\+y\$\$$/);
    console.log('LATEX_SINGLE_COMMENT_PASS',name,JSON.stringify({...result,rows:'(verified)',lineNumbers:'(verified)'}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
