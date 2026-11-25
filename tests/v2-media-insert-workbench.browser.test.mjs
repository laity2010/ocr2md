/** WP31B actual built workbench: real SQLite, inventory selection and native CM6 insert. */
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const dist=resolve('labs/lab-ocr-v2/dist'),prefix='/labs/lab-ocr-v2/';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=','base64');
const imagePath='media/'+createHash('sha256').update(png).digest('hex').slice(0,24)+'.png',ref='![]('+imagePath+')';
const py=(folder,code,args={})=>JSON.parse(execFileSync('python3',['-c',
 'import sys,json,base64\nfrom pathlib import Path\nsys.path.insert(0,"tests")\nfrom test_v2_owned_edit import *\nfrom test_v2_media_paste import call\nfolder=Path(sys.argv[1]);args=json.load(sys.stdin)\n'+code,folder],
 {input:JSON.stringify(args),encoding:'utf8',maxBuffer:32*1024*1024}));
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png'};
for(const [name,engine] of [['chromium',chromium],['ipad-webkit',webkit]]){
 const folder=mkdtempSync(join(tmpdir(),'wp31a-workbench-')),initial=py(folder,'print(json.dumps(prepare_owned_book(folder),ensure_ascii=False))');
 const writes=[],errors=[];let uploads=0;
 const stored=py(folder,'code,body=call(folder);print(json.dumps({"code":code,"body":body}))');assert.equal(stored.code,200);assert.equal(stored.body.path,imagePath);
 const server=createServer(async(req,res)=>{
  const send=(status,data,type='application/json')=>{const body=Buffer.isBuffer(data)?data:Buffer.from(type==='application/json'?JSON.stringify(data):data);res.writeHead(status,{'Content-Type':type,'Content-Length':body.length,'Cache-Control':'no-store'});res.end(body);};
  try{
   const u=new URL(req.url,'http://127.0.0.1'),op=u.pathname.split('/').at(-1);
   if(u.pathname.startsWith('/labs/lab-frame/api/workspace-io/')){
    if(op==='roots')return send(200,{allowedRoots:[folder]});
    if(op==='probe')return send(200,{verified:true,readable:true,writable:true});
    if(op==='session')return send(200,{authorized:true});
    return send(404,{error:'not used'});
   }
   if(u.pathname.startsWith(prefix+'api/mineru-base/')){
    const q={};for(const [k,v] of u.searchParams)q[k]=[v];
    if(op==='pdf-map'||op==='pdf')return send(404,{error:'No PDF in isolated paste smoke'});
    if(op==='media-file'){
     const r=py(folder,'data,mime=base.dispatch("media-file","GET",folder,{},args["query"],Stub())\nprint(json.dumps({"bytes":base64.b64encode(data).decode(),"mime":mime}))',{query:q});return send(200,Buffer.from(r.bytes,'base64'),r.mime);
    }
    const chunks=[];if(req.method==='POST')for await(const chunk of req)chunks.push(chunk);
    if(op==='media-paste'){
     const bytes=Buffer.concat(chunks);assert.deepEqual(bytes,png);uploads++;
     const r=py(folder,'code,body=call(folder,body=base64.b64decode(args["bytes"]),mime=args["mime"],workspace=args["book"])\nprint(json.dumps({"status":code,"body":body}))',{bytes:bytes.toString('base64'),mime:req.headers['content-type'],book:u.searchParams.get('workspace')});return send(r.status,r.body);
    }
    const payload=req.method==='POST'?JSON.parse(Buffer.concat(chunks).toString()):{};
    if(req.method==='POST'){assert.equal(op,'md-commit');assert.equal(payload.changes.length,1);writes.push(payload);}
    const r=py(folder,'try:\n result=base.dispatch(args["op"],args["method"],folder,args["payload"],args["query"],Stub())\n print(json.dumps({"status":200,"body":result},ensure_ascii=False))\nexcept base.BaseError as e:\n print(json.dumps({"status":e.status,"body":{"error":str(e)}}))',{op,method:req.method,payload,query:q});
    return send(r.status,r.body);
   }
   if(u.pathname.startsWith(prefix)){
    const f=resolve(dist,u.pathname.slice(prefix.length)||'index.html');
    if(f.startsWith(dist+sep)&&statSync(f,{throwIfNoEntry:false})?.isFile())return send(200,readFileSync(f),types[extname(f)]||'application/octet-stream');
   }
   return send(404,'not used','text/plain');
  }catch(e){errors.push(e.message);console.error('WP31A_WORKBENCH_HTTP',e);send(500,{error:e.message});}
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+server.address().port+prefix;
  browser=await engine.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1180,height:850},hasTouch:true,...(name==='ipad-webkit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(path=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',JSON.stringify({settings:{
   'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
   'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
   'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:path,range:{kind:'server-directory'}}
  }})),folder);
  await page.route('https://cdn-mineru.openxlab.org.cn/**',r=>r.abort());
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>{
   const w=document.querySelector('#workspace'),nav=w?.querySelector('.ocr-source-file-select'),picker=w?.querySelector('.ocr-ag-module-select'),grid=w?.querySelector('.ocr-outline-grid')?.v2BaseGridPort,source=w?.querySelector('#editor')?.v2SourcePort;
   return !w?.hidden&&document.querySelector('#settings-workspace')?.hidden&&nav?.value==='sql:logical_block'&&nav.ocrNavigationSelect?.tom.getValue()==='sql:logical_block'&&picker?.value==='frame'&&picker.selectedOptions[0]?.textContent==='逻辑块审阅'&&grid?.getColumns()?.[0]?.field==='pbs'&&grid.getDisplayedRows().length>0&&source?.getState().loaded;
  },null,{timeout:45000});
  assert.equal(writes.length,0,'opening existing logical table must not write SQL');
  console.log('WP31C_STARTUP_PASS',name,'existing logical table auto selected, visible review, zero writes');
  const source=page.locator('#workspace #editor'),pos=initial.segments[0].endUtf16-1;
  const before=await source.evaluate(el=>({text:el.v2SourcePort.getMarkdown(),structure:el.v2SourcePort.getStructureRows()}));
  assert.equal(before.text,initial.markdown);
  const expected=before.text.slice(0,pos)+ref+'\n'+before.text.slice(pos);
  const mode=page.locator('#workspace .ocr-preview-pane select.ocr-preview-mode');
  if(await mode.inputValue()!=='md')await mode.selectOption('md');
  await source.evaluate((el,pos)=>{const view=el.v2SourcePort.getEditorView();view.dispatch({selection:{anchor:pos}});view.focus();},pos);
  const grid=page.locator('#workspace .ocr-outline-grid');
  await page.waitForFunction(()=>document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.some(c=>c.field==='logical_id'),null,{timeout:25000});
  await page.locator('#workspace .ocr-ag-module-select').selectOption('media');
  try{await page.waitForFunction(path=>document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getDisplayedRows().some(r=>r.url===path&&r.adopted==='未引用'),imagePath,{timeout:50000});}
  catch(e){console.error('WP31B_INVENTORY_DIAG',name,await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,picker:document.querySelector('#workspace .ocr-ag-module-select')?.value,rows:document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getDisplayedRows().map(r=>[r.url,r.adopted]),all:document.querySelector('#workspace .ocr-ag-toolbar input[type=checkbox]')?.checked})),py(folder,'print(json.dumps(base.dispatch("media-inventory","GET",folder,{}, {},Stub())))'));throw e;}
  const fields=await grid.evaluate(el=>el.v2BaseGridPort.getColumns().map(c=>c.field));
  assert.deepEqual(fields.slice(0,6),['preview_path','adopted','source_kind','line_no','pbs','action']);
  // Scroll the native grid to the inventory row, then clear the artificial focus
  // before the actual user-like click. No rowData replacement on selection.
  await grid.evaluate((el,path)=>{el.v2BaseGridPort.focusRow('media_row_id','file:'+path);el.v2BaseGridPort.focusRow('media_row_id',null);},imagePath);
  const row=grid.locator('.ag-row.v2-media-unreferenced').filter({has:page.locator('[col-id="adopted"]',{hasText:'未引用'})}).first();
  await row.locator('[col-id="adopted"]').click();
  assert.equal(await row.evaluate(el=>el.classList.contains('ag-row-selected')),true);
  assert.equal(await row.locator('[col-id="adopted"]').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(94, 164, 225, 0.24)');
  assert.equal(await source.evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head),pos);
  const insert=async()=>{
    await page.locator('#workspace .ocr-ag-function-select').click();
    await page.getByRole('menuitem',{name:'插入所选媒体'}).click();
  };
  await insert();
  const saved=async(text,count)=>{
   await page.waitForFunction(text=>{const p=document.querySelector('#workspace #editor')?.v2SourcePort;return p?.getMarkdown()===text&&!p.getState().dirty;},text,{timeout:20000});
   assert.equal(writes.length,count);assert.equal(py(folder,'print(json.dumps(base.existing_markdown(folder),ensure_ascii=False))').markdown,text);
   assert.deepEqual(await source.evaluate(el=>el.v2SourcePort.getStructureRows()),before.structure);
  };
  await saved(expected,1);
  await page.waitForFunction(path=>[...document.querySelectorAll('#workspace .ocr-preview-md-scroll img')].some(i=>i.src.includes(encodeURIComponent(path))&&i.complete&&i.naturalWidth>0),imagePath);
  await source.evaluate(el=>el.v2SourcePort.undo());await saved(before.text,2);
  await page.waitForFunction(path=>document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getDisplayedRows().some(r=>r.url===path&&r.adopted==='未引用'),imagePath);
  await source.evaluate(el=>el.v2SourcePort.redo());await saved(expected,3);
  await page.locator('#workspace .ocr-ag-module-select').selectOption('media');
  await page.waitForFunction(path=>document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getDisplayedRows().some(r=>r.url===path&&r.adopted==='已采用'),imagePath);
  assert.equal(uploads,0);assert.deepEqual(readFileSync(join(folder,imagePath)),png);assert.deepEqual(errors,[]);
  // Explicit Settings reentry must not bounce the user back into review.
  await source.evaluate(el=>{const select=el.closest('.ocr-source-pane').querySelector('.ocr-source-file-select');select.value='settings';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>!document.querySelector('#settings-workspace').hidden&&document.querySelector('#workspace').hidden);
  // Wait for the ordinary F02 recheck and existing SQLite readiness, not an arbitrary sleep.
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('V2 SQLite 就绪')||document.querySelector('#status')?.textContent.includes('SQL 逻辑表'),null,{timeout:30000});
  assert.equal(await page.locator('#settings-workspace').isVisible(),true);
  await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{select.value='sql:mineru-base';select.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.waitForFunction(()=>!document.querySelector('#workspace').hidden&&document.querySelector('#workspace .ocr-source-file-select')?.value==='sql:mineru-base'&&document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.[0]?.field==='blockid',null,{timeout:30000});
  assert.equal(writes.length,3);assert.equal(await source.evaluate(el=>el.v2SourcePort.getMarkdown()),expected);
  console.log('WP31C_MANUAL_NAV_PASS',name,'settings reentry and explicit base table; no extra SQL writes');
  console.log('WP31B_WORKBENCH_PASS',name,'column order, blue unused selection, unchanged caret, insert, auto CAS, undo/redo, inventory, stable PBS');
 }catch(e){console.error('WP31B_WORKBENCH_FAILURE',name,errors,writes.length);throw e;}
 finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true});}
}

