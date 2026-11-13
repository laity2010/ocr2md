/** Explicit SQL init: no automatic SQL review reset on load or reload.
 * Test genuine dropdown interaction and Browser confirmation in Chromium/WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';

const port=5352,book='/isolated/mineru-source';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
 'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),
 '--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';vite.stdout.on('data',c=>logs+=c);vite.stderr.on('data',c=>logs+=c);
const blockRows=[
 {block_id:1,pbs:'p1b0',source_block_key:'s0:p0:para_blocks:b0',source_order:0,
  source_name:'fixture.json',global_page:0,local_page:0,block_group:'para_blocks',
  parent_block_id:null,sibling_order:0,block_path:'0',block_type:'text',
  block_bbox_json:'[30,40,190,100]',page_size_json:'[595,842]',
  line_count:1,span_count:1,span_types:'text',content_preview:'one',
  block_json:'{"type":"text","bbox":[30,40,190,100],"lines":[{"spans":[{"type":"text","content":"one"}]}]}',
  has_blocks_field:0},
 {block_id:2,pbs:'p1b1',source_block_key:'s0:p0:para_blocks:b1',source_order:0,
  source_name:'fixture.json',global_page:0,local_page:0,block_group:'para_blocks',
  parent_block_id:null,sibling_order:1,block_path:'1',block_type:'text',
  block_bbox_json:'[330,180,490,260]',page_size_json:'[595,842]',
  line_count:1,span_count:1,span_types:'text',content_preview:'two',
  block_json:'{"type":"text","bbox":[330,180,490,260],"lines":[{"spans":[{"type":"text","content":"two"}]}]}',
  has_blocks_field:0},
];
try{
 let active=false;
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok){active=true;break;}}catch{}
  await sleep(200);}
 assert(active,'Vite not ready '+logs.slice(-500));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1150,height:850},hasTouch:true});
   page.setDefaultTimeout(22000);
   let checked=0,initialized=0,imports=0,readBlock=0;
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
     'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
       comment:'Test',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
    const u=new URL(route.request().url()),op=u.pathname.split('/').at(-1);
    const body=route.request().method()==='POST'?JSON.parse(route.request().postData()||'{}'):null;
    const reply=x=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(x)});
    if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});
    if(op==='inspect'){checked++;return reply({status:'unchanged',blocks:2,pages:2,pdf:'fixture.pdf',sources:[{name:'fixture.json',pages:2}]});}
    if(op==='import'){imports++;throw Error('Existing raw MinerU must never be re-imported');}
    if(op==='minerujson2block')return reply({status:initialized?'ready':'missing',
      kind:initialized?'view':null,blocks:initialized?2:0});
    if(op==='minerujson2span')throw Error('No Span should be initialized for the new schema');
    if(op==='initialize-sql'){
      assert.equal(body.workspace,book);
      assert.equal(body.confirmReset,true);
      initialized++;
      return reply({status:'initialized',kind:'view',table:'block',blocks:2,
        extensionRows:2,clearedReviewHistory:true});
    }
    if(op==='block-edit-state')return reply({revision:0,canUndo:false,canRedo:false,cursor:0,history:[]});
    if(op==='rows'){
      if(u.searchParams.get('table')==='block'){
        readBlock++;
        return reply({table:'block',total:2,rows:blockRows});
      }
      return reply({table:'minerujson',total:2,rows:[
       {id:1,global_page:0,source_name:'fixture.json',local_page:0,block_group:'para_blocks',block_json:'{"raw":true}'},
       {id:2,global_page:0,source_name:'fixture.json',local_page:0,block_group:'para_blocks',block_json:'{"raw":true}'},
      ]});
    }
    if(op==='overlays'){
      const p=Number(u.searchParams.get('page')),level=u.searchParams.get('level');
      return reply({level,page:p,pageSize:[595,842],
        boxes:initialized&&level==='block'&&p===1?blockRows.map(r=>({
          id:'b'+r.block_id,blockId:String(r.block_id),pbs:r.pbs,
          parentBlockId:null,blockGroup:'para_blocks',blockType:'text',bbox:JSON.parse(r.block_bbox_json)})):[]});
    }
    throw Error('Unexpected API operation '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   const nav=page.locator('#workspace select.ocr-source-file-select');
   await page.waitForFunction(()=>document.querySelector('option[value="sql:initialize"]')&&
     document.querySelector('option[value="sql:minerujson"]')&&
     document.querySelector('.lab-ocr-pdf-root'));
   assert.equal(initialized,0,'Opening a book must not rebuild its extension');
   assert.equal(await nav.locator('option[value="sql:block"]').count(),0);
   assert.equal(await nav.locator('option[value="sql:span"]').count(),0);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('option[value="sql:initialize"]')&&
     document.querySelector('option[value="sql:minerujson"]'));
   assert.equal(initialized,0,'Reload must not rebuild');
   const invokeInit=async()=>{
     await page.locator('#workspace .ocr-navigation-files .ts-control').click();
     const popup=page.locator('.ocr-navigation-popup-files:visible');
     await popup.locator('.option').filter({hasText:'数据库管理'}).click();
   };
   page.once('dialog',async dialog=>{
     assert.match(dialog.message(),/清空现有人工关系/);
     await dialog.dismiss();
   });
   await invokeInit();
   await sleep(140);
   assert.equal(initialized,0,'Cancel must keep existing review data');
   page.once('dialog',async dialog=>{assert.match(dialog.message(),/清空现有人工关系/);await dialog.accept();});
   await invokeInit();
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
     document.querySelectorAll('#workspace .ag-row').length===2).catch(async error=>{
       console.error('INITIALIZE_BROWSER_DIAG',name,JSON.stringify({
         initialized,checked,readBlock,
         status:await page.locator('#status').innerText(),
         navValue:await nav.inputValue(),
         options:await nav.locator('option').evaluateAll(nodes=>nodes.map(n=>[n.value,n.textContent])),
         agRows:await page.locator('#workspace .ag-row').count(),
         errors
       }));
       throw error;
     });
   assert.equal(initialized,1);
   assert.equal(readBlock,1);
   assert.equal(await nav.locator('option[value="sql:span"]').count(),0);
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-level option[value="span"]')
     .evaluate(option=>option.disabled),true);
   await page.waitForFunction(()=>document.querySelectorAll('.lab-ocr-pdf-pbs-tag').length===2,
     null,{timeout:12000}).catch(async error=>{
       console.error('INIT_PDF_BOX_DIAG',name,JSON.stringify({
         status:await page.locator('#status').innerText(),
         initialized,
         overlayLevel:await page.locator('.lab-ocr-pdf-overlay-level').inputValue(),
         boxes:await page.locator('.lab-ocr-pdf-overlay-box').count(),
         errors,
       }));
       throw error;
     });
   assert.equal(imports,0);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('select.ocr-source-file-select')?.value==='sql:block'&&
     document.querySelectorAll('#workspace .ag-row').length===2);
   assert.equal(initialized,1,'Reopen view is read-only and must not clear extension');
   assert.equal(imports,0);
   assert.deepEqual(errors,[]);
   console.log('LAB_OCR_EXPLICIT_VIEW_INIT_PASS',name,
      JSON.stringify({initialized,checked,imports,readBlock}));
  }finally{await browser.close();}
 }
}finally{vite.kill('SIGTERM');}
