/** Real MinerU fixture through V2 one blank line + V1 Markdown renderer.
 * Chrome and iPad WebKit. Browser mocks ONLY the authorized HTTP transport;
 * backend snapshot comes from real Python SQL import, not invented strings.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makePDF} from './v2-pdf-fixture.mjs';
import {composeBlockSource} from '../ui/v2-block-source.js';
const python=String.raw`
import sys,json,shutil,tempfile
from pathlib import Path
sys.path.insert(0,'scripts')
import v2_mineru_base as backend
fixture=Path('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json')
with tempfile.TemporaryDirectory(prefix='wp04-reader-') as td:
  folder=Path(td);(folder/'minerujson').mkdir()
  shutil.copyfile(fixture,folder/'minerujson'/fixture.name)
  backend.new_book(folder)
  print(json.dumps({'source':backend.existing_markdown(folder),'pdf':backend.existing_pdf_map(folder)},ensure_ascii=False))
`;
const evidence=JSON.parse(execFileSync('python3',['-c',python],{encoding:'utf8'}));
const snapshot=evidence.source,projection=evidence.pdf;
const pdfBytes=makePDF(projection.pageSizes);
assert.equal(snapshot.rowCount,267);
assert.equal(projection.mappedCount,267);
const port=5427,url=`http://127.0.0.1:${port}/labs/lab-ocr-v2/`;
const server=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-ocr-v2/vite.config.mjs',
  '--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>logs+=chunk);
try{
  for(let i=0;i<100;i++){
    try{if((await fetch(url)).ok)break;}catch{}
    if(i===99)throw Error('V2 fixture server failed '+logs);
    await sleep(200);
  }
  for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]
    .filter(([name])=>!process.env.V2_TEST_BROWSER||name===process.env.V2_TEST_BROWSER)){
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:name==='iPad-WebKit'?{width:834,height:1112}:{width:1100,height:900},
        hasTouch:true,...(name==='iPad-WebKit'?{userAgent:'Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'}:{})});
      const errors=[];page.on('pageerror',event=>errors.push(event.message));
      await page.addInitScript(()=>{
        window.__v2PdfStatuses=[];
        document.addEventListener('v2-pdf-status',event=>{
          if(window.__v2PdfStatuses.length<60)window.__v2PdfStatuses.push(event.detail?.text||'');
        });
      });
      const folder='/demo/books/wp04-real-preview';
      // Reproduce the real iPad failure at INITIAL PDF.js pagesinit: Dockview
      // can initialize the PDF with a zero-width (not yet laid out) scroller.
      // Remove only after page initialization, then require auto-refit.
      if(name==='iPad-WebKit')await page.addInitScript(()=>{
        document.addEventListener('DOMContentLoaded',()=>{
          const style=document.createElement('style');
          style.id='v2-test-zero-width-on-pagesinit';
          style.textContent='#workspace .lab-ocr-pdf-scroller{width:0px!important}';
          document.head.append(style);
        },{once:true});
      });
      await page.addInitScript(directory=>localStorage.setItem('ocr2md.lab-ocr-v2-frame.settings.json.v1',
        JSON.stringify({settings:{
          'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',comment:'Sarasa',value:'Sarasa',range:{kind:'readonly'}},
          'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',comment:'字号',value:16,range:{min:8,max:32,step:1}},
          'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',comment:'资料目录绑定',value:directory,range:{kind:'server-directory'}},
        }})),folder);
      await page.route('**/labs/lab-frame/api/workspace-io/roots',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({allowedRoots:['/demo/books']})}));
      await page.route('**/labs/lab-frame/api/workspace-io/probe',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({verified:true,readable:true,writable:true})}));
      await page.route('**/labs/lab-frame/api/workspace-io/session',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({authorized:true})}));
      const baseCols=['blockid','source_path','source_sha256','page_index','page_number','block_group',
        'page_block_index','source_json_path','block_type','mineru_index','bbox_json','angle','level',
        'lines_json','blocks_json','block_json','record_kind','original_bytes'];
      const logicCols=['logical_id','base_blockid','parent_id','logical_order','md_block','block_type','p','b','s','raw_path'];
      const tables=[{name:'mineru_base',columns:baseCols},{name:'logical_block',columns:logicCols}];
      let sqlPosts=0,structurePosts=0,markdownGets=0,pdfGets=0;
      await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
        const req=route.request();const op=new URL(req.url()).pathname.split('/').at(-1);
        if(op==='import'){sqlPosts++;return route.fulfill({status:500,contentType:'application/json',body:'{"error":"No DB import in WP04"}'});}
        if(op==='structure-commit'){
          const body=req.postDataJSON();
          assert.equal(body.confirm,'commit-v2-structure');
          assert.equal(body.workspace,folder);
          assert(body.changes.length>0&&body.changes.every(change=>
            Number.isInteger(change.logicalId)&&change.before&&change.after));
          structurePosts++;
          return route.fulfill({status:200,contentType:'application/json',
            body:JSON.stringify({saved:true,changedRows:body.changes.length,logicalCount:267})});
        }
        if(op==='pdf-map')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(projection)});
        if(op==='pdf'){pdfGets++;return route.fulfill({status:200,contentType:'application/pdf',body:pdfBytes});}
        if(op==='markdown'){markdownGets++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot)});}
        if(op==='state'){
          const query=new URL(req.url()).searchParams;
          const table=query.get('table')||'mineru_base';
          const offset=Number(query.get('offset')||0);
          const rows=table==='logical_block'
            ? projection.covers.map(item=>({logical_id:item.logicalId,
                base_blockid:item.baseBlockId,parent_id:item.parentId,
                p:Number(item.pbs.match(/^p(\d+)/)?.[1]),b:Number(item.pbs.match(/b(\d+)/)?.[1]),
                s:Number(item.pbs.match(/s(\d+)$/)?.[1]),
                logical_order:item.logicalOrder,md_block:(()=>{const r=snapshot.segments.find(s=>s.logicalId===item.logicalId);return snapshot.markdown.slice(r.startUtf16,r.endUtf16)})(),raw_path:'$',raw_block:'ORIGINAL EVIDENCE',block_type:snapshot.segments.find(s=>s.logicalId===item.logicalId).blockType}))
            : projection.covers.slice(offset,offset+120).map(item=>({blockid:item.baseBlockId,
                page_index:item.physicalPageIndex,block_type:'text'}));
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
            exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,paraBlockCount:224,logicalCount:267,
            sourceCount:1,tables,tableName:table,rowCount:table==='logical_block'?267:539,
            columns:table==='logical_block'?logicCols:baseCols,rows,offset,
          })});
        }
        return route.abort();
      });
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      try{
        await page.waitForFunction(()=>document.querySelector('#settings-workspace .ocr-source-file-select option[value="sql:logical_block"]'),null,{timeout:30000});
      }catch(error){
        console.log('REAL_PREVIEW_STARTUP_DEBUG',name,await page.locator('#status').textContent(),errors,logs.slice(-1000));
        throw error;
      }
      await page.locator('#settings-workspace .ocr-source-file-select').evaluate(el=>{
        el.value='sql:logical_block';el.dispatchEvent(new Event('change',{bubbles:true}));
      });
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
        ?.v2MarkdownPreviewPort?.getRenderedCount()>0,null,{timeout:30000});
      const result=await page.locator('#workspace').evaluate(el=>{
        const src=el.querySelector('#editor').v2SourcePort;
        const pane=el.querySelector('.ocr-preview-md-scroll');
        const article=pane.querySelector('article.ocr-markdown');
        return {blockCount:src.getBlocks().length,separator:src.getState().separator,
          sourceLength:src.getMarkdown().length,rendered:pane.v2MarkdownPreviewPort.getRenderedCount(),
          headingCount:article.querySelectorAll('h1,h2,h3,h4').length,
          tableCount:article.querySelectorAll('table').length,
          katexCount:article.querySelectorAll('.katex').length,
          textLength:article.textContent.length,
          editorCount:el.querySelectorAll('#editor .cm-editor').length};
      });
      // WP15: the physical PDF page 5 continued Table 1 is NOT empty just
      // because final para_blocks marked its three children lines_deleted.
      // preproc_blocks from the same page restores caption/HTML/note; page 4
      // receives its own (non-merged) Table 1-B portion without duplicate.
      const getTablePart=(p,b,type)=>{
        const seg=snapshot.segments.find(row=>row.p===p&&row.b===b&&row.blockType===type);
        assert(seg,`missing ${p}/${b}/${type}`);
        return snapshot.markdown.slice(seg.startUtf16,seg.endUtf16);
      };
      assert(getTablePart(4,0,'table_caption').includes('continued'));
      assert(getTablePart(4,0,'table_body').startsWith('<table>'));
      assert(getTablePart(4,0,'table_footnote').includes('Notes:'));
      assert.notEqual(getTablePart(3,1,'table_body'),getTablePart(4,0,'table_body'));
      assert.equal(getTablePart(3,1,'table_footnote'),'','transferred note must not duplicate on the previous page');
      assert.equal(result.blockCount,267);
      assert.equal(result.sourceLength,composeBlockSource(snapshot).source.length,
        'WP09 typed children concatenate without invented text or separators');
      assert.equal(result.separator,'\n\n','WP14B keeps one blank line after each independent parent group');
      assert.equal(result.editorCount,1);
      if(name==='iPad-WebKit'){
        await page.waitForFunction(()=>{
          const state=document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState();
          return state?.fitPending&&state.scrollerWidth===0&&!state.loaded;
        },null,{timeout:15000});
        await page.evaluate(()=>document.getElementById('v2-test-zero-width-on-pagesinit')?.remove());
      }
      try{
        await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')
          ?.v2PDFPort?.getState().loaded,null,{timeout:30000});
      }catch(error){
        console.log('V1_MULTILANE_READY_DIAG',name,
          await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>({
            state:el.v2PDFPort?.getState(),
            controls:el.closest('.ocr-detached-pdf-pane')?.querySelector('.lab-ocr-pdf-controls')?.outerHTML?.slice(0,500),
            canvases:el.querySelectorAll('canvas').length,
            tags:el.querySelectorAll('.lab-ocr-pdf-pbs-tag').length,
            errors:window.__v2PdfStatuses,
          })),errors,logs.slice(-900));
        throw error;
      }
      await page.waitForFunction(()=>document.querySelector(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="23"]'),null,{timeout:20000});
      const pdfState=await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState());
      assert.equal(pdfState.pageCount,22);
      assert.equal(pdfState.mappedCount,267);
      assert.equal(pdfState.renderingOwner,'V1 lab-ocr mountLabOcrPdf');
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>
        ['loadPdf','setOverlays','focusBlock','relayout'].every(name=>
          typeof el.v2PDFPort.getV1Preview()?.[name]==='function')),true);
      assert.equal(await page.locator('#workspace .v2-pdf-label,#workspace .v2-pdf-cover,#workspace .ocr-pdf-block-ctrl').count(),0,
        'neither handmade V2 tags nor Main/V6 PdfPreview may be mounted');
      const firstTag=page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="23"]').first();
      assert.equal(await firstTag.textContent(),'p0b0s0');
      assert.equal(await firstTag.getAttribute('data-lane'),'0');
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host canvas').count()>0,true,'original V1 PDF.js canvas');
      // WP16: the recovered Table 1 has an empty para container s0, but
      // visible typed caption/body/note. V1 OCR source-empty provenance stays
      // true; CURRENT CM6 child text must make the PDF wrapper a SOLID box.
      const recoveredRoot=snapshot.segments.find(r=>r.p===4&&r.b===0&&r.s===0);
      assert(recoveredRoot,'real page 5 continued table root');
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate((el,id)=>
        el.v2PDFPort.focusId(id,true),recoveredRoot.logicalId);
      await page.waitForFunction(id=>{
        const label=document.querySelector(`#workspace .lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
        return !!label&&label.dataset.mdEmpty==='false';
      },recoveredRoot.logicalId,{timeout:18000});
      const recoveredVisual=await page.locator('#workspace .ocr-preview-pdf-host').evaluate((el,id)=>{
        const label=el.querySelector(`.lab-ocr-pdf-pbs-tag[data-block-id="${id}"]`);
        const box=[...el.querySelectorAll('.lab-ocr-pdf-overlay-box')].find(node=>
          node.dataset.blockIds.split(' ').includes(String(id)));
        return {ocrSourceEmpty:label?.dataset.sourceEmpty,liveMdEmpty:label?.dataset.mdEmpty,
          labelBorder:label&&getComputedStyle(label).borderStyle,
          boxBorder:box&&getComputedStyle(box).borderStyle};
      },recoveredRoot.logicalId);
      assert.deepEqual(recoveredVisual,{ocrSourceEmpty:'true',liveMdEmpty:'false',
        labelBorder:'solid',boxBorder:'none'},
      'OCR history must remain visible without incorrectly dashing recovered table');
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.focusId(23,true));
      await page.waitForFunction(()=>document.querySelector(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="23"]'),null,{timeout:18000});

      if(process.env.V2_TEST_WP09_ONLY){
      // WP09 integration gate: real table subtypes have independent logical
      // rows, their own Raw Txt and SOURCE PDF geometry; they are not merged
      // into the single parent table row.
      const rawSub=snapshot.segments.find(row=>row.blockType==='table_caption'&&
        snapshot.markdown.slice(row.startUtf16,row.endUtf16).includes('Table 1.'));
      assert(rawSub,'real MinerU contains independently typed caption');
      const rawParent=snapshot.segments.find(row=>row.logicalId===rawSub.parentId);
      const rawBody=snapshot.segments.find(row=>row.parentId===rawSub.parentId&&
        row.blockType==='table_body');
      assert(rawParent&&rawBody,'parent table retains both typed children');
      assert.equal(rawParent.blockType,'table');
      assert.equal(snapshot.markdown.slice(rawParent.startUtf16,rawParent.endUtf16),'',
        'parent table has no own span text; do not duplicate its children');
      assert(snapshot.markdown.slice(rawBody.startUtf16,rawBody.endUtf16).startsWith('<table>'));
      assert.equal(projection.covers.find(c=>c.logicalId===rawSub.logicalId).pbs.endsWith('s1'),true);
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate((el,id)=>
        el.v2PDFPort.focusId(id,true),rawSub.logicalId);
      await page.waitForFunction(id=>document.querySelector(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="'+id+'"]'),rawSub.logicalId,{timeout:18000});
      // Public V1 label click emits the real focus event that updates AG's
      // page filter. Calling focusId alone only scrolls the PDF viewer.
      await page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="'+rawSub.logicalId+'"]')
        .first().evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelector('#workspace .v2-logical-page')
        ?.textContent.includes('p3 ·'),null,{timeout:12000});
      assert.equal(await page.locator('#workspace #editor').evaluate((el,id)=>
        el.v2SourcePort.getBlocks().find(r=>r.logicalId===id)?.blockType,rawSub.logicalId),
        'table_caption');
      await page.waitForFunction(()=>[...document.querySelectorAll(
        '#workspace .ocr-outline-grid .ag-row [col-id="block_type"]')]
        .some(el=>el.textContent==='table_caption'),null,{timeout:12000});
        assert.deepEqual(errors,[]);
        console.log('WP09_REAL_PDF_TYPED_SUBELEMENTS_PASS',name,
          JSON.stringify({blocks:result.blockCount,rawCaptionId:rawSub.logicalId,
            rawBodyId:rawBody.logicalId,pdfMapped:pdfState.mappedCount}));
        continue;
      }

      const density=await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>{
        const host=el.querySelector('.page[data-page-number="1"]');
        const labels=[...host.querySelectorAll('.lab-ocr-pdf-pbs-tag')];
        const covers=[...host.querySelectorAll('.lab-ocr-pdf-overlay-box')];
        const rect=node=>{
          const r=node.getBoundingClientRect();
          return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};
        };
        const overlap=(a,b)=>a.l<b.r-.6&&a.r>b.l+.6&&a.t<b.b-.6&&a.b>b.t+.6;
        const chips=labels.map(rect),body=covers.map(rect);
        const chipPairs=[];
        for(let i=0;i<chips.length;i++)for(let j=i+1;j<chips.length;j++)
          if(overlap(chips[i],chips[j]))chipPairs.push([i,j]);
        const overText=[];
        for(let i=0;i<chips.length;i++)for(let j=0;j<body.length;j++)
          if(overlap(chips[i],body[j]))overText.push([i,j]);
        const lanes=labels.map(n=>Number(n.dataset.lane));
        return {labels:labels.length,covers:covers.length,chipPairs,overText,
          maxLane:Math.max(...lanes),lanes,
          leaders:host.querySelectorAll('.lab-ocr-pdf-pbs-leaders polyline').length,
          left:labels.filter(n=>n.dataset.side==='left').length,
          right:labels.filter(n=>n.dataset.side==='right').length};
      });
      assert(density.labels>0&&density.covers>0&&density.leaders>0,density);
      assert.equal(density.labels,density.leaders,'V1 each PBS must have its own leader');
      assert.deepEqual(density.chipPairs,[],name+' V1 dynamic lanes must not collide');
      assert.deepEqual(density.overText,[],name+' PBS labels must stay outside OCR rectangles');
      assert(density.lanes.every(n=>Number.isInteger(n)&&n>=0),density);
      assert(density.maxLane>=1,'actual V1 must use multiple outward tracks; single left/right rail is NOT accepted');
      // USER SAFARI REGRESSION: split OFF -> PDF in preview dropdown -> split ON
      // must preserve the original V1 PDF.js viewer/worker and all PBS overlays.
      const split=page.locator('#workspace .ocr-preview-split-toggle input');
      const previewMode=page.locator('#workspace .ocr-preview-mode');
      const livePdf=()=>page.locator('#workspace .ocr-preview-pdf-host');
      assert.equal(await split.isChecked(),true,'V2 starts split with detached PDF');
      assert.equal(await previewMode.locator('option[value="pdf"]').isDisabled(),true);
      assert.equal(pdfGets,1,'initial real PDF downloaded exactly once');
      await page.evaluate(()=>window.__v2PreviewInstance=
        document.querySelector('#workspace .ocr-preview-pdf-host').v2PDFPort.getV1Preview());
      for(let cycle=0;cycle<2;cycle++){
        await split.uncheck();
        await page.waitForFunction(()=>document.querySelectorAll('#workspace .dv-content-container').length===3,
          null,{timeout:12000});
        assert.equal(await previewMode.locator('option[value="pdf"]').isDisabled(),false,
          'unsplit must enable PDF in preview dropdown');
        await previewMode.selectOption('pdf');
        await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pane')?.dataset.previewMode==='pdf'&&
          !!document.querySelector('#workspace .ocr-preview-pane>.ocr-preview-pdf-host'),null,{timeout:12000});
        assert.equal(await page.locator('#workspace .ocr-preview-pane .ocr-preview-pdf-host').isVisible(),true);
        assert.equal(await page.locator('#workspace .ocr-preview-pane .lab-ocr-pdf-controls').count(),1,
          'original V1 toolbar must move into the single preview pane');
        assert.equal(await page.locator('#workspace .ocr-preview-pane .ocr-preview-pdf-host').evaluate(el=>
          el.v2PDFPort.getV1Preview()===window.__v2PreviewInstance),true,
          'unsplit must NOT recreate the V1 PDF viewer');
        assert.equal(await page.locator('#workspace .ocr-preview-pane .ocr-preview-pdf-host').evaluate(el=>
          el.v2PDFPort.getState().loaded),true);
        assert.equal(pdfGets,1,'unsplit must not refetch PDF bytes');
        try{
          await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pane .lab-ocr-pdf-pbs-tag[data-block-id="23"]'),
            null,{timeout:12000});
        }catch(error){
          console.log('SPLIT_UNSPLIT_PDF_DETAIL',name,cycle,JSON.stringify(
            await page.locator('#workspace .ocr-preview-pane').evaluate(el=>{
              const p=el.querySelector('.ocr-preview-pdf-host'),v=p?.v2PDFPort?.getV1Preview();
              return {mode:el.dataset.previewMode,pdfPort:p?.v2PDFPort?.getState(),
                toolbar:el.querySelector('.lab-ocr-pdf-controls')?.outerHTML?.slice(0,320),
                pane:{w:el.clientWidth,h:el.clientHeight},pdf:{w:p?.clientWidth,h:p?.clientHeight},
                scroller:{w:p?.querySelector('.lab-ocr-pdf-scroller')?.clientWidth,
                  h:p?.querySelector('.lab-ocr-pdf-scroller')?.clientHeight,
                  top:p?.querySelector('.lab-ocr-pdf-scroller')?.scrollTop},
                pagecount:p?.querySelectorAll('.page').length,
                firstPage:p?.querySelector('.page')?.outerHTML?.slice(0,400),
                tags:p?.querySelectorAll('.lab-ocr-pdf-pbs-tag').length,
                covers:p?.querySelectorAll('.lab-ocr-pdf-overlay-box').length,
                canvas:p?.querySelectorAll('canvas').length,
                statuses:window.__v2PdfStatuses.slice(-15),
              };
            })));
          throw error;
        }
        await previewMode.selectOption('md');
        assert.equal(await page.locator('#workspace .ocr-preview-pane').getAttribute('data-preview-mode'),'md');
        assert.equal(await page.locator('#workspace .ocr-preview-pane .ocr-preview-md-scroll').isVisible(),true);
        await split.check();
        await page.waitForFunction(()=>document.querySelectorAll('#workspace .dv-content-container').length===4&&
          !!document.querySelector('#workspace .ocr-detached-pdf-pane .ocr-preview-pdf-host'),null,{timeout:12000});
        assert.equal(await previewMode.locator('option[value="pdf"]').isDisabled(),true);
        assert.equal(await livePdf().evaluate(el=>el.v2PDFPort.getV1Preview()===window.__v2PreviewInstance),true,
          'resplit must reparent the SAME V1 PDF viewer');
        assert.equal(await page.locator('#workspace .ocr-detached-pdf-pane .lab-ocr-pdf-controls').count(),1);
        await page.waitForFunction(()=>document.querySelector('#workspace .ocr-detached-pdf-pane .lab-ocr-pdf-pbs-tag[data-block-id="23"]'),
          null,{timeout:12000});
        assert.equal(pdfGets,1,'resplit cannot re-download or clear the PDF');
        assert.equal(await page.locator('#workspace .ocr-preview-pane .ocr-preview-md-scroll').isVisible(),true);
      }
      const boxSelector='#workspace .lab-ocr-pdf-overlay-box[data-block-ids="23"]';
      const coverBefore=await page.locator(boxSelector).first().evaluate(el=>({
        left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,
      }));
      assert(Math.abs(parseFloat(coverBefore.left)-95/634*100)<.001,
        'PDF original bbox x must retain its MinerU page-relative coordinate');
      const zoomSelect=page.locator('#workspace .lab-ocr-pdf-scale');
      await zoomSelect.selectOption('125');
      await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-scale')?.value==='125',
        null,{timeout:12000});
      try{
        await page.waitForFunction(()=>document.querySelector(
          '#workspace .lab-ocr-pdf-overlay-box[data-block-ids="23"]'),null,{timeout:12000});
      }catch(error){
        console.log('V1_MULTILANE_ZOOM_DIAG',name,
          await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>({
            pdf:el.v2PDFPort?.getState(),
            firstPage:el.querySelector('.page[data-page-number="1"]')?.outerHTML?.slice(0,500),
            firstPageCovers:el.querySelectorAll('.page[data-page-number="1"] .lab-ocr-pdf-overlay-box').length,
            pages:el.querySelectorAll('.page').length,
            covers:el.querySelectorAll('.lab-ocr-pdf-overlay-box').length,
            tags:el.querySelectorAll('.lab-ocr-pdf-pbs-tag').length,
            scale:el.closest('.ocr-detached-pdf-pane')?.querySelector('.lab-ocr-pdf-scale')?.value,
            errorStatus:window.__v2PdfStatuses,
          })));
        throw error;
      }
      const coverAfter=await page.locator(boxSelector).first().evaluate(el=>({
        left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,
      }));
      assert.deepEqual(coverAfter,coverBefore,'zoom must keep original normalized MinerU bbox');
      // Original V1 LAB-OCR PBS label => CM6/MD/AG, using stable logical block ID.
      await firstTag.click();
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
        ?.v2MarkdownPreviewPort?.getFocusedId()===23,null,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-outline-grid .v2-sync-ag-row')
        ?.querySelector('[col-id="pbs"]')?.textContent?.includes('p0b0s0'),null,{timeout:10000});
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState().selectedId),23);
      assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head),0);
      // WP19: PDF viewport scrolling is NOT a new selection. Keep the
      // explicit label-click logical ID across page movement, and ensure the
      // linked AG/Markdown/CM6 highlight and caret stay on that same block.
      const pdfScrollBefore=await page.locator('#workspace .lab-ocr-pdf-scroller').evaluate(el=>el.scrollTop);
      await page.locator('#workspace .lab-ocr-pdf-scroller').evaluate(el=>{
        el.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:850}));
        el.scrollTop=Math.min(el.scrollHeight-el.clientHeight,el.scrollTop+850);
        el.dispatchEvent(new Event('scroll'));
      });
      await sleep(350);
      const afterPDFScroll=await page.locator('#workspace').evaluate(el=>({
        pdf:el.querySelector('.ocr-preview-pdf-host').v2PDFPort.getState().selectedId,
        markdown:el.querySelector('.ocr-preview-md-scroll').v2MarkdownPreviewPort.getFocusedId(),
        caret:el.querySelector('#editor').v2SourcePort.getEditorView().state.selection.main.head,
        ag:el.querySelector('.ocr-outline-grid .ag-row.v2-sync-ag-row [col-id="pbs"]')?.textContent,
      }));
      assert.deepEqual(afterPDFScroll,{pdf:23,markdown:23,caret:0,ag:'p0b0s0'},
        'scrolling a PDF page must not automatically move the highlighted logical block');
      await page.locator('#workspace .lab-ocr-pdf-scroller').evaluate((el,scroll)=>{
        el.scrollTop=scroll;
      },pdfScrollBefore);
      await sleep(250);
      // WP07 end-to-end: ACTUAL V1 PDF PBS tag pointer gesture, not a
      // fabricated structural event. The cover geometry and PDF.js instance
      // must stay stable while CM6, AG and PBS tags reflect the change.
      const sourceTag=page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]').first();
      // PDF.js legitimately replaces tag DOM while zoom/scroll settles.
      // Read both live rectangles from one animation frame; never ask
      // Playwright to wait for a particular replaced tag to remain stable.
      await page.waitForFunction(()=>document.querySelector(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]')?.isConnected,null,{timeout:12000});
      await sourceTag.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
      await sleep(250);
      const beforeTag=await sourceTag.textContent();
      assert.equal(beforeTag,'p0b1s0');
      const {sourceRect,targetRect,scrollerRect}=await page.evaluate(()=>{
        const src=document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]');
        const dst=document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="23"]');
        const scroll=document.querySelector('#workspace .lab-ocr-pdf-scroller');
        const box=node=>{const r=node?.getBoundingClientRect();
          return r?{x:r.x,y:r.y,width:r.width,height:r.height}:null;};
        return {sourceRect:box(src),targetRect:box(dst),scrollerRect:box(scroll)};
      });
      assert(sourceRect&&targetRect,'V1 PDF gesture needs visible tag and cover');
      assert(sourceRect.x>scrollerRect.x&&sourceRect.x+sourceRect.width<scrollerRect.x+scrollerRect.width,
        'drag source must be inside the visible PDF scroller');
      assert(targetRect.x>scrollerRect.x&&targetRect.x+targetRect.width<scrollerRect.x+scrollerRect.width,
        'drag target must be inside the visible PDF scroller');
      await page.mouse.move(sourceRect.x+sourceRect.width/2,sourceRect.y+sourceRect.height/2);
      await page.mouse.down();
      await sleep(460); // V1 long-press arm delay is 370ms
      await page.mouse.move(targetRect.x+targetRect.width/2,
        targetRect.y+targetRect.height/2,{steps:8});
      await page.waitForFunction(()=>document.querySelector(
        '.lab-ocr-pdf-drop-guide [data-placement="child"]'),null,{timeout:4000});
      const childSlot=await page.evaluate(()=>{
        const r=document.querySelector('.lab-ocr-pdf-drop-guide [data-placement="child"]').getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height/2};
      });
      await page.mouse.move(childSlot.x,childSlot.y,{steps:6});
      await page.mouse.up();
      try{
        await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort
          ?.getBlocks().find(row=>row.logicalId===24)?.s===1,null,{timeout:5000});
      }catch(error){
        console.log('WP07_GESTURE_DIAG',name,await page.evaluate(()=>({
          statuses:window.__v2PdfStatuses.slice(-15),
          source:document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks().find(r=>r.logicalId===24),
          dragged:document.querySelectorAll('.lab-ocr-pdf-drag-arrow').length,
        })));
        throw error;
      }
      await page.waitForFunction(()=>[...document.querySelectorAll(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]')]
        .some(node=>node.textContent==='p0b0s1'),null,{timeout:18000});
      assert.equal(await page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]')
        .first().getAttribute('data-child'),'true','V1 family tag must update as a child');
      assert.equal(await livePdf().evaluate(el=>el.v2PDFPort.getV1Preview()===window.__v2PreviewInstance),true);
      const coverMoved=await page.locator(boxSelector).first().evaluate(el=>({
        left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,
      }));
      assert.deepEqual(coverMoved,coverBefore,'WP07 must never move original PDF bbox');
      const movedRow=await page.locator('#workspace #editor').evaluate(el=>{
        const r=el.v2SourcePort.getBlocks().find(row=>row.logicalId===24);
        return {logicalId:r.logicalId,baseBlockId:r.baseBlockId,p:r.p,b:r.b,s:r.s,parentId:r.parentId};
      });
      assert.deepEqual(movedRow,{logicalId:24,baseBlockId:24,p:0,b:0,s:1,parentId:23});
      const groupedText=await page.locator('#workspace #editor').evaluate(el=>{
        const port=el.v2SourcePort,intervals=port.getIntervals();
        const head=intervals.find(row=>row.logicalId===23);
        const child=intervals.find(row=>row.logicalId===24);
        return {text:port.getMarkdown().slice(head.from,child.to),
          headPadding:head.groupEndPad,childPadding:child.groupEndPad,
          contiguous:head.to===child.from};
      });
      const firstRaw=snapshot.markdown.slice(snapshot.segments[0].startUtf16,
        snapshot.segments[0].endUtf16);
      const secondRaw=snapshot.markdown.slice(snapshot.segments[1].startUtf16,
        snapshot.segments[1].endUtf16);
      const headLinePad=firstRaw.endsWith('\n')?'':'\n';
      assert.deepEqual(groupedText,{text:firstRaw+headLinePad+secondRaw+'\n\n',
        headPadding:headLinePad.length,childPadding:2,contiguous:true},
      'actual V1 drag must display child on next line without synthetic blank line');
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
      assert.equal(structurePosts,1,'V1 drag must idle-commit one SQL transaction');
      await page.locator('#workspace #undo').click();
      await page.waitForFunction(()=>[...document.querySelectorAll(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]')]
        .some(node=>node.textContent==='p0b1s0'),null,{timeout:12000});
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
      assert.equal(structurePosts,2,'undo must restore SQL PBS');
      await page.locator('#workspace #redo').click();
      await page.waitForFunction(()=>[...document.querySelectorAll(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="24"]')]
        .some(node=>node.textContent==='p0b0s1'),null,{timeout:12000});
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
      assert.equal(structurePosts,3,'redo must persist SQL again');
      assert.equal(await page.locator('#workspace #editor').evaluate(el=>{
        const port=el.v2SourcePort,rows=port.getIntervals();
        const a=rows.find(r=>r.logicalId===23),b=rows.find(r=>r.logicalId===24);
        return port.getMarkdown().slice(a.from,b.to);
      }),groupedText.text,'Undo/Redo must restore group-end blank ownership exactly');
      // Isolated WP08 gate is available when unrelated later PDF page/zoom
      // gestures are intermittently unstable in headless WebKit. The FULL
      // original test below remains intact for WP07/PDF regression.
      if(process.env.V2_TEST_WP08_ONLY){
        assert.deepEqual(errors,[]);
        console.log('WP08_REAL_V1_PDF_CHILD_GROUP_BLANK_PASS',name,
          JSON.stringify({groupedTextLength:groupedText.text.length,
            headPadding:groupedText.headPadding,childPadding:groupedText.childPadding,
            structurePosts}));
        continue;
      }
      // Reproduce the user's exact failing operation on ORIGINAL PDF page 2:
      // p1b3s0 (logicalId 63) AFTER p1b4s0 (logicalId 64), preserving
      // target b4 while assigning source b5 and shifting ALL later b values.
      await zoomSelect.selectOption('page-width');
      await livePdf().evaluate(el=>el.v2PDFPort.focusId(63,true));
      await page.waitForFunction(()=>document.querySelector(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="63"]')&&document.querySelector(
        '#workspace .lab-ocr-pdf-overlay-box[data-block-ids="64"]'),null,{timeout:18000});
      await page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="63"]')
        .first().evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
      await sleep(250);
      const parentRects=await page.evaluate(()=>{
        const a=document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="63"]');
        // On dense PDF pages V1 may place PBS badges on far outward rails;
        // drop capture is the authoritative ORIGINAL target coverage box.
        const b=document.querySelector('#workspace .lab-ocr-pdf-overlay-box[data-block-ids="64"]');
        const clip=document.querySelector('#workspace .lab-ocr-pdf-scroller');
        const rect=el=>{const r=el.getBoundingClientRect();
          return {x:r.x+r.width/2,y:r.y+r.height/2};};
        const viewport=clip.getBoundingClientRect();
        return {from:rect(a),to:rect(b),
          clip:{left:viewport.left,right:viewport.right,top:viewport.top,bottom:viewport.bottom}};
      });
      for(const p of [parentRects.from,parentRects.to]){
        assert(p.x>parentRects.clip.left&&p.x<parentRects.clip.right&&
          p.y>parentRects.clip.top&&p.y<parentRects.clip.bottom,
          'p1b3 source badge and p1b4 target cover must both be reachable');
      }
      const originalP1bbox=await livePdf().evaluate(el=>
        el.v2PDFPort.getCovers().find(c=>c.logicalId===63).bbox);
      await page.mouse.move(parentRects.from.x,parentRects.from.y);
      await page.mouse.down();await sleep(460);
      await page.mouse.move(parentRects.to.x,parentRects.to.y,{steps:9});
      await page.waitForFunction(()=>document.querySelector(
        '.lab-ocr-pdf-drop-guide [data-placement="after"]'),null,{timeout:6000});
      const afterSlot=await page.evaluate(()=>{
        const r=document.querySelector('.lab-ocr-pdf-drop-guide [data-placement="after"]').getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height/2};
      });
      await page.mouse.move(afterSlot.x,afterSlot.y);
      assert.deepEqual(await page.evaluate(()=>({
        guide:document.querySelector('.lab-ocr-pdf-drop-guide')?.dataset.blockId,
        placement:document.querySelector('.lab-ocr-pdf-drop-guide')?.dataset.placement,
      })),{guide:'64',placement:'after'},'V1 must select the exact target and AFTER slot');
      await page.mouse.up();
      try{
        await page.waitForFunction(()=>{
          const list=document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks();
          const find=id=>list?.find(r=>r.logicalId===id);
          return find(63)?.b===5&&find(64)?.b===4&&find(65)?.b===6;
        },null,{timeout:9000});
      }catch(error){
        console.log('WP07_ROOT_AFTER_FAILURE',name,await page.evaluate(()=>({
          status:window.__v2PdfStatuses.slice(-20),
          rows:[63,64,65].map(id=>document.querySelector('#workspace #editor')
            ?.v2SourcePort?.getBlocks().find(r=>r.logicalId===id)),
        })));
        throw error;
      }
      await page.waitForFunction(()=>document.querySelector(
        '#workspace .lab-ocr-pdf-pbs-tag[data-block-id="63"]')?.textContent==='p1b5s0',
        null,{timeout:15000});
      assert.deepEqual(await livePdf().evaluate(el=>
        el.v2PDFPort.getCovers().find(c=>c.logicalId===63).bbox),originalP1bbox,
        'root insertion never alters PDF original bounding boxes');
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getState().dirty===false,null,{timeout:14000});
      assert.equal(structurePosts,4,'parent b+1 insertion must idle-commit once');
      await page.locator('#workspace #undo').click();
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getBlocks().find(r=>r.logicalId===63)?.b===3,null,{timeout:12000});
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getState().dirty===false,null,{timeout:14000});
      assert.equal(structurePosts,5,'parent undo is a new SQLite transaction');
      await page.locator('#workspace #redo').click();
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getBlocks().find(r=>r.logicalId===63)?.b===5,null,{timeout:12000});
      await page.waitForFunction(()=>document.querySelector('#workspace #editor')
        ?.v2SourcePort?.getState().dirty===false,null,{timeout:14000});
      assert.equal(structurePosts,6,'parent redo restores the updated PBS');
      // Real Safari/Chromium gesture repeated at its CURRENT correct slot:
      // show a benign status rather than "写入失败：拖动没有产生结构变化".
      await livePdf().evaluate(el=>el.v2PDFPort.focusId(63,true));
      await page.locator('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="63"]')
        .first().evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
      await sleep(180);
      const repeatedRects=await page.evaluate(()=>{
        const src=document.querySelector('#workspace .lab-ocr-pdf-pbs-tag[data-block-id="63"]');
        const dst=document.querySelector('#workspace .lab-ocr-pdf-overlay-box[data-block-ids="64"]');
        const mid=el=>{const r=el.getBoundingClientRect();
          return {x:r.x+r.width/2,y:r.y+r.height/2};};
        return {source:mid(src),target:mid(dst)};
      });
      await page.mouse.move(repeatedRects.source.x,repeatedRects.source.y);
      await page.mouse.down();await sleep(460);
      await page.mouse.move(repeatedRects.target.x,repeatedRects.target.y,{steps:8});
      await page.waitForFunction(()=>document.querySelector(
        '.lab-ocr-pdf-drop-guide [data-placement="after"]'),null,{timeout:6000});
      const repeatAfter=await page.evaluate(()=>{
        const r=document.querySelector('.lab-ocr-pdf-drop-guide [data-placement="after"]')
          .getBoundingClientRect();
        return {x:r.x+r.width/2,y:r.y+r.height/2};
      });
      await page.mouse.move(repeatAfter.x,repeatAfter.y);
      await page.mouse.up();
      await page.waitForFunction(()=>window.__v2PdfStatuses.some(text=>
        text.includes('已在目标位置')),null,{timeout:6000});
      assert.equal(await page.locator('#workspace #editor').evaluate(el=>
        el.v2SourcePort.getBlocks().find(r=>r.logicalId===63).b),5);
      await sleep(1100);
      assert.equal(structurePosts,6,'real repeated PDF AFTER must not write SQLite');
      await page.locator('#workspace #editor').evaluate((el,last)=>{
        const port=el.v2SourcePort;
        const interval=port.getIntervals().find(row=>row.logicalId===last);
        port.getEditorView().dispatch({selection:{anchor:interval.from}});
      },539);
      await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-page')?.value==='22',
        null,{timeout:18000});
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState().selectedId),539);
      await page.waitForFunction(()=>document.querySelector('#workspace .v2-logical-page')
        ?.textContent.includes('p21'),null,{timeout:10000});
      // The logical_id physical column is still present, but with the
      // user-requested PBS/Type/Raw Txt-first order, AG's horizontal
      // virtualization can omit its DOM cell. The pinned PBS always exists.
      const agPBS=(await page.locator(
        '#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row [col-id="pbs"]')
        .first().textContent()).trim();
      const agId=projection.covers.find(row=>row.pbs===agPBS)?.logicalId;
      assert(Number.isSafeInteger(agId),'selected AG PBS not found: '+agPBS);
      await page.locator('#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row .ag-cell').first().click();
      await page.waitForFunction(expected=>document.querySelector('#workspace .ocr-preview-pdf-host')
        ?.v2PDFPort?.getState().selectedId===expected,agId,{timeout:10000});
      const expectedPage=projection.covers.find(row=>row.logicalId===agId).physicalPageIndex+1;
      await page.waitForFunction(n=>document.querySelector('#workspace .lab-ocr-pdf-page')?.value===String(n),
        expectedPage,{timeout:15000});
      // Real V1 zoom engine must never evaluate PDF.js page-width with width 0.
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>{
        el.querySelector('.lab-ocr-pdf-scroller').style.width='0px';
      });
      await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-scroller')
        ?.clientWidth===0,null,{timeout:10000});
      await zoomSelect.selectOption('page-width');
      assert(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>
        Number.isFinite(el.v2PDFPort.getState().scale)&&el.v2PDFPort.getState().scale>0),
        'collapsed PDF pane cannot produce a negative or invalid PDF scale');
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>{
        el.querySelector('.lab-ocr-pdf-scroller').style.width='';
      });
      await page.waitForFunction(()=>document.querySelector('#workspace .lab-ocr-pdf-scroller')
        ?.clientWidth>80,null,{timeout:12000});
      assert.equal(await zoomSelect.inputValue(),'page-width');
      console.log('LAB_OCR_NATIVE_MULTILANE_FIRST_PAGE',name,JSON.stringify(density));
      assert(result.headingCount>0,'MD Block derives Markdown headings from immutable OCR raw');
      assert(result.textLength>10000,result);
      assert.equal(sqlPosts,0);
      assert.equal(markdownGets,1,'the Markdown document must be fetched once per book');
      const renderFailures=await page.evaluate(()=>window.__v2PdfStatuses.filter(x=>x.includes('页面渲染错误')));
      assert.deepEqual(renderFailures,[],name+' should not report PDF canvas errors, even when panes start at zero width');
      assert.deepEqual(errors,[]);
      console.log('WP04_REAL_V1_PREVIEW_BROWSER_PASS',name,JSON.stringify(result));
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
