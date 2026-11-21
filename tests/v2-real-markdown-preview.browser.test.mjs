/** Real MinerU fixture through V2 one blank line + V1 Markdown renderer.
 * Chrome and iPad WebKit. Browser mocks ONLY the authorized HTTP transport;
 * backend snapshot comes from real Python SQL import, not invented strings.
 */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
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
  print(json.dumps(backend.existing_markdown(folder),ensure_ascii=False))
`;
const snapshot=JSON.parse(execFileSync('python3',['-c',python],{encoding:'utf8'}));
assert.equal(snapshot.rowCount,224);
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
      const folder='/demo/books/wp04-real-preview';
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
        if(op==='markdown'){markdownGets++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(snapshot)});}
        if(op==='state'){
          const table=new URL(req.url()).searchParams.get('table')||'mineru_base';
          return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
            exists:true,dbFile:'ocr2md.v2.sqlite',blockCount:539,paraBlockCount:224,logicalCount:224,
            sourceCount:1,tables,tableName:table,rowCount:table==='logical_block'?224:539,
            columns:table==='logical_block'?logicCols:baseCols,rows:[],offset:0,
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
      assert(result.headingCount>0,result);
      assert(result.textLength>10000,result);
      assert.equal(sqlPosts,0);
      assert.equal(markdownGets,1);
      assert.deepEqual(errors,[]);
      console.log('WP04_REAL_V1_PREVIEW_BROWSER_PASS',name,JSON.stringify(result));
    }finally{await browser.close();}
  }
}finally{server.kill('SIGTERM');}
