/** WP31A actual built workbench smoke: F02 fixture, real SQLite, real HTTP image. */
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
  await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:logical_block"]')&&document.querySelector('#workspace #editor')?.v2SourcePort?.getState().loaded,null,{timeout:30000});
  await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));},undefined,{timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().loaded&&document.querySelector('#workspace').getBoundingClientRect().width>0,null,{timeout:20000});
  const source=page.locator('#workspace #editor'),pos=initial.segments[0].endUtf16-1;
  const before=await source.evaluate(el=>({text:el.v2SourcePort.getMarkdown(),structure:el.v2SourcePort.getStructureRows()}));
  assert.equal(before.text,initial.markdown);
  const expected=before.text.slice(0,pos)+ref+'\n'+before.text.slice(pos);
  const mode=page.locator('#workspace .ocr-preview-pane select.ocr-preview-mode');
  if(await mode.inputValue()!=='md')await mode.selectOption('md');
  await source.evaluate((el,pos)=>{const view=el.v2SourcePort.getEditorView();view.dispatch({selection:{anchor:pos}});view.focus();},pos);
  assert(await source.evaluate((el,b64)=>{
   const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(b64),x=>x.charCodeAt(0))],'paste.png',{type:'image/png'}));
   return !el.v2SourcePort.getEditorView().contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));
  },png.toString('base64')));
  const saved=async(text,count)=>{
   await page.waitForFunction(text=>{const p=document.querySelector('#workspace #editor')?.v2SourcePort;return p?.getMarkdown()===text&&!p.getState().dirty;},text,{timeout:20000});
   assert.equal(writes.length,count);assert.equal(py(folder,'print(json.dumps(base.existing_markdown(folder),ensure_ascii=False))').markdown,text);
   assert.deepEqual(await source.evaluate(el=>el.v2SourcePort.getStructureRows()),before.structure);
  };
  await saved(expected,1);
  await page.waitForFunction(path=>[...document.querySelectorAll('#workspace .ocr-preview-md-scroll img')].some(i=>i.src.includes(encodeURIComponent(path))&&i.complete&&i.naturalWidth>0),imagePath);
  await source.evaluate(el=>el.v2SourcePort.undo());await saved(before.text,2);
  await source.evaluate(el=>el.v2SourcePort.redo());await saved(expected,3);
  await page.locator('#workspace .ocr-ag-module-select').selectOption('media');
  await page.waitForFunction(path=>document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getDisplayedRows().some(r=>r.url===path&&r.adopted==='已采用'),imagePath);
  assert.equal(uploads,1);assert.deepEqual(readFileSync(join(folder,imagePath)),png);assert.deepEqual(errors,[]);
  console.log('WP31A_WORKBENCH_PASS',name,'actual built UI, image, automatic 850ms CAS, Undo/Redo, media row, stable PBS');
 }catch(e){console.error('WP31A_WORKBENCH_FAILURE',name,errors,writes.length);throw e;}
 finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));rmSync(folder,{recursive:true,force:true});}
}

