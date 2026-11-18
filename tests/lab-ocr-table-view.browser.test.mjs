/** Table AG view integration: all table Block types, merged and PDF-only
 * wrappers, sort, selection/CM6 source, no SQL writes. Synthetic book only.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5484,book='/isolated/table-view-book';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const types=['title','table','table_caption','table_body','table_footnote',
  'table','custom_TABLE_label','chart_body'];
const pbs=['p1b0','p2b0','p2b0s0','p2b0s1','p2b0s2',
  '~merged:1005','p3b1','p3b2'];
const blocks=types.map((type,index)=>({block_id:1000+index,pbs:pbs[index],
  global_page:index===0?0:index<6?1:2,
  parent_block_id:index>=2&&index<=4?1001:null,
  absorbed_into_block_id:index===5?1001:null,
  sibling_order:index,block_type:type,block_group:'para_blocks',
  block_json:JSON.stringify({type,lines:[]}),block_bbox_json:'[45,80,360,210]',
  content_preview:index===3?'<table><tr><td>First</td></tr></table>':
    index===2?'Table caption':index===4?'Table footnote':index===6?'Other table label':'',
  line_count:1,span_count:0,span_types:'',page_size_json:'[595,842]'}));
const sourceTexts=['A title','Table caption',
  '<table><tr><td>First</td></tr></table>','Table footnote',
  'Custom table label','Chart body'];
const blockIds=[1000,1002,1003,1004,1006,1007];
const md=sourceTexts.map((text,i)=>({line_no:i+1,line_id:`table-md-${i}`,
  block_id:blockIds[i],text}));
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
try{
  let ready=false;
  for(let i=0;i<140;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await sleep(145);
  }
  assert(ready,'Vite boot failed: '+log.slice(-1700));
  for(const [name,type] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1200,height:900},hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      let mutationCount=0;
      await page.addInitScript(({book})=>localStorage.setItem(
        'ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
          'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
            category2:'目录',comment:'isolated table book',value:book,
            range:{kind:'server-directory'}}}})),{book});
      await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
        const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
        const params=req.method()==='POST'?req.postDataJSON():{};
        assert.equal(params.workspace??u.searchParams.get('workspace'),book);
        const json=data=>route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify(data)});
        if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',
          body:makeLabOcrPdf(4)});
        if(op==='inspect')return json({status:'unchanged',blocks:blocks.length,
          pages:4,pdf:'table.pdf',sources:[{name:'table.json',pages:4}],mdSupported:true});
        if(op==='minerujson2block')return json({status:'ready',kind:'view',blocks:blocks.length});
        if(op==='rows')return json({table:'block',rows:blocks,total:blocks.length});
        if(op==='block-edit-state')return json({revision:0,cursor:0,history:[],canUndo:false,canRedo:false});
        if(op==='md-state')return json({status:'ready',revision:0,rows:md,total:md.length});
        if(op==='block-break-reviews')return json({status:'ready',reviews:[]});
        if(op==='overlays')return json({page:Number(u.searchParams.get('page')),
          level:'block',pageSize:[595,842],boxes:[]});
        if(req.method()!=='GET')mutationCount++;
        throw Error('Unexpected Table View API: '+op);
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#workspace select.ocr-source-file-select')
        ?.value==='sql:md',null,{timeout:27000});
      const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
      await picker.selectOption('table');
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent
        .includes('AG 表格 · 6 个 Block'),null,{timeout:14000});
      const records=await page.evaluate(()=>[...document.querySelectorAll('.ocr-outline-grid .ag-row')]
        .map(row=>({index:Number(row.getAttribute('row-index')),
          pbs:row.querySelector('[col-id="pbs"]')?.textContent?.trim(),
          type:row.querySelector('[col-id="block_type"]')?.textContent?.trim(),
          line:row.querySelector('[col-id="line_no"]')?.textContent?.trim(),
          merged:row.querySelector('[col-id="merged_into_block_id"]')?.textContent?.trim(),
        })).sort((a,b)=>a.index-b.index));
      assert.equal(records.length,6,'all table block types, not only MD lines');
      assert(records.every(row=>row.type.toLowerCase().includes('table')));
      assert(records.find(row=>row.pbs==='p2b0')?.line==='',
        'table parent without MD must still be included');
      assert(records.find(row=>row.pbs==='p2b0s1')?.line==='3',
        'table_body retains actual CM6 source line');
      assert(records.some(row=>row.pbs==='~merged:1005'),
        'historical absorbed table block is included even without source line');
      // The merge-target metadata is covered by the direct projector test;
      // AG horizontally virtualizes offscreen columns in narrow Dockview.
      assert(!records.some(row=>row.type==='title'||row.type==='chart_body'));
      const header=page.locator('.ocr-outline-grid .ag-header-cell[col-id="pbs"]');
      await header.click(); // default PBS ascending -> descending
      await page.waitForFunction(()=>document.querySelector('.ocr-outline-grid .ag-header-cell[col-id="pbs"]')
        ?.getAttribute('aria-sort')==='descending',null,{timeout:6000});
      await page.locator('.ocr-outline-grid .ag-row')
        .filter({has:page.locator('[col-id="pbs"]',{hasText:'p2b0s1'})}).first().click();
      await page.waitForFunction(()=>document.querySelector('.ocr-cm-source .cm-activeLine')
        ?.textContent?.includes('<table>')??false,null,{timeout:7000});
      assert.match(await page.locator('#status').innerText(),/表格.*table_body.*源码行 3/);
      await page.locator('.ocr-outline-grid .ag-row')
        .filter({has:page.locator('[col-id="pbs"]',{hasText:/^p2b0$/})}).first().click();
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent
        .includes('仅 PDF 块（无直接 MD 行）'),null,{timeout:8000});
      assert.equal(mutationCount,0,'table view has no write API');
      assert.deepEqual(errors,[]);
      console.log('LAB_OCR_TABLE_VIEW_PASS',name,JSON.stringify({
        tableRows:records.length,sourceLine:3,pdfOnly:true,
        merged:true,sorted:true,mutations:mutationCount}));
    }finally{await browser.close();}
  }
}finally{vite.kill('SIGTERM');}
