/** Independent CM runtime state tests. No AG/PDF/SQLite. */
import assert from 'node:assert/strict';
import {createBlockRuntime,editBlockRuntime,planBlockMoveInMemory,planFlattenPageInMemory,
  acknowledgeBlockPersistence,runtimeStatus,projectBlockOverlays} from '../ui/lab-ocr/block-runtime.js';

const data=[
 [100,null,0,'p1b0',0],[101,null,1,'p1b1',0],
 [102,101,0,'p1b1s0',0],[103,null,2,'p1b2',0],
 [104,103,0,'p1b2s0',0],[105,null,0,'p2b0',1],
].map(([block_id,parent_block_id,sibling_order,pbs,global_page])=>
 ({block_id,parent_block_id,sibling_order,pbs,global_page,block_group:'para_blocks',
 source_block_key:'source:'+block_id,block_json:'{"raw":true}'}));
const initial=JSON.stringify(data);
let cm=createBlockRuntime({workspace:'/isolated',rows:data,revision:5});
assert.deepEqual(runtimeStatus(cm),{initialized:true,workspace:'/isolated',
  revision:5,pending:0,canUndo:false,canRedo:false});
const a=editBlockRuntime(cm,{action:'apply',sourceBlockId:100,targetBlockId:101,placement:'child'});
cm=a.state;
assert(a.changed);
assert.equal(cm.rows.find(r=>r.block_id===100).pbs,'p1b0s1');
assert.equal(cm.rows.find(r=>r.block_id===100).parent_block_id,101);
assert.equal(cm.rows.find(r=>r.block_id===105).pbs,'p2b0');
assert.equal(cm.queue.length,1);
assert.equal(JSON.stringify(data),initial,'CM runtime must never mutate source rows');
const projected=projectBlockOverlays(cm,{level:'block',page:1,boxes:[
 {blockId:'100',pbs:'p1b0',parentBlockId:null,bbox:[10,20,50,65]}]});
assert.deepEqual([projected.boxes[0].pbs,projected.boxes[0].parentBlockId],
  ['p1b0s1','101']);
const b=editBlockRuntime(cm,{action:'apply',sourceBlockId:103,targetBlockId:101,placement:'before'});
cm=b.state;
assert.equal(cm.queue.length,2,'Two edits take effect before any SQL persistence');
assert.equal(cm.rows.find(r=>r.block_id===103).pbs,'p1b0');
assert.equal(cm.rows.find(r=>r.block_id===101).pbs,'p1b1');
const c=editBlockRuntime(cm,{action:'undo'});
cm=c.state;
assert.equal(cm.rows.find(r=>r.block_id===103).pbs,'p1b1');
assert.equal(cm.queue.length,3);
assert.equal(runtimeStatus(cm).canRedo,true);
const d=editBlockRuntime(cm,{action:'redo'});
cm=d.state;
assert.equal(cm.rows.find(r=>r.block_id===103).pbs,'p1b0');
assert.equal(cm.queue.length,4);
const saved=acknowledgeBlockPersistence(cm,[1,2],7);
assert.equal(saved.queue.length,2);
assert.equal(saved.revision,7);
assert.equal(saved.rows.find(r=>r.block_id===100).pbs,'p1b1s1',
  'An acknowledgment must not replace the current CM relations');
// Redo remains a CM record after a partial persistence batch.
assert.equal(saved.history.length,2);
assert.throws(()=>acknowledgeBlockPersistence(cm,[2],6),/回执不匹配/);
assert.equal(acknowledgeBlockPersistence(saved,[3,4],9).dirty,false);
assert.equal(acknowledgeBlockPersistence(saved,[3,4],9).queue.length,0);
const orphan=data.map(r=>({...r}));orphan[2].parent_block_id=999;
assert.throws(()=>planBlockMoveInMemory(orphan,100,101,'before'),/父 BlockID/);
assert.throws(()=>planBlockMoveInMemory(data,101,102,'child'),/自身的后代/);
assert.throws(()=>planBlockMoveInMemory(data,100,105,'after'),/同页/);
assert.throws(()=>planBlockMoveInMemory(data,102,103,'after'),/同级/);

// Reported real-world shape: p6b4s2s0 must NOT exist after a full page
// load, moving a parent with children or restoring from SQLite.
const nested=[
  [20,null,4,'p6b4',0],
  [21,20,0,'p6b4s0',0],
  [22,20,1,'p6b4s1',0],
  [23,20,2,'p6b4s2',0],
  [24,23,0,'p6b4s2s0',0],
  [25,null,5,'p6b5',0],
].map(([block_id,parent_block_id,sibling_order,pbs])=>({
  block_id,parent_block_id,sibling_order,pbs,global_page:5,
  block_group:'para_blocks',block_json:'source_'+block_id,source_block_key:'src_'+block_id,
}));
const beforeNested=JSON.stringify(nested);
const normalized=planFlattenPageInMemory(nested,6);
assert.equal(normalized.changed,true);
const promoted=normalized.changedRows.find(r=>r.block_id===24);
assert.deepEqual([promoted.parent_block_id,promoted.pbs],
  [20,'p6b0s3'],'A grandson is promoted beneath the original top parent');
assert.equal(JSON.stringify(nested),beforeNested,'Pure canonicalization must not mutate source');
let migrate=createBlockRuntime({workspace:'/isolated',rows:nested});
let flattened=editBlockRuntime(migrate,{action:'flatten',page:6});
migrate=flattened.state;
assert.equal(migrate.rows.find(r=>r.block_id===24).parent_block_id,20);
assert.equal(migrate.rows.find(r=>r.block_id===24).pbs,'p6b0s3');
assert.equal(migrate.queue[0].action,'flatten');
assert.equal(runtimeStatus(migrate).canUndo,false,'Protective migration cannot be undone into invalid depth');
assert.throws(()=>editBlockRuntime(migrate,{action:'undo'}),/保护性迁移/);
assert.equal(migrate.history[0].before.find(row=>row[0]===24)[3],
  'p6b4s2s0','Original nested relationship survives in the audit snapshot');
const later=editBlockRuntime(migrate,{action:'apply',
  sourceBlockId:25,targetBlockId:20,placement:'child'});
migrate=later.state;
assert.equal(runtimeStatus(migrate).canUndo,true,'Subsequent user moves remain undoable');
const undoLater=editBlockRuntime(migrate,{action:'undo'}).state;
assert.equal(undoLater.rows.find(r=>r.block_id===24).parent_block_id,20);
assert.equal(runtimeStatus(undoLater).canUndo,false,'Undo stops at the system migration barrier');
// Parent absorbs child parents as a flat family. No third-level PBS survives.
const flatBase=[
 [10,null,0,'p1b0'],[11,10,0,'p1b0s0'],
 [12,null,1,'p1b1'],[13,12,0,'p1b1s0'],
].map(([block_id,parent_block_id,sibling_order,pbs])=>({
 block_id,parent_block_id,sibling_order,pbs,global_page:0,block_group:'para_blocks',
}));
const absorbed=planBlockMoveInMemory(flatBase,10,12,'child');
const absorbedById=new Map(absorbed.after.map(row=>[row[0],row]));
assert.equal(absorbedById.get(10)[1],12);
assert.equal(absorbedById.get(11)[1],12);
assert.equal(absorbedById.get(10)[3],'p1b0s1');
assert.equal(absorbedById.get(11)[3],'p1b0s2');
assert(absorbed.after.every(r=>r[3].split('s').length<=2));
console.log('LAB_OCR_CM_BLOCK_RUNTIME_PASS',JSON.stringify({history:cm.history.length,
  queued:cm.queue.length,partialAck:saved.queue.length}));
