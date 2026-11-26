import assert from "node:assert/strict";
import {spawn,execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {chromium,webkit} from "playwright";
import {importSnapshot} from "../ui/sentence/snapshot.js";
import {persistedReview} from "../ui/sentence/persisted.js";
import {boundaryDisplay,isDisputed,reviewProjection,projectSentenceRows} from "../ui/sentence/display.js";
const payload=JSON.parse(execFileSync("python3",["-c","import sys,tempfile,json,sqlite3; from pathlib import Path; sys.path.insert(0,sys.argv[1]); sys.path.insert(0,sys.argv[2]); from test_v2_owned_edit import prepare_owned_book; from sentence_initialize import initialize_sentence_table; from v2_mineru_base import DB_NAME; tmp=tempfile.TemporaryDirectory(prefix='sentence-fixture-'); folder=Path(tmp.name); snapshot=prepare_owned_book(folder); db=sqlite3.connect(folder/DB_NAME); rows=initialize_sentence_table(db,snapshot); db.close(); print(json.dumps(dict(snapshot=snapshot,rows=rows),ensure_ascii=False))","../lab-ocr-v2/tests","scripts"],{encoding:"utf8",maxBuffer:32*1024*1024}));
const fixture=payload.snapshot,sourceSnapshot=await importSnapshot(fixture),expected=persistedReview(sourceSnapshot,payload.rows);
const url="http://127.0.0.1:5399/labs/lab-sentence/";
const server=spawn("node",["node_modules/vite/bin/vite.js","preview","--config","labs/lab-sentence/vite.config.mjs","--host","127.0.0.1","--port","5399","--strictPort"],{stdio:["ignore","ignore","inherit"]});
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}if(i===99)throw Error("preview unavailable");await sleep(200);}
 for(const [name,engine] of [["Chromium",chromium],["iPad-WebKit",webkit]]){
  const b=await engine.launch({headless:true});
  try{
   const page=await b.newPage({viewport:{width:1100,height:800}});
   await page.route("**/labs/lab-frame/api/workspace-io/session",r=>r.fulfill({json:{authorized:true}}));
   await page.route("**/labs/lab-frame/api/workspace-io/roots",r=>r.fulfill({json:{allowedRoots:["/fixture"]}}));
   await page.route("**/labs/lab-frame/api/workspace-io/probe",r=>r.fulfill({json:{verified:true,readable:true,writable:true}}));
   let failRead=false,stale=false,opens=0,resets=0,failReset=false,failSave=false;
   let currentRows=payload.rows,releaseFirst,startFirst;
   const batches=[],firstStarted=new Promise(resolve=>startFirst=resolve);
   const lineRows=line=>currentRows.filter(r=>r.source_line===line);
   function saveBatch(changes){
    const changed=[];
    for(const c of changes){
     const group=lineRows(c.source_line),first=group[0],line=sourceSnapshot.lines[c.source_line-1];
     assert.equal(c.source_line_hash,line.sha256);
     assert.equal(c.candidates_hash,createHash('sha256').update(first.candidates_json).digest('hex'));
     assert.equal(c.previous_engine,first.adopted_engine);
     const points=[0,...(c.adopted_engine===null?[]:JSON.parse(first.candidates_json)[c.adopted_engine].boundaries),line.text.length];
     const next=points.slice(0,-1).map((from,i)=>({...first,
      sentence_index:i,from_utf16:from,to_utf16:points[i+1],sentence_text:line.text.slice(from,points[i+1]),
      line_eol:i===points.length-2?line.eol:'',candidates_json:i===0?first.candidates_json:null,
      review_state:i===0?(c.adopted_engine===null?'disputed':'adopted'):null,
      adopted_engine:i===0?c.adopted_engine:null
     }));
     currentRows=currentRows.filter(r=>r.source_line!==c.source_line).concat(next).sort((a,b)=>a.source_line-b.source_line||a.sentence_index-b.sentence_index);
     changed.push(...next);
    }
    return changed.sort((a,b)=>a.source_line-b.source_line||a.sentence_index-b.sentence_index);
   }
   await page.route("**/labs/lab-sentence/api/sentence/*",async r=>{
    assert.equal(r.request().method(),"POST");const body=r.request().postDataJSON();
    assert.equal(body.workspace,"/fixture");assert.equal(body.source_document_hash,fixture.sha256);
    if(r.request().url().endsWith("/save")){
     batches.push(body.changes);
     if(batches.length===1)await new Promise(resolve=>{releaseFirst=resolve;startFirst();});
     if(failSave&&batches.length>1)return r.fulfill({status:503,json:{error:"injected idle save failure"}});
     return r.fulfill({json:{state:'ready',source_document_hash:fixture.sha256,rows:saveBatch(body.changes)}});
    }
    if(r.request().url().endsWith("/reinitialize")){
     resets++;assert.equal(body.confirm,"reinitialize-sentence-table");
     if(failReset)return r.fulfill({status:503,json:{error:"injected reset failure"}});
     stale=false;currentRows=payload.rows;
    }else{opens++;assert(!("confirm" in body));}
    return r.fulfill({json:{state:stale?"stale":"ready",source_document_hash:fixture.sha256,rows:stale?[]:currentRows}});
   });
   await page.route("**/labs/lab-ocr-v2/api/mineru-base/markdown?*",r=>{assert.equal(r.request().method(),"GET");assert.equal(new URL(r.request().url()).searchParams.get("workspace"),"/fixture");return failRead?r.fulfill({status:404,json:{error:"missing table"}}):r.fulfill({json:fixture});});
   await page.addInitScript(()=>localStorage.setItem("ocr2md.lab-sentence.settings.json.v1",JSON.stringify({settings:{"globalUi.font.family":{key:"family",category1:"全局 UI",category2:"字体",comment:"Sarasa",value:"Sarasa",range:{kind:"readonly"}},"globalUi.font.size":{key:"size",category1:"全局 UI",category2:"字体",comment:"字号",value:16,range:{min:8,max:32,step:1}},"workspace.dataDirectory":{key:"dataDirectory",category1:"工作区",category2:"目录",comment:"资料目录绑定",value:"/fixture",range:{kind:"server-directory"}}}})));
   await page.goto(url,{waitUntil:"domcontentloaded"});
   await page.locator("#settings-workspace .ocr-source-file-select").waitFor({state:"attached",timeout:25000});
   assert.equal(await page.locator(".frame-brand").textContent(),"OCR2MD lab-sentence");
   assert.equal(await page.locator("#workspace .dv-content-container").count(),5);
   const metadata=await (await page.request.get(url+"release-version.json")).json();
   assert.equal(metadata.name,"lab-sentence");
   assert.match(metadata.commit,/^[0-9a-f]{40}$/);
   assert.equal(await page.locator("#workspace").isVisible(),true);
   await page.waitForFunction(n=>document.querySelector("#status")?.textContent.includes("V2 已保存逻辑表 · "+n+" MDLine"),sourceSnapshot.lines.length,{timeout:30000});
   const readDoc=()=>page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.doc.toString());
   await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes('三引擎分句 '+n+'/'+n),sourceSnapshot.lines.length*3,{timeout:60000});
   const all=page.getByRole('checkbox',{name:'全部',exact:true});
   assert.equal(await all.isChecked(),false);
   const pending=reviewProjection(sourceSnapshot,expected,false,new Map()).snapshot;
   assert(pending.lines.length>0&&pending.lines.length<sourceSnapshot.lines.length);
   const expectDocs=async text=>{
    await page.waitForFunction(text=>document.querySelector('#editor .cm-content').cmTile.root.view.state.doc.toString()===text,text);
   };
   await expectDocs(pending.markdown);
   const gridCount=async (projection)=>page.waitForFunction(n=>document.querySelector('[data-sentence-pane="sentence"] .sentence-engine-label')?.textContent.endsWith(' · '+n+' 条'),projectSentenceRows(payload.rows,projection.lines,new Map()).length);
   const gridRow=(line,index=0)=>page.locator('.sentence-table-grid .ag-row[row-id="'+line+':'+index+'"]');
   await gridCount(pending);
   // The fixture contains real trailing blank lines. Check independently of
   // the implementation's expected projection.
   const expectedLines=[];
   for(const [i,line] of sourceSnapshot.lines.entries()){
    if(!isDisputed(expected.lines[i]))continue;
    expectedLines.push(line);
    for(let j=i+1;j<sourceSnapshot.lines.length&&/^[ \t]*$/.test(sourceSnapshot.lines[j].text);j++)expectedLines.push(sourceSnapshot.lines[j]);
   }
   assert(expectedLines.some(l=>l.text===''),'fixture has no trailing blank lines');
   assert.equal(pending.markdown,expectedLines.map(l=>l.text+l.eol).join(''));
   assert.deepEqual(pending.lines.map(l=>l.sourceLine),expectedLines.map(l=>l.sourceLine));
   assert.equal(await page.locator('.sentence-table-grid').isVisible(),true);
   const first=pending.lines[0],adopt=page.getByRole('checkbox',{name:'采用 Intl',exact:true});
   await gridRow(first.sourceLine).first().waitFor({state:'visible'});
   assert(await gridRow(first.sourceLine).first().evaluate(e=>e.classList.contains('sentence-grid-active')));
   const undo=page.locator('#workspace #undo'),redo=page.locator('#workspace #redo');
   assert(await undo.isDisabled());assert(await redo.isDisabled());
   // Execute a burst of native UI actions in the same browser turn.
   await page.evaluate(()=>{
    const a=document.querySelector('[data-sentence-pane="intl"] input');
    const u=document.querySelector('#workspace #undo'),r=document.querySelector('#workspace #redo');
    a.click();u.click();r.click();u.click();
   });
   await expectDocs(pending.markdown);await gridCount(pending);
   await sleep(1100);assert.equal(batches.length,0);
   assert(await undo.isDisabled());assert(await redo.isEnabled());
   await adopt.click();
   const chosen=new Map([[first.sourceLine,'intl']]);
   const reduced=reviewProjection(sourceSnapshot,expected,false,chosen).snapshot;
   await expectDocs(reduced.markdown);await gridCount(reduced);
   await gridRow(first.sourceLine).first().waitFor({state:"detached",timeout:5000});
   assert.equal(await gridRow(first.sourceLine).count(),0);
   // Hold the first SQL response indefinitely while changing the memory state.
   await Promise.race([firstStarted,sleep(12000).then(()=>{throw Error('idle save not started')})]);
   assert.equal(batches.length,1);
   assert(await undo.isEnabled());assert(await all.isEnabled());
   assert.equal(lineRows(first.sourceLine)[0].adopted_engine,null);
   await all.check();await expectDocs(fixture.markdown);
   const adoptedCount=payload.rows.length+JSON.parse(lineRows(first.sourceLine)[0].candidates_json).intl.boundaries.length;
   await page.waitForFunction(n=>document.querySelector('[data-sentence-pane="sentence"] .sentence-engine-label')?.textContent.endsWith(' · '+n+' 条'),adoptedCount);
   const select=pos=>page.locator('#editor .cm-content').evaluate((e,pos)=>e.cmTile.root.view.dispatch({selection:{anchor:pos},scrollIntoView:true}),pos);
   await select(first.sourceFrom);
   await page.waitForFunction(()=>document.querySelector('[data-sentence-pane="intl"] input[type="checkbox"]').checked);
   await gridRow(first.sourceLine).first().waitFor({state:'visible'});
   assert(await gridRow(first.sourceLine).first().evaluate(e=>e.classList.contains('sentence-grid-active')));
   const splitter=page.getByRole('checkbox',{name:'采用 Sentence Splitter',exact:true});
   await splitter.check();assert.equal(await adopt.isChecked(),false);
   // Both keyboard undo/redo are immediate even with the SQL request held.
   await page.locator('#editor .cm-content').focus();
   const mod=await page.evaluate(()=>/Mac/.test(navigator.platform)?'Meta':'Control');
   await page.keyboard.press(mod+'+z');assert(await adopt.isChecked());
   await page.keyboard.press(mod+'+Shift+z');assert(await splitter.isChecked());
   await splitter.uncheck();
   await all.uncheck();await expectDocs(pending.markdown);await gridCount(pending);
   assert.equal(batches.length,1);
   failSave=true;releaseFirst();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('尚未确认保存'),null,{timeout:15000});
   assert.equal(batches.length,2);
   assert.equal(lineRows(first.sourceLine)[0].adopted_engine,'intl');
   await expectDocs(pending.markdown);assert(await undo.isEnabled());assert(await all.isEnabled());
   failSave=false;await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('仲裁已保存'),null,{timeout:15000});
   assert.equal(batches.length,3);assert.deepEqual(batches[1],batches[2]);assert.deepEqual(currentRows,payload.rows);
   // A real saved choice survives reload; native history is session-only.
   await select(first.from);await page.waitForFunction(()=>!document.querySelector('[data-sentence-pane="intl"] input').disabled);
   await adopt.click();await expectDocs(reduced.markdown);
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('仲裁已保存'),null,{timeout:15000});
   assert.equal(lineRows(first.sourceLine)[0].adopted_engine,'intl');
   await page.reload({waitUntil:'domcontentloaded'});await expectDocs(reduced.markdown);
   assert(await undo.isDisabled());assert(await redo.isDisabled());
   await all.check();await expectDocs(fixture.markdown);
   await select(first.sourceFrom);assert(await adopt.isChecked());await adopt.uncheck();
   await all.uncheck();await expectDocs(pending.markdown);await gridCount(pending);
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('仲裁已保存'),null,{timeout:15000});
   assert.deepEqual(currentRows,payload.rows);
   await all.check();await expectDocs(fixture.markdown);
   console.log('SENTENCE_IDLE_REVIEW_PASS',name,'zero net-zero requests; in-flight choice+history; failed batch retry; reload');
   assert.equal(await page.locator('#workspace select.ocr-navigation-native option[value="frame"]').evaluate(e=>e.parentElement.label),'SQL');
   assert.equal(await page.locator('#workspace .ocr-navigation-select .item').textContent(),'逻辑表 · logical_block');
   assert.equal(await page.locator('#editor .cm-content').getAttribute('contenteditable'),'false');
   await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({changes:{from:0,insert:'SHOULD NOT WRITE'}}));
   assert.equal(await readDoc(),fixture.markdown);
   assert.equal(await readDoc(),fixture.markdown);
   const projection=boundaryDisplay(sourceSnapshot,expected);
   const engines=[['intl','intl'],['splitter','sentence-splitter'],['wink','wink-nlp']];
   const expectBlocks=async(block)=>{
    const row=expected.lines.find(r=>r.sourceLine===block.sourceLine);
    for(const [pane,id] of engines){
     const c=row.candidates.find(c=>c.engine===id);
     const text=c.error?'':block.text;
     const host=page.locator('#sentence-editor-'+pane+' .cm-content');
     await page.waitForFunction(({pane,text})=>document.querySelector('#sentence-editor-'+pane+' .cm-content').cmTile.root.view.state.doc.toString()===text,{pane,text});
     assert.equal(await host.getAttribute('contenteditable'),'false');
     const marks=projection[id].marks.filter(m=>m.pos>block.from&&m.pos<=block.to);
     for(const mark of marks){
      await host.evaluate((e,pos)=>e.cmTile.root.view.dispatch({selection:{anchor:pos},scrollIntoView:true}),mark.pos-block.from);
      const widget=page.locator('#sentence-editor-'+pane+' .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
      await widget.waitFor({state:'visible'});
      assert.equal(await widget.textContent(),'│');
      assert(await widget.evaluate((e,style)=>e.classList.contains(style),mark.style));
     }
    }
    assert.equal(await readDoc(),fixture.markdown);
   };
   const block=sourceSnapshot.lines.find(b=>{
    const row=expected.lines.find(r=>r.sourceLine===b.sourceLine);
    return row.candidates.every(c=>c.boundaries.length>0)&&isDisputed(row);
   });
   assert(block,'expected multi-sentence disagreement');
   const row=expected.lines.find(r=>r.sourceLine===block.sourceLine);
   const points=[block.from,block.from+row.candidates[0].boundaries[0]];
   await select(points[0]);await expectBlocks(block);
   await page.locator('#editor .ocr-sb-active-line').first().waitFor({state:'visible'});
   await page.evaluate(()=>{window.__sentenceBlockStates=Array.from(document.querySelectorAll('[data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content'),e=>e.cmTile.root.view.state);});
   await select(points[1]);
   await page.waitForFunction(pos=>document.querySelector('#editor .cm-content').cmTile.root.view.state.selection.main.head===pos,points[1]);
   assert(await page.evaluate(()=>Array.from(document.querySelectorAll('[data-sentence-pane]:not([data-sentence-pane="source"]) .cm-content'),e=>e.cmTile.root.view.state).every((state,i)=>state===window.__sentenceBlockStates[i])));
   const next=sourceSnapshot.lines.find(b=>b.sourceLine!==block.sourceLine&&b.text!==block.text&&b.text.length>0);
   assert(next);await select(next.from);await expectBlocks(next);
   await select(points[0]);await expectBlocks(block);
   const blank=sourceSnapshot.lines.find(l=>!l.text&&l.eol);
   assert(blank);await select(blank.from);await expectBlocks(blank);
   await select(fixture.markdown.length);
   await page.waitForFunction(()=>Array.from(document.querySelectorAll('[data-sentence-pane]:not([data-sentence-pane="source"]):not([data-sentence-pane="sentence"]) input')).every(e=>e.disabled));
   await select(points[0]);await expectBlocks(block);
   const before=await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.selection.main.head);
   await page.locator('#sentence-editor-intl .cm-content').evaluate(e=>e.cmTile.root.view.dispatch({selection:{anchor:1}}));
   assert.equal(await page.locator('#editor .cm-content').evaluate(e=>e.cmTile.root.view.state.selection.main.head),before);
   for(const style of ['ocr-sb-agreed','ocr-sb-split']){
    const mark=projection.source.marks.find(m=>m.style===style&&m.pos>100);
    assert(mark);await select(mark.pos);
    const widget=page.locator('#editor .ocr-sb-boundary[title='+JSON.stringify(mark.title)+']');
    await widget.waitFor({state:'visible'});assert.equal(await widget.textContent(),mark.label);
   }
   console.log("SENTENCE_MDLINE_FOCUS_PASS",name,fixture.rowCount,fixture.markdown.length,"right full source, complete MDLine candidates, stable same-line states and cross-line switch, adoption/filter, readonly");
   assert.equal(await page.locator('select.ocr-navigation-native option[value="sentence"]').count(),2);
   const openNav=async()=>{
    // Native dialog focus restoration may already reopen Tom Select. Do not
    // toggle an already-open dropdown closed before clicking its SQL group.
    if(!await page.locator('.ocr-navigation-popup:visible').count())await page.locator('#workspace .ocr-navigation-select .ts-control').click();
   };
   await openNav();
   await page.locator('.ocr-navigation-popup:visible [data-value="sentence"]').click();
   await page.locator('.sentence-table-grid .ag-root').waitFor({state:'visible'});
   assert.equal(await page.locator('#workspace .dv-content-container').count(),5);
   assert.equal(await page.locator('#editor').isVisible(),true);
   assert.equal(await page.locator('.sentence-table-grid').isVisible(),true);
   assert.equal(await all.isVisible(),true);
   await select(0);
   await gridRow(payload.rows[0].source_line,payload.rows[0].sentence_index).first().waitFor({state:'visible'});
   assert.equal(await gridRow(payload.rows[0].source_line,payload.rows[0].sentence_index).locator('[col-id="sentence_text"]').textContent(),payload.rows[0].sentence_text);
   const pair=payload.rows.find(r=>r.sentence_index===1);
   assert(pair);
   const pairLine=sourceSnapshot.lines[pair.source_line-1];
   await select(pairLine.from);
   await gridRow(pair.source_line,1).locator('[col-id="source_line"]').click();
   await page.waitForFunction(pos=>document.querySelector('#editor .cm-content').cmTile.root.view.state.selection.main.head===pos,pairLine.from+pair.from_utf16);
   assert(await gridRow(pair.source_line,0).first().evaluate(e=>e.classList.contains('sentence-grid-active')));
   await expectBlocks(pairLine);
   console.log('SENTENCE_FIVE_PANE_SYNC_PASS',name,pending.lines.length,'pending lines with blanks');
   const header=page.locator('.sentence-table-grid .ag-header-cell[col-id="review_state"]');
   // Actual V1 native multi-value filter, not a replacement select.
   await header.locator('.ag-header-cell-filter-button').click();
   await page.locator('.ag-popup').getByText('all',{exact:true}).waitFor({state:'visible'});
   await page.keyboard.press('Escape');
   await openNav();await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').click();
   await page.locator('#editor').waitFor({state:'visible'});
   await expectDocs(fixture.markdown);
   const sqlMenu=async()=>{
    await openNav();
    await page.locator('.ocr-navigation-popup:visible .optgroup-header').filter({hasText:/^SQL$/}).click();
    await page.locator('#sentence-sql-actions-dialog').waitFor({state:'visible'});
   };
   await sqlMenu();
   await page.getByRole('button',{name:'取消',exact:true}).click();
   assert.equal(resets,0);
   await page.locator('#sentence-sql-actions-dialog').waitFor({state:'hidden'});
   console.log('SENTENCE_CANCEL_NAV_STATE',name,await page.locator('.ocr-navigation-popup:visible').count());
   await sqlMenu();
   await page.getByRole('button',{name:'重新初始化句表',exact:true}).click();
   assert.equal(resets,0);
   await page.getByRole('button',{name:'确认重新初始化句表',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('677 句记录'));
   assert.equal(resets,1);
   await expectDocs(pending.markdown);assert(await undo.isDisabled());assert(await redo.isDisabled());
   failReset=true;
   await sqlMenu();
   await page.getByRole('button',{name:'重新初始化句表',exact:true}).click();
   await page.getByRole('button',{name:'确认重新初始化句表',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('重新初始化未确认成功'));
   assert.equal(resets,2);
   await expectDocs(pending.markdown);
   failReset=false;
   console.log('SENTENCE_SQL_NAV_GRID_REINIT_PASS',name,'677 persisted rows, native filter, cancel, confirmed reset, failure keeps review');
   // Reopening a saved directory with stale rows never auto-reinitializes.
   stale=true;
   await openNav();await page.locator('.ocr-navigation-popup:visible [data-value="settings"]').click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('句表与已保存 MDLine 不一致'));
   assert.equal(await page.locator('select.ocr-navigation-native option[value="sentence"]').count(),0);
   assert.equal(await page.locator('.sentence-table-grid').count(),0);
   assert.equal(resets,2);
   assert(opens>=2);
   await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
   await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').click();
   await expectDocs(fixture.markdown);
   await sqlMenu();
   await page.getByRole('button',{name:'重新初始化句表',exact:true}).click();
   await page.getByRole('button',{name:'确认重新初始化句表',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('677 句记录'));
   assert.equal(resets,3);
   await expectDocs(pending.markdown);
   console.log('SENTENCE_STALE_EXPLICIT_RESET_PASS',name);
   // Both native menus and the actual Tom Select dropdown must reflect the
   // successfully loaded table. Then force the existing GET to fail.
   assert.equal(await page.locator('select.ocr-navigation-native optgroup[label="SQL"]').count(),2);
   failRead=true;
   await page.locator('#workspace .ocr-navigation-select .ts-control').click();
   await page.locator('.ocr-navigation-popup:visible [data-value="settings"]').click();
   await page.locator('#settings-workspace').waitFor({state:'visible'});
   await page.waitForFunction(()=>document.querySelectorAll('select.ocr-navigation-native optgroup[label="SQL"]').length===0);
   assert.equal(await page.locator('.sentence-table-grid').count(),0);
   assert.deepEqual(await page.locator('#workspace .cm-content').evaluateAll(es=>es.map(e=>e.cmTile.root.view.state.doc.toString())),['','','','']);
   await page.locator('#settings-workspace .ocr-navigation-select .ts-control').click();
   assert.equal(await page.locator('.ocr-navigation-popup:visible [data-value="frame"]').count(),0);
   console.log("SENTENCE_NAV_FAILURE_CLEAR_PASS",name);

  }finally{await b.close();}
 }
}finally{server.kill("SIGTERM");}
