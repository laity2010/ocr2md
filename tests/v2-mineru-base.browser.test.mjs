import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5422,url=`http://127.0.0.1:${port}/labs/lab-ocr-v2/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr-v2/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',x=>log+=x);server.stderr.on('data',x=>log+=x);
try{
 for(let i=0;i<100;i++){
   try{if((await fetch(url)).ok)break;}catch{}
   if(i===99)throw Error('V2 start failed '+log);
   await sleep(200);
 }
 for(const [kind,browserType] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1280,height:850}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const books='/demo/books/my-book';let exists='retired-v2',postCount=0,logicPost=0,logicalInitialized=false,probeCount=0;
   await page.addInitScript(path=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',
     JSON.stringify({settings:{
      'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
      'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:path,range:{kind:'server-directory'}}
     }})),books);
   await page.route('**/api/workspace/roots',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/books']})}));
   await page.route('**/labs/lab-frame/api/workspace-io/probe',route=>{
    probeCount++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})});
   });
   const cols=['blockid','source_path','source_sha256','page_index','page_number','block_group',
     'page_block_index','source_json_path','block_type','mineru_index','bbox_json','angle','level',
     'lines_json','blocks_json','block_json','record_kind','original_bytes'];
   const rows=Array.from({length:120},(_,i)=>Object.fromEntries(cols.map(k=>[k,k==='blockid'?i+1:k==='block_type'?'text':k==='block_json'?'{"type":"text"}':null])));
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
    const request=route.request();const op=new URL(request.url()).pathname.split('/').at(-1);
    if(op==='initialize-logical'){
      logicPost++;assert.equal(request.postDataJSON().confirm,'initialize-logical');
      logicalInitialized=true;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created:true,blockCount:267})});
    }
    if(op==='logical-state'){
      const columns=['logical_id','parent_id','sort_order','node_kind','block_type','markdown','source_refs','attrs','revision'];
      const rows=Array.from({length:120},(_,i)=>({logical_id:i+1,parent_id:null,sort_order:i+1,
        node_kind:'content',block_type:'text',markdown:'Some Markdown',source_refs:'[{"blockid":23,"child_path":[]}]',attrs:'{}',revision:0}));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(logicalInitialized?
        {exists:true,initialized:true,blockCount:267,offset:Number(new URL(request.url()).searchParams.get('offset')||0),columns,rows}:
        {exists:true,initialized:false,needsInitialization:true,blockCount:0,columns,rows:[]})});
    }
    if(op==='import'){
      postCount++;assert.equal(request.postDataJSON().confirm,'import-mineru-base');
      exists=true;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created:true,blockCount:539,sourceCount:1,dbFile:'ocr2md.v2.sqlite'})});
    }
    if(op==='state'&&exists==='retired-v2')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'现有 SQLite 不符合 V2 两表结构，拒绝覆盖'})});
    if(op==='state')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(exists?
      {exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,sourceCount:1,columns:cols,rows,
      offset:Number(new URL(request.url()).searchParams.get('offset')||0)}:{exists:false,dbFile:'ocr2md.v2.sqlite'})});
    return route.abort();
   });
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});

   await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:logical-block"]')!==null,null,{timeout:12000});
   assert.equal(postCount,1,'auto-import once after verified workspace');
   assert.equal(logicPost,1,'logical init after verified workspace');
   assert.equal(probeCount>=1,true);
   assert.equal(await page.locator('#settings-workspace').isVisible(),true);
   const names=await page.locator('#settings-workspace .ocr-source-file-select optgroup').evaluateAll(groups=>groups.map(x=>x.label));
   assert.deepEqual(names,['全局设置','SQL']);
   assert.equal(await page.locator('#settings-workspace .ocr-source-file-select option[value="sql:logical-block"]').count(),1);
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:mineru-base';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace')&&!document.querySelector('#workspace').hidden&&
      document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===18,null,{timeout:30000});
   const headers=await page.locator('#workspace .ocr-outline-grid').evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.headerName));
   assert.equal(headers.length,18,JSON.stringify(headers));
   assert.equal(headers[0],'BlockID');
   assert.match(await page.locator('#workspace .v2-base-count').textContent(),/1–120 \/ 539/);
   await page.getByRole('button',{name:'基础表下一页'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-base-count')?.textContent.includes('121–240'),null,{timeout:12000});
   assert.equal(postCount,1);
   await page.locator('#workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:logical-block';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===9,null,{timeout:15000});
   const logicalHeaders=await page.locator('#workspace .ocr-outline-grid').evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.headerName));
   assert.equal(logicalHeaders[0],'LogicalID');
   assert.match(await page.locator('#workspace .v2-base-count').textContent(),/逻辑表 1–120 \/ 267/);
   assert.equal(logicPost,1);
   assert.deepEqual(errors,[]);
   console.log('V2_TWO_TABLE_BROWSER_PASS',kind,JSON.stringify({headers:headers.length,postCount,probeCount}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
