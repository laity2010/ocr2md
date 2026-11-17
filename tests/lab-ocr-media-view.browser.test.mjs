/** Isolated WCP44 Media AG -> Main resumable adapter -> CM6 -> SQLite CAS.
 * Both Chromium and iPad-WebKit. Never accesses an actual user book.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const port=5468,book='/isolated/media-view-book';
const url=`http://127.0.0.1:${port}/labs/lab-ocr/`;
const remote='https://cdn-mineru.openxlab.org.cn/demo.png';
const local='media/'+'c'.repeat(24)+'.png';
const orphan='media/'+'d'.repeat(24)+'.png';
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/eZ8AAAAASUVORK5CYII=','base64');
const lines=[`Images ![one](${remote}) and ![two](${remote}).`,
  `Local ![present](${local}).`,
  'Plain paragraph with no media'];
const blocks=lines.map((text,i)=>({block_id:400+i,pbs:`p${i+1}b0`,global_page:i,
  parent_block_id:null,sibling_order:i,block_type:'text',block_group:'para_blocks',
  absorbed_into_block_id:null,block_json:JSON.stringify({type:'text',lines:[{spans:[{type:'text',content:text}]}]}),
  block_bbox_json:'[40,70,420,145]',content_preview:text,
  line_count:1,span_count:1,span_types:'text',page_size_json:'[595,842]'}));
const initial=lines.map((text,i)=>({line_no:i+1,line_id:`media-line-${i}`,
  block_id:400+i,text}));
const vite=spawn('node',['node_modules/vite/bin/vite.js','--config',
  'labs/lab-ocr/vite.config.mjs','--host','127.0.0.1','--port',String(port),'--strictPort'],
 {stdio:['ignore','pipe','pipe']});
let log='';vite.stdout.on('data',x=>log+=x);vite.stderr.on('data',x=>log+=x);
try{
  let ready=false;
  for(let i=0;i<160;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await sleep(130);
  }
  assert(ready,'Vite failed to boot: '+log.slice(-1200));
  for(const [name,browserType] of [['Chromium',chromium],['iPad-WebKit',webkit]]
    .filter(([name])=>!process.env.LAB_OCR_TEST_BROWSER||name===process.env.LAB_OCR_TEST_BROWSER)){
    const browser=await browserType.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1200,height:900},hasTouch:true});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      let db=initial.map(x=>({...x})),revision=0,mdSaves=0,blockSaves=0,chunkCalls=0,inventoryCalls=0;
      await page.addInitScript(({book})=>localStorage.setItem(
        'ocr2md.lab-ocr.settings.json.v1',JSON.stringify({settings:{
          'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',
            category2:'目录',comment:'isolated synthetic media',value:book,
            range:{kind:'server-directory'}}}})),{book});
      await page.route('**/labs/lab-ocr/api/ocr/**',async route=>{
        const req=route.request(),u=new URL(req.url()),op=u.pathname.split('/').at(-1);
        const json=obj=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(obj)});
        const payload=req.method()==='POST'?req.postDataJSON():{};
        assert.equal(payload.workspace??u.searchParams.get('workspace'),book,'Lab media workspace isolation');
        if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:makeLabOcrPdf(4)});
        if(op==='inspect')return json({status:'unchanged',blocks:blocks.length,pages:4,
          pdf:'media.pdf',sources:[{name:'media.json',pages:4}],mdSupported:true});
        if(op==='minerujson2block')return json({status:'ready',kind:'view',blocks:blocks.length});
        if(op==='rows')return json({table:'block',rows:blocks,total:blocks.length});
        if(op==='block-edit-state')return json({revision:0,cursor:0,history:[],canUndo:false,canRedo:false});
        if(op==='md-state')return json({status:'ready',revision,rows:db,total:db.length});
        if(op==='block-break-reviews')return json({status:'ready',reviews:[]});
        if(op==='media-inventory'){
          inventoryCalls++;
          return json({files:[{path:local,bytes:123},{path:orphan,bytes:123}]});
        }
        if(op==='media-status'){
          assert.equal(u.searchParams.get('url'),remote);
          return json({state:'partial',bytes:12,total:24});
        }
        if(op==='media-chunk'){
          assert.equal(payload.url,remote);
          chunkCalls++;
          if(chunkCalls%2===1)return json({state:'partial',bytes:16,total:24});
          return json({state:'complete',bytes:24,total:24,path:local});
        }
        if(op==='media-file'){
          assert([local,orphan].includes(u.searchParams.get('path')));
          return route.fulfill({status:200,contentType:'image/png',body:image});
        }
        if(op==='md-save'){
          mdSaves++;
          assert.equal(payload.expectedRevision,revision);
          db.splice(payload.start-1,payload.deleteCount,...payload.insert);
          db=db.map((item,i)=>({...item,line_no:i+1}));
          revision++;
          return json({revision,total:db.length});
        }
        if(op==='block-edit-batch'){blockSaves++;throw Error('Media must not write block SQL');}
        if(op==='overlays')return json({page:Number(u.searchParams.get('page')),
          level:'block',pageSize:[595,842],boxes:[]});
        throw Error('Unexpected API: '+op);
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#workspace select.ocr-source-file-select')
        ?.value==='sql:md',null,{timeout:26000});
      const picker=page.locator('.ocr-outline-pane .ocr-ag-module-select');
      await picker.selectOption('media');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-lab-media-preview').length>=4,
        null,{timeout:16000});
      assert.equal(await page.locator('.ocr-lab-media-action').count(),2,
        'two source refs, same remote URL, local and orphan are read-only');
      await page.waitForFunction(()=>document.querySelector('.ocr-lab-media-action')?.textContent==='续传',null,{timeout:8000});
      await page.locator('.ocr-lab-media-action').first().click();
      await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable
        ?.mdRuntime()?.rows[0]?.text.includes('media/'),null,{timeout:12000});
      const modified=await page.evaluate(()=>document.querySelector('.ocr-cm-source').ocrCmTable.mdRuntime().rows);
      assert.equal((modified[0].text.match(/media\//g)||[]).length,2,
        'one download replaces both references');
      assert.deepEqual(modified.map(x=>x.line_id),initial.map(x=>x.line_id));
      assert.equal(chunkCalls,2,'resume via two byte chunks, duplicate URL downloaded once');
      await page.waitForFunction(()=>document.querySelector('.ocr-lab-media-preview a')!==null ||
        document.querySelectorAll('.ocr-lab-media-preview').length>=4);
      await page.waitForFunction(()=>document.querySelector('.ocr-source-pane #undo')
        ?.disabled===false,null,{timeout:7000});
      await page.locator('.ocr-source-pane #undo').click();
      await page.waitForFunction(url=>document.querySelector('.ocr-cm-source')?.ocrCmTable
        ?.mdRuntime()?.rows[0]?.text.includes(url),remote,{timeout:7000});
      const undone=await page.evaluate(()=>document.querySelector('.ocr-cm-source').ocrCmTable.mdRuntime().rows);
      assert.deepEqual(undone.map(x=>x.text),lines,'one Undo restores all references');
      assert.deepEqual(undone.map(x=>x.line_id),initial.map(x=>x.line_id));
      await page.locator('.ocr-source-pane #redo').click();
      await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable
        ?.mdRuntime()?.rows[0]?.text.includes('media/'),null,{timeout:7000});
      await page.waitForFunction(()=>document.querySelector('.ocr-cm-source')?.ocrCmTable
        ?.mdRuntime()?.dirty===false,null,{timeout:14000});
      assert.equal(mdSaves>=1,true,'resident CM6 saved via existing MD CAS');
      assert.equal(blockSaves,0,'no Block writes');
      assert(inventoryCalls>=1);
      assert.deepEqual(errors,[],'no unhandled browser exceptions');
      console.log(`LAB_OCR_MEDIA_VIEW_PASS ${name} `+JSON.stringify({
        refs:2,chunks:chunkCalls,saves:mdSaves,orphan:true,undoRedo:true}));
    }finally{await browser.close();}
  }
}finally{vite.kill('SIGTERM');}
