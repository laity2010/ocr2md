import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,importSnapshot,readV2Snapshot,createSnapshotSession} from '../ui/sentence/snapshot.js';
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
 assert.equal(s.blocks.map(b=>b.text).join(''),f.markdown);assert(Object.isFrozen(s.blocks[0]));
 let calls=0;const out=await readV2Snapshot('/test/书',async(url,opts)=>{calls++;assert.equal(new URL(url,'https://test').searchParams.get('workspace'),'/test/书');assert.equal(opts.method,'GET');assert.equal(opts.credentials,'same-origin');return {ok:true,json:async()=>f};});
 assert.equal(calls,1);assert.equal(out.documentVersion,s.documentVersion);
 f.segments[0].b=9;assert.notEqual((await importSnapshot(f)).documentVersion,s.documentVersion);
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

test('cancel pending preserves accepted source and ignores obsolete failure',async()=>{
 const s=await importSnapshot(await fixture());let reject;const reports=[];
 const session=createSnapshotSession({report:(...v)=>reports.push(v),reader:p=>p==='old'?new Promise((_,r)=>reject=r):Promise.resolve(s)});
 await session.load('current');const old=session.load('old');session.cancelPending();reject(Error('obsolete'));assert.equal(await old,null);
 assert.equal(session.getSnapshot(),s);assert.equal(reports.length,1);
});
