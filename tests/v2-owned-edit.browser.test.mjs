/** WP23E actual V2 Frame + CM6 + AG + real isolated SQLite business API.
 * F02 auth/probe are stubbed, and the Python bridge routes only a test temp
 * directory. No user DB, no gateway, no real PDF required by this text test.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makePDF} from './v2-pdf-fixture.mjs';
const structureMode=process.env.V2_TEST_OWNED_STRUCTURE==='1';
const port=5431,url='http://127.0.0.1:'+port+'/labs/lab-ocr-v2/';
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr-v2/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
const py=(code,folder,input={})=>JSON.parse(execFileSync('python3',['-c',
 'import sys,json\nfrom pathlib import Path\nsys.path.insert(0,"tests")\nfrom test_v2_owned_edit import *\nfolder=Path(sys.argv[1])\nargs=json.load(sys.stdin)\n'+code,folder],
 {input:JSON.stringify(input),encoding:'utf8',maxBuffer:32*1024*1024}));
const api=(folder,op,method,payload={},query={})=>py(
 'try:\n result=base.dispatch(args["op"],args["method"],folder,args["payload"],args["query"],Stub())\n print(json.dumps({"status":200,"body":result},ensure_ascii=False))\nexcept base.BaseError as e:\n print(json.dumps({"status":e.status,"body":{"error":str(e)}},ensure_ascii=False))',
 folder,{op,method,payload,query});
try{
 for(let i=0;i<100;i++){
   try{if((await fetch(url)).ok)break;}catch{}
   if(i===99)throw Error('Vite startup failed '+log);
   await sleep(200);
 }
 for(const [name,browserType] of [['chromium',chromium],['webkit',webkit]]){
  const folder=mkdtempSync(join(tmpdir(),'wp23e-browser-'));
  const browser=await browserType.launch({headless:true});
  try{
   const initial=py('print(json.dumps(prepare_owned_book(folder),ensure_ascii=False))',folder);
   const projection=structureMode?api(folder,'pdf-map','GET').body:null;
   const pdfBytes=projection?makePDF(projection.pageSizes):null;
   const page=await browser.newPage({viewport:name==='webkit'?{width:834,height:1112}:{width:1280,height:850},
    hasTouch:true,...(name==='webkit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));
   if(structureMode)await page.addInitScript(()=>{
     window.__wp23fStatuses=[];
     document.addEventListener('v2-pdf-status',e=>window.__wp23fStatuses.push(e.detail?.text));
   });
   await page.addInitScript(path=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',
     JSON.stringify({settings:{
      'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
      'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:path,range:{kind:'server-directory'}}
     }})),folder);
   const fulfill=(route,body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>fulfill(r,{allowedRoots:[folder]}));
   await page.route('**/labs/lab-frame/api/workspace-io/probe',r=>fulfill(r,{verified:true,readable:true,writable:true}));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>fulfill(r,{authorized:true}));
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',async route=>{
     const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
     if(op==='pdf')return structureMode?route.fulfill({status:200,contentType:'application/pdf',body:pdfBytes}):fulfill(route,{error:'No PDF in disposable fixture'},404);
     const payload=req.method()==='POST'?req.postDataJSON():{};
     if(req.method()==='POST'){
       if(structureMode)assert(['md-commit','structure-commit'].includes(op));
       else assert.equal(op,'md-commit');
       assert.equal(payload.confirm,op==='structure-commit'?'commit-v2-owned-structure':'commit-v2-owned-md');
       assert.equal(payload.expectedStructure.length,267);
       writes.push(structureMode?{op,payload}:payload.changes);
     }
     const query={};for(const [k,v] of u.searchParams)query[k]=[v];
     const result=api(folder,op,req.method(),payload,query);
     return fulfill(route,result.body,result.status);
   });
   const loadPage=async()=>{
     await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:logical_block"]'),null,{timeout:20000});
     await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
       select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
     });
     await page.waitForFunction(()=>{const p=document.querySelector('#workspace #editor')?.v2SourcePort;
       return p?.getState().loaded&&p.getState().ownedLF&&p.getBlocks().length===267&&
        document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===12;},null,{timeout:30000});
   };
   await loadPage();
   const source=page.locator('#workspace #editor');
   const snapshot=()=>source.evaluate(el=>{
     const p=el.v2SourcePort,doc=p.getMarkdown(),intervals=p.getIntervals(),rows=p.getBlocks();
     let at=0;const complete=intervals.every((r,i)=>{const ok=r.from===at&&r.to>r.from&&
       doc.slice(r.from,r.to)===rows[i].markdownText&&!Object.hasOwn(r,'groupEndPad');at=r.to;return ok;})&&at===doc.length;
     return {doc,rows,intervals,complete,state:p.getState(),head:p.getEditorView().state.selection.main.head};
   });
   const before=await snapshot();
   assert(before.complete);assert.equal(before.doc,initial.markdown);
   if(structureMode){
     const parent=before.rows[0],child=before.rows[1];
     assert.equal(parent.logicalId,23);assert.equal(child.logicalId,24);
     const pdf=page.locator('#workspace .ocr-preview-pdf-host');
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:20000});
     const geometry=()=>pdf.evaluate(el=>el.v2PDFPort.getCovers().map(c=>[c.logicalId,c.physicalPageIndex,c.bbox]).sort((a,b)=>a[0]-b[0]));
     const originalGeometry=await geometry();
     const sourceTag=page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]').first();
     await sourceTag.waitFor({state:'visible',timeout:15000});
     await sourceTag.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
     await sleep(250);
     const points=await page.evaluate(()=>{
       const center=node=>{const r=node.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};};
       const from=center(document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]'));
       const to=center(document.querySelector('#workspace .lab-ocr-pdf-overlay-box[data-block-ids="23"]'));
       return {from,to};
     });
     await page.mouse.move(points.from.x,points.from.y);await page.mouse.down();await sleep(460);
     // The middle third of the original target cover is V1's child slot.
     // Release directly at that verified point, not at a stale floating
     // menu rectangle while PDF edge auto-scroll is active.
     await page.mouse.move(points.to.x,points.to.y);
     const drop=await page.evaluate(()=>({
       guide:document.querySelector('.lab-ocr-pdf-drop-guide')?.dataset.blockId,
       placement:document.querySelector('.lab-ocr-pdf-drop-guide')?.dataset.placement,
     }));
     assert.deepEqual(drop,{guide:'23',placement:'child'},'actual V1 child slot must be selected before release');
     await page.mouse.up();
     const saveStructure=async()=>{
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty,null,{timeout:10000});
       const now=await snapshot();assert(now.complete);
       const disk=api(folder,'markdown','GET').body;
       assert.equal(disk.markdown,now.doc);
       assert.deepEqual(disk.segments.map(r=>[r.logicalId,r.p,r.b,r.s,r.parentId]),
         now.rows.map(r=>[r.logicalId,r.p,r.b,r.s,r.parentId]));
       assert.deepEqual(await geometry(),originalGeometry);
       return now;
     };
     try{await page.waitForFunction(()=>document.querySelector('#workspace #editor').v2SourcePort.getBlocks().find(r=>r.logicalId===24).s===1,null,{timeout:8000});}
     catch(e){console.log('WP23F_GESTURE_FAIL',name,await page.evaluate(()=>({
       statuses:window.__wp23fStatuses.slice(-20),
       structure:document.querySelector('#workspace #editor').v2SourcePort.getStructureRows().slice(0,6),
       statusText:document.querySelector('#status')?.textContent,
     })),errors,writes.map(w=>w.op));throw e;}
     const merged=await saveStructure();
     assert.equal(merged.rows[0].markdownText,parent.markdownText.replace(/\n+$/,'\n'));
     assert.equal(merged.rows[1].parentId,23);
     assert.equal(merged.rows[1].markdownText,child.markdownText);
     assert.deepEqual(merged.rows.slice(2),before.rows.slice(2));
     assert.equal(writes.length,1);assert.equal(writes[0].op,'structure-commit');
     assert.equal(writes[0].payload.textChanges.length,1);
     await source.evaluate(el=>el.v2SourcePort.undo());
     const undone=await saveStructure();assert.deepEqual(undone.rows,before.rows);
     await source.evaluate(el=>el.v2SourcePort.redo());
     const redone=await saveStructure();assert.deepEqual(redone.rows,merged.rows);
     assert.equal(writes.length,3);
     // Manually add an internal blank to the already merged group.
     await source.evaluate(el=>{
       const p=el.v2SourcePort,r=p.getIntervals().find(r=>r.logicalId===23);
       p.getEditorView().dispatch({changes:{from:r.to-1,insert:'\n'},userEvent:'input'});
     });
     const authored=await saveStructure();assert.equal(authored.rows[0].markdownText,merged.rows[0].markdownText+'\n');
     assert.equal(writes.at(-1).op,'md-commit');
     // Existing root + child move together; internal authored LF preserved.
     await source.evaluate(el=>{
       const p=el.v2SourcePort,rows=p.getBlocks();
       const dst=rows.find(r=>r.s===0&&r.logicalId!==23&&r.p===rows[0].p);
       p.applyDrag({sourceBlockId:23,targetBlockId:dst.logicalId,placement:'after'});
     });
     const moved=await saveStructure();
     assert.equal(moved.rows.find(r=>r.logicalId===23).markdownText,authored.rows[0].markdownText);
     await source.evaluate(el=>el.v2SourcePort.undo());
     const restored=await saveStructure();assert.deepEqual(restored.rows,authored.rows);
     await loadPage();
     assert.deepEqual((await snapshot()).rows,authored.rows);
     assert.deepEqual(errors,[]);
     console.log('WP23F_REAL_PDF_SQL_PASS',name,writes.length,'atomic/delta commits and reopen');
     continue;
   }
   const target=before.rows[1],id=target.logicalId;
   const save=async expected=>{
     await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty,null,{timeout:10000});
     const now=await snapshot();assert(now.complete);
     assert.equal(now.rows[1].markdownText,expected);
     assert.deepEqual(now.rows.filter(r=>r.logicalId!==id),before.rows.filter(r=>r.logicalId!==id),'all other logical texts and identities unchanged');
     const disk=api(folder,'markdown','GET').body;
     assert.equal(disk.markdown,now.doc);assert.equal(disk.schema,'v2-logical-md/v3');
     return now;
   };
   // Real keyboard insertion in the final editable empty line, not a synthetic row.
   await source.evaluate((el,id)=>{
     const p=el.v2SourcePort,r=p.getIntervals().find(r=>r.logicalId===id);
     p.locateLogicalId(id);
     p.getEditorView().dispatch({selection:{anchor:r.to-1}});
     p.getEditorView().focus();
   },id);
   await page.keyboard.insertText('## Added heading');
   const expected=target.markdownText.slice(0,-1)+'## Added heading\n\n';
   let current=await save(expected);
   assert.equal(current.head,current.intervals[1].to-2,'caret remains before real LF repair');
   assert.equal(writes.length,1);assert.deepEqual(writes[0].map(c=>c.logicalId),[id]);
   // Native Enter and multi-line paste, grouped into a native history step.
   await page.keyboard.press('Enter');
   await source.evaluate(el=>{
     const view=el.v2SourcePort.getEditorView(),pos=view.state.selection.main.head;
     view.dispatch({changes:{from:pos,insert:'Line 😀\n\nMore'},selection:{anchor:pos+'Line 😀\n\nMore'.length},userEvent:'input.paste'});
   });
   const pasted=target.markdownText.slice(0,-1)+'## Added heading\nLine 😀\n\nMore\n\n';
   await save(pasted);
   // Undo then redo each native history event; force an idle save after them.
   await source.evaluate(el=>el.v2SourcePort.undo());
   const afterUndo=await snapshot();
   assert(afterUndo.complete);assert.notEqual(afterUndo.rows[1].markdownText,pasted);
   await save(afterUndo.rows[1].markdownText);
   await source.evaluate(el=>el.v2SourcePort.redo());
   await save(pasted);
   // Delete text only (not a logical identity) on one of the inner lines.
   await source.evaluate((el,id)=>{
     const p=el.v2SourcePort,r=p.getIntervals().find(x=>x.logicalId===id);
     const pos=r.from+p.getBlocks().find(x=>x.logicalId===id).markdownText.indexOf('More');
     p.getEditorView().dispatch({changes:{from:pos,to:pos+4,insert:''},userEvent:'delete'});
   },id);
   const deleted=pasted.replace('More','');
   await save(deleted);
   // Mandatory minimum real trailing LF is retained even when selected for removal.
   await source.evaluate((el,id)=>{
     const p=el.v2SourcePort,r=p.getIntervals().find(x=>x.logicalId===id);
     p.getEditorView().dispatch({changes:{from:r.to-2,to:r.to,insert:''},userEvent:'delete'});
   },id);
   const trimmed=deleted.replace(/\n+$/,'\n\n');
   await save(trimmed);
   // Cross-block deletion cannot implicitly remove or merge identities.
   const checkpoint=await snapshot();
   await source.evaluate((el,id)=>{
     const p=el.v2SourcePort,r=p.getIntervals().find(x=>x.logicalId===id);
     p.getEditorView().dispatch({changes:{from:r.to-1,to:r.to+1,insert:''},userEvent:'delete'});
   },id);
   assert.equal((await snapshot()).doc,checkpoint.doc);
   // Verify PDF native text command remains a local text operation using
   // the existing API (provided text, no actual PDF fixture here).
   await source.evaluate((el,id)=>{const p=el.v2SourcePort;p.locateLogicalId(id);
      p.insertPdfText({blockId:id,text:'PDF sample',mode:'insert'});},id);
   await save('PDF sample'+trimmed);
   await source.evaluate(el=>el.v2SourcePort.undo());
   await save(trimmed);
   // Reload the actual persisted snapshot through existing navigation.
   await loadPage();
   assert.equal((await snapshot()).doc,checkpoint.doc);
   assert.deepEqual(errors,[]);
   console.log('WP23E_REAL_EDITOR_SQL_PASS',name,'267 blocks',writes.length,'real SQLite delta commits / reopen');
  }finally{await browser.close();rmSync(folder,{recursive:true,force:true});}
 }
}finally{server.kill();}
