/** Real MinerU fixture through V2 one blank line + V1 Markdown renderer.
 * Chrome and iPad WebKit. Browser mocks ONLY the authorized HTTP transport;
 * backend snapshot comes from real Python SQL import, not invented strings.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {makePDF} from './v2-pdf-fixture.mjs';
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
assert.equal(snapshot.rowCount,224);
assert.equal(projection.mappedCount,224);
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
  for(const [name,engine] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
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
          style.textContent='#workspace .ocr-pdf-scroller{width:0px!important}';
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
      const logicCols=['logical_id','base_blockid','parent_id','logical_order','markdown_text','block_type'];
      const tables=[{name:'mineru_base',columns:baseCols},{name:'logical_block',columns:logicCols}];
      let sqlPosts=0,markdownGets=0;
      await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
        const req=route.request();const op=new URL(req.url()).pathname.split('/').at(-1);
        if(op==='import'){sqlPosts++;return route.fulfill({status:500,contentType:'application/json',body:'{"error":"No DB import in WP04"}'});}
        if(op==='pdf-map')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(projection)});
        if(op==='pdf')return route.fulfill({status:200,contentType:'application/pdf',body:pdfBytes});
        if(op==='markdown'){markdownGets++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot)});}
        if(op==='state'){
          const query=new URL(req.url()).searchParams;
          const table=query.get('table')||'mineru_base';
          const offset=Number(query.get('offset')||0);
          const rows=table==='logical_block'
            ? projection.covers.slice(offset,offset+120).map(item=>({logical_id:item.logicalId,
                base_blockid:item.baseBlockId,parent_id:item.parentId,
                logical_order:item.logicalOrder,markdown_text:'original logic',block_type:'text'}))
            : projection.covers.slice(offset,offset+120).map(item=>({blockid:item.baseBlockId,
                page_index:item.physicalPageIndex,block_type:'text'}));
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
            exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,paraBlockCount:224,logicalCount:224,
            sourceCount:1,tables,tableName:table,rowCount:table==='logical_block'?224:539,
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
      assert.equal(result.blockCount,224);
      assert.equal(result.sourceLength,snapshot.markdown.length+2,
        'each of 224 blocks contributes exactly two newline characters, one blank line');
      assert.equal(result.separator,'\n\n');
      assert.equal(result.editorCount,1);
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host')
        ?.v2PDFPort?.getState().loaded,null,{timeout:30000});
      if(name==='iPad-WebKit'){
        await page.waitForFunction(()=>document.querySelector('#workspace .v2-pdf-zoom')
          ?.textContent!=='—',null,{timeout:15000});
        const hidden=await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState());
        assert.equal(hidden.scrollerWidth,0,'the PDF must initialize in a collapsed pane');
        assert(hidden.fitPending,'initial fit must remain pending until layout is valid');
        assert(hidden.scale>0,'initial collapsed PDF cannot create negative scale');
        await page.evaluate(()=>document.getElementById('v2-test-zero-width-on-pagesinit')?.remove());
        await page.waitForFunction(()=>{
          const state=document.querySelector('#workspace .ocr-preview-pdf-host')?.v2PDFPort?.getState();
          return state&&!state.fitPending&&state.scrollerWidth>80&&state.scale>0;
        },null,{timeout:18000});
      }
      await page.waitForFunction(()=>document.querySelector('#workspace .v2-pdf-label[data-logical-id="23"]'),
        null,{timeout:30000});
      const pdfState=await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState());
      assert.equal(pdfState.pageCount,22);
      assert.equal(pdfState.mappedCount,224);
      assert.equal(await page.locator('#workspace .v2-pdf-label[data-logical-id="23"]').first().textContent(),'p0b0');
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host canvas').count()>0,true,'PDF.js original canvas');
      const coverBefore=await page.locator('#workspace .v2-pdf-cover[data-logical-id="23"]').first().evaluate(el=>({
        left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,
      }));
      assert(Math.abs(parseFloat(coverBefore.left)-95/634*100)<.001,'original MinerU x0 stays page-relative');
      await page.locator('#workspace .v2-pdf-plus').click();
      await page.waitForFunction(()=>document.querySelector('#workspace .v2-pdf-zoom')
        ?.textContent!=='—',null,{timeout:12000});
      await page.waitForFunction(()=>document.querySelector('#workspace .v2-pdf-cover[data-logical-id="23"]'),null,{timeout:12000});
      const coverAfter=await page.locator('#workspace .v2-pdf-cover[data-logical-id="23"]').first().evaluate(el=>({
        left:el.style.left,top:el.style.top,width:el.style.width,height:el.style.height,
      }));
      assert.deepEqual(coverAfter,coverBefore,'PDF zoom never changes original normalized bbox');
      // Actual PDF V1-style PBS label => original CM6 logical ID and MD focus.
      await page.locator('#workspace .v2-pdf-label[data-logical-id="23"]').first().click();
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
        ?.v2MarkdownPreviewPort?.getFocusedId()===23,null,{timeout:10000});
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-outline-grid .v2-sync-ag-row')
        ?.querySelector('[col-id="logical_id"]')?.textContent?.includes('23'),null,{timeout:10000});
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState().selectedId),23);
      assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head),
        0);
      // Source selection at a last-page logical block navigates back to the
      // real physical PDF page, without inventing a new page or bbox.
      await page.locator('#workspace #editor').evaluate((el,last)=>{
        const port=el.v2SourcePort;
        const interval=port.getIntervals().find(row=>row.logicalId===last);
        port.getEditorView().dispatch({selection:{anchor:interval.from}});
      },539);
      try{
        await page.waitForFunction(()=>document.querySelector('#workspace .ocr-detached-pdf-toolbar .ocr-pdf-page')?.value==='22',
          null,{timeout:15000});
      }catch(err){
        console.log('V2_PDF_FOCUS_DIAG',name,await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>({
          state:el.v2PDFPort.getState(),pageField:el.closest('.ocr-detached-pdf-pane').querySelector('.ocr-pdf-page')?.value,
          viewerPage:el.v2PDFPort.getViewer()?.currentPageNumber,scroll:el.querySelector('.ocr-pdf-scroller')?.scrollTop,
          sourceHead:document.querySelector('#workspace #editor')?.v2SourcePort?.getEditorView().state.selection.main.head,
          sourceFocus:document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.getFocusedId(),
        })),errors);
        throw err;
      }
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState().selectedId),539);
      await page.waitForFunction(()=>document.querySelector('#workspace .v2-base-count')
        ?.textContent.includes('121–224'),null,{timeout:10000});
      // AG 2nd-page row -> the corresponding physical PDF page, using the
      // actual logical row ID (a programmatic scroll must not fake an index).
      const agId=Number(await page.locator('#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row [col-id="logical_id"]').first().textContent());
      await page.locator('#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row .ag-cell').first().click();
      await page.waitForFunction(expected=>document.querySelector('#workspace .ocr-preview-pdf-host')
        ?.v2PDFPort?.getState().selectedId===expected,agId,{timeout:10000});
      const expectedPage=projection.covers.find(row=>row.logicalId===agId).physicalPageIndex+1;
      try{
        await page.waitForFunction(n=>document.querySelector('#workspace .ocr-detached-pdf-toolbar .ocr-pdf-page')?.value===String(n),
          expectedPage,{timeout:12000});
      }catch(error){
        console.log('V2_PDF_AG_PAGE_DIAG',name,JSON.stringify({agId,expectedPage,
          model:projection.covers.find(c=>c.logicalId===agId),
          pdf:await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>({
            state:el.v2PDFPort.getState(),viewerPage:el.v2PDFPort.getViewer()?.currentPageNumber,
            field:el.closest('.ocr-detached-pdf-pane').querySelector('.ocr-pdf-page')?.value,
            scrollerHeight:el.querySelector('.ocr-pdf-scroller')?.scrollHeight,
            scrollTop:el.querySelector('.ocr-pdf-scroller')?.scrollTop,
          }))}));
        throw error;
      }
      assert.equal(await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getState().selectedId),agId);
      // iPad split panes are often hidden or 0px wide when PDF.js pagesinit
      // fires; PDF.js page-width=(clientWidth-40)/pageWidth, which is negative
      // at width 0. Fit must never apply that negative value and must recover
      // automatically after Dockview reveals the panel again.
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>{
        el.querySelector('.ocr-pdf-scroller').style.width='0px';
      });
      await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-pdf-host .ocr-pdf-scroller')?.clientWidth===0,
        null,{timeout:8000});
      await page.locator('#workspace .v2-pdf-fit').click();
      const hiddenScale=await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>el.v2PDFPort.getViewer().currentScale);
      assert(Number.isFinite(hiddenScale)&&hiddenScale>0,'collapsed PDF panel cannot produce a negative scale: '+hiddenScale);
      await page.locator('#workspace .ocr-preview-pdf-host').evaluate(el=>{
        el.querySelector('.ocr-pdf-scroller').style.width='';
      });
      await page.waitForFunction(()=>{
        const host=document.querySelector('#workspace .ocr-preview-pdf-host');
        const scroller=host?.querySelector('.ocr-pdf-scroller');
        const scale=host?.v2PDFPort?.getViewer()?.currentScale;
        return scroller?.clientWidth>80&&Number.isFinite(scale)&&scale>0&&
          Number(document.querySelector('#workspace .v2-pdf-zoom')?.textContent.replace('%',''))>0;
      },null,{timeout:12000});
      assert(result.headingCount>0,result);
      assert(result.textLength>10000,result);
      assert.equal(sqlPosts,0);
      assert.equal(markdownGets,1);
      const renderFailures=await page.evaluate(()=>window.__v2PdfStatuses.filter(x=>x.includes('页面渲染错误')));
      assert.deepEqual(renderFailures,[],name+' should not report PDF canvas errors, even when panes start at zero width');
      assert.deepEqual(errors,[]);
      console.log('WP04_REAL_V1_PREVIEW_BROWSER_PASS',name,JSON.stringify(result));
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
