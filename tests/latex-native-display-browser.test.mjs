/** Exact six historical standalone formulas: source-preserving $$ conversion.
 * Isolation: a frozen excerpt of the real mother Markdown with six legacy
 * standalone reviews and two inline reviews; never reads/writes user data.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {homedir} from 'node:os';
import {chromium,webkit} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers,planNormalizeReviewedInline} from '../ui/latex-review-markers.js';

const original=readFileSync('tests/fixtures/latex-legacy-display.md','utf8');
const originals=findLatex(original).map(r=>({...r,raw:original.slice(r.from,r.to)}));
findReviewMarkers(original,originals);
const legacy=originals.filter(r=>r.kind==='独立'&&r.status==='latex'&&r.raw.startsWith('```math'));
assert.equal(legacy.length,6);
const port=5468,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
try{
  let ready=false;
  for(let i=0;i<120;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await new Promise(r=>setTimeout(r,150));
  }
  assert(ready,'isolated Vite server not ready');
  for(const [name,engine,options] of [
    ['Chrome',chromium,{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}],
    ['WebKit',webkit,{executablePath:homedir()+'/Library/Caches/ms-playwright/webkit-2359/pw_run.sh'}],
  ]){
    const browser=await engine.launch({headless:true,...options});
    try{
      const page=await browser.newPage();
      await page.goto(url,{waitUntil:'domcontentloaded'});
      const result=await page.evaluate(async(source)=>{
        const {CMDocument}=await import('/cm-document.js');
        const {history,undo,redo}=await import('/@id/@codemirror/commands');
        const {findLatex}=await import('/latex-scan.js');
        const {findReviewMarkers,planNormalizeReviewedInline,planReviewAnnotations}=await import('/latex-review-markers.js');
        const {renderMarkdown}=await import('/markdown-preview.js');
        const host=document.createElement('div');document.body.append(host);
        const cm=new CMDocument({parent:host,markdown:source,extensions:[history()]});
        const annotated=()=>{
          const text=cm.markdown;
          const list=findLatex(text).map(r=>({...r,raw:text.slice(r.from,r.to)}));
          findReviewMarkers(text,list,cm.readAnnotations());
          return list;
        };
        try{
          const originalRows=annotated();
          const originalContent=originalRows.filter(r=>r.status==='latex').map(r=>r.content);
          const ops=planNormalizeReviewedInline(cm.markdown,originalRows);
          cm.editAnnotations(ops,{expectedSource:cm.markdown});
          const changed=cm.markdown;
          const convertedRows=annotated();
          const converted=convertedRows.filter(r=>r.status==='latex'&&r.kind==='独立'&&r.syntax==='$$');
          const changedLines=source.split('\n').flatMap((line,i)=>line===changed.split('\n')[i]?[]:[i+1]);
          const html=renderMarkdown(changed);
          const mapped=html.includes('data-source-start="2"')&&html.includes('katex-display');
          const undoOk=undo(cm.view)&&cm.markdown===source;
          const redoOk=redo(cm.view)&&cm.markdown===changed;
          // Re-review one converted display formula and restore its math markers.
          const first=annotated().find(r=>r.status==='latex'&&r.kind==='独立'&&r.syntax==='$$');
          cm.editAnnotations(planReviewAnnotations(cm.markdown,first,'忽略'),{expectedSource:cm.markdown});
          const ignored=annotated().find(r=>r.status==='忽略'&&r.line===first.line);
          const ignoredFence=ignored?.raw.startsWith('```math')??false;
          if(ignored)cm.editAnnotations(planReviewAnnotations(cm.markdown,ignored,'latex'),{expectedSource:cm.markdown});
          const restored=annotated().find(r=>r.status==='latex'&&r.line===first.line);
          const revertOk=restored?.syntax==='$$';
          // New annotation path (no prior marker), also one undoable transaction.
          const fixture='\n```math\nx + y\n```\n';
          const childHost=document.createElement('div');document.body.append(childHost);
          const testCM=new CMDocument({parent:childHost,markdown:fixture,extensions:[history()]});
          let newMarker, newUndo;
          try{
            const candidates=findLatex(testCM.markdown).map(r=>({...r,raw:fixture.slice(r.from,r.to)}));
            testCM.editAnnotations(planReviewAnnotations(testCM.markdown,candidates[0],'latex','fedcba9876543210'),
              {expectedSource:fixture});
            newMarker=testCM.markdown;
            newUndo=undo(testCM.view)&&testCM.markdown===fixture;
          }finally{testCM.destroy();childHost.remove();}
          return {changed,lines:changedLines,formulaCount:convertedRows.length,reviewed:convertedRows.filter(r=>r.status==='latex').length,
            display:converted.length,contentSame:JSON.stringify(convertedRows.filter(r=>r.status==='latex').map(r=>r.content))===JSON.stringify(originalContent),
            mapAndRender:mapped,undoOk,redoOk,ignoredFence,revertOk,
            newMarker,newUndo,idempotent:planNormalizeReviewedInline(changed,convertedRows).length===0};
        }finally{cm.destroy();host.remove();}
      },original);
      assert.equal(result.formulaCount,8,name);
      assert.equal(result.reviewed,8,name);
      assert.equal(result.display,6,name);
      assert(result.contentSame&&result.mapAndRender&&result.undoOk&&result.redoOk&&result.ignoredFence&&result.revertOk&&result.idempotent&&result.newUndo,
        name+' state '+JSON.stringify({...result,changed:'(omitted)',newMarker:result.newMarker.slice(0,150)}));
      assert.match(result.changed.split('\n')[1],/^\$\$$/);
      assert.match(result.changed.split('\n')[3],/^\$\$$/);
      assert.match(result.newMarker,/<!--ocr2md:latex[^\n]+-->\n\$\$\nx \+ y\n\$\$\n<!--\/ocr2md:latex/);
      assert.equal(result.changed.split('\n').length,original.split('\n').length,'no line insertion for historical conversion');
      assert.equal(result.lines.length,18,'six marker comments and twelve delimiters changed');
      console.log('LATEX_OBSIDIAN_DISPLAY_PASS',name,JSON.stringify({formulas:8,reviewed:8,converted:6,changedLines:result.lines.length,undoRedo:true,preview:true,newMark:true}));
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
