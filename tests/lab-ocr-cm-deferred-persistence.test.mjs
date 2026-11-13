/** Persistence is transport-only; CM runtime stays the sole source of truth. */
import assert from 'node:assert/strict';
import {createBlockRuntime,editBlockRuntime,acknowledgeBlockPersistence} from '../ui/lab-ocr/block-runtime.js';
import {createBlockPersistence} from '../ui/lab-ocr/block-persistence.js';
const rows=[
 {block_id:1,global_page:0,block_group:'para_blocks',parent_block_id:null,sibling_order:0,pbs:'p1b0'},
 {block_id:2,global_page:0,block_group:'para_blocks',parent_block_id:null,sibling_order:1,pbs:'p1b1'},
 {block_id:3,global_page:0,block_group:'para_blocks',parent_block_id:null,sibling_order:2,pbs:'p1b2'},
];
let cm=createBlockRuntime({workspace:'/fixture',rows}),attempts=0,serverRevision=0;
const reports=[];
const transport=createBlockPersistence({
 read:()=>cm,
 ack:(ids,revision)=>{cm=acknowledgeBlockPersistence(cm,ids,revision);},
 post:async batch=>{
  attempts++;
  assert.equal(batch.expectedRevision,serverRevision);
  if(attempts===1)throw Error('simulated offline');
  serverRevision+=batch.operations.length;
  return {revision:serverRevision,appliedCount:batch.operations.length};
 },
 makeBatchId:()=> 'test_batch_123456',
 onStatus:(message,kind)=>reports.push({message,kind}),
 idleMs:60000,
});
cm=editBlockRuntime(cm,{action:'apply',sourceBlockId:1,targetBlockId:2,placement:'child'}).state;
assert.equal(cm.rows.find(r=>r.block_id===1).parent_block_id,2);
transport.changed();
cm=editBlockRuntime(cm,{action:'undo'}).state;
transport.changed();
assert.equal(serverRevision,0,'CM responds without network');
await assert.rejects(()=>transport.flush(),/offline/);
assert.equal(cm.queue.length,2);
assert.equal(cm.rows.find(r=>r.block_id===1).pbs,'p1b0');
const result=await transport.flush();
assert.equal(result,true);
assert.equal(serverRevision,2);
assert.equal(attempts,2);
assert.equal(cm.queue.length,0);
assert.equal(cm.revision,2);
assert.equal(reports[0].kind,'warning');
assert.equal(reports.at(-1).kind,'ok');
transport.dispose();
console.log('LAB_OCR_CM_DEFERRED_SQL_PASS');
