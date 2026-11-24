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
const lineEditMode=process.env.V2_TEST_LINE_EDIT==='1';
const splitMode=process.env.V2_TEST_OWNED_SPLIT==='1';
const titleMode=process.env.V2_TEST_OWNED_TITLES==='1';
const lineViewMode=process.env.V2_TEST_LINE_VIEW==='1';
const initMode=process.env.V2_TEST_FRESH_OWNED_INIT==='1';
const pdfMode=structureMode||splitMode||titleMode||initMode||lineViewMode;
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
   const initial=py(initMode?
     'make_book(folder);print(json.dumps(base.existing_markdown(folder),ensure_ascii=False))':
     'print(json.dumps(prepare_owned_book(folder),ensure_ascii=False))',folder);
   const projection=pdfMode?api(folder,'pdf-map','GET').body:null;
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
     if(op==='pdf')return pdfMode?route.fulfill({status:200,contentType:'application/pdf',body:pdfBytes}):fulfill(route,{error:'No PDF in disposable fixture'},404);
     const payload=req.method()==='POST'?req.postDataJSON():{};
     if(req.method()==='POST'&&initMode){
       assert.equal(op,'logical-rebuild');
       assert.equal(payload.confirm,'initialize-v2-owned-logical');
       writes.push({op,payload});
     }else if(req.method()==='POST'){
       if(pdfMode&&!titleMode)assert(['md-commit','structure-commit'].includes(op));
       else assert.equal(op,'md-commit');
       assert.equal(payload.confirm,op==='structure-commit'?'commit-v2-owned-structure':'commit-v2-owned-md');
       assert.equal(payload.expectedStructure.length,267);
       writes.push(pdfMode?{op,payload}:payload.changes);
     }
     const query={};for(const [k,v] of u.searchParams)query[k]=[v];
     const result=api(folder,op,req.method(),payload,query);
     return fulfill(route,result.body,result.status);
   });
   const loadPage=async(count=267,owned=true)=>{
     await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
     await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:logical_block"]'),null,{timeout:20000});
     await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
       select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
     });
     await page.waitForFunction(({count,owned})=>{const p=document.querySelector('#workspace #editor')?.v2SourcePort;
       return p?.getState().loaded&&p.getState().ownedLF===owned&&p.getBlocks().length===count&&
        document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===12;},{count,owned},{timeout:30000});
   };
   await loadPage(267,!initMode);
   const source=page.locator('#workspace #editor');
   const snapshot=()=>source.evaluate(el=>{
     const p=el.v2SourcePort,doc=p.getMarkdown(),intervals=p.getIntervals(),rows=p.getBlocks();
     let at=0;const complete=intervals.every((r,i)=>{const ok=r.from===at&&r.to>r.from&&
       doc.slice(r.from,r.to)===rows[i].markdownText&&!Object.hasOwn(r,'groupEndPad');at=r.to;return ok;})&&at===doc.length;
     return {doc,rows,intervals,complete,state:p.getState(),head:p.getEditorView().state.selection.main.head};
   });
   if(initMode){
     const before=await snapshot();
     assert(!before.state.ownedLF);
     assert(before.doc.includes('手工修改'));
     const oldPdf=api(folder,'pdf-map','GET').body;
     const pdf=page.locator('#workspace .ocr-preview-pdf-host');
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:30000});
     await page.locator('#workspace .ts-wrapper.ocr-navigation-files .ts-control').click();
     const header=page.locator('.ocr-navigation-popup-files:visible .optgroup-header').filter({hasText:/^SQL$/}).first();
     if(name==='webkit')await header.tap();else await header.click();
     const dialog=page.locator('#v2-sql-actions-dialog');
     await dialog.getByRole('button',{name:'初始化逻辑表（覆盖编辑）'}).click();
     assert.equal(writes.length,0);
     await dialog.getByRole('button',{name:'确认初始化逻辑表'}).click();
     await page.waitForFunction(()=>{
       const p=document.querySelector('#workspace #editor').v2SourcePort;
       return p.getState().ownedLF&&p.getBlocks().length===267&&
         document.querySelector('#status')?.textContent.includes('真实换行逻辑表已初始化');
     },null,{timeout:30000});
     const after=await snapshot();assert(after.complete);
     assert(!after.doc.includes('手工修改'));assert(!after.doc.includes('新标题'));
     assert.equal(after.doc,api(folder,'markdown','GET').body.markdown);
     assert.equal(writes.length,1);
     assert.deepEqual(api(folder,'pdf-map','GET').body.covers.map(r=>[r.logicalId,r.physicalPageIndex,r.bbox]),
       oldPdf.covers.map(r=>[r.logicalId,r.physicalPageIndex,r.bbox]));
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:30000});
     await loadPage();
     assert.equal((await snapshot()).doc,after.doc);
     assert.equal(writes.length,1,'reopen never resets again');
     assert.deepEqual(errors,[]);
     console.log('WP24_REAL_FRESH_INITIALIZE_PASS',name,'267 blocks, real LF, explicit backup/reset and reopen');
     continue;
   }
   const before=await snapshot();
   assert(before.complete);assert.equal(before.doc,initial.markdown);
   if(lineEditMode){
     const expectedIds=before.rows.map(r=>r.logicalId);
     const edit=async(a,b,insert)=>source.evaluate((el,{a,b,insert})=>{
       const p=el.v2SourcePort;
       p.getEditorView().dispatch({changes:{from:a,to:b,insert},selection:{anchor:a+insert.length},userEvent:'input.paste'});
     },{a,b,insert});
     const saved=async()=>{
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty,null,{timeout:15000});
       const now=await snapshot();assert(now.complete);
       assert.deepEqual(now.rows.map(r=>r.logicalId),expectedIds);
       assert.equal(api(folder,'markdown','GET').body.markdown,now.doc);
       const check=await source.evaluate(el=>{
         const p=el.v2SourcePort,idx=p.getMdLineIndex();
         return idx.rows.map(r=>r.md_line+'\n').join('')===p.getMarkdown()&&
           idx.rows.every(r=>idx.atBlockLine(r.logical_id,r.line_offset)===r);
       });
       assert(check);return now;
     };
     let pos=before.intervals[1].from;
     await edit(pos,pos,'\n');
     let now=await saved();
     assert.equal(now.rows[0].markdownText,before.rows[0].markdownText+'\n');
     assert.deepEqual(now.rows.slice(1),before.rows.slice(1));
     await source.evaluate(el=>el.v2SourcePort.undo());
     assert.deepEqual((await saved()).rows,before.rows);
     await source.evaluate(el=>el.v2SourcePort.redo());
     assert.deepEqual((await saved()).rows,now.rows);
     await source.evaluate(el=>el.v2SourcePort.undo());
     assert.deepEqual((await saved()).rows,before.rows);
     await edit(pos,pos,'新行😀\nPREFIX ');
     now=await saved();
     assert.equal(now.rows[0].markdownText,before.rows[0].markdownText+'新行😀\n\n');
     assert.equal(now.rows[1].markdownText,'PREFIX '+before.rows[1].markdownText);
     assert.deepEqual(now.rows.slice(2),before.rows.slice(2));
     await source.evaluate(el=>el.v2SourcePort.undo());
     assert.deepEqual((await saved()).rows,before.rows);
     await edit(0,before.intervals[2].from,'');
     now=await saved();
     assert.equal(now.rows[0].markdownText,'\n\n');
     assert.equal(now.rows[1].markdownText,'\n\n');
     assert.deepEqual(now.rows.slice(2),before.rows.slice(2));
     await source.evaluate(el=>el.v2SourcePort.undo());
     assert.deepEqual((await saved()).rows,before.rows);
     await edit(before.doc.length,before.doc.length,'EOF😀');
     now=await saved();
     assert.equal(now.rows.at(-1).markdownText,before.rows.at(-1).markdownText+'EOF😀\n\n');
     assert.deepEqual(now.rows.slice(0,-1),before.rows.slice(0,-1));
     await loadPage();
     assert.deepEqual((await snapshot()).rows,now.rows);
     assert.deepEqual(errors,[]);
     console.log('WP25C_REAL_LINE_EDIT_SQL_PASS',name,writes.length,'delta saves, 267 unchanged IDs, reopen');
     continue;
   }
   if(lineViewMode){
     const grid=page.locator('#workspace .ocr-outline-grid');
     const picker=page.locator('#workspace .ocr-ag-module-select');
     const pdf=page.locator('#workspace .ocr-preview-pdf-host');
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:30000});
     const read=()=>grid.evaluate(el=>el.v2BaseGridPort.getDisplayedRows());
     const cols=()=>grid.evaluate(el=>el.v2BaseGridPort.getColumns().map(c=>c.field));
     const oldColumns=await cols();
     await picker.selectOption('line');
     assert.deepEqual((await cols()).slice(0,6),['md_line','pbs','line_offset','source_line','block_type','line_type']);
     assert((await read()).every(r=>r.p===before.rows[0].p));
     await page.getByRole('checkbox',{name:'全部逻辑块'}).check();
     const all=await read();
     const expected=await source.evaluate(el=>el.v2SourcePort.getMdLineIndex().rows);
     assert.deepEqual(all,expected);assert.equal(all.length,497);
     assert.equal(await grid.evaluate(el=>{
       const p=document.querySelector('#workspace #editor').v2SourcePort;
       return el.v2BaseGridPort.getDisplayedRows().every(r=>p.getMdLineIndex().atSourceLine(r.source_line)===r);
     }),true);
     await grid.evaluate(el=>el.v2BaseGridPort.setFilterModel({line_type:{values:['blank','title']}}));
     assert.deepEqual((await read()).map(r=>r.source_line),all.filter(r=>['blank','title'].includes(r.line_type)).map(r=>r.source_line));
     await grid.evaluate(el=>el.v2BaseGridPort.setFilterModel(null));
     const click=async line=>{
       const cell=grid.locator('.ag-center-cols-container .ag-row').filter({has:grid.locator('[col-id="source_line"]').getByText(String(line),{exact:true})});
       // Native focusRow brings the intended row into the virtual viewport.
       await grid.evaluate((el,line)=>el.v2BaseGridPort.focusRow('source_line',line),line);
       const row=grid.locator('.ag-row.v2-sync-ag-row [col-id="md_line"]').first();
       await row.click();
       assert.equal(await source.evaluate(el=>el.v2SourcePort.getEditorView().state.doc.lineAt(el.v2SourcePort.getEditorView().state.selection.main.head).number),line);
     };
     await click(3);
     await source.evaluate(el=>{
       const p=el.v2SourcePort,v=p.getEditorView();v.dispatch({selection:{anchor:v.state.doc.line(1).from}});
     });
     await page.waitForFunction(()=>document.querySelector('.ag-row.v2-sync-ag-row [col-id="source_line"]')?.textContent==='1');
     assert.equal(await pdf.evaluate(el=>el.v2PDFPort.getState().selectedId),23);
     const focusBefore=await source.evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head);
     await grid.evaluate(el=>{const viewport=el.querySelector('.ag-body-viewport');if(viewport)viewport.scrollTop+=120;});
     assert.equal(await source.evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head),focusBefore);
     await picker.selectOption('frame');assert.deepEqual(await cols(),oldColumns);
     assert.equal((await read()).length,267);
     await picker.selectOption('line');assert.deepEqual(await read(),all);
     assert.deepEqual((await snapshot()).rows,before.rows);assert.equal(writes.length,0);
     assert.deepEqual(errors,[]);
     console.log('WP25E_REAL_AG_LINE_VIEW_PASS',name,all.length,'shared rows, native filter, exact line focus, no writes');
     continue;
   }
   if(titleMode){
     const grid=page.locator('#workspace .ocr-outline-grid');
     const picker=page.locator('#workspace .ocr-ag-module-select');
     const pdf=page.locator('#workspace .ocr-preview-pdf-host');
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:30000});
     const geometry=()=>pdf.evaluate(el=>el.v2PDFPort.getCovers().map(c=>[c.logicalId,c.physicalPageIndex,c.bbox]).sort((a,b)=>a[0]-b[0]));
     const originalGeometry=await geometry();
     const target=before.rows[1],id=target.logicalId;
     assert.equal(id,24);
     const readRows=()=>grid.evaluate(el=>el.v2BaseGridPort.getDisplayedRows());
     const find=async()=> (await readRows()).find(r=>r.logical_id===id);
     await page.getByRole('checkbox',{name:'全部逻辑块'}).check();
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-outline-grid').v2BaseGridPort.getDisplayedRows().length===267);
     await grid.evaluate((el,id)=>{window.__wp23hRow=el.v2BaseGridPort.getDisplayedRows().find(r=>r.logical_id===id);},id);
     await picker.selectOption('title');
     const row=await find();assert(row);
     assert.equal(row.block_type,'title');
     assert.equal(row.md_block,target.markdownText);
     assert.equal(row.source_line,8);
     assert.deepEqual(JSON.parse(row.heading_lines),[{line:8,text:'# 新标题'}]);
     assert.equal(await grid.evaluate((el,id)=>el.v2BaseGridPort.getDisplayedRows().find(r=>r.logical_id===id)===window.__wp23hRow,id),true,'same shared AG row on switching presets');
     assert.deepEqual(await grid.evaluate(el=>el.v2BaseGridPort.getFilterModel()),{block_type:{values:['title']}});
     assert.deepEqual(await grid.evaluate(el=>el.v2BaseGridPort.getColumns().slice(0,4).map(c=>c.field)),['md_block','pbs','source_line','block_type']);
     const edit=async(from,to,insert)=>{
       await source.evaluate((el,{id,from,to,insert})=>{
         const p=el.v2SourcePort,r=p.getIntervals().find(x=>x.logicalId===id);
         p.getEditorView().dispatch({changes:{from:r.from+from,to:r.from+to,insert},userEvent:'input.type'});
       },{id,from,to,insert});
     };
     const save=async()=>{
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty,null,{timeout:15000});
       const now=await snapshot();assert(now.complete);assert.equal(now.rows.length,267);
       assert.deepEqual(now.rows.filter(r=>r.logicalId!==id),before.rows.filter(r=>r.logicalId!==id));
       const disk=api(folder,'markdown','GET').body;
       assert.equal(disk.markdown,now.doc);
       assert.deepEqual(disk.segments.map(r=>[r.logicalId,r.baseBlockId,r.p,r.b,r.s,r.parentId,r.blockType]),
         before.rows.map(r=>[r.logicalId,r.baseBlockId,r.p,r.b,r.s,r.parentId,r.blockType]));
       assert.deepEqual(await geometry(),originalGeometry);
       return now;
     };
     // Insert at actual empty line; the last blank remains part of this row.
     const pos=target.markdownText.length-1;
     await source.evaluate((el,{id,pos})=>{
       const p=el.v2SourcePort,r=p.getIntervals().find(x=>x.logicalId===id);
       p.getEditorView().dispatch({selection:{anchor:r.from+pos}});p.getEditorView().focus();
     },{id,pos});
     await page.keyboard.insertText('## Added heading');
     let multi=await find();
     assert.deepEqual(JSON.parse(multi.heading_lines),[{line:8,text:'# 新标题'},{line:10,text:'## Added heading'}]);
     const withTwo=await save();
     const first=grid.locator('.ocr-ag-title-source[data-v2-title-line="8"]').filter({hasText:'# 新标题'});
     const second=grid.locator('.ocr-ag-title-source[data-v2-title-line="10"]').filter({hasText:'## Added heading'});
     await first.waitFor({state:'visible'});await second.waitFor({state:'visible'});
     assert.equal(await first.evaluate(el=>getComputedStyle(el).color),'rgb(218, 99, 98)');
     assert.equal(await second.evaluate(el=>getComputedStyle(el).color),'rgb(215, 127, 72)');
     assert.equal(await second.evaluate(el=>getComputedStyle(el).fontSize),'16px');
     const bounds1=await first.boundingBox(),bounds2=await second.boundingBox();
     assert(bounds2.y>=bounds1.y+bounds1.height-1,'two headings rendered in distinct visual lines of a single cell');
     await second.click();
     await page.waitForFunction(()=>{const p=document.querySelector('#workspace #editor').v2SourcePort,v=p.getEditorView();
       return v.state.doc.lineAt(v.state.selection.main.head).number===10;});
     assert.equal(await pdf.evaluate(el=>el.v2PDFPort.getState().selectedId),id);
     await first.click();
     await page.waitForFunction(()=>{const p=document.querySelector('#workspace #editor').v2SourcePort,v=p.getEditorView();
       return v.state.doc.lineAt(v.state.selection.main.head).number===8;});
     // Remove first prefix; the shared row persists with the second title.
     let current=withTwo.rows[1].markdownText;
     let prefix=current.indexOf('# 新标题');
     await edit(prefix,prefix+2,'');
     assert.deepEqual(JSON.parse((await find()).heading_lines),[{line:10,text:'## Added heading'}]);
     current=(await save()).rows[1].markdownText;
     prefix=current.indexOf('## Added heading');
     await edit(prefix,prefix+3,'');
     assert.equal(await find(),undefined,'removing last title immediately removes the shared row');
     await save();
     await source.evaluate(el=>el.v2SourcePort.undo());
     assert.equal(JSON.parse((await find()).heading_lines)[0].line,10);
     await save();
     await source.evaluate(el=>el.v2SourcePort.undo());
     assert.equal(JSON.parse((await find()).heading_lines).length,2);
     await save();
     await source.evaluate(el=>el.v2SourcePort.redo());
     assert.equal(JSON.parse((await find()).heading_lines).length,1);
     await save();
     await source.evaluate(el=>el.v2SourcePort.undo());
     const restored=await save();assert.deepEqual(restored.rows,withTwo.rows);
     // Reopen the actual persisted source, then reapply only the native preset.
     await loadPage();
     await page.getByRole('checkbox',{name:'全部逻辑块'}).check();
     await picker.selectOption('title');
     assert.deepEqual(JSON.parse((await find()).heading_lines),[{line:8,text:'# 新标题'},{line:10,text:'## Added heading'}]);
     assert.equal(writes.length,7);
     assert(writes.every(w=>w.op==='md-commit'&&w.payload.changes.length===1&&w.payload.changes[0].logicalId===id));
     assert.deepEqual(errors,[]);
     console.log('WP23H_REAL_OWNED_TITLES_PASS',name,'same 267 rows, exact multiline clicks, 7 delta saves and reopen');
     continue;
   }
   if(splitMode){
     const pdf=page.locator('#workspace .ocr-preview-pdf-host');
     await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:30000});
     const geometry=()=>pdf.evaluate(el=>el.v2PDFPort.getCovers().map(c=>[c.logicalId,c.physicalPageIndex,c.bbox]).sort((a,b)=>a[0]-b[0]));
     const oldGeometry=await geometry();assert.equal(oldGeometry.length,267);
     await source.evaluate(el=>el.v2SourcePort.locateSourceLine(2));
     const lineButton=page.locator('#workspace #editor .ocr-cm-line-number-button[data-line-no="2"]');
     await lineButton.waitFor({state:'visible',timeout:10000});
     await lineButton.click();
     assert.equal(await page.getByRole('menuitem',{name:'在此分割逻辑块'}).count(),0);
     assert.equal(await page.getByRole('menuitem',{name:'删除当前行'}).count(),1);
     assert.equal(await source.evaluate(el=>typeof el.v2SourcePort.splitAtLine),'undefined');
     const rejected=api(folder,'structure-commit','POST',{workspace:folder,confirm:'commit-v2-owned-inventory'});
     assert.equal(rejected.status,409);
     assert.deepEqual((await snapshot()).rows,before.rows);
     assert.equal(api(folder,'markdown','GET').body.markdown,before.doc);
     assert.deepEqual(await geometry(),oldGeometry);
     assert.equal(writes.length,0);assert.deepEqual(errors,[]);
     console.log('WP25B_REAL_GUTTER_SPLIT_RETIRED_PASS',name,'267 unchanged blocks, no writes');
     continue;
   }
   if(structureMode){
     const first=before.rows[0];
     const verifyIndex=()=>source.evaluate(el=>{
       const p=el.v2SourcePort,idx=p.getMdLineIndex();
       return idx.rows.map(r=>r.md_line+'\n').join('')===p.getMarkdown()&&
         idx.rows.every(r=>idx.atBlockLine(r.logical_id,r.line_offset)===r&&idx.atSourceLine(r.source_line)===r);
     });
     assert(await verifyIndex());
     if(process.env.V2_TEST_LINE_ACTIONS==='1'){
       // The real PDF first-load scroll sync must finish before opening
       // the gutter menu; normal scrolling intentionally dismisses it.
       await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:30000});
       await source.evaluate(el=>el.v2SourcePort.locateSourceLine(3));
       const btn=page.locator('#workspace #editor .ocr-cm-line-number-button[data-line-no="3"]');
       await btn.waitFor({state:'visible',timeout:10000});
       await btn.click();
       await page.getByRole('menuitem',{name:'删除当前行'}).click();
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty);
       let current=await snapshot();
       assert.equal(current.rows[0].markdownText,first.markdownText.replace('手工修改\n',''));
       assert.deepEqual(current.rows.slice(1),before.rows.slice(1));
       assert(await verifyIndex());
       await source.evaluate(el=>el.v2SourcePort.undo());
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty);
       assert.deepEqual((await snapshot()).rows,before.rows);
       await source.evaluate(el=>{
         const p=el.v2SourcePort,idx=p.getMdLineIndex(),ref=idx.makeRef(3);
         p.locateSourceLine(3);p.insertPdfText({blockId:ref.logical_id,mode:'replace',text:'PDF line sample',lineRef:ref});
         window.__staleLineRef=ref;
       });
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty);
       current=await snapshot();
       assert.equal(current.rows[0].markdownText,first.markdownText.replace('手工修改','PDF line sample'));
       assert.deepEqual(current.rows.slice(1),before.rows.slice(1));
       assert(await source.evaluate(el=>{
         const p=el.v2SourcePort;
         try{p.insertPdfText({blockId:window.__staleLineRef.logical_id,mode:'insert',text:'bad',lineRef:window.__staleLineRef});return false;}catch{return true;}
       }));
       await source.evaluate(el=>el.v2SourcePort.undo());
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty);
       assert.deepEqual((await snapshot()).rows,before.rows);
       await source.evaluate(el=>{
         const p=el.v2SourcePort,ref=p.getMdLineIndex().makeRef(3);
         p.locateSourceLine(3);p.insertPdfText({blockId:ref.logical_id,mode:'insert',text:'PREFIX ',lineRef:ref});
       });
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty);
       assert.equal((await snapshot()).rows[0].markdownText,first.markdownText.replace('手工修改','PREFIX手工修改'));
       await source.evaluate(el=>el.v2SourcePort.undo());
       await page.waitForFunction(()=>!document.querySelector('#workspace #editor').v2SourcePort.getState().dirty);
       assert.deepEqual((await snapshot()).rows,before.rows);assert(await verifyIndex());
       assert.equal(writes.length,6);
       // Scope the original WP23F counter assertions to its own drag phase.
       writes.splice(0);
     }
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
     const merged=await saveStructure();assert(await verifyIndex());
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
     const moved=await saveStructure();assert(await verifyIndex());
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
