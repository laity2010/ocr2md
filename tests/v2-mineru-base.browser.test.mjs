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
   const page=await browser.newPage({viewport:kind==='webkit'?{width:834,height:1112}:{width:1280,height:850},
     hasTouch:true,...(kind==='webkit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const books='/demo/books/my-book';let exists='retired-v2',postCount=0,logicalReady=false,mdRequests=0,probeCount=0;
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
   const logicalCols=['logical_id','base_blockid','parent_id','logical_order','markdown_text','block_type'];
   const tables=[{name:'mineru_base',columns:cols},{name:'logical_block',columns:logicalCols}];
   const rows=Array.from({length:120},(_,i)=>Object.fromEntries(cols.map(k=>[k,k==='blockid'?i+1:k==='block_type'?'text':k==='block_json'?'{"type":"text"}':null])));
   // Match the actual WP03 out-of-band UTF-16 segment contract. The single
   // CM6 source is automatically populated with all 224 logical rows.
   const fragments=Array.from({length:224},(_,i)=>
     i===0?'# WP04 Chapter 🧪':i===1?'Original text':i===2?'':i===3?'中文😀 content':`Paragraph ${i+1}`);
   const segments=[];let markdown='';
   for(let i=0;i<fragments.length;i++){
     if(i)markdown+='\n\n';
     const startUtf16=markdown.length;
     markdown+=fragments[i];
     segments.push({logicalId:i+1,baseBlockId:i+1,parentId:null,logicalOrder:i+1,
       blockType:i===0?'title':'text',startUtf16,endUtf16:markdown.length});
   }
   const mdSnapshot={schema:'v2-logical-md/v2',markdown,rowCount:224,segments};
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
    const request=route.request();const op=new URL(request.url()).pathname.split('/').at(-1);
    if(op==='import'){
      postCount++;assert.equal(request.postDataJSON().confirm,'import-mineru-base');
      const created=exists==='retired-v2';
      exists=true;logicalReady=true;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created,
        backfilled:!created,blockCount:539,logicalCount:224,sourceCount:1,dbFile:'ocr2md.v2.sqlite'})});
    }
    if(op==='markdown'){
      mdRequests++;assert(logicalReady,'Markdown should only be rendered from initialized logical rows');
      assert.equal(request.method(),'GET');
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(mdSnapshot)});
    }
    if(op==='logical-init')throw Error('Deprecated manual initialization must never be requested');
    if(op==='state'&&exists==='retired-v2')return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'现有 SQLite 不符合 V2 两表结构，拒绝覆盖'})});
    if(op==='state'){
      const query=new URL(request.url()).searchParams;
      const table=query.get('table')||'mineru_base';
      const logical=table==='logical_block';
      assert(['mineru_base','logical_block'].includes(table));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(exists?
        {exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,sourceCount:1,
        tables,tableName:table,paraBlockCount:224,logicalCount:logicalReady?224:0,rowCount:logical?(logicalReady?224:0):539,
        columns:logical?logicalCols:cols,rows:logical?(logicalReady?
          Array.from({length:120},(_,i)=>({logical_id:i+1,base_blockid:i+1,parent_id:null,
            logical_order:i+1,markdown_text:'reconstructed',block_type:'text'})):[]):rows,
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
   // Both physical tables are populated atomically during initial import;
   // choosing logical_block must open its 6-column AG view without a click.
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>!document.querySelector('#workspace')?.hidden&&
      document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===6,
      null,{timeout:30000});
   const logicalHeaders=await page.locator('#workspace .ocr-outline-grid')
     .evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.field));
   assert.deepEqual(logicalHeaders,logicalCols);
   assert.equal(await page.locator('#workspace .ocr-outline-grid').evaluate(
     el=>el.v2BaseGridPort.getColumns().find(column=>column.field==='block_type').headerName),
     'Block Type（当前）');
   assert.match(await page.locator('#workspace .v2-base-count').textContent(),/逻辑表 1–120 \/ 224/);
   assert.equal(await page.getByRole('button',{name:'SQL 表下一页'}).isDisabled(),false);
   assert.equal(await page.getByRole('button',{name:'初始化逻辑表'}).count(),0);
   // WP04 loads this automatically, with two fully blank lines after EVERY
   // block (including the last); no second CM6 editor or SQL document writer.
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().loaded,
     null,{timeout:15000});
   const sourceState=await page.locator('#workspace #editor').evaluate(el=>({
     text:el.v2SourcePort.getMarkdown(),state:el.v2SourcePort.getState(),
     blocks:el.v2SourcePort.getBlocks(),intervals:el.v2SourcePort.getIntervals(),
     cmCount:el.querySelectorAll('.cm-editor').length,
   }));
   assert.equal(sourceState.cmCount,1,'one existing Frame editor host');
   assert.equal(sourceState.blocks.length,224);
   assert.equal(sourceState.blocks[0].markdownText,'# WP04 Chapter 🧪');
   assert.equal(sourceState.blocks[2].markdownText,'');
   assert.equal(sourceState.text,fragments.map(text=>text+'\n\n\n').join(''));
   assert.equal(sourceState.state.dirty,false);
   assert.equal(sourceState.state.undo,0);
   assert.equal(sourceState.state.redo,0);
   assert.equal(await page.locator('#workspace #editor .cm-content').getAttribute('contenteditable'),'true');
   const computed=await page.locator('#workspace #editor .cm-editor').evaluate(el=>({
     background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,
     family:getComputedStyle(el).fontFamily,gutters:el.querySelectorAll('.cm-gutters').length,
   }));
   assert.match(computed.background,/rgb\(47, 56, 62\)/,'V1 Everforest source background');
   assert.equal(computed.gutters,1,'V1 line-number gutter');
   assert.match(computed.family,/Sarasa/i);
   await page.waitForFunction(()=>Boolean(document.querySelector('#workspace #editor .cm-ob-heading-line-1')),
     null,{timeout:12000});
   const headerPx=await page.locator('#workspace #editor .cm-ob-heading-line-1').first()
     .evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
   const bodyPx=await page.locator('#workspace #editor .cm-content')
     .evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
   assert(headerPx>bodyPx*1.8,'V1 Obsidian heading line style should enlarge H1');
   assert.equal(mdRequests,1,'auto load should fetch Markdown once');
   assert.equal(await page.locator('#workspace #undo').isDisabled(),true);
   assert.equal(await page.locator('#workspace #redo').isDisabled(),true);
   // Type directly through the existing native CM6 DOM. No SQL POST is sent.
   await page.locator('#workspace #editor .cm-line').first().click();
   await page.keyboard.press('End');
   await page.keyboard.type(' EDIT');
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[0].markdownText.endsWith(' EDIT'),
     null,{timeout:10000});
   assert.equal(await page.locator('#workspace #undo').isDisabled(),false);
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getState().dirty),true);
   assert.equal(postCount,1,'typing must not post SQL');
   // Replaying the same validated snapshot cannot overwrite unsaved edits.
   assert.equal(await page.locator('#workspace #editor').evaluate((el,snapshot)=>el.v2SourcePort.load(snapshot,'/demo/books/my-book'),mdSnapshot),false);
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getBlocks()[0].markdownText.endsWith(' EDIT')),true);
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[0].markdownText==='# WP04 Chapter 🧪',
     null,{timeout:12000});
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getState().dirty),false);
   assert.equal(await page.locator('#workspace #redo').isDisabled(),false);
   await page.locator('#workspace #redo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[0].markdownText.endsWith(' EDIT'),
     null,{timeout:12000});
   assert.equal(postCount,1,'undo/redo must not post SQL');
   // Structural boundaries are not user text: Ctrl/Meta+A replacement across
   // all blocks must be refused rather than erase identities or blank lines.
   const beforeCross=await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getMarkdown());
   await page.locator('#workspace #editor .cm-content').click();
   await page.keyboard.press('ControlOrMeta+A');
   await page.keyboard.type('SHOULD BE DENIED');
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getMarkdown()),beforeCross);
   assert.equal(postCount,1);
   assert.equal(await page.locator('#workspace .ocr-outline-grid').evaluate(
     el=>el.v2BaseGridPort.getColumns().length),6);
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
   // Simulate a previously-created WP00 SQLite with an empty logical table:
   // the next verified reopen automatically backfills through the SAME import
   // endpoint. The user must not click a separate initializer.
   logicalReady=false;
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('V2 SQLite 就绪'),null,{timeout:25000});
   assert.equal(postCount,2,'previous empty logical table should auto-backfill once');
   assert.equal(await page.getByRole('button',{name:'初始化逻辑表'}).count(),0);
   assert.deepEqual(errors,[]);
   console.log('V2_LEGACY_SQLITE_AUTO_REPLACE_BROWSER_PASS',kind,JSON.stringify({physicalTables:sqlOptions.length,baseColumns:headers.length,logicalColumns:logicalHeaders.length,postCount,mdRequests,probeCount}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
