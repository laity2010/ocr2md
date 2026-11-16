/** PDF source OCR extraction into existing CM6 cursor. No real user DB.
 * Real Dockview/PDF.js/AG/CM6 on Chromium and iPad WebKit.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5396,book='/isolated/pdf-source-extract';
const url=process.env.LAB_OCR_TEST_URL||`http://127.0.0.1:${port}/labs/lab-ocr/`;
const vite=process.env.LAB_OCR_TEST_URL?null:spawn('node',[
 'node_modules/vite/bin/vite.js','--config','labs/lab-ocr/vite.config.mjs',
 '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';vite?.stdout.on('data',c=>serverLog+=c);vite?.stderr.on('data',c=>serverLog+=c);
const sourceText='From MinerU OCR\nsecond OCR line';
const baseBlocks=[
 {block_id:11,pbs:'p1b0',parent_block_id:null,global_page:0,block_type:'text',
  block_json:JSON.stringify({type:'text',lines:[
   {spans:[{content:'From MinerU OCR'}]},{spans:[{content:'second OCR line'}]}]}),
  content_preview:'From MinerU OCR'},
 {block_id:12,pbs:'p1b1',parent_block_id:null,global_page:0,block_type:'image',
  block_json:JSON.stringify({type:'image',lines:[{spans:[{image_path:'source-only-image.png'}]}]}),
  content_preview:'source-only-image.png'},
 {block_id:13,pbs:'p1b2',parent_block_id:null,global_page:0,block_type:'text',
  block_json:JSON.stringify({type:'text',lines:[],lines_deleted:true}),content_preview:''},
 {block_id:14,pbs:'p2b0',parent_block_id:null,global_page:1,block_type:'text',
  block_json:JSON.stringify({type:'text',lines:[{spans:[{content:'Second page'}]}]}),
  content_preview:'Second page'},
].map((row,i)=>({...row,block_group:'para_blocks',sibling_order:i,block_path:'orig.'+i,
 source_name:'source.json',source_block_key:'src:'+row.block_id,
 block_bbox_json:JSON.stringify([45,70+i*110,195,135+i*110]),span_count:1,line_count:1}));
const baseLines=[
 {line_id:'md-1',line_no:1,block_id:11,text:'Intro: here'},
 {line_id:'md-2',line_no:2,block_id:11,text:'Next line'},
 {line_id:'md-3',line_no:3,block_id:14,text:'Second page'},
];
const original=baseLines.map(row=>row.text).join('\n');
const upgraded='Intro: '+sourceText+'here\nNext line\nSecond page';
try{
 let started=false;
 for(let i=0;i<115;i++){
  try{if((await fetch(url)).ok){started=true;break;}}catch{}
  await sleep(180);
 }
 assert(started,'OCR Vite unavailable: '+serverLog.slice(-900));
 for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
   .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||name===process.env.LAB_OCR_TEST_BROWSER)){
  const browser=await engine.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1170,height:850},hasTouch:true});
   page.setDefaultTimeout(20000);
   const jsErrors=[];page.on('pageerror',e=>jsErrors.push(e.message));
   let mdRows=baseLines.map(row=>({...row})),revision=0,saves=0,reads=0,overlays=0;
   let receipt=new Map();
   await page.addInitScript(({book})=>{
    localStorage.setItem('ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
        comment:'Isolated PDF extraction fixture',value:book,range:{kind:'server-directory'}},
    }}));
   },{book});
   await page.route('**/labs/lab-ocr/api/ocr/**',route=>{
    const parsed=new URL(route.request().url()),op=parsed.pathname.split('/').at(-1);
    const payload=route.request().method()==='POST'?JSON.parse(route.request().postData()||'{}'):null;
    const reply=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
    if(op==='inspect')return reply({status:'unchanged',blocks:4,pages:2,pdf:'fixture.pdf',
      sources:[{name:'source.json',pages:2}],mdSupported:true});
    if(op==='minerujson2block')return reply({status:'ready',kind:'view',blocks:4});
    if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(2)});
    if(op==='rows'){
      reads++;
      assert.equal(parsed.searchParams.get('table'),'block');
      return reply({table:'block',total:4,rows:baseBlocks});
    }
    if(op==='block-edit-state')return reply({revision:0,canUndo:false,canRedo:false,cursor:0,history:[]});
    if(op==='md-state')return reply({status:'ready',revision,total:mdRows.length,rows:mdRows});
    if(op==='md-save'){
      saves++;
      if(receipt.has(payload.requestId))return reply(receipt.get(payload.requestId));
      assert.equal(payload.expectedRevision,revision);
      assert.equal(payload.blockRevision,0);
      mdRows=[...mdRows.slice(0,payload.start-1),...payload.insert,
        ...mdRows.slice(payload.start-1+payload.deleteCount)]
        .map((row,i)=>({...row,line_no:i+1}));
      const result={status:'saved',revision:++revision,total:mdRows.length};
      receipt.set(payload.requestId,result);return reply(result);
    }
    if(op==='overlays'){
      overlays++;
      const n=Number(parsed.searchParams.get('page'));
      assert.equal(parsed.searchParams.get('level'),'block','Block overlay remains default without dropdown');
      const bboxes={11:[50,65,195,135],12:[52,185,196,265],
        13:[53,305,195,370],14:[50,75,195,145]};
      return reply({level:'block',page:n,pageSize:[595,842],boxes:baseBlocks
        .filter(row=>row.global_page===n-1).map(row=>({id:'b'+row.block_id,
         blockId:String(row.block_id),pbs:row.pbs,parentBlockId:null,
         blockGroup:'para_blocks',blockType:row.block_type,
         sourceEmpty:row.block_id===13,bbox:bboxes[row.block_id]}))});
    }
    throw Error('Unexpected OCR API '+op);
   });
   await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable
     ?.mdDocument()==='Intro: here\nNext line\nSecond page');
   await page.waitForFunction(()=>document.querySelectorAll(
     '.lab-ocr-pdf-pbs-layer[data-page="1"] .lab-ocr-pdf-pbs-tag').length===3);
   const extract=page.locator('.lab-ocr-pdf-extract-text');
   assert.equal(await extract.count(),1);
   assert.equal(await extract.isDisabled(),true,'No selected source block');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-control,.lab-ocr-pdf-overlay-level').count(),0);
   assert.equal(await page.locator('.lab-ocr-pdf-controls select').count(),1,'Only zoom dropdown remains');
   assert.equal(await page.locator('.lab-ocr-pdf-overlay-layer[data-level="block"]').count()>0,true);
   const tag=id=>page.locator(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
   // Image URL in source preview does NOT qualify as text.
   await tag(12).click();assert.equal(await extract.isDisabled(),true);
   await tag(13).click();assert.equal(await extract.isDisabled(),true,
     'Source-empty lines_deleted OCR block stays disabled');
   await tag(11).click();assert.equal(await extract.isEnabled(),true);
   // Capture existing CodeMirror cursor BEFORE selecting the PDF label:
   // the PDF block focus updates highlights but cannot steal that caret.
   const pos=await page.evaluate(()=>{
     const cm=document.querySelector('.ocr-cm-source').ocrCmTable.editorView();
     cm.dispatch({selection:{anchor:'Intro: '.length}});
     return cm.state.selection.main.head;
   });
   await tag(12).click();assert.equal(await extract.isDisabled(),true);
   await tag(11).click();assert.equal(await extract.isEnabled(),true);
   const still=await page.evaluate(()=>document.querySelector('.ocr-cm-source')
     .ocrCmTable.editorView().state.selection.main.head);
   assert.equal(still,pos,'PDF label selection must not silently move CodeMirror insertion cursor');
   await extract.click();
   await page.waitForFunction(text=>document.querySelector('.ocr-cm-source')
     ?.ocrCmTable?.mdDocument()===text,upgraded,{timeout:8000});
   const newMd=await page.evaluate(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable?.mdRuntime());
   assert.equal(newMd.dirty,true);
   assert.equal(newMd.rows[0].line_id,'md-1');
   assert.equal(newMd.rows[0].block_id,11);
   assert.equal(newMd.rows[1].block_id,11,'New physical row inherits the CM cursor logical BlockID');
   assert.equal(newMd.rows.find(row=>row.text==='Next line')?.line_id,'md-2');
   assert.equal(newMd.rows.find(row=>row.text==='Second page')?.line_id,'md-3');
   assert.equal(newMd.rows.find(row=>row.text==='Second page')?.block_id,14);
   // Use existing CM native undo/redo, never any ad hoc parallel source edit.
   await page.locator('#undo').click();
   await page.waitForFunction(text=>document.querySelector('.ocr-cm-source')
      ?.ocrCmTable?.mdDocument()===text,original,{timeout:6500});
   await page.locator('#redo').click();
   await page.waitForFunction(text=>document.querySelector('.ocr-cm-source')
      ?.ocrCmTable?.mdDocument()===text,upgraded,{timeout:6500});
   await page.locator('#global-save').click();
   await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')
      ?.ocrCmTable?.mdRuntime()?.dirty===false,null,{timeout:15000});
   assert.equal(mdRows.map(row=>row.text).join('\n'),upgraded);
   assert.equal(saves>=1,true);
   await page.reload({waitUntil:'domcontentloaded'});
   await page.waitForFunction(text=>document.querySelector('.ocr-cm-source')
      ?.ocrCmTable?.mdDocument()===text,upgraded,{timeout:12000});
   assert.equal(reads>=1,true);assert.equal(overlays>=1,true);
   assert.deepEqual(jsErrors,[]);
   console.log('LAB_OCR_PDF_EXTRACT_PASS',name,JSON.stringify({reads,overlays,saves,revision}));
  }finally{await browser.close();}
 }
}finally{vite?.kill('SIGTERM');}
