import assert from 'node:assert/strict';
import {moveLogicalBlocks} from '../ui/v2-structure-move.js';
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
assert.equal(join.source,'A\n\nB\n\nC\n\nD\n\nE\n\n');
const reorder=moveLogicalBlocks(rows,{sourceBlockId:13,targetBlockId:11,placement:'before'});
assert.deepEqual(reorder.blocks.map(r=>r.logicalId),[13,11,12,21,22]);
assert.deepEqual(reorder.blocks.map(r=>r.b),[2,0,1,0,1],'b identities must not renumber');
assert.throws(()=>moveLogicalBlocks(join.blocks,{sourceBlockId:13,targetBlockId:12,placement:'after'}),/不受支持/);
const joinAgain=moveLogicalBlocks(join.blocks,{sourceBlockId:21,targetBlockId:12,placement:'child'});
assert.equal(joinAgain.blocks.find(r=>r.logicalId===21).s,2);
const siblings=moveLogicalBlocks(joinAgain.blocks,{sourceBlockId:21,targetBlockId:13,placement:'before'});
assert.deepEqual(siblings.blocks.filter(r=>r.p===0&&r.b===1).map(r=>[r.logicalId,r.s]),[[12,0],[21,1],[13,2]]);
assert.equal(siblings.blocks.find(r=>r.logicalId===22).p,1);
const gapRows=[
  [101,0,null],[102,1,101],[103,5,101],[104,9,101],
].map(([logicalId,s,parentId],i)=>({
  logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,
  p:0,b:0,s,parentId,markdownText:'G'+i,
}));
const withGaps=moveLogicalBlocks(gapRows,{sourceBlockId:104,targetBlockId:103,placement:'before'});
assert.deepEqual(withGaps.blocks.map(r=>[r.logicalId,r.s]),
  [[101,0],[102,1],[104,5],[103,9]],'preserve PBS s gaps and untouched sibling s1');
assert.deepEqual(rows.map(r=>r.markdownText),['A','B','C','D','E'],'input unchanged');
console.log('WP07_STRUCTURE_MOVE_PURE_PASS');
