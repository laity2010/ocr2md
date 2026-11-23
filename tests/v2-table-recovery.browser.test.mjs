/** WP15: use only V2's existing SQL group + native CM6 history/MD commit. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const port=5449,url=`http://127.0.0.1:${port}/labs/lab-ocr-v2/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr-v2/vite.config.mjs',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';for(const stream of [server.stdout,server.stderr])stream.on('data',x=>log+=x);
try{
 for(let n=0;n<100;n++){
  try{if((await fetch(url)).ok)break;}catch{}
  if(n===99)throw Error('V2 WP15 fixture server failed '+log);
  await sleep(200);
 }
 for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:834,height:1112}:{width:1280,height:850},
    hasTouch:true,...(name==='iPad-WebKit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const book='/demo/books/table-recovery';
   let previews=0,commits=0,structurePosts=0,rebuildPosts=0;
   const logicalCols=['logical_id','base_blockid','parent_id','logical_order','md_block','block_type','p','b','s','raw_path'];
   const baseCols=['blockid','block_group','block_type','block_json'];
   const types=['table','table_caption','table_body','table_footnote'];
   const rows=types.map((type,i)=>({logical_id:i+1,base_blockid:1,parent_id:i?1:null,
    logical_order:i+1,md_block:'',block_type:type,p:4,b:0,s:i,raw_path:i?`$.blocks[${i-1}]`:'$',raw_block:''}));
   const after=['','Table 1 (continued)','<table><tr><td>B. Sample Distribution of Information Ratios</td></tr></table>',
    'Notes: Information ratio'];
   const segments=[];let markdown='';
   for(const [i,r] of rows.entries()){
    if(i)markdown+='\n\n';
    const startUtf16=markdown.length;markdown+=r.md_block;
    segments.push({logicalId:r.logical_id,baseBlockId:r.base_blockid,parentId:r.parent_id,
      logicalOrder:r.logical_order,blockType:r.block_type,p:r.p,b:r.b,s:r.s,startUtf16,endUtf16:markdown.length});
   }
   const mdSnapshot={schema:'v2-logical-md/v2',rowCount:rows.length,markdown,segments};
   await page.addInitScript(path=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',JSON.stringify({settings:{
    'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
    'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
    'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:path,range:{kind:'server-directory'}}
   }})),book);
   await page.route('**/labs/lab-frame/api/workspace-io/roots',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/books']})}));
   await page.route('**/labs/lab-frame/api/workspace-io/probe',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})}));
   await page.route('**/labs/lab-frame/api/workspace-io/session',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authorized:true})}));
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
    const req=route.request(),op=new URL(req.url()).pathname.split('/').at(-1);
    const reply=(obj,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(obj)});
    if(op==='state'){
     const table=new URL(req.url()).searchParams.get('table')||'mineru_base',logical=table==='logical_block';
     return reply({exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:1,logicalCount:4,paraBlockCount:1,sourceCount:1,
      tables:[{name:'mineru_base',columns:baseCols},{name:'logical_block',columns:logicalCols}],
      tableName:table,rowCount:logical?4:1,offset:0,columns:logical?logicalCols:baseCols,
      rows:logical?rows:[{blockid:1,block_group:'para_blocks',block_type:'table',block_json:'{"type":"table"}'}]});
    }
    if(op==='markdown')return reply(mdSnapshot);
    if(op==='table-repair-preview'){
     previews++;assert.equal(req.method(),'GET');
     const candidates=rows.slice(1).filter(r=>r.md_block==='').map(r=>({
      logicalId:r.logical_id,before:r.md_block,after:after[r.logical_id-1],reason:'same-page-preproc'}));
     return reply({schema:'v2-table-repair/v1',candidates,changeCount:candidates.length,skippedEdited:0});
    }
    if(op==='md-commit'){
     commits++;const data=req.postDataJSON();assert.equal(data.confirm,'commit-v2-md');
     for(const item of data.changes){
      assert.deepEqual(Object.keys(item).sort(),['after','before','logicalId']);
      const row=rows.find(r=>r.logical_id===item.logicalId);
      assert.equal(row.md_block,item.before);row.md_block=item.after;
     }
     return reply({saved:true,changedRows:data.changes.length});
    }
    if(op==='logical-rebuild'){rebuildPosts++;throw Error('Table recovery must not rebuild logical SQL');}
    if(op==='structure-commit'){structurePosts++;throw Error('Table recovery must not alter PBS');}
    if(op==='pdf-map')return reply({error:'No PDF fixture'},404);
    throw Error('Unexpected V2 operation '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().loaded,
    null,{timeout:20000});
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
    select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-logical-page')?.textContent.includes('p4'),null,{timeout:10000});
   const before=await page.locator('#workspace #editor').evaluate(el=>({
    texts:el.v2SourcePort.getBlocks().map(r=>r.markdownText),
    pbs:el.v2SourcePort.getStructureRows(),
   }));
   assert.deepEqual(before.texts,['','','','']);
   await page.locator('#workspace .ts-wrapper.ocr-navigation-files .ts-control').click();
   const head=page.locator('.ocr-navigation-popup-files:visible .optgroup-header').filter({hasText:/^SQL$/}).first();
   if(name==='iPad-WebKit')await head.tap();else await head.click();
   const dialog=page.locator('#v2-sql-actions-dialog'),btn=dialog.getByRole('button',{name:'恢复跨页表格正文（不重建）'});
   assert.equal(await btn.isEnabled(),true);
   await btn.click();
   await page.waitForFunction(()=>document.querySelector('.v2-sql-action-table-repair')?.textContent.includes('确认恢复 3 行'),null,{timeout:12000});
   assert.equal(previews,1);assert.equal(commits,0);assert.equal(rebuildPosts,0);
   assert.deepEqual(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getBlocks().map(r=>r.markdownText)),before.texts,
    'read-only preview and first click must not modify CM6');
   await dialog.getByRole('button',{name:'确认恢复 3 行表格正文'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[2]?.markdownText.includes('<table>'),null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(commits,1);assert.equal(structurePosts,0);assert.equal(rebuildPosts,0);
   assert.deepEqual(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getStructureRows()),before.pbs);
   assert.deepEqual(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getBlocks().map(r=>r.markdownText)),after);
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[2]?.markdownText==='',null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(commits,2);
   await page.locator('#workspace #redo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[2]?.markdownText.includes('<table>'),null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(commits,3);assert.equal(structurePosts,0);
   assert.deepEqual(errors,[]);
   console.log('WP15_TABLE_RECOVERY_BROWSER_PASS',name,JSON.stringify({previewRequests:previews,mdCommits:commits,structurePosts}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
