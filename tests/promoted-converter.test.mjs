import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const root=process.cwd(),port=4519,url=`http://127.0.0.1:${port}/`;
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json');
const legacyFixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const expected=Buffer.from(toMarkdown(raw.toString('utf8')));
const token=readFileSync('.v6/private/editor-token','utf8').trim();
const doc=resolve(`.v6/tests/converter-${process.pid}/mother.md`);
mkdirSync(resolve(`.v6/tests/converter-${process.pid}`),{recursive:true});
writeFileSync(doc,legacyFixture);
const server=spawn('python3',['scripts/v6_serve.py'],{
 cwd:root,env:{...process.env,V6_PORT:String(port),V6_DOCUMENT_PATH:doc,V6_STATIC_ROOT:resolve('dist')},stdio:'ignore',
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
try {
 let online=false;
 for(let i=0;i<100;i++){
  try{if((await fetch(url+'healthz')).ok){online=true;break;}}catch{}await wait(120);
 }
 assert(online);
 const req=(body,auth)=>fetch(url+'api/convert-mineru',{
  method:'POST',headers:{Origin:url.slice(0,-1),'Content-Type':'application/json',
   ...(auth?{Cookie:`v6edit=${token}`}:{})},body,
 });
 assert.equal((await req('{}',false)).status,403,'Unauthenticated conversion must be forbidden');
 assert.equal((await req('{"invalid":true}',true)).status,422,'Bad MinerU source must be rejected');
 const converted=await req(raw,true);
 assert.equal(converted.status,200,'Valid MinerU source must be convertible');
 const bytes=Buffer.from(await converted.arrayBuffer());
 assert(bytes.equals(expected),'Service output differs from current lossless MinerU converter');
 assert.equal(toMineruJSON(bytes.toString('utf8')),raw.toString('utf8'),
   'Current lossless projection must reverse to original JSON bytes');
 assert.equal((bytes.toString('utf8').match(/^<!-- minerujson:end:/gm)||[]).length,0);
 assert.equal((bytes.toString('utf8').match(/^<!-- minerujson:block:/gm)||[]).length,224);
 assert(readFileSync(doc).equals(legacyFixture),'In-memory conversion must not write the mother document');
 console.log('V6_MAINLINE_CONVERSION_PASS',JSON.stringify({sourceBytes:raw.length,mdBytes:bytes.length,auth:'required',sourceUnchanged:true}));
}finally{server.kill('SIGTERM');}
