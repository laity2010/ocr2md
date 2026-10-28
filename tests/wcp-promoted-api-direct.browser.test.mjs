/** Direct promoted Main cross-module API contracts, isolated mother Markdown.
 * The test calls the actual exported functions, not a proxy or mock implementation.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const dir=mkdtempSync(join(tmpdir(),'ocr2md-api-boundary-'));
const source=join(dir,'document.md'),settings=join(dir,'settings.json');
writeFileSync(source,fixture);writeFileSync(settings,'{"settings":{}}\n');
const port=5983,origin=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 cwd:process.cwd(),env:{...process.env,V6_LAB_ID:'',V6_DOCUMENT_PATH:source,V6_SETTINGS_PATH:settings},stdio:'ignore'});
try{
 let ready=false;
 for(let n=0;n<150;n++){
  try{if((await fetch(origin)).ok){ready=true;break}}catch{}
  await new Promise(r=>setTimeout(r,120));
 }
 assert(ready,'Isolated Vite server did not start');
 for(const [name,engine] of [['Chrome',chromium],['WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1280,height:800}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
   await page.goto(origin,{waitUntil:'domcontentloaded',timeout:60000});
   await page.waitForFunction(()=>window.__v6cm6?.outline?.rows?.length===21 &&
      document.querySelector('.ocr-lab-ag-toolbar') && document.querySelector('.ocr-lab-file-toolbar'),
    null,{timeout:50000});
   const result=await page.evaluate(async()=>{
    const {createWCPRuntime}=await import('/wcp-wcp-virtual-chapters.js');
    const {persistLabWorkspaceLayout}=await import('/wcp-layout-persistence.js');
    const {createCMDTransactionPort}=await import('/wcp-cmd-element-transactions.js');
    const {chapterPreviewRange,renderVirtualMarkdown}=await import('/wcp-md-virtual-preview.js');
    const {chapterAssignments}=await import('/wcp-chapter-files.js');
    const {createIndexProjector}=await import('/wcp-document-index.js');
    const {virtualChapterExtensions,setVirtualChapter,currentVirtualChapter}=await import('/wcp-cm-virtual-view.js');
    const {mountAgModuleToolbar}=await import('/wcp-ag-module-toolbar.js');
    const {createSourceFileNavigation}=await import('/wcp-source-file-navigation.js');
    // Fixture source is immutable except for a disposable editor below.
    const wcpRuntime=createWCPRuntime();
    const wcpHooksOk=Object.isFrozen(wcpRuntime) && wcpRuntime.editorExtensions.length===4 &&
      typeof wcpRuntime.wrapCMD==='function' && typeof wcpRuntime.onAGReady==='function' &&
      typeof wcpRuntime.onPreviewInit==='function';
    wcpRuntime.dispose();
    const markdown=window.__v6cm6.cm.markdown;
    const projector=createIndexProjector(()=>markdown);
    const index=projector.get();
    const projected=index.chapters.length===21 && projector.get()===index &&
      index.queryElements({type:'heading'}).length===21;
    const freshRows=index.chapters.map(c=>({id:c.id,title:c.title,independent:true}));
    const named=chapterAssignments(freshRows,'000');
    const namesOk=named.length===21 && named.every((c,i)=>c.file.endsWith('.cmd.chapter.md') &&
      freshRows[i].chapterFile===c.file);
    const scope=index.chapters[1];
    const piece=chapterPreviewRange(markdown,scope);
    const html=renderVirtualMarkdown(markdown,scope);
    const renderOk=piece.offsetLines>0 && html.includes('data-source-') && typeof html==='string';
    let invalidPreview=false;
    try{chapterPreviewRange(markdown,{id:'broken',from:-1,to:4});}catch{invalidPreview=true;}
    const cmdPort=createCMDTransactionPort(window.__v6cm6.cm);
    const indexOk=cmdPort.getIndex().chapters.length===21 && Object.isFrozen(cmdPort) &&
      cmdPort.queryElements({type:'heading'}).length===21;
    let unsafeRejected=false;
    try{cmdPort.replaceRanges([{from:markdown.length+10,to:markdown.length+11,insert:'BAD'}]);}
    catch{unsafeRejected=true;}
    const nav=createSourceFileNavigation();
    const navSame=createSourceFileNavigation()===nav && typeof nav.mountSettings==='function';
    const toolbarSingle=mountAgModuleToolbar()===false &&
      document.querySelectorAll('.ocr-lab-ag-toolbar').length===1;
    const key='ocr2md:lab:cm-html:workspace-divider:v1';
    sessionStorage.removeItem(key);
    let subscribed=null,stopped=false;
    const ratios={agRatio:0.3,sourceRatio:0.6};
    const disposeLayout=persistLabWorkspaceLayout({getRatios:()=>ratios,
      setRatios:()=>{throw Error('fresh storage must not restore ratios')},
      onChange:fn=>{subscribed=fn;return {dispose(){stopped=true}};}});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    subscribed?.();
    const layoutOk=typeof subscribed==='function' &&
      JSON.parse(sessionStorage.getItem(key))?.sourceRatio===0.6;
    disposeLayout();
    sessionStorage.removeItem(key);
    // CM virtual chapter public port already uses the current CM6 view.
    // Round trip only a scope effect, never a source edit.
    const originalScope=currentVirtualChapter(window.__v6cm6.cm.view.state);
    const scopeChanged=setVirtualChapter(window.__v6cm6.cm.view,scope);
    const active=currentVirtualChapter(window.__v6cm6.cm.view.state);
    const sameScopeNoop=setVirtualChapter(window.__v6cm6.cm.view,scope)===false;
    setVirtualChapter(window.__v6cm6.cm.view,originalScope);
    const cmOk=virtualChapterExtensions.length===3 && scopeChanged && active?.id===scope.id &&
      sameScopeNoop && currentVirtualChapter(window.__v6cm6.cm.view.state)===originalScope;
    return {wcpHooksOk,projected,namesOk,renderOk,invalidPreview,indexOk,unsafeRejected,
      navSame,toolbarSingle,layoutOk,stopped,cmOk,sourcePreserved:window.__v6cm6.cm.markdown===markdown};
   });
   for(const [key,value] of Object.entries(result))assert(value,`${name} ${key} direct API failed: ${JSON.stringify(result)}`);
   assert.deepEqual(errors,[],`${name} browser errors`);
   console.log('WCP_PROMOTED_API_DIRECT_PASS',name,JSON.stringify(result));
  }finally{await browser.close()}
 }
 assert.equal(readFileSync(source,'utf8'),fixture,'isolated mother Markdown modified');
}finally{server.kill('SIGTERM');rmSync(dir,{recursive:true,force:true})}
