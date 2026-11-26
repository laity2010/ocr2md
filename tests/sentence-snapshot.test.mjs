import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,createMDLineSnapshot,importSnapshot,readV2Snapshot,createSnapshotSession} from '../ui/sentence/snapshot.js';
async function fixture(){
 const texts=['Hello. 😀\n\n','Second.\n\n'];
 const markdown=texts.join('');let from=0,ch=0;const segments=[];
 for(let i=0;i<texts.length;i++){
  const text=texts[i],end=from+text.length,n=Array.from(text).length;
  segments.push({logicalId:i+1,baseBlockId:i+1,parentId:null,logicalOrder:i+1,blockType:'text',p:0,b:i,s:0,startChar:ch,endChar:ch+n,startUtf16:from,endUtf16:end,fragmentSha256:await sha256(text)});from=end;ch+=n;
 }
 return {schema:'v2-logical-md/v3',markdown,segments,rowCount:2,lengthUtf16:markdown.length,sha256:await sha256(markdown)};
}
test('immutable exact V2 UTF16 source and read-only GET',async()=>{
 const f=await fixture();const s=await importSnapshot(f);
 assert.equal(s.lines.map(b=>b.text+b.eol).join(''),f.markdown);assert(Object.isFrozen(s.lines[0]));
 let calls=0;const out=await readV2Snapshot('/test/书',async(url,opts)=>{calls++;assert.equal(new URL(url,'https://test').searchParams.get('workspace'),'/test/书');assert.equal(opts.method,'GET');assert.equal(opts.credentials,'same-origin');return {ok:true,json:async()=>f};});
 assert.equal(calls,1);assert.equal(out.documentVersion,s.documentVersion);
 f.segments[0].b=9;assert.deepEqual(await importSnapshot(f),s);assert.equal(s.lines.length,4);assert(!("blocks" in s));assert(s.lines.every(l=>!("logicalId" in l)&&!("p" in l)));
});
test('reject drift, duplicate, missing source range and parent cycle',async()=>{
 for(const damage of [f=>f.markdown+='x',f=>f.segments[1].logicalId=1,f=>f.segments[1].startUtf16++,f=>f.segments[0].parentId=1,f=>f.segments[0].fragmentSha256='0'.repeat(64)]){
  const f=await fixture();damage(f);await assert.rejects(importSnapshot(f));
 }
});
test('stale results cannot replace the current snapshot',async()=>{
 let resolve;const f=await fixture(),s=await importSnapshot(f);
 const session=createSnapshotSession({reader:p=>p==='old'?new Promise(r=>resolve=r):Promise.resolve(s)});
 const old=session.load('old');await session.load('new');resolve(null);await old;assert.equal(session.getSnapshot(),s);
 session.invalidate();assert.equal(session.getSnapshot(),null);
});

test('real LF, empty lines, spaces, UTF16 and final EOF are exact',async()=>{
 for(const text of ['', '\n', '\n\n', ' A. 😀 \n\nB. ', 'A\n', 'A\n\n']){
  const s=await createMDLineSnapshot(text);
  assert.equal(s.lines.map(l=>l.text+l.eol).join(''),text);
  assert.equal(s.lines.length,text.length?text.split('\n').length-(text.endsWith('\n')?1:0):0);
  for(const [i,l] of s.lines.entries()){
   assert.equal(l.sourceLine,i+1);assert.equal(l.from,i?s.lines[i-1].to:0);
   assert.equal(text.slice(l.from,l.textTo),l.text);assert.equal(text.slice(l.textTo,l.to),l.eol);
   assert.equal(l.sha256,await sha256(l.text+l.eol));assert(Object.isFrozen(l));
  }
 }
 const f=await fixture();f.schema='v2-logical-md/v2';await assert.rejects(importSnapshot(f),/真实 LF/);
});
