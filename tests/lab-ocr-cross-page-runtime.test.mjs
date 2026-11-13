import assert from 'node:assert/strict';
import {createBlockRuntime,editBlockRuntime,planBlockMoveInMemory} from '../ui/lab-ocr/block-runtime.js';
const data=[
 [10,0,null,0,'p1b0'],[11,0,null,1,'p1b1'],[12,0,11,0,'p1b1s0'],
 [20,1,null,0,'p2b0'],[21,1,20,0,'p2b0s0'],[22,1,null,1,'p2b1'],
 [23,1,null,2,'p2b2'],
].map(([block_id,global_page,parent_block_id,sibling_order,pbs])=>({
 block_id,global_page,parent_block_id,sibling_order,pbs,block_group:'para_blocks',
 source_block_key:'immutable:'+block_id,block_json:'source:'+block_id,
}));
const raw=JSON.stringify(data);
let state=createBlockRuntime({workspace:'/isolated',rows:data});
const apply=editBlockRuntime(state,{action:'apply',sourceBlockId:20,targetBlockId:12,placement:'child'});
assert.equal(apply.changed,true);
assert.deepEqual(apply.pages,[1,2]);
state=apply.state;
const lookup=id=>state.rows.find(row=>row.block_id===id);
assert.equal(lookup(20).parent_block_id,11);
assert.equal(lookup(20).pbs,'p1b1s1');
assert.equal(lookup(21).parent_block_id,11);
assert.equal(lookup(21).pbs,'p1b1s2');
assert.equal(lookup(22).pbs,'p2b0');
assert.equal(lookup(20).global_page,1);
assert.equal(lookup(21).global_page,1);
assert.equal(JSON.stringify(data),raw);
assert.equal(state.queue[0].placement,'child');
assert.equal(state.history[0].operation.scope,'delta');
// After linking, ordinary page-2 sibling ordering must remain available.
const follow=editBlockRuntime(state,{action:'apply',
 sourceBlockId:23,targetBlockId:22,placement:'before'});
state=follow.state;
assert.equal(lookup(23).pbs,'p2b0');
assert.equal(lookup(22).pbs,'p2b1');
const undo=editBlockRuntime(state,{action:'undo'});
state=undo.state;
assert.equal(lookup(22).pbs,'p2b0');
assert.equal(lookup(23).pbs,'p2b1');
const undoCross=editBlockRuntime(state,{action:'undo'});
state=undoCross.state;
assert.equal(lookup(20).parent_block_id,null);
assert.equal(lookup(21).parent_block_id,20);
assert.equal(lookup(20).pbs,'p2b0');
assert.equal(lookup(21).pbs,'p2b0s0');
const redo=editBlockRuntime(state,{action:'redo'});
state=redo.state;
assert.equal(lookup(20).pbs,'p1b1s1');
assert.equal(lookup(21).pbs,'p1b1s2');
assert.throws(()=>planBlockMoveInMemory(data,10,20,'child'),/后一页/);
assert.throws(()=>planBlockMoveInMemory(data,20,11,'after'),/后一页/);
console.log('LAB_OCR_CROSS_PAGE_CM_PASS');
