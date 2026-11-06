/** Direct contract checks for Media's three exported module entry points.
 * Uses a Vite-only fixture and in-memory transport; never opens a user book,
 * touches production media storage, or modifies the Main workspace.
 */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
import {chromeExecutable,webkitExecutable} from './platform.test-helper.mjs';

const vite=await createServer({configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0}});
await vite.listen();
const base=vite.resolvedUrls.local[0];
const engines=[['Chromium',chromium,{executablePath:chromeExecutable()}],
  ['WebKit',webkit,{executablePath:webkitExecutable()}]];
let ran=0;
try{
  for(const [name,engine,options] of engines){
    if(process.env.V6_ONLY_CHROME&&name!=='Chromium')continue;
    if(process.env.V6_ONLY_WEBKIT&&name!=='WebKit')continue;
    const browser=await engine.launch({headless:true,...options});
    try{
      const page=await browser.newPage();
      await page.goto(base+'tests/media-public-contract.fixture.html',{waitUntil:'domcontentloaded'});
      const actual=await page.evaluate(async()=>{
        const media=await import('/ui/media-module.js');
        const check=(condition,label)=>{if(!condition)throw Error('MEDIA_CONTRACT: '+label);};
        const local='media/'+'a'.repeat(24)+'.png';
        const remote='https://example.org/a.png',rejected='https://example.org/rejected.png';
        const source=`![one](${remote}|100x50)\n![local](${local})\n![again](${remote})\n`+
          `<!-- minerujson:v1:ignored ![secret](${rejected}) -->\n`+
          `![denied](${rejected})`;
        // A02: direct parsing: resized URL offsets, duplicates, local URL,
        // immutable OCR evidence exclusion, stable source range round-trip.
        const found=media.findMedia(source);
        check(found.length===4,'findMedia reference count / evidence exclusion');
        check(found.filter(row=>row.url===remote).length===2,'findMedia duplicate references');
        check(found.some(row=>row.local&&row.url===local),'findMedia local links');
        check(found.every(row=>source.slice(row.from,row.to)===row.url),'findMedia exact URL offsets');
        const req=[];const reports=[];const edits=[];
        const originalFetch=globalThis.fetch;
        const counts=new Map();
        globalThis.fetch=async(input,init={})=>{
          const url=String(input);
          if(url.includes('/api/media/paste')){
            const kind=init.body?.type;
            if(kind==='image/jpeg')return new Response('unauthorized',{status:403});
            if(kind==='image/gif')return Response.json({path:'../unsafe.gif'});
            return Response.json({path:local});
          }
          if(url.includes('/api/media/inventory'))return Response.json({files:[],chapterReferences:[]});
          if(url.includes('/api/media/status'))return Response.json({state:'pending',bytes:0,total:null});
          if(url.includes('/api/media/chunk')){
            const {url:target}=JSON.parse(init.body);req.push(target);
            if(target===rejected)return new Response('no permission',{status:403});
            const round=(counts.get(target)||0)+1;counts.set(target,round);
            if(round===1)return Response.json({state:'partial',bytes:8,total:16});
            return Response.json({state:'complete',bytes:16,path:local});
          }
          throw Error('unexpected transport: '+url);
        };
        let owned;
        try{
          // A11: direct upload entry with input validation, authorization
          // errors and returned-path validation. Backend signatures have
          // existing separate server-side tests.
          let badType=false;
          try{await media.uploadPastedImage(new Blob(['x'],{type:'text/plain'}));}catch{badType=true;}
          check(badType,'uploadPastedImage rejects non-images');
          let empty=false;
          try{await media.uploadPastedImage(new Blob([],{type:'image/png'}));}catch{empty=true;}
          check(empty,'uploadPastedImage rejects zero bytes');
          let denied=false;
          try{await media.uploadPastedImage(new Blob(['x'],{type:'image/jpeg'}));}catch(e){denied=/授权/.test(e.message);}
          check(denied,'uploadPastedImage handles 403 authorization');
          let unsafe=false;
          try{await media.uploadPastedImage(new Blob(['x'],{type:'image/gif'}));}catch(e){unsafe=/有效的本地路径/.test(e.message);}
          check(unsafe,'uploadPastedImage rejects unsafe backend path');
          check(await media.uploadPastedImage(new Blob(['x'],{type:'image/png'}))===local,
            'uploadPastedImage accepts validated local path');
          // A01: directly construct the Media facade and exercise its public
          // scan + bulk-localize behavior with an injected CMD transaction.
          owned=media.createMediaModule(document.querySelector('#media-contract-host'),
            ()=>source,()=>({replaceMediaReferences(next,scope){edits.push({next,scope});
              return {changed:next.length,skipped:0};}}),(message,level)=>reports.push({message,level}));
          check(typeof owned.scan==='function'&&typeof owned.downloadAll==='function',
            'createMediaModule facade');
          await owned.scan();
          await owned.downloadAll();
          check(req.length===3,'resumable transfer then denied URL stops batch');
          check(req[0]===remote&&req[1]===remote&&req[2]===rejected,
            'partial transfer resumes same URL');
          check(edits.length===1,'one and only one atomic CMD transaction');
          check(edits[0].next.length===2,'both successful repeated references localized');
          check(edits[0].next.every(row=>row.insert===local&&row.expected===remote),
            'failed URL not replaced');
          check(edits[0].scope.mode==='all','batch CMD replacement is all-document');
          check(source.includes(remote)&&source.includes(rejected),
            'Media does not auto-save or mutate CMD source');
          check(reports.some(row=>row.message.includes('引用')), 'semantic status report');
          return {exports:['createMediaModule','findMedia','uploadPastedImage'],
            references:found.length,resumeRequests:req.length,cmdTransactions:edits.length};
        }finally{
          owned?.dispose();
          globalThis.fetch=originalFetch;
        }
      });
      assert.deepEqual(actual.exports,['createMediaModule','findMedia','uploadPastedImage']);
      assert.equal(actual.cmdTransactions,1);
      ran++;
      console.log('MEDIA_PUBLIC_CONTRACT_PASS',name,JSON.stringify(actual));
    }finally{await browser.close();}
  }
  assert(ran>0,'no configured browser engine exercised');
}finally{await vite.close();}
