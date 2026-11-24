import assert from 'node:assert/strict';
import {splitOwnedBlock,SYNTHETIC_ID_MIN} from '../ui/v2-structure-split.js';
import {composeOwnedSource,logicalTextRows} from '../ui/v2-block-source.js';
const rows=[
 [11,0,0,0,null,'A\n\nB\n'],
 [12,0,0,2,11,'C\n\n\n'],
 [13,0,1,0,null,'D\n\n'],
 [14,1,0,0,null,'E\n\n'],
].map(([logicalId,p,b,s,parentId,markdownText],i)=>({
 logicalId,baseBlockId:logicalId,blockType:'text',logicalOrder:i+1,p,b,s,parentId,markdownText,
}));
const id=SYNTHETIC_ID_MIN+1,old=composeOwnedSource(rows);
const result=splitOwnedBlock(rows,{logicalId:11,offset:2,newId:id});
assert.equal(result.source,old.source,'interior split preserves every byte');
assert.deepEqual(result.blocks.map(r=>[r.logicalId,r.p,r.b,r.s,r.parentId]),[
 [11,0,0,0,null],[id,0,1,0,null],[12,0,1,2,id],[13,0,2,0,null],[14,1,0,0,null]]);
assert.equal(result.blocks[1].baseBlockId,11);
assert.equal(result.blocks[1].markdownText,'B\n');
assert.equal(result.blocks[2].markdownText,'C\n\n\n');
assert.deepEqual(logicalTextRows(result.source,result.blocks).map(r=>r.logicalId),[11,id,12,13,14]);
assert.throws(()=>splitOwnedBlock(rows,{logicalId:11,offset:1,newId:id}));
const child=splitOwnedBlock(rows,{logicalId:12,offset:2,newId:id});
assert.equal(child.blocks[1].markdownText,'C\n\n');
assert.equal(child.blocks[2].markdownText,'\n\n');
assert.equal(child.blocks[2].parentId,null);
assert(child.source.startsWith('A\n\nB\nC\n\n\n\nD'));
const tail=splitOwnedBlock(rows,{logicalId:13,offset:2,newId:id});
assert.equal(tail.blocks.find(r=>r.logicalId===id).markdownText,'\n\n');
console.log('WP23G_EXPLICIT_SPLIT_PURE_PASS');
