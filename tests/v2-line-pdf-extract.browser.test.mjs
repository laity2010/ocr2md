/** WP17 · true V1 gutter / V1 PDF.js text layer, one CM6 + SQL MD authority. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makePDF} from './v2-pdf-fixture.mjs';
const port=5457,url=`http://127.0.0.1:${port}/labs/lab-ocr-v2/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr-v2/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';for(const stream of [server.stdout,server.stderr])stream.on('data',x=>serverLog+=x);
const book='/demo/books/wp17-pdf';const pageSize=[600,800];
const pdf=makePDF([pageSize]);
const rows=[
 {logical_id:11,base_blockid:10,parent_id:null,logical_order:1,md_block:'',block_type:'text',p:0,b:0,s:0,raw_path:'$'},
 {logical_id:12,base_blockid:11,parent_id:null,logical_order:2,md_block:'Second row',block_type:'text',p:0,b:1,s:0,raw_path:'$'},
 {logical_id:13,base_blockid:12,parent_id:null,logical_order:3,md_block:'Third row',block_type:'text',p:0,b:2,s:0,raw_path:'$'},
];
const pdfMap={schema:'v2-pdf-projection/v1',pageCount:1,pageSizes:[pageSize],logicalCount:3,mappedCount:3,
 sourcePath:'minerujson/test.json',unmappedLogicalIds:[],pbs:{11:'p0b0s0',12:'p0b1s0',13:'p0b2s0'},
 covers:rows.map((r,i)=>({logicalId:r.logical_id,baseBlockId:r.base_blockid,parentId:null,
  logicalOrder:r.logical_order,pbs:`p0b${i}s0`,physicalPageIndex:0,physicalBlockIndex:i,
  pageSize,bbox:i===0?[10,12,340,120]:i===1?[30,300,350,380]:[30,600,350,700],empty:!r.md_block}))};
const columns=['logical_id','base_blockid','parent_id','logical_order','md_block','block_type','p','b','s','raw_path'];
function snapshot(){let markdown='';const segments=[];
 for(const [i,row] of rows.entries()){
  if(i)markdown+='\n\n';const startUtf16=markdown.length;
  markdown+=row.md_block;
  segments.push({logicalId:row.logical_id,baseBlockId:row.base_blockid,parentId:row.parent_id,
   logicalOrder:row.logical_order,blockType:row.block_type,p:row.p,b:row.b,s:row.s,
   startUtf16,endUtf16:markdown.length});
 }
 return {schema:'v2-logical-md/v2',rowCount:rows.length,markdown,segments};
}
try{
 for(let n=0;n<120;n++){
  try{if((await fetch(url)).ok)break;}catch{}
  if(n===119)throw Error('WP17 Vite unavailable '+serverLog);
  await sleep(170);
 }
 for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]].filter(([name])=>!process.env.V2_TEST_BROWSER||name===process.env.V2_TEST_BROWSER)){
  const browser=await browserType.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:834,height:1112}:{width:1170,height:880},
    hasTouch:true,...(name==='iPad-WebKit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   let mdCommits=0,structurePosts=0,pdfGets=0;
   rows[0].md_block='';rows[1].md_block='Second row';rows[2].md_block='Third row';
   await page.addInitScript(directory=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',JSON.stringify({settings:{
    'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
    'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
    'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:directory,range:{kind:'server-directory'}},
   }})),book);
   await page.route('**/labs/lab-frame/api/workspace-io/roots',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/books']})}));
   await page.route('**/labs/lab-frame/api/workspace-io/probe',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})}));
   await page.route('**/labs/lab-frame/api/workspace-io/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authorized:true})}));
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
    const req=route.request(),op=new URL(req.url()).pathname.split('/').at(-1);
    const respond=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(op==='state'){
     const table=new URL(req.url()).searchParams.get('table')||'mineru_base';
     const logical=table==='logical_block';
     return respond({exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:3,logicalCount:3,paraBlockCount:3,sourceCount:1,
      tables:[{name:'mineru_base',columns:['blockid','block_group','block_type','block_json']},{name:'logical_block',columns}],
      tableName:table,rowCount:3,offset:0,columns:logical?columns:['blockid','block_group','block_type','block_json'],
      rows:logical?rows:rows.map(r=>({blockid:r.base_blockid,block_group:'para_blocks',block_type:'text',block_json:'{"type":"text"}'}))});
    }
    if(op==='markdown')return respond(snapshot());
    if(op==='pdf-map')return respond(pdfMap);
    if(op==='pdf'){pdfGets++;return route.fulfill({status:200,contentType:'application/pdf',body:pdf});}
    if(op==='md-commit'){
     const body=req.postDataJSON();mdCommits++;
     assert.equal(body.confirm,'commit-v2-md');assert.equal(body.workspace,book);
     assert(body.changes.every(item=>Object.keys(item).sort().join(',')==='after,before,logicalId'));
     for(const change of body.changes){
      const row=rows.find(r=>r.logical_id===change.logicalId);
      assert(row,'stable logical_id');assert.equal(row.md_block,change.before,'optimistic before');
      row.md_block=change.after;
     }
     return respond({saved:true,changedRows:body.changes.length});
    }
    if(op==='structure-commit'){structurePosts++;throw Error('WP17 action must not change PBS/SQL structure');}
    throw Error('unexpected operation '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
   // Real V1/V2 Frame opens Settings first. Switch the ORIGINAL navigation
   // (do not bypass UI authorization or mount a synthetic PDF owner).
   await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:logical_block"]'),null,{timeout:20000});
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(el=>{
     el.value='sql:logical_block';el.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().loaded,null,{timeout:25000});
   try{await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState().loaded,null,{timeout:18000});}
   catch(e){console.log('WP17_PDF_LOAD_DIAG',name,JSON.stringify(await page.evaluate(()=>({
    status:document.querySelector('#status')?.textContent,
    state:document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState(),
    previewMode:document.querySelector('#workspace .ocr-preview-pane')?.dataset.previewMode,
    split:document.querySelector('#workspace .ocr-preview-split-toggle input')?.checked,
    pages:document.querySelectorAll('#workspace .ocr-preview-pdf-host .page').length,
    canvases:document.querySelectorAll('#workspace .ocr-preview-pdf-host canvas').length,
    errors:window.__v2PdfStatuses,
   }))),errors,serverLog.slice(-950));throw e;}
   const source=page.locator('#workspace #editor'),pdfHost=page.locator('#workspace .ocr-preview-pdf-host');
   assert.deepEqual(await source.evaluate(el=>el.v2SourcePort.getBlocks().map(x=>x.markdownText)),['','Second row','Third row']);
   // The first stock lineNumbers extension is REPLACED, not stacked. V1 only
   // current focus line shows a true button with a popup.
   await source.evaluate(el=>el.v2SourcePort.locateLogicalId(12));
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-cm-line-number-button'),null,{timeout:12000});
   assert.equal(await source.locator('.ocr-cm-line-button-gutter').count(),1);
   assert.equal(await source.locator('.cm-lineNumbers').count(),1,'no duplicate line-number gutter');
   const button=source.locator('.ocr-cm-line-number-button');
   assert.equal(await button.count(),1,'only one active line button');
   await button.click();
   const menu=page.getByRole('menu',{name:/第 \d+ 行操作/});
   assert.equal(await menu.getByRole('menuitem',{name:'删除当前行'}).count(),1);
   await menu.getByRole('menuitem',{name:'删除当前行'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[1]?.markdownText==='',null,{timeout:10000});
   assert.equal(await source.evaluate(el=>el.v2SourcePort.getBlocks().length),3);
   assert.deepEqual(await source.evaluate(el=>el.v2SourcePort.getBlocks().map(r=>r.logicalId)),[11,12,13]);
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(rows[1].md_block,'');assert.equal(mdCommits,1);
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[1]?.markdownText==='Second row',null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(mdCommits,2);
   // The original V1 button is disabled before PDF selection; no PDF source
   // text means NO fallback from the nonempty MD Block in the next row.
   const extract=page.locator('#workspace .lab-ocr-pdf-extract-text');
   assert.equal(await extract.isDisabled(),true);
   await pdfHost.evaluate(el=>el.v2PDFPort.focusId(12,true));
   await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="12"]'),null,{timeout:15000});
   await page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="12"]').first().evaluate(el=>el.click());
   await sleep(700);
   assert.equal(await extract.isDisabled(),true,'no native text in this bbox despite MD content');
   await pdfHost.evaluate(el=>el.v2PDFPort.focusId(11,true));
   await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="11"]'),null,{timeout:15000});
   await page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="11"]').first().evaluate(el=>el.click());
   await page.waitForFunction(()=>!document.querySelector('#workspace .lab-ocr-pdf-extract-text')?.disabled,null,{timeout:18000});
   assert.equal(await source.evaluate(el=>el.v2SourcePort.getBlocks()[0].markdownText),'');
   await extract.click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[0]?.markdownText.includes('Synthetic PDF page 1'),null,{timeout:10000});
   assert.deepEqual(await source.evaluate(el=>el.v2SourcePort.getBlocks().map(r=>r.logicalId)),[11,12,13]);
   const actual=await source.evaluate(el=>el.v2SourcePort.getBlocks().map(r=>r.markdownText));
   assert.equal(actual[0],'Synthetic PDF page 1');assert.equal(actual[1],'Second row');
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(mdCommits,3);assert.equal(rows[0].md_block,'Synthetic PDF page 1');
   await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="11"]')?.dataset.mdEmpty==='false',null,{timeout:12000});
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[0]?.markdownText==='',null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(mdCommits,4);
   await page.locator('#workspace #redo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[0]?.markdownText==='Synthetic PDF page 1',null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,null,{timeout:15000});
   assert.equal(mdCommits,5);assert.equal(structurePosts,0);assert.equal(pdfGets,1);
   assert.deepEqual(errors,[]);
   console.log('WP17_V1_GUTTER_NATIVE_PDF_TEXT_PASS',name,JSON.stringify({mdCommits,pdfGets,structurePosts}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
