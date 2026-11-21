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
   const books='/demo/books/my-book';let exists='retired-v2',postCount=0,logicalPostCount=0,logicalReady=false,probeCount=0;
   await page.addInitScript(path=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',
     JSON.stringify({settings:{
      'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
      'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:path,range:{kind:'server-directory'}}
     }})),books);
   await page.route('**/labs/lab-frame/api/workspace-io/roots',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/books']})}));
   await page.route('**/labs/lab-frame/api/workspace-io/probe',route=>{
    probeCount++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})});
   });
   const cols=['blockid','source_path','source_sha256','page_index','page_number','block_group',
     'page_block_index','source_json_path','block_type','mineru_index','bbox_json','angle','level',
     'lines_json','blocks_json','block_json','record_kind','original_bytes'];
   const logicalCols=['logical_id','base_blockid','parent_id','logical_order','markdown_text'];
   const tables=[{name:'mineru_base',columns:cols},{name:'logical_block',columns:logicalCols}];
   const rows=Array.from({length:120},(_,i)=>Object.fromEntries(cols.map(k=>[k,k==='blockid'?i+1:k==='block_type'?'text':k==='block_json'?'{"type":"text"}':null])));
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
    const request=route.request();const op=new URL(request.url()).pathname.split('/').at(-1);
    if(op==='import'){
      postCount++;assert.equal(request.postDataJSON().confirm,'import-mineru-base');
      exists=true;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created:true,blockCount:539,sourceCount:1,dbFile:'ocr2md.v2.sqlite'})});
    }
    if(op==='logical-init'){
      logicalPostCount++;
      assert.equal(request.postDataJSON().confirm,'initialize-logical');
      assert.equal(logicalReady,false,'logical initialization only once');
      logicalReady=true;
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({created:true,preserved:false,logicalCount:224,baseChanged:false})});
    }
    if(op==='state'&&exists==='retired-v2')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'现有 SQLite 不符合 V2 两表结构，拒绝覆盖'})});
    if(op==='state'){
      const query=new URL(request.url()).searchParams;
      const table=query.get('table')||'mineru_base';
      const logical=table==='logical_block';
      assert(['mineru_base','logical_block'].includes(table));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(exists?
        {exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,sourceCount:1,
        tables,tableName:table,rowCount:logical?(logicalReady?224:0):539,
        columns:logical?logicalCols:cols,rows:logical?(logicalReady?
          Array.from({length:120},(_,i)=>({logical_id:i+1,base_blockid:i+1,parent_id:null,
            logical_order:i+1,markdown_text:'reconstructed'})):[]):rows,
        offset:Number(query.get('offset')||0)}:{exists:false,dbFile:'ocr2md.v2.sqlite'})});
    }
    return route.abort();
   });
   await page.route('**/labs/lab-frame/api/workspace-io/session',route=>route.fulfill({
     status:200,contentType:'application/json',body:JSON.stringify({authorized:true})}));
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});

   await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:mineru-base"]')!==null,null,{timeout:12000});
   assert.equal(postCount,1,'auto-import once after verified workspace');
   assert.equal(probeCount>=1,true);
   assert.equal(await page.locator('#settings-workspace').isVisible(),true);
   const names=await page.locator('#settings-workspace .ocr-source-file-select optgroup').evaluateAll(groups=>groups.map(x=>x.label));
   assert.deepEqual(names,['全局设置','SQL']);
   const sqlOptions=await page.locator('#settings-workspace .ocr-source-file-select optgroup[label="SQL"] option')
     .evaluateAll(nodes=>nodes.map(node=>({label:node.textContent,value:node.value})));
   assert.deepEqual(sqlOptions,[
     {label:'基础表 · mineru_base',value:'sql:mineru-base'},
     {label:'逻辑表 · logical_block',value:'sql:logical_block'}
   ]);
   // Empty logical_block is still a physical table; choosing it must create
   // 5 actual AG columns rather than hide the entry or show the MinerU grid.
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>!document.querySelector('#workspace')?.hidden&&
      document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===5,
      null,{timeout:30000});
   const logicalHeaders=await page.locator('#workspace .ocr-outline-grid')
     .evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.field));
   assert.deepEqual(logicalHeaders,logicalCols);
   assert.match(await page.locator('#workspace .v2-base-count').textContent(),/逻辑表 0–0 \/ 0/);
   assert.equal(await page.getByRole('button',{name:'SQL 表下一页'}).isDisabled(),true);
   const init=page.getByRole('button',{name:'初始化逻辑表'});
   assert.equal(await init.isVisible(),true,'Initialize action appears ONLY for empty logical table');
   await init.click();
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-base-count')?.textContent.includes('1–120 / 224'),null,{timeout:20000});
   assert.equal(logicalPostCount,1);
   assert.equal(await init.isVisible(),false,'Initialize button hides once logical data exists');
   assert.equal(await page.locator('#workspace .ocr-outline-grid').evaluate(
     el=>el.v2BaseGridPort.getColumns().length),5);
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:mineru-base';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace')&&!document.querySelector('#workspace').hidden&&
      document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===18,null,{timeout:30000});
   const headers=await page.locator('#workspace .ocr-outline-grid').evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.headerName));
   assert.equal(headers.length,18,JSON.stringify(headers));
   assert.equal(headers[0],'BlockID');
   assert.match(await page.locator('#workspace .v2-base-count').textContent(),/1–120 \/ 539/);
   await page.getByRole('button',{name:'SQL 表下一页'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-base-count')?.textContent.includes('121–240'),null,{timeout:12000});
   assert.equal(postCount,1);
   assert.deepEqual(errors,[]);
   console.log('V2_LEGACY_SQLITE_AUTO_REPLACE_BROWSER_PASS',kind,JSON.stringify({physicalTables:sqlOptions.length,baseColumns:headers.length,logicalColumns:logicalHeaders.length,postCount,logicalPostCount,probeCount}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
