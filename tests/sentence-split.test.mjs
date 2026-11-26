import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {importSnapshot,sha256,createMDLineSnapshot} from '../ui/sentence/snapshot.js';
import {splitLine,rebuildLine,splitSnapshot} from '../ui/sentence/split.js';
const engines=['intl','sentence-splitter','wink-nlp'];
async function block(text){return {sourceLine:1,text,sha256:await sha256(text)};}
test('three real engines, exact text, inline protection and emoji',async()=>{
 const b=await block('# Sample title. Dr. Smith saw a fox. It ran. $x+y$ ![](media/a.png) 😀');
 for(const id of engines){
  const r=splitLine(b,id);assert.equal(rebuildLine(r),b.text);assert(r.units.length>1);
  assert(r.units.every(u=>!u.original.includes('media/')&&!u.original.includes('x+y')));
  assert(r.units.some(u=>u.original.includes('😀')));
  const raw=await block('$$a+b$$');
  const protectedResult=splitLine(raw,id);assert.equal(protectedResult.units.length,0);assert.equal(rebuildLine(protectedResult),raw.text);
 }
});
test('point ellipses remain in sentence source ranges',async()=>{
 for(const text of ['First sentence. . . . Next sentence.','First sentence. . . Next sentence.','. . .','Start. . . .']){
  const b=await block(text);
  for(const id of engines){
   const r=splitLine(b,id);assert.equal(rebuildLine(r),text);
   const eligible=Array.from({length:text.length},(_,i)=>i).filter(i=>!/\s/u.test(text[i]));
   assert.deepEqual(r.units.flatMap(u=>u.sourceRanges.flatMap(({from,to})=>Array.from({length:to-from},(_,i)=>from+i))),eligible);
  }
 }
});
test('real V2 isolated SQLite: full coverage across MDLines and 3 engines',async()=>{
 const f=JSON.parse(execFileSync('python3',['-c',"import sys,tempfile,json; from pathlib import Path; sys.path.insert(0,sys.argv[1]); from test_v2_owned_edit import prepare_owned_book; tmp=tempfile.TemporaryDirectory(); print(json.dumps(prepare_owned_book(Path(tmp.name)),ensure_ascii=False))",'../lab-ocr-v2/tests'],{encoding:'utf8',maxBuffer:32*1024*1024}));
 const snapshot=await importSnapshot(f),result=splitSnapshot(snapshot);
 assert.equal(result.documentVersion,snapshot.documentVersion);assert.equal(f.rowCount,267);assert.equal(result.lines.length,snapshot.markdown.split("\n").length-1);assert.equal(snapshot.lines.map(l=>l.text+l.eol).join(""),f.markdown);
 const counts=Object.fromEntries(engines.map(id=>[id,0])),failed=[];
 for(let i=0;i<result.lines.length;i++){
  const b=snapshot.lines[i],row=result.lines[i];assert.equal(row.sourceLine,b.sourceLine);assert.equal(row.candidates.length,3);
  for(const c of row.candidates){
   if(c.error){failed.push([b.sourceLine,c.engine,c.error]);continue;}
   assert.equal(rebuildLine(c),b.text);
   assert.equal(c.sourceSha256,b.sha256);
   const indexed=c.pieces.filter(p=>p.kind==='sentence').map(({from,to})=>({from,to}));
   assert.deepEqual(indexed,c.units.flatMap(u=>u.sourceRanges));
   counts[c.engine]++;
  }
 }
 console.log('ACTUAL_ENGINE_COVERAGE',JSON.stringify(counts),'errors',JSON.stringify(failed.slice(0,10)));
 assert.deepEqual(failed,[]);
 for(const id of engines)assert.equal(counts[id],snapshot.lines.length);
});

test('cross-line protected Markdown and independent line-local sentence ranges',async()=>{
 const text=['A. B.','', '~~~js','Code. Not prose.','~~~','<!--','Hidden. Comment.','-->','$$','x. y.','$$','<table>','<tr><td>Cell. Text.</td></tr>','</table>','A | B','--- | ---','Cell. | More.','![](media/a.png)','After. Next. 😀  '].join('\n');
 const snapshot=await createMDLineSnapshot(text),result=splitSnapshot(snapshot);
 const protectedLines=new Set([2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]);
 for(const id of engines){
  const reconstructed=[];
  for(const [i,line] of snapshot.lines.entries()){
   const c=result.lines[i].candidates.find(c=>c.engine===id);assert(!c.error,c.error);
   assert.equal(rebuildLine(c),line.text);
   reconstructed.push(rebuildLine(c)+line.eol);
   if(protectedLines.has(i+1))assert.equal(c.units.length,0,'protected line '+(i+1)+' '+id);
   else assert(c.units.length>0);
   for(const u of c.units)for(const r of u.sourceRanges)assert(r.from>=0&&r.to<=line.text.length);
  }
  assert.equal(reconstructed.join(''),text);
 }
});
