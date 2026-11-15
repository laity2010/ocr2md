/** WCP48 contract: merging two *parent containers* adds only child atoms.
 * The source parent keeps its BlockID and JSON as an absorbed audit record,
 * not a fifth child in PDF/AG.
 */
import assert from 'node:assert/strict';
import {createBlockRuntime,editBlockRuntime} from '../ui/lab-ocr/block-runtime.js';
const rows=[
 [10,null,0,'p4b0'],[11,10,0,'p4b0s0'],[12,10,1,'p4b0s1'],
 [20,null,1,'p4b1'],[21,20,0,'p4b1s0'],[22,20,1,'p4b1s1'],
].map(([block_id,parent_block_id,sibling_order,pbs])=>({
 block_id,parent_block_id,sibling_order,pbs,global_page:3,
 block_group:'para_blocks',source_block_key:'immutable:'+block_id,
 block_json:JSON.stringify({original_id:block_id}),
 absorbed_into_block_id:null,
}));
const original=JSON.stringify(rows);
let cm=createBlockRuntime({workspace:'/isolated',rows});
let result=editBlockRuntime(cm,{action:'apply',sourceBlockId:20,targetBlockId:10,placement:'child'});
cm=result.state;
const visible=()=>cm.rows.filter(r=>r.absorbed_into_block_id==null);
assert.deepEqual(visible().map(r=>r.pbs),['p4b0','p4b0s0','p4b0s1','p4b0s2','p4b0s3']);
const buried=cm.rows.find(r=>r.block_id===20);
assert.equal(buried.absorbed_into_block_id,10);
assert.equal(buried.source_block_key,'immutable:20');
assert.equal(buried.block_json,JSON.stringify({original_id:20}));
assert.deepEqual(visible().filter(r=>r.parent_block_id===10).map(r=>r.block_id),[11,12,21,22]);
assert.equal(JSON.stringify(rows),original);
assert.equal(cm.history[0].operation.scope,'delta');
assert.equal(cm.queue.length,1);
cm=editBlockRuntime(cm,{action:'undo'}).state;
assert.deepEqual(cm.rows.map(r=>r.pbs),rows.map(r=>r.pbs));
assert(cm.rows.every(r=>r.absorbed_into_block_id==null));
cm=editBlockRuntime(cm,{action:'redo'}).state;
assert.deepEqual(cm.rows.filter(r=>r.absorbed_into_block_id==null).map(r=>r.pbs),
 ['p4b0','p4b0s0','p4b0s1','p4b0s2','p4b0s3']);
console.log('LAB_OCR_PARENT_PARENT_MERGE_CM_PASS');
