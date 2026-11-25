/** WP31A: real V2 source port/preview, disposable SQLite and real byte-store.
 * Deliberately no Frame navigation or Vite dev startup in this direct test.
 */
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium,webkit} from 'playwright';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7xkAAAAASUVORK5CYII=','base64');
const path='media/'+createHash('sha256').update(png).digest('hex').slice(0,24)+'.png';
const ref='![]('+path+')';
const py=(folder,code,args={})=>JSON.parse(execFileSync('python3',['-c',
 'import sys,json,base64\nfrom pathlib import Path\nsys.path.insert(0,"tests")\nfrom test_v2_owned_edit import *\nfrom test_v2_media_paste import call\nfolder=Path(sys.argv[1]);args=json.load(sys.stdin)\n'+code,folder],
 {input:JSON.stringify(args),encoding:'utf8',maxBuffer:32*1024*1024}));
const bundle=await build({stdin:{contents:[
 "import {mountV2Source} from './ui/v2-source-session.js';",
 "import {mountV2MarkdownPreview} from './ui/v2-markdown-preview.js';",
 "import {mediaContext} from './ui/v2-media.js';",
 "import {projectLabMedia} from './ui/lab-ocr/media-view.js';",
 "window.statuses=[];document.addEventListener('v2-cm-status',e=>statuses.push(e.detail.text));",
 "window.host=document.querySelector('#editor');window.source=mountV2Source(host);",
 "window.port=host.v2SourcePort;",
 "window.preview=mountV2MarkdownPreview(document.querySelector('.ocr-preview-md-scroll'));",
 "window.mediaRows=files=>projectLabMedia({...mediaContext(port.getWorkspace(),port.getMarkdown(),port.getMdLineIndex()),inventory:files});"
 ].join('\n'),resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'import.meta.env.BASE_URL':'"/labs/lab-ocr-v2/"'}});
for(const [name,engine] of [['chromium',chromium],['ipad-webkit',webkit]]){
 const folder=mkdtempSync(join(tmpdir(),'wp31a-direct-'));
 const browser=await engine.launch({headless:true});let server;
 try{
  const initial=py(folder,'print(json.dumps(prepare_owned_book(folder),ensure_ascii=False))');
  const page=await browser.newPage({viewport:{width:1000,height:800},hasTouch:true,
   ...(name==='ipad-webkit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
  page.setDefaultTimeout(12000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let uploads=0,deny=false,hold=null,release=null;
  // Real loopback HTTP: Playwright WebKit route.postDataBuffer can be null
  // for binary File bodies. Never substitute assumed fixture bytes.
  server=createServer(async(req,res)=>{
   const respond=(status,body,type='application/json')=>{res.writeHead(status,{'Content-Type':type,'Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store'});res.end(body);};
   try{
    const u=new URL(req.url,'http://127.0.0.1'),op=u.pathname.split('/').at(-1);
    if(op==='wp31a.html')return respond(200,'<!doctype html><style>#editor,.ocr-preview-md-scroll{height:320px;overflow:auto}.cm-editor{height:100%}</style><main id="workspace"><section class="ocr-source-pane"><button id="undo">Undo</button><button id="redo">Redo</button><div id="editor"></div></section><div class="ocr-preview-md-scroll"></div></main>','text/html');
    if(op==='media-paste'){
     uploads++;
     const chunks=[];for await(const chunk of req)chunks.push(chunk);
     const bytes=Buffer.concat(chunks);
     assert.deepEqual(bytes,png,'actual HTTP request bytes');
     assert.equal(req.method,'POST');
     assert.equal(req.headers.origin,'http://127.0.0.1:'+server.address().port);
     if(hold)await hold;
     if(deny)return respond(403,'{"error":"Unauthorized"}');
     const result=py(folder,'code,body=call(folder,body=base64.b64decode(args["bytes"]),mime=args["mime"],workspace=args["book"])\nprint(json.dumps({"status":code,"body":body}))',{bytes:bytes.toString('base64'),mime:req.headers['content-type'],book:u.searchParams.get('workspace')});
     return respond(result.status,JSON.stringify(result.body));
    }
    if(op==='media-file'){
     const result=py(folder,'data,mime=base.dispatch("media-file","GET",folder,{},{"path":[args["path"]]},Stub())\nprint(json.dumps({"bytes":base64.b64encode(data).decode(),"mime":mime}))',{path:u.searchParams.get('path')});
     return respond(200,Buffer.from(result.bytes,'base64'),result.mime);
    }
    return respond(404,'not used by fixture','text/plain');
   }catch(e){errors.push(e.message);console.error('WP31A_HTTP_FIXTURE',e);respond(500,JSON.stringify({error:e.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  await page.route('https://cdn-mineru.openxlab.org.cn/**',r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port+'/wp31a.html');
  await page.addScriptTag({content:bundle.outputFiles[0].text});
  await page.evaluate(({snapshot,folder})=>port.load(snapshot,folder),{snapshot:initial,folder});
  const state=()=>page.evaluate(()=>({text:port.getMarkdown(),rows:port.getBlocks(),structure:port.getStructureRows(),state:port.getState(),head:port.getEditorView().state.selection.main.head}));
  const original=await state();
  assert.equal(original.text,initial.markdown);
  const select=(from,to=from)=>page.evaluate(({from,to})=>{
   const view=port.getEditorView();view.dispatch({selection:{anchor:from,head:to}});view.focus();
  },{from,to});
  const paste=()=>page.evaluate(b64=>{
   statuses.length=0;const dt=new DataTransfer();
   dt.items.add(new File([Uint8Array.from(atob(b64),x=>x.charCodeAt(0))],'test.png',{type:'image/png'}));
   return !port.getEditorView().contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  },png.toString('base64'));
  const waitStatus=word=>page.waitForFunction(word=>statuses.at(-1)?.includes(word),word);
  const save=async(expected,previous)=>{
   const current=await state();assert.equal(current.text,expected,JSON.stringify(current.state));
   assert.deepEqual(current.structure,original.structure);
   const changes=current.rows.filter((r,i)=>r.markdownText!==previous.rows[i].markdownText)
     .map((r,i)=>({logicalId:r.logicalId,before:previous.rows.find(x=>x.logicalId===r.logicalId).markdownText,after:r.markdownText}));
   assert.equal(changes.length,1);
   const result=py(folder,'result=owned_commit(folder,args["changes"],args["structure"]);print(json.dumps({"result":result,"snapshot":base.existing_markdown(folder)},ensure_ascii=False))',{changes,structure:current.structure});
   assert.equal(result.result.changedRows,1);assert.equal(result.snapshot.markdown,expected);
   await page.evaluate(rows=>port.markTextPersisted(rows),current.rows);
   assert.equal((await state()).state.dirty,false);
   return {current,snapshot:result.snapshot};
  };
  // Last owned blank: existing CM6 LF repair path must remain reversible.
  const pos=initial.segments[0].endUtf16-1;
  const expected=original.text.slice(0,pos)+ref+'\n'+original.text.slice(pos);
  await select(pos);assert(await paste());await waitStatus('已插入');
  let inserted=await save(expected,original);
  assert.deepEqual(inserted.current.rows.slice(1),original.rows.slice(1));
  assert.deepEqual(readFileSync(join(folder,path)),png);
  const files=py(folder,'print(json.dumps(base.dispatch("media-inventory","GET",folder,{}, {},Stub())))').files;
  assert.equal(files.length,1);
  await page.waitForFunction(path=>[...document.querySelectorAll('.ocr-preview-md-scroll img')].some(i=>i.src.includes(encodeURIComponent(path))&&i.complete&&i.naturalWidth>0),path);
  assert(await page.evaluate(({files,path})=>mediaRows(files).some(x=>x.url===path&&x.adopted==='已采用'),{files,path}));
  const history=await state();assert.equal(history.state.undo,1);
  await page.evaluate(()=>port.undo());const undone=await save(original.text,inserted.current);
  assert(await page.evaluate(({files,path})=>mediaRows(files).some(x=>x.url===path&&x.adopted==='未引用'),{files,path}));
  await page.evaluate(()=>port.redo());inserted=await save(expected,undone.current);
  assert.deepEqual(readFileSync(join(folder,path)),png);
  console.log('WP31A_DIRECT_HISTORY_PASS',name,'exact image + LF; one undo/redo; original IDs; 3 real CAS; preview + media');
  // Reopen actual persisted snapshot without Frame navigation races.
  await page.evaluate(({snapshot,folder})=>{port.clear();port.load(snapshot,folder);},{snapshot:inserted.snapshot,folder});
  assert.equal((await state()).text,expected);
  await select(pos,pos+ref.length);assert(await paste());await waitStatus('已插入');
  assert.equal((await state()).text,expected);assert.equal((await state()).state.undo,0);
  assert.equal(py(folder,'print(json.dumps(base.dispatch("media-inventory","GET",folder,{}, {},Stub())))').files.length,1);
  // Reject cross-block selection before sending bytes.
  const boundary=inserted.snapshot.segments[0].endUtf16;
  const prevUploads=uploads;await select(boundary-1,boundary+1);assert(await paste());await waitStatus('同一逻辑块');
  assert.equal(uploads,prevUploads);assert.equal((await state()).text,expected);
  deny=true;await select(pos);assert(await paste());await waitStatus('失败');deny=false;
  assert.equal((await state()).text,expected);
  // Delayed upload + ordinary edit must reject stale insertion.
  hold=new Promise(resolve=>release=resolve);await select(pos);assert(await paste());
  await page.evaluate(pos=>port.getEditorView().dispatch({changes:{from:pos,insert:'X'},userEvent:'input.type'}),pos);
  release();hold=null;await waitStatus('文档已改变');
  assert.equal((await state()).text,expected.slice(0,pos)+'X'+expected.slice(pos));
  assert.deepEqual(errors,[]);
  console.log('WP31A_DIRECT_GUARDS_PASS',name,'reopen, duplicate, cross-block, unauthorized, stale upload');
 }finally{await browser.close();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}rmSync(folder,{recursive:true,force:true});}
}

