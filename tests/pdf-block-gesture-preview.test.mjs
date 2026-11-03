import assert from 'node:assert/strict';
import {describePDFBlockGesture} from '../ui/pdf-block-gesture-preview.js';
for(const [placement,description] of [
  ['before','拟移至 p1b5 之前'],
  ['child','拟归入 p1b5 的子块'],
  ['after','拟移至 p1b5 之后']
]){
  const result=describePDFBlockGesture({sourceId:'p1b3',targetId:'p1b5',placement});
  assert.equal(result.sourceId,'p1b3');
  assert.equal(result.targetId,'p1b5');
  assert.equal(result.placement,placement);
  assert(result.message.includes(description),result.message);
  assert(result.message.includes('未修改 CMD、编号或覆盖框'));
  assert(Object.isFrozen(result));
}
assert(describePDFBlockGesture({sourceId:'p1b5',targetId:'p1b3s0',placement:'child'})
  .message.includes('拟归入 p1b3 的子块（落在 p1b3s0）'));
for(const args of [
  {sourceId:'p1b3',targetId:'p1b3',placement:'child'},
  {sourceId:'p1b3',targetId:'p1b5',placement:'invalid'},
  {sourceId:'unknown',targetId:'p1b5',placement:'before'},
  {sourceId:'p1b3',targetId:null,placement:'before'}
])assert.throws(()=>describePDFBlockGesture(args),/手势落点无效/);
console.log('PDF_BLOCK_GESTURE_STATUS_ONLY_PASS');
