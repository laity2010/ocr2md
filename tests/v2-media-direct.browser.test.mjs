/** Direct Media controller contract with deterministic transport; real Range
 * byte-store coverage is independent in test_v2_media.py. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
const vite=await createServer({configFile:false,logLevel:'error',
 optimizeDeps:{include:['markdown-it','markdown-it-footnote','markdown-it-task-lists','dompurify','katex',
 'highlight.js/lib/core',...['python','javascript','typescript','json','xml','css','bash','sql','yaml','markdown','diff'].map(x=>'highlight.js/lib/languages/'+x),
 'ag-grid-community','zustand','zustand/vanilla','@codemirror/state']},
 server:{host:'127.0.0.1',port:0}});
await vite.listen();
try{
 for(const [name,type] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await type.launch({headless:true});
  try{
   const page=await browser.newPage();
   page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(vite.resolvedUrls.local[0]))console.error('DIRECT_HTTP',r.status(),r.url());});
   await page.route('**/wp29-direct-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Media direct test</title>'}));
   await page.goto(vite.resolvedUrls.local[0]+'wp29-direct-fixture.html');
   const result=await page.evaluate(async()=>{
    const {findLabMedia,createLabOcrMediaView}=await import('/ui/lab-ocr/media-view.js');
    const {mediaContext,planMediaEdits,resolveMediaRow,mediaFileUrl}=await import('/ui/v2-media.js');
    const {composeOwnedSource}=await import('/ui/v2-block-source.js');
    const {createMdLineIndex}=await import('/ui/v2-md-line-index.js');
    const {EditorState}=await import('/node_modules/.vite/deps/@codemirror_state.js').catch(()=>import('/node_modules/@codemirror/state/dist/index.js'));
    const url='https://cdn-mineru.openxlab.org.cn/one.png',url2='https://cdn-mineru.openxlab.org.cn/two.jpg';
    const local='media/'+'a'.repeat(24)+'.png',local2='media/'+'b'.repeat(24)+'.jpg';
    let text='![A](<'+url+'>) and ![B]('+url+')\n![C]('+url2+')\n\n',index;
    const reset=()=>{const c=composeOwnedSource([{logicalId:1,baseBlockId:1,logicalOrder:1,parentId:null,p:0,b:0,s:0,blockType:'text',markdownText:text}]);index=createMdLineIndex(EditorState.create({doc:c.source}).doc,c.blocks);};
    reset();
    const check=(ok,msg)=>{if(!ok)throw Error(msg);};
    check(findLabMedia(text).length===3,'M00 count');
    const {renderMarkdown}=await import('/ui/markdown-preview.js');
    const sample='Caption\n'+url2+'\nNotes\n\n'+local2+'\n\n```text\n'+url+'\n```\n<!--\n'+url+'\n-->\n ordinary '+url+'\n';
    const bare=findLabMedia(sample);
    check(bare.length===2&&bare[0].line===2&&bare[1].line===5,'bare line scanner excludes code/comment/inline');
    check(bare.every(r=>sample.slice(r.from,r.to)===r.url),'bare exact offsets');
    const html=document.createElement('div');html.innerHTML=renderMarkdown(sample,{bareMedia:true});
    const imgs=[...html.querySelectorAll('img')];
    check(imgs.length===2&&imgs[0].closest('[data-source-start]').dataset.sourceStart==='2'&&imgs[1].closest('[data-source-start]').dataset.sourceStart==='5','bare reader exact independent line maps');
    html.innerHTML=renderMarkdown(sample);check(html.querySelectorAll('img').length===0,'default renderer unchanged');

    check(mediaFileUrl('/book',local).includes('media-file?'),'local API URL');
    check(mediaFileUrl('/book','media/../secret')===null,'reject invalid local path');
    let release,chunk=0,replaces=0,completed=false;
    const states=new Map();
    const controller=createLabOcrMediaView({
      read:()=>mediaContext('/book',text,index),
      request:async(op,{url:target})=>{
       if(op==='media-inventory')return {files:[]};
       if(op==='media-status')return states.get(target)??{state:'pending',bytes:0,total:null};
       if(op!=='media-chunk')throw Error(op);
       if(target===url&&++chunk===1){
        await new Promise(resolve=>{release=resolve;});
        const partial={state:'partial',bytes:524288,total:524300};states.set(target,partial);return partial;
       }
       const state={state:'complete',bytes:524300,total:524300,path:target===url?local:local2};
       states.set(target,state);return state;
      },
      replace:edits=>{
       const plan=planMediaEdits(index,text,edits);check(plan.length>0,'no plan');
       for(const edit of [...edits].sort((a,b)=>b.from-a.from))text=text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
       reset();replaces++;return {changed:edits.length};
      },onChanged:()=>{},onStatus:()=>{}
    });
    controller.setActive(true);await controller.scan();
    let row=controller.rows().find(r=>r.url===url);
    check(resolveMediaRow(index,text,row)?.source_line===1,'M01 exact source row');
    const stale={...row,source_from:row.source_from+1};
    check(resolveMediaRow(index,text,stale)===null,'reject stale endpoint');
    const downloading=controller.downloadOne(url);
    await Promise.resolve();
    check(typeof release==='function','first request entered');
    row=controller.rows().find(r=>r.url===url);
    check(row.action==='暂停','pause action');
    controller.actionCell({data:row}).click();release();
    check(await downloading===false,'pause result');
    check(controller.rows().find(r=>r.url===url).action==='续传','resume action');
    check(replaces===0,'pause must not write source');
    check(await controller.downloadOne(url)===true,'resumed');
    check(text.includes('![A](<'+local+'>) and ![B]('+local+')'),'exact duplicate replacement');
    check(replaces===1,'one replacement for duplicated URL');
    await controller.downloadAll();
    check(text.includes('![C]('+local2+')'),'bulk replacement');
    check(replaces===2,'bulk one replacement');
    controller.dispose();return {chunks:chunk,replaces,localRefs:findLabMedia(text).filter(r=>r.local).length};
   });
   assert.deepEqual(result,{chunks:2,replaces:2,localRefs:3});
   console.log('WP29_DIRECT_CONTROLLER_PASS',name,JSON.stringify(result));
  }finally{await browser.close();}
 }
}finally{await vite.close();}
