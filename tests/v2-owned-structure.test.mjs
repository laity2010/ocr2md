import assert from 'node:assert/strict';
import {moveLogicalBlocks} from '../ui/v2-structure-move.js';
import {composeOwnedSource,logicalTextRows} from '../ui/v2-block-source.js';
const rows=[
 [11,0,0,0,null,'A\n\n内部\n\n\n'],
 [12,0,1,0,null,'B\n\n\n'],
 [13,0,1,1,12,'C\n\n\n'],
 [14,0,2,0,null,'D\n\n'],
 [21,1,0,0,null,'E\n\n'],
].map(([logicalId,p,b,s,parentId,markdownText],i)=>({
 logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,p,b,s,parentId,markdownText,
}));
const move=(rows,intent)=>moveLogicalBlocks(rows,intent,{ownedLF:true});
const join=move(rows,{sourceBlockId:12,targetBlockId:11,placement:'child'});
assert.equal(join.source,'A\n\n内部\nB\n\n\nC\n\n\nD\n\nE\n\n');
assert.deepEqual(join.blocks.slice(0,3).map(r=>[r.logicalId,r.s,r.parentId]),[[11,0,null],[12,1,11],[13,2,11]]);
assert.equal(join.blocks[1].markdownText,rows[1].markdownText,'existing group internal blanks preserved');
assert(join.blocks.every(r=>!Object.hasOwn(r,'groupEndPad')));
const same=move(join.blocks,{sourceBlockId:12,targetBlockId:13,placement:'before'});
assert(same.unchanged);assert.equal(same.source,join.source);
const reordered=move(join.blocks,{sourceBlockId:13,targetBlockId:12,placement:'before'});
assert.equal(reordered.source,'A\n\n内部\nC\nB\n\n\nD\n\nE\n\n');
const rootMove=move(rows,{sourceBlockId:21,targetBlockId:11,placement:'before'});
assert.equal(rootMove.blocks.find(r=>r.logicalId===12).markdownText,rows[1].markdownText);
const append=move(join.blocks,{sourceBlockId:14,targetBlockId:13,placement:'child'});
assert.equal(append.blocks.find(r=>r.logicalId===13).markdownText,'C\n');
assert.equal(append.blocks.find(r=>r.logicalId===14).markdownText,'D\n\n');
const text=logicalTextRows(append.source,append.blocks);
assert.deepEqual(composeOwnedSource(text),{source:append.source,blocks:append.blocks});
const empty=rows.map(r=>r.logicalId===11?{...r,markdownText:'\n\n'}:r);
const emptyJoin=move(empty,{sourceBlockId:12,targetBlockId:11,placement:'child'});
assert.equal(emptyJoin.blocks[0].markdownText,'\n');
assert.equal(emptyJoin.blocks.length,rows.length);
console.log('WP23F_OWNED_STRUCTURE_PURE_PASS');
