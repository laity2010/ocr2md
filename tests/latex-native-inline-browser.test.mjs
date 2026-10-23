/** Regression: real 765 legacy annotation -> HTML-comment $...$ using CM6.
 * No calls to the production editing endpoint; source read only as fixture.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers,planNormalizeReviewedInline} from '../ui/latex-review-markers.js';
const source=readFileSync('.v6/workspace/buffetts-alpha.minerujson.md','utf8');
const originalLine=source.split('\n')[764];
assert(originalLine.startsWith('where<!--ocr2md:latex '));
const rows=findLatex(source).map(r=>({...r,raw:source.slice(r.from,r.to)}));
findReviewMarkers(source,rows);
assert.equal(rows.filter(r=>r.status==='latex').length,8);
const operations=planNormalizeReviewedInline(source,rows);
assert.equal(operations.filter(op=>op.tag==='ocr2md:latex').length,2);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5467','--strictPort'],{stdio:'ignore'});
const url='http://127.0.0.1:5467/';
try{
  let ready=false;for(let i=0;i<150;i++){try{if((await fetch(url)).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,120))}
  assert(ready,'Vite unavailable');
  for (const [name,engine,opts] of [['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}]]){
    const browser=await engine.launch({headless:true,...opts});
    try{
      const page=await browser.newPage();
      await page.goto(url,{waitUntil:'domcontentloaded'});
      const result=await page.evaluate(async({original})=>{
        const {CMDocument}=await import('/cm-document.js');
        const {history,undo,redo}=await import('/@id/@codemirror/commands');
        const {findLatex}=await import('/latex-scan.js');
        const {findReviewMarkers,planNormalizeReviewedInline,planReviewAnnotations}=await import('/latex-review-markers.js');
        const {renderMarkdown}=await import('/markdown-preview.js');
        const host=document.createElement('div');document.body.append(host);
        const cm=new CMDocument({parent:host,markdown:original,extensions:[history()]});
        try{
          const formulas=findLatex(original).map(r=>({...r,raw:original.slice(r.from,r.to)}));
          findReviewMarkers(original,formulas,cm.readAnnotations());
          const edits=planNormalizeReviewedInline(original,formulas);
          cm.editAnnotations(edits,{expectedSource:original});
          const changed=cm.markdown;
          const preview=renderMarkdown(changed);
          const undoOk=undo(cm.view)&&cm.markdown===original;
          const redoOk=redo(cm.view)&&cm.markdown===changed;
          const revisions=findLatex(cm.markdown).map(r=>({...r,raw:cm.markdown.slice(r.from,r.to)}));
          findReviewMarkers(cm.markdown,revisions,cm.readAnnotations());
          const first=revisions.find(r=>r.status==='latex'&&r.kind==='行内');
          cm.editAnnotations(planReviewAnnotations(cm.markdown,first,'忽略'),{expectedSource:cm.markdown});
          const ignoreOk=!cm.markdown.split('\n')[764].split('is total assets')[0].includes('$');
          const ignoring=findLatex(cm.markdown).map(r=>({...r,raw:cm.markdown.slice(r.from,r.to)}));
          findReviewMarkers(cm.markdown,ignoring,cm.readAnnotations());
          const ignored=ignoring.find(r=>r.kind==='行内'&&r.status==='忽略');
          if(ignored)cm.editAnnotations(planReviewAnnotations(cm.markdown,ignored,'latex'),{expectedSource:cm.markdown});
          const restoredOk=cm.markdown.split('\n')[764].includes('$\\mathsf');
          const line=changed.split('\n')[764];
          const undoable=changed!==original;
          const annotations=cm.readAnnotations({tag:'ocr2md:latex'});
          return {line,changed,undoable,undoOk,redoOk,ignoreOk,restoredOk,
            previewKaTeX:preview.includes('ocr-reviewed-inline-latex')&&!preview.includes('ocr-reviewed-inline-error'),
            annotations:annotations.map(a=>a.attributes)};
        } finally {cm.destroy();host.remove();}
      },{original:source});
      assert(result.undoable);
      assert(result.undoOk&&result.redoOk&&result.ignoreOk&&result.restoredOk&&result.previewKaTeX,
        name+' undo/review/preview '+JSON.stringify({undoOk:result.undoOk,redoOk:result.redoOk,ignoreOk:result.ignoreOk,restoredOk:result.restoredOk,previewKaTeX:result.previewKaTeX}));
      assert.match(result.line,/^where <!--ocr2md:latex id="188702e91c0d468f" review="latex" delimited="auto-inline" padBefore="1" padAfter="1"-->\$\\mathsf/);
      assert.match(result.line,/\$<!--\/ocr2md:latex id="188702e91c0d468f"--> is total assets/);
      const revised=findLatex(result.changed).map(r=>({...r,raw:result.changed.slice(r.from,r.to)}));
      findReviewMarkers(result.changed,revised);
      assert.equal(revised.filter(r=>r.status==='latex').length,8);
      assert.equal(revised.length,42);
      assert.equal(planNormalizeReviewedInline(result.changed,revised).length,0,'idempotent');
      const previous=rows.filter(r=>r.status==='latex'&&r.kind==='行内').map(r=>r.content);
      assert.deepEqual(revised.filter(r=>r.status==='latex'&&r.kind==='行内').map(r=>r.content),previous);
      console.log('LATEX_NATIVE_INLINE_PASS',name,JSON.stringify({line765:result.line.slice(0,220),latexCount:8,formulas:42}));
    }finally{await browser.close()}
  }
}finally{server.kill('SIGTERM')}
