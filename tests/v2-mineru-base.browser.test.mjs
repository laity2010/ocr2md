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
   const books='/demo/books/my-book';let exists='retired-v2',postCount=0,structurePosts=0,logicalReady=false,mdRequests=0,probeCount=0,rebuildPosts=0,mdCommitPosts=0;const requestedPages=[];
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
   const logicalCols=['logical_id','base_blockid','parent_id','logical_order','md_block','block_type','p','b','s','raw_path'];
   const tables=[{name:'mineru_base',columns:cols},{name:'logical_block',columns:logicalCols}];
   const rows=Array.from({length:120},(_,i)=>Object.fromEntries(cols.map(k=>[k,k==='blockid'?i+1:k==='block_type'?'text':k==='block_json'?'{"type":"text"}':null])));
   // Match the actual WP03 out-of-band UTF-16 segment contract. The single
   // CM6 source is automatically populated with all 224 logical rows.
   const fragments=Array.from({length:224},(_,i)=>
     i===0?'# WP04 Chapter 🧪':i===1?'Original text':i===2?'':
     i===3?'中文😀 content':i===4?'$$\nx^2+1\n$$':
     i===5?'<table><tr><td>V1 Table</td></tr></table>':
     i===6?'> [!note] V1 Callout\n> V1 callout body':
     i===7?'**V1 Bold** and `inline code`':
     i===8?'<script>window.__v2Injected=true</script>':
     i===9?'Footnote reference[^1].\n\n[^1]: A V1 footnote note':
     `Paragraph ${i+1}`);
   const segments=[];let markdown='';
   for(let i=0;i<fragments.length;i++){
     if(i)markdown+='\n\n';
     const startUtf16=markdown.length;
     markdown+=fragments[i];
     segments.push({logicalId:i+1,baseBlockId:i+1,parentId:null,logicalOrder:i+1,
       blockType:i===0?'title':'text',p:Math.floor(i/10),b:i%10,s:0,
       startUtf16,endUtf16:markdown.length});
   }
   const mdSnapshot={schema:'v2-logical-md/v2',markdown,rowCount:224,segments};
   await page.route('**/labs/lab-ocr-v2/api/mineru-base/**',route=>{
    const request=route.request();const op=new URL(request.url()).pathname.split('/').at(-1);
    if(op==='md-commit'){
      mdCommitPosts++;
      const req=request.postDataJSON();
      assert.equal(req.confirm,'commit-v2-md');
      assert(req.changes.every(c=>typeof c.before==='string'&&typeof c.after==='string'));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        saved:true,baseChanged:false,changedRows:req.changes.length})});
    }
    if(op==='structure-commit'){
      structurePosts++;
      const changes=request.postDataJSON().changes;
      assert.equal(request.postDataJSON().confirm,'commit-v2-structure');
      return route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({saved:true,changedRows:changes.length,logicalCount:224})});
    }
    if(op==='logical-rebuild'){
      rebuildPosts++;
      assert.deepEqual(request.postDataJSON(),
        {workspace:books,confirm:'rebuild-v2-logical-only'},
        'only the verified current workspace may trigger a logic-only reset');
      assert.equal(request.method(),'POST');
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        rebuilt:true,baseChanged:false,previousLogicalCount:224,
        logicalCount:224,blockCount:539,dbFile:'ocr2md.v2.sqlite'})});
    }
    if(op==='import'){
      postCount++;assert.equal(request.postDataJSON().confirm,'import-mineru-base');
      const created=exists==='retired-v2',backfilled=!created&&!logicalReady;
      exists=true;logicalReady=true;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({created,
        backfilled,blockCount:539,logicalCount:224,sourceCount:1,dbFile:'ocr2md.v2.sqlite'})});
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
      const pageOffset=Number(query.get('offset')||0);
      requestedPages.push({table,pageOffset});
      assert(['mineru_base','logical_block'].includes(table));
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(exists?
        {exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,sourceCount:1,
        tables,tableName:table,paraBlockCount:224,logicalCount:logicalReady?224:0,rowCount:logical?(logicalReady?224:0):539,
        columns:logical?logicalCols:cols,rows:logical?(logicalReady?
          Array.from({length:224},(_,i)=>({
            logical_id:i+1,base_blockid:i+1,parent_id:null,
            logical_order:i+1,md_block:fragments[i],block_type:i===0?'title':'text',raw_path:'$',raw_block:'ORIGINAL '+i,
            p:Math.floor(i/10),b:i%10,s:0})):[]):
          Array.from({length:Math.max(0,Math.min(120,539-pageOffset))},(_,i)=>({
            ...rows[0],blockid:pageOffset+i+1})),
        offset:pageOffset}:{exists:false,dbFile:'ocr2md.v2.sqlite'})});
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
   // SQL group in the original Tom Select (including Settings view) is the
   // ONLY gateway for base import and logical rebuild; no AG toolbar button.
   await page.locator('#settings-workspace .ts-wrapper.ocr-navigation-files .ts-control').click();
   const groupHeader=page.locator('.ocr-navigation-popup-files:visible .optgroup-header')
     .filter({hasText:/^SQL$/}).first();
   if(kind==='webkit')await groupHeader.tap();
   else await groupHeader.click();
   const sqlActions=page.locator('#v2-sql-actions-dialog');
   assert.equal(await sqlActions.isVisible(),true,'clicking SQL group opens modal');
   assert.equal(await sqlActions.getByRole('button',{name:'导入基础表'}).isEnabled(),true);
   assert.equal(await sqlActions.getByRole('button',{name:'重建逻辑表'}).isEnabled(),true);
   assert.equal(await page.locator('#workspace .v2-logical-rebuild').count(),0,
     'rebuild must not exist in the AG toolbar');
   await sqlActions.getByRole('button',{name:'取消'}).click();
   assert.equal(await sqlActions.isVisible(),false);
   // Both physical tables are populated atomically during initial import;
   // choosing logical_block must open its nine-field+PBS AG view without a click.
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>!document.querySelector('#workspace')?.hidden&&
      document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===12,
      null,{timeout:30000});
   if(process.env.V2_TEST_CROSS_FILTER){
     // Mandatory cross-version release gate. Drive the actual AG Grid Type
     // header icon and popup on Chromium and iPad WebKit, not a static mock.
     assert.equal(await page.locator('#workspace .v2-type-value-filter').count(),0,
       'custom Type <select> forbidden by V1 cross-version contract');
     const button=page.locator('#workspace .ag-header-cell[col-id="block_type"] .ag-header-cell-filter-button');
     await button.waitFor({timeout:12000});
     if(kind==='webkit')await button.tap();else await button.click();
     const popup=page.locator('.ocr-enum-filter[aria-label="Type 筛选"]:visible');
     await popup.waitFor({timeout:12000});
     const checkbox=value=>popup.locator(`[data-filter-value="${value}"] input`);
     assert.equal(await checkbox('all').isChecked(),true);
     assert.equal(await checkbox('title').count(),1);
     assert.equal(await checkbox('text').count(),1);
     await checkbox('all').uncheck();
     await checkbox('title').check();
     const titleOnly=await page.locator('#workspace .ocr-outline-grid .ag-row [col-id="block_type"]')
       .allTextContents();
     assert(titleOnly.length>0&&titleOnly.every(text=>text.trim()==='title'),
       'V1 Type filter does not project only title rows');
     await checkbox('text').check();
     const both=await page.locator('#workspace .ocr-outline-grid .ag-row [col-id="block_type"]')
       .allTextContents();
     assert(both.includes('title')&&both.includes('text'),'V1 multiple Type options must be combinable');
     await checkbox('all').check();
     assert.equal(await checkbox('all').isChecked(),true);
     assert.deepEqual(errors,[]);
     console.log('V2_V1_AG_TYPE_FILTER_BROWSER_PASS',kind,'native icon/all/multi/model');
     continue;
   }
   const logicalHeaders=await page.locator('#workspace .ocr-outline-grid')
     .evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.field));
   assert.deepEqual(logicalHeaders,['pbs','block_type','md_block',
     ...logicalCols.filter(key=>key!=='block_type'&&key!=='md_block'),'raw_block'],
     'logical AG puts PBS, Type, MD Block first; Raw Block is external only');
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-outline-grid .ag-row [col-id=\"pbs\"]')?.textContent?.trim()==='p0b0s0',null,{timeout:12000});
   const derivedPBS=await page.locator('#workspace .ocr-outline-grid').evaluate(el=>{
     const columns=el.v2BaseGridPort.getColumns();
     const row=el.querySelector('.ag-row[row-index="0"]');
     return {pinned:columns[0].pinned,field:columns[0].field,
       rendered:row?.querySelector('[col-id="pbs"]')?.textContent?.trim(),
       headers:columns.slice(0,3).map(column=>column.headerName),
       rawWidth:columns[2].width,otherPinned:columns.slice(1).some(column=>column.pinned)};
   });
   assert.deepEqual(derivedPBS,{pinned:'left',field:'pbs',rendered:'p0b0s0',
     headers:['PBS','Type','MD Block'],rawWidth:420,otherPinned:false});
   assert.equal(await page.locator('#workspace .ocr-outline-grid').evaluate(
     el=>el.v2BaseGridPort.getColumns().find(column=>column.field==='block_type').headerName),
     'Type');
   const agRules=await page.locator('#workspace .ocr-outline-grid').evaluate(el=>{
     const cs=el.v2BaseGridPort.getColumns();
     return {pbsSort:cs[0].sortable,pbsPin:cs[0].pinned,
       typeSort:cs[1].sortable,typeWidth:cs[1].width,pbsWidth:cs[0].width,
       md:cs[2].field,raw:cs.at(-1).field};
   });
   assert.equal(agRules.pbsSort,false);assert.equal(agRules.pbsPin,'left');
   assert.equal(agRules.typeSort,false);
   assert(agRules.pbsWidth>=80&&agRules.pbsWidth<=155);
   assert(agRules.typeWidth>=96&&agRules.typeWidth<=220);
   assert.equal(agRules.md,'md_block');assert.equal(agRules.raw,'raw_block');
   const typeFilter=page.locator('#workspace .v2-type-value-filter');
   await typeFilter.selectOption('title');
   assert.match(await page.locator('#workspace .v2-logical-page').textContent(),/1 \/ 224/);
   await typeFilter.selectOption('');
   const all=page.getByRole('checkbox',{name:'全部逻辑块'});
   assert.equal(await all.isVisible(),true,'全部必须在逻辑表顶栏');
   assert.equal(await all.isChecked(),false,'默认按焦点 PBS p 过滤');
   assert.equal(await page.locator('#workspace .v2-logical-all').evaluate(el=>el===el.parentElement.firstElementChild),true,
     '全部 checkbox 位于 AG 工具栏最左端');
   assert.equal(await page.locator('#workspace .v2-base-paging').isVisible().catch(()=>false),false,
     '逻辑表不显示 SQL 翻页');
   assert.match(await page.locator('#workspace .v2-logical-page').textContent(),/p0 · 10 \/ 224/);
   await all.check();
   assert.match(await page.locator('#workspace .v2-logical-page').textContent(),/全部 · 224 行/);
   await all.uncheck();
   assert.match(await page.locator('#workspace .v2-logical-page').textContent(),/p0 · 10 \/ 224/);
   assert.equal(await page.getByRole('button',{name:'初始化逻辑表'}).count(),0);
   // WP08 loads into one CM6 document, with one blank only at each group's
   // last child. This fixture initially has 224 separate parent groups.
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
   assert.equal(sourceState.text,fragments.map(text=>text+'\n\n').join(''));
   assert.equal(sourceState.state.dirty,false);
   assert.equal(sourceState.state.separator,'');
   assert.equal(sourceState.state.groupEndMinimum,'\n\n');
   // Original V1 Markdown renderer is mounted in the ORIGINAL Frame MD pane.
   // It projects the live source rather than reparsing SQL on each keystroke.
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.v2MarkdownPreviewPort?.getHtml().includes('WP04 Chapter'),null,{timeout:20000});
   const preview=page.locator('#workspace .ocr-preview-md-scroll');
   const article=preview.locator('article.ocr-markdown');
   assert.equal(await article.count(),1,'exact V1 article reading surface');
   assert.equal(await article.locator('h1').first().textContent(),'WP04 Chapter 🧪');
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')?.v2MarkdownPreviewPort?.getHtml().includes('V1 Table'),null,{timeout:10000});
   assert.equal(await article.locator('table td').first().textContent(),'V1 Table');
   assert.equal(await article.locator('.katex').count()>0,true,'V1 KaTeX math rendering');
   assert.equal(await article.locator('.ocr-callout').count()>0,true,'V1 Obsidian callout plugin');
   assert.equal(await article.locator('strong').first().textContent(),'V1 Bold');
   const footnoteLink=article.locator('sup.footnote-ref a').first();
   assert.equal(await footnoteLink.count(),1,'V1 footnote renderer');
   await footnoteLink.click();
   const popover=page.locator('.ocr-footnote-popover:not([hidden])');
   assert.equal(await popover.count(),1,'V1 footnote popover');
   assert.match(await popover.textContent(),/A V1 footnote note/);
   await page.getByRole('button',{name:'关闭注释'}).click();
   assert.equal(await article.locator('script').count(),0,'V1 DOMPurify removes unsafe HTML');
   assert.equal(await page.evaluate(()=>window.__v2Injected),undefined,'XSS script cannot run');
   assert.equal(await preview.evaluate(el=>getComputedStyle(el.querySelector('article')).backgroundColor),'rgb(47, 56, 62)');
   assert.equal(await preview.locator('.ocr-markdown h1').evaluate(el=>getComputedStyle(el).color),'rgb(218, 99, 98)');
   assert.equal(await preview.locator('.ocr-markdown h1').evaluate(el=>el.hasAttribute('data-source-start')),true,
     'V1 source line coordinate projection exists');
   assert.equal(sourceState.state.undo,0);
   assert.equal(sourceState.state.redo,0);
   // V1 transient state bus + logical-id adapter: AG -> source -> MD.
   await page.locator('#workspace .ocr-outline-grid .ag-row[row-index="1"] .ag-cell').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.v2MarkdownPreviewPort?.getFocusedId()===2,null,{timeout:10000});
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head),
     sourceState.intervals[1].from);
   assert.equal(await page.locator('#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row').count(),1);
   // Preview -> source + AG, without a second CM6 document.
   await article.locator('h1').first().click();
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.v2MarkdownPreviewPort?.getFocusedId()===1,null,{timeout:10000});
   assert.equal(await page.locator('#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row').count(),1);
   // Source/CM6 selection in a distant block -> AG follows persistent PBS p.
   await page.locator('#workspace #editor').evaluate(el=>{
     const p=el.v2SourcePort;const row=p.getIntervals().find(b=>b.logicalId===130);
     p.getEditorView().dispatch({selection:{anchor:row.from}});
   });
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-logical-page')
     ?.textContent.includes('p12 · 10 / 224'),null,{timeout:12000});
   assert.equal(await page.locator('#workspace .ocr-outline-grid .ag-row.v2-sync-ag-row').count(),1);
   // A PDF-origin focus uses the same logical p, independent of physical page.
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('v2-sync-focus',{
     detail:{logicalId:213,baseBlockId:213,logicalOrder:213,origin:'pdf'}})));
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-logical-page')
     ?.textContent.includes('p21 · 10 / 224'),null,{timeout:12000});
   await all.check();
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('v2-sync-focus',{
     detail:{logicalId:130,baseBlockId:130,logicalOrder:130,origin:'preview'}})));
   assert.match(await page.locator('#workspace .v2-logical-page').textContent(),/全部 · 224 行/);
   await all.uncheck();
   assert.match(await page.locator('#workspace .v2-logical-page').textContent(),/p12 · 10 \/ 224/);
   // Navigate back to the first page for the remaining CM6 edit regression.
   await page.locator('#workspace #editor').evaluate(el=>{
     const p=el.v2SourcePort;p.getEditorView().dispatch({selection:{anchor:p.getIntervals()[0].from}});
   });
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-logical-page')
     ?.textContent.includes('p0 · 10 / 224'),null,{timeout:12000});
   // The exact V1 scroll-sync coordinator must have installed source-line
   // anchors for real two-way scrolling (not percentage-only linking).
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.v2MarkdownPreviewPort?.getScrollAnchorCount()>100,null,{timeout:12000});
   await page.locator('#workspace .ocr-preview-md-scroll').evaluate(pane=>{
     pane.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:350}));
     pane.scrollTop=Math.min(pane.scrollHeight-pane.clientHeight,1800);
     pane.dispatchEvent(new Event('scroll'));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.v2MarkdownPreviewPort?.getScrollDriver()==='preview',null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort
     ?.getEditorView().scrollDOM.scrollTop>200,null,{timeout:12000});
   await page.locator('#workspace #editor').evaluate(el=>{
     const src=el.v2SourcePort.getEditorView().scrollDOM;
     src.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:-350}));
     src.scrollTop=0;src.dispatchEvent(new Event('scroll'));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.v2MarkdownPreviewPort?.getScrollDriver()==='cm6',null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace .ocr-preview-md-scroll')
     ?.scrollTop<500,null,{timeout:12000});
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
   // WP10: live CM6 edit changes just one MD Block, not its immutable Raw.
   const beforeTextPosts=mdCommitPosts;
   const editNow=await page.locator('#workspace #editor').evaluate(el=>{
     const port=el.v2SourcePort,row=port.getIntervals()[0];
     port.getEditorView().dispatch({changes:{from:row.from+2,to:row.from+2,insert:'EDIT '}});
     return {dirty:port.getState().dirty,md:port.getBlocks()[0].markdownText};
   });
   assert.equal(editNow.dirty,true,'CM6 marks changed MD Block dirty immediately');
   assert(editNow.md.includes('EDIT '),'input belongs to the original logical ID');
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(mdCommitPosts,beforeTextPosts+1,'edited MD Block saved once via SQL');
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(original=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getMarkdown()===original,sourceState.text,{timeout:9000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(mdCommitPosts,beforeTextPosts+2,'CM6 Undo persists original MD Block');
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>
     el.v2SourcePort.getBlocks()[0].markdownText),fragments[0]);
   // WP08+WP10: typing in the group-ending virtual blank must belong to
   // this MD Block, and the rendered group must STILL end with one blank.
   const blankBeforePosts=mdCommitPosts;
   const blankEdit=await page.locator('#workspace #editor').evaluate(el=>{
     const port=el.v2SourcePort,first=port.getIntervals()[0],editor=port.getEditorView();
     editor.dispatch({changes:{from:first.to-1,to:first.to-1,insert:'New line'}});
     const next=port.getIntervals()[0];
     return {raw:port.getBlocks()[0].markdownText,
       suffix:editor.state.doc.sliceString(next.to-2,next.to),
       continued:next.to===port.getIntervals()[1].from,
       pad:next.groupEndPad};
   });
   assert(blankEdit.raw.includes('New line'));
   assert.deepEqual({suffix:blankEdit.suffix,continued:blankEdit.continued},
     {suffix:'\n\n',continued:true});
   assert.equal(blankEdit.pad,1,'new final LF remains virtual; typed line becomes MD');
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(mdCommitPosts,blankBeforePosts+1);
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(original=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getMarkdown()===original,sourceState.text,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(mdCommitPosts,blankBeforePosts+2,'blank-line edit undo persists to MD Block');
   // One edit spanning two logical IDs is forbidden, even though CM6 is open.
   await page.locator('#workspace #editor').evaluate(el=>{
     const port=el.v2SourcePort,rows=port.getIntervals();
     port.getEditorView().dispatch({changes:{from:rows[0].to-1,
       to:rows[1].from+1,insert:'CROSS'}});
   });
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getMarkdown()),sourceState.text);
   // A genuine PDF drag intent enters CM6 structure and native history.
   await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.applyDrag({
     sourceBlockId:2,targetBlockId:1,placement:'child'}));
   assert.equal(await page.locator('#workspace #undo').isDisabled(),false);
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getState().dirty),true);
   assert.deepEqual(await page.locator('#workspace #editor').evaluate(el=>{
     const row=el.v2SourcePort.getBlocks().find(row=>row.logicalId===2);
     return [row.p,row.b,row.s,row.parentId,row.markdownText];
   }),[0,0,1,1,'Original text']);
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>{
     const rows=el.v2SourcePort.getIntervals(),doc=el.v2SourcePort.getMarkdown();
     const a=rows.find(r=>r.logicalId===1),b=rows.find(r=>r.logicalId===2);
     return doc.slice(a.from,b.to);
   }),fragments[0]+fragments[1]+'\n\n',
   'joined root/child must concatenate with NO synthetic blank between');
   assert.equal(postCount,1,'structural drag cannot re-import SQL');
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,
     null,{timeout:12000});
   assert.equal(structurePosts,1,'idle commit once for affected logical row');
   assert.equal(await page.locator('#workspace #editor').evaluate((el,snapshot)=>el.v2SourcePort.load(snapshot,'/demo/books/my-book'),mdSnapshot),false);
   await page.locator('#workspace #undo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[1].s===0,
     null,{timeout:12000});
   for(let tries=0;tries<100&&structurePosts<2;tries++)await sleep(100);
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,
     null,{timeout:12000});
   assert.equal(structurePosts,2,'undo is a new incremental SQL transaction');
   assert.equal(await page.locator('#workspace #redo').isDisabled(),false);
   await page.locator('#workspace #redo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getBlocks()[1].s===1,
     null,{timeout:12000});
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().dirty===false,
     null,{timeout:12000});
   assert.equal(structurePosts,3,'redo is also saved');
   assert.equal(postCount,1,'undo/redo cannot import SQL');
   // Structural boundaries are not user text: Ctrl/Meta+A replacement across
   // all blocks must be refused rather than erase identities or blank lines.
   const beforeCross=await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getMarkdown());
   await page.locator('#workspace #editor').evaluate(el=>{
     const port=el.v2SourcePort;
     port.getEditorView().dispatch({changes:{from:0,to:port.getDoc().length,
       insert:'SHOULD BE DENIED'}});
   });
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getMarkdown()),beforeCross);
   assert.equal(postCount,1);
   assert.equal(await page.locator('#workspace .ocr-outline-grid').evaluate(
     el=>el.v2BaseGridPort.getColumns().length),12);
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:mineru-base';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.waitForFunction(()=>document.querySelector('#workspace')&&!document.querySelector('#workspace').hidden&&
      document.querySelector('#workspace .ocr-outline-grid')?.v2BaseGridPort?.getColumns()?.length===18,null,{timeout:30000});
   const headers=await page.locator('#workspace .ocr-outline-grid').evaluate(el=>el.v2BaseGridPort.getColumns().map(x=>x.headerName));
   assert.equal(headers.length,18,JSON.stringify(headers));
   assert.equal(headers[0],'BlockID');
   assert.equal(await page.locator('#workspace .ocr-outline-grid').evaluate(el=>
     el.v2BaseGridPort.getColumns().find(column=>column.field==='block_type').headerName),
     '原始类型','base table header must remain original after logical view reorder');
   // After switching tables, the active four-pane CM6 focus may navigate AG
   // to the currently selected logical block (e.g. its base row 121–240).
   // Verify the real base-table count, then explicitly go to its first page
   // before testing the manual next-page control. Do not disable focus sync.
   await page.waitForFunction(()=>document.querySelector('#workspace .v2-base-count')
     ?.textContent.includes('/ 539'),null,{timeout:12000});
   for(let attempt=0;attempt<5;attempt++){
     const label=await page.locator('#workspace .v2-base-count').textContent();
     if(label.includes('1–120 / 539'))break;
     const previous=page.getByRole('button',{name:'SQL 表上一页'});
     assert.equal(await previous.isDisabled(),false,'cannot navigate back to first base page from '+label);
     await previous.click();
     await page.waitForFunction(before=>document.querySelector('#workspace .v2-base-count')
       ?.textContent!==before,label,{timeout:12000});
   }
   assert.match(await page.locator('#workspace .v2-base-count').textContent(),/1–120 \/ 539/);
   const beforeNext=requestedPages.length;
   await page.getByRole('button',{name:'SQL 表下一页'}).click();
   try{
     // WebKit may asynchronously re-focus AG to the current CM6 block after
     // manual paging. Check the actual 120-offset request instead of assuming
     // a transient counter must remain visible despite that focus event.
     for(let tries=0;tries<80&&requestedPages.length===beforeNext;tries++)await sleep(100);
     assert(requestedPages.slice(beforeNext).some(p=>p.table==='mineru_base'&&p.pageOffset===120),
       'base-table next page must request SQL offset 120');
   }catch(error){
     console.log('V2_SQL_PAGING_DIAG',kind,{requestedPages:requestedPages.slice(-18),
       counter:await page.locator('#workspace .v2-base-count').textContent(),
       selected:await page.locator('#workspace .ocr-source-file-select').inputValue(),
       status:await page.locator('#status').textContent(),
       focus:await page.locator('#workspace #editor').evaluate(el=>el.v2SourcePort.getEditorView().state.selection.main.head)});
     throw error;
   }
   assert.equal(postCount,1);
   // iPad Safari actual failure: a book edited with an older order-only
   // release can have CM6 order B,A already, but PBS still A:b2 B:b3.
   // Re-drop A AFTER B must repair PBS even if visible source text stays
   // byte-for-byte identical; CM6 history and idle SQL must still work.
   const beforeRepairPosts=structurePosts;
   const repaired=await page.locator('#workspace #editor').evaluate((el,snapshot)=>{
     const port=el.v2SourcePort;
     const fragments=snapshot.segments.map(r=>({...r,
       text:snapshot.markdown.slice(r.startUtf16,r.endUtf16)}));
     [fragments[2],fragments[3]]=[fragments[3],fragments[2]];
     let markdown='';
     const segments=fragments.map((r,i)=>{
       if(i)markdown+='\n\n';
       const startUtf16=markdown.length;markdown+=r.text;
       const {text,...meta}=r;
       return {...meta,logicalOrder:i+1,startUtf16,endUtf16:markdown.length};
     });
     port.clear();
     // This historical-order fixture is browser-local, not user SQL.
     port.load({...snapshot,markdown,segments},'/demo/books/my-book');
     const beforeText=port.getMarkdown();
     const result=port.applyDrag({sourceBlockId:3,targetBlockId:4,placement:'after'});
     return {beforeText,afterText:port.getMarkdown(),result,
       source:port.getBlocks().find(row=>row.logicalId===3),
       target:port.getBlocks().find(row=>row.logicalId===4),
       following:port.getBlocks().find(row=>row.logicalId===5)};
   },mdSnapshot);
   assert.equal(repaired.result.unchanged,false,'inverted PBS labels are NOT a no-op');
   assert.equal(repaired.beforeText,repaired.afterText,'PBS-only repair keeps the CM6 Markdown bytes');
   assert.equal(repaired.source.b,4);
   assert.equal(repaired.target.b,3);
   assert.equal(repaired.following.b,5);
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(structurePosts,beforeRepairPosts+1,'PBS-only repair must persist SQL even when document text does not move');
   await page.locator('#workspace #undo').click();
   assert.equal(await page.locator('#workspace #editor').evaluate(el=>
     el.v2SourcePort.getBlocks().find(row=>row.logicalId===3).b),2);
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(structurePosts,beforeRepairPosts+2,'native Undo restores persisted PBS-only state');
   await page.locator('#workspace #redo').click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().dirty===false,null,{timeout:12000});
   assert.equal(structurePosts,beforeRepairPosts+3,'Redo persists PBS-only repair again');
   const noop=await page.locator('#workspace #editor').evaluate(el=>{
     const p=el.v2SourcePort;
     const before=p.getState();
     const result=p.applyDrag({sourceBlockId:3,targetBlockId:4,placement:'after'});
     return {result,before,after:p.getState()};
   });
   assert.equal(noop.result.unchanged,true,'repeat at already correct position is a benign no-op');
   assert.equal(noop.result.changed.length,0);
   assert.equal(noop.after.dirty,false);
   assert.equal(noop.after.undo,noop.before.undo,'no-op must not create CM6 undo history');
   await sleep(1100);
   assert.equal(structurePosts,beforeRepairPosts+3,'no-op must NOT issue a redundant SQLite write');
   // Simulate a previously-created WP00 SQLite with an empty logical table:
   // the next verified reopen automatically backfills through the SAME import
   // endpoint. The user must not click a separate initializer.
   logicalReady=false;
   await page.reload({waitUntil:'domcontentloaded'});
   try{
     await page.waitForFunction(()=>document.querySelector('#workspace #editor')?.v2SourcePort?.getState().loaded&&
       document.querySelector('#workspace .ocr-source-file-select option[value="sql:logical_block"]'),null,{timeout:25000});
   }catch(error){
     console.log('V2_PDF_ABSENT_RELOAD_DIAG',kind,{postCount,mdRequests,probeCount,errors},
       await page.evaluate(()=>({status:document.querySelector('#status')?.textContent,
         frame:!!document.querySelector('#workspace'),
         editor:document.querySelector('#workspace #editor')?.v2SourcePort?.getState(),
         options:[...document.querySelectorAll('#workspace .ocr-source-file-select option')].map(x=>x.value),
       })));
     throw error;
   }
   assert.equal(postCount,2,'previous empty logical table should auto-backfill once');
   // WP09: SQL group actions in the WORKSPACE dropdown. Explicit import is
   // safe/idempotent for an identical source; explicit logical-only rebuild
   // invalidates stale CM6 and refreshes the same book without full import.
   await page.locator('#settings-workspace .ocr-source-file-select').evaluate(select=>{
     select.value='sql:logical_block';select.dispatchEvent(new Event('change',{bubbles:true}));
   });
   await page.locator('#workspace .ts-wrapper.ocr-navigation-files .ts-control').click();
   if(kind==='webkit')await page.locator('.ocr-navigation-popup-files:visible .optgroup-header')
     .filter({hasText:/^SQL$/}).first().tap();
   else await page.locator('.ocr-navigation-popup-files:visible .optgroup-header')
     .filter({hasText:/^SQL$/}).first().click();
   const dialog=page.locator('#v2-sql-actions-dialog');
   assert.equal(await dialog.isVisible(),true);
   assert.equal(await page.locator('#workspace .ocr-ag-toolbar .v2-logical-rebuild').count(),0);
   await dialog.getByRole('button',{name:'导入基础表'}).click();
   await page.waitForFunction(()=>document.querySelector('#status')
     ?.textContent.includes('基础表已存在且来源相同'),null,{timeout:15000});
   assert.equal(postCount,3,'user explicit import invokes existing safe F02 API');
   await page.locator('#workspace .ts-wrapper.ocr-navigation-files .ts-control').click();
   if(kind==='webkit')await page.locator('.ocr-navigation-popup-files:visible .optgroup-header')
     .filter({hasText:/^SQL$/}).first().tap();
   else await page.locator('.ocr-navigation-popup-files:visible .optgroup-header')
     .filter({hasText:/^SQL$/}).first().click();
   const beforeMD=mdRequests;
   await dialog.getByRole('button',{name:'重建逻辑表'}).click();
   await page.waitForFunction(()=>document.querySelector('#workspace #editor')
     ?.v2SourcePort?.getState().loaded&&document.querySelector('#status')
     ?.textContent.includes('逻辑表已从原始 para_blocks 重建'),null,{timeout:15000});
   assert.equal(rebuildPosts,1);
   assert.equal(mdRequests,beforeMD+1,'single CM6 refreshed after rebuild');
   assert.equal(postCount,3,'logic-only rebuild must NOT import the original base');

   assert.equal(await page.getByRole('button',{name:'初始化逻辑表'}).count(),0);
   assert.deepEqual(errors,[]);
   console.log('V2_LEGACY_SQLITE_AUTO_REPLACE_BROWSER_PASS',kind,JSON.stringify({physicalTables:sqlOptions.length,baseColumns:headers.length,logicalColumns:logicalHeaders.length,postCount,mdRequests,probeCount}));
  }finally{await browser.close();}
 }
}finally{server.kill('SIGTERM');}
