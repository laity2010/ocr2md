import assert from 'node:assert/strict';
import {moveLogicalBlocks} from '../ui/v2-structure-move.js';
import {composeLogicalSource,logicalTextRows} from '../ui/v2-block-source.js';
const rows=[
  [11,0,0,0,null,'A'],[12,0,1,0,null,'B'],[13,0,2,0,null,'C'],
  [21,1,0,0,null,'D'],[22,1,1,0,null,'E'],
].map(([logicalId,p,b,s,parentId,markdownText],i)=>({
  logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,
  p,b,s,parentId,markdownText,
}));
const join=moveLogicalBlocks(rows,{sourceBlockId:13,targetBlockId:12,placement:'child'});
assert.deepEqual(join.blocks.map(r=>[r.logicalId,r.p,r.b,r.s]),[
  [11,0,0,0],[12,0,1,0],[13,0,1,1],[21,1,0,0],[22,1,1,0]]);
assert.equal(join.changes.length,1);
assert.equal(join.blocks[2].parentId,12);
assert.equal(join.source,'A\n\nB\nC\n\nD\n\nE\n\n',
  'reparent removes blank line but keeps a single LF before the child');
assert.deepEqual(join.blocks.slice(1,3).map(r=>r.groupEndPad),[1,2]);
assert.deepEqual(logicalTextRows(join.source,join.blocks).map(r=>r.markdownText),
  ['A','B','C','D','E'],'no raw text changed by parent-child reparent');
const reorder=moveLogicalBlocks(rows,{sourceBlockId:13,targetBlockId:11,placement:'before'});
assert.deepEqual(reorder.blocks.map(r=>r.logicalId),[13,11,12,21,22]);
assert.deepEqual(reorder.blocks.map(r=>r.b),[0,1,2,0,1],
  'before reserves target b, all subsequent parent groups increment; other pages untouched');
const parentAfter=moveLogicalBlocks(rows,{sourceBlockId:11,targetBlockId:12,placement:'after'});
assert.deepEqual(parentAfter.blocks.map(r=>[r.logicalId,r.p,r.b,r.s]),[
  [12,0,1,0],[11,0,2,0],[13,0,3,0],[21,1,0,0],[22,1,1,0]]);
assert.equal(parentAfter.blocks.find(r=>r.logicalId===11).parentId,null);
const redundantBefore=moveLogicalBlocks(rows,{sourceBlockId:11,targetBlockId:12,placement:'before'});
assert.equal(redundantBefore.unchanged,true,'already correctly positioned: no unnecessary renumbering');
assert.deepEqual(redundantBefore.changes,[]);
assert.throws(()=>moveLogicalBlocks(join.blocks,{sourceBlockId:13,targetBlockId:12,placement:'after'}),/不受支持/);
const joinAgain=moveLogicalBlocks(join.blocks,{sourceBlockId:21,targetBlockId:12,placement:'child'});
assert.equal(joinAgain.blocks.find(r=>r.logicalId===21).s,1);
assert.equal(joinAgain.blocks.find(r=>r.logicalId===13).s,2,'old child shifted by +1');
const siblings=moveLogicalBlocks(joinAgain.blocks,{sourceBlockId:13,targetBlockId:21,placement:'before'});
assert.deepEqual(siblings.blocks.filter(r=>r.p===0&&r.b===1).map(r=>[r.logicalId,r.s]),[[12,0],[13,1],[21,2]]);
assert.equal(siblings.blocks.find(r=>r.logicalId===22).p,1);
const gapRows=[
  [101,0,null],[102,1,101],[103,5,101],[104,9,101],
].map(([logicalId,s,parentId],i)=>({
  logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,
  p:0,b:0,s,parentId,markdownText:'G'+i,
}));
const withGaps=moveLogicalBlocks(gapRows,{sourceBlockId:104,targetBlockId:103,placement:'before'});
assert.deepEqual(withGaps.blocks.map(r=>[r.logicalId,r.s]),
  [[101,0],[102,1],[104,5],[103,6]],
  'subsequent s increases by one, not renumbered and the original s9 stays a hole');
const childAfter=moveLogicalBlocks(gapRows,{sourceBlockId:104,targetBlockId:102,placement:'after'});
assert.deepEqual(childAfter.blocks.map(r=>[r.logicalId,r.s]),
  [[101,0],[102,1],[104,2],[103,6]],'child after creates s2, increments every later s');
assert.throws(()=>moveLogicalBlocks(gapRows,{
  sourceBlockId:101,targetBlockId:102,placement:'child'}),/只能把独立父块组归入/);
// Exact field report: p1b3s0 -> p1b4s0 AFTER, all existing b>=5 shift +1.
const p1=Array.from({length:7},(_,i)=>({
  logicalId:200+i,baseBlockId:200+i,blockType:'text',logicalOrder:i+1,
  p:1,b:i+1,s:0,parentId:null,markdownText:'p1b'+(i+1),
}));
const p1After=moveLogicalBlocks(p1,{sourceBlockId:202,targetBlockId:203,placement:'after'});
assert.deepEqual(p1After.blocks.map(r=>[r.logicalId,r.b]),[
  [200,1],[201,2],[203,4],[202,5],[204,6],[205,7],[206,8]]);
assert.equal(p1After.changes.length,5,'only source, displaced range and their logical orders');
// A root carries children, target children stay put, descendants of shifted
// parents inherit the same b+1 while keeping their s and stable parentId.
const family=[
  [301,1,3,0,null],[302,1,3,1,301],
  [303,1,4,0,null],[304,1,4,1,303],
  [305,1,5,0,null],[306,1,5,2,305],
  [307,2,0,0,null],
].map(([logicalId,p,b,s,parentId],i)=>({
  logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,
  p,b,s,parentId,markdownText:'F'+logicalId,
}));
const familyAfter=moveLogicalBlocks(family,{sourceBlockId:301,targetBlockId:303,placement:'after'});
assert.deepEqual(familyAfter.blocks.map(r=>[r.logicalId,r.p,r.b,r.s,r.parentId]),[
  [303,1,4,0,null],[304,1,4,1,303],
  [301,1,5,0,null],[302,1,5,1,301],
  [305,1,6,0,null],[306,1,6,2,305],[307,2,0,0,null]]);
// iPad screenshot regression: the CM6 sequence is ALREADY target then
// source+its child (an older drag moved order only), but PBS remains inverted.
// A sequence-only no-op check would incorrectly reject this necessary b fix.
const invertedFamily=[family[2],family[3],family[0],family[1],family[4],family[5],family[6]]
  .map((row,i)=>({...row,logicalOrder:i+1}));
const fixLabelsOnly=moveLogicalBlocks(invertedFamily,{
  sourceBlockId:301,targetBlockId:303,placement:'after'});
assert.deepEqual(fixLabelsOnly.blocks.map(r=>[r.logicalId,r.p,r.b,r.s]),[
  [303,1,4,0],[304,1,4,1],[301,1,5,0],[302,1,5,1],
  [305,1,6,0],[306,1,6,2],[307,2,0,0]]);
assert.equal(fixLabelsOnly.source,composeLogicalSource(invertedFamily).source,
  'CM6 document text must remain byte-identical during PBS-only corrections');
assert.deepEqual(fixLabelsOnly.changes.map(r=>r.logicalId).sort((a,b)=>a-b),
  [301,302,305,306],'only affected PBS changes, no logicalOrder difference');
assert.equal(fixLabelsOnly.unchanged,false);
const alreadyCorrect=moveLogicalBlocks(fixLabelsOnly.blocks,{
  sourceBlockId:301,targetBlockId:303,placement:'after'});
assert.equal(alreadyCorrect.unchanged,true,'repeating AFTER should not keep shifting b and writing SQL');
assert.deepEqual(alreadyCorrect.changes,[]);
const invertedChildren=[
  [601,0,null],[602,2,601],[603,1,601],[604,3,601],
].map(([logicalId,s,parentId],i)=>({
  logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,
  p:1,b:1,s,parentId,markdownText:'K'+logicalId,
}));
const fixChildLabelOnly=moveLogicalBlocks(invertedChildren,{
  sourceBlockId:603,targetBlockId:602,placement:'after'});
assert.deepEqual(fixChildLabelOnly.blocks.map(r=>[r.logicalId,r.s]),
  [[601,0],[602,2],[603,3],[604,4]]);
assert.deepEqual(fixChildLabelOnly.changes.map(r=>r.logicalId),[603,604]);
// Slots are absolute; holes are never used to suppress the +1 shift.
const holes=[
  [401,1,null],[402,4,null],[403,6,null],[404,10,null],
].map(([logicalId,b,parentId],i)=>({logicalId,baseBlockId:logicalId,
  logicalOrder:i+1,p:1,b,s:0,parentId,blockType:'text',markdownText:'H'+logicalId}));
const holesAfter=moveLogicalBlocks(holes,{sourceBlockId:401,targetBlockId:402,placement:'after'});
assert.deepEqual(holesAfter.blocks.map(r=>[r.logicalId,r.b]),
  [[402,4],[401,5],[403,7],[404,11]]);
// Insertion of a root into a parent's child slot shifts existing s>=1;
// inserting under an existing child shifts s after that child.
const childGroup=[
  [501,1,1,0,null],[502,1,1,1,501],[503,1,1,5,501],
  [504,1,4,0,null],[505,1,4,2,504],
].map(([logicalId,p,b,s,parentId],i)=>({
  logicalId,baseBlockId:logicalId,logicalOrder:i+1,p,b,s,parentId,
  blockType:'text',markdownText:'S'+logicalId}));
const intoChild=moveLogicalBlocks(childGroup,{sourceBlockId:504,targetBlockId:501,placement:'child'});
assert.deepEqual(intoChild.blocks.map(r=>[r.logicalId,r.b,r.s,r.parentId]),[
  [501,1,0,null],[504,1,1,501],[505,1,2,501],[502,1,3,501],[503,1,7,501]]);
const afterChild=moveLogicalBlocks(childGroup,{sourceBlockId:504,targetBlockId:502,placement:'child'});
assert.deepEqual(afterChild.blocks.map(r=>[r.logicalId,r.b,r.s,r.parentId]),[
  [501,1,0,null],[502,1,1,501],[504,1,2,501],[505,1,3,501],[503,1,7,501]]);
assert.deepEqual(rows.map(r=>r.markdownText),['A','B','C','D','E'],'input unchanged');
console.log('WP07_STRUCTURE_MOVE_PURE_PASS');
