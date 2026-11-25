import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {importSnapshot,sha256} from '../ui/sentence/snapshot.js';
import {splitBlock,rebuildBlock,splitSnapshot} from '../ui/sentence/split.js';
const engines=['intl','sentence-splitter','wink-nlp'];
async function block(text,blockType='text'){return {logicalId:1,blockType,text,sha256:await sha256(text)};}
test('three real engines, exact text, inline protection and emoji',async()=>{
 const b=await block('# Sample title. Dr. Smith saw a fox. It ran. $x+y$ ![](media/a.png) 😀\n\n');
 for(const id of engines){
  const r=splitBlock(b,id);assert.equal(rebuildBlock(r),b.text);assert(r.units.length>1);
  assert(r.units.every(u=>!u.original.includes('media/')&&!u.original.includes('x+y')));
  assert(r.units.some(u=>u.original.includes('😀')));
  const raw=await block('$$a+b$$\n\n','interline_equation');
  const protectedResult=splitBlock(raw,id);assert.equal(protectedResult.units.length,0);assert.equal(rebuildBlock(protectedResult),raw.text);
 }
});
test('point ellipses remain in sentence source ranges',async()=>{
 for(const text of ['First sentence. . . . Next sentence.','First sentence. . . Next sentence.','. . .','Start. . . .']){
  const b=await block(text);
  for(const id of engines){
   const r=splitBlock(b,id);assert.equal(rebuildBlock(r),text);
   const eligible=Array.from({length:text.length},(_,i)=>i).filter(i=>!/\s/u.test(text[i]));
   assert.deepEqual(r.units.flatMap(u=>u.sourceRanges.flatMap(({from,to})=>Array.from({length:to-from},(_,i)=>from+i))),eligible);
  }
 }
});
test('real V2 isolated SQLite: full coverage across 267 blocks and 3 engines',async()=>{
 const f=JSON.parse(execFileSync('python3',['-c',"import sys,tempfile,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_v2_owned_edit import prepare_owned_book; tmp=tempfile.TemporaryDirectory(); print(json.dumps(prepare_owned_book(Path(tmp.name)),ensure_ascii=False))",'../lab-ocr-v2/tests'],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const snapshot=await importSnapshot(f),result=splitSnapshot(snapshot);
 assert.equal(result.documentVersion,snapshot.documentVersion);assert.equal(result.blocks.length,267);
 const counts=Object.fromEntries(engines.map(id=>[id,0])),failed=[];
 for(let i=0;i<result.blocks.length;i++){
  const b=snapshot.blocks[i],row=result.blocks[i];assert.equal(row.logicalId,b.logicalId);assert.equal(row.candidates.length,3);
  for(const c of row.candidates){
   if(c.error){failed.push([b.logicalId,c.engine,c.error]);continue;}
   assert.equal(rebuildBlock(c),b.text);
   assert.equal(c.sourceSha256,b.sha256);
   const indexed=c.pieces.filter(p=>p.kind==='sentence').map(({from,to})=>({from,to}));
   assert.deepEqual(indexed,c.units.flatMap(u=>u.sourceRanges));
   counts[c.engine]++;
  }
 }
 console.log('ACTUAL_ENGINE_COVERAGE',JSON.stringify(counts),'errors',JSON.stringify(failed.slice(0,10)));
 assert.deepEqual(failed,[]);
 for(const id of engines)assert.equal(counts[id],267);
});
