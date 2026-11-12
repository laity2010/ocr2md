import assert from 'node:assert/strict';
import test from 'node:test';
import {pdfOverlayRect,validateOverlays} from '../src/geometry.js';
const basic={blockId:12,parentId:null,label:'p1b1',pageIndex:0,
  bbox:[80,120,450,165],pageSize:[595,842],type:'text',status:'normal'};
test('PV01: normalized OCR rectangle mirrors Main geometry (no rotation drift)',()=>{
 const rect=pdfOverlayRect(basic,{width:595,height:842});
 assert.deepEqual(rect,{left:80/595*100,top:120/842*100,width:370/595*100,height:45/842*100});
 const scale=pdfOverlayRect(basic,{width:1190,height:1684});
 assert.deepEqual(scale,rect);
});
test('PV01: rejects inconsistent page dimensions, invalid bounds or rotation',()=>{
 assert.throws(()=>pdfOverlayRect(basic,{width:842,height:595}),/尺寸或旋转不一致/);
 assert.throws(()=>pdfOverlayRect({...basic,bbox:[0,0,900,2]},{width:595,height:842}),/坐标无效/);
 assert.throws(()=>pdfOverlayRect({...basic,bbox:[3,5,1,2]},{width:595,height:842}),/坐标无效/);
 assert.throws(()=>pdfOverlayRect({...basic,pageSize:[0,842]},{width:595,height:842}),/坐标无效/);
});
test('PV02: stable BlockID, ParentID and mutable PBS are separate',()=>{
 const rows=validateOverlays([basic,{...basic,blockId:13,parentId:12,label:'p1b1s0'}]);
 assert.equal(rows[1].parentId,12);
 const changed=validateOverlays([basic,{...basic,blockId:13,parentId:12,label:'p1b7s2'}]);
 assert.equal(changed[1].parentId,12);
 assert.equal(changed[1].blockId,13);
 assert.equal(changed[1].label,'p1b7s2');
 assert.equal(Object.isFrozen(changed[1]),true);
});
test('PV02: disallow collisions/unsafe input before mutating viewer state',()=>{
 assert.throws(()=>validateOverlays([basic,basic]),/重复/);
 assert.throws(()=>validateOverlays([basic,{...basic,blockId:-1}]),/BlockID/);
 assert.throws(()=>validateOverlays([{...basic,blockId:13,pageIndex:-1}]),/页码无效/);
 assert.throws(()=>validateOverlays([{...basic,parentId:{id:1}}]),/ParentID/);
 assert.throws(()=>validateOverlays([{...basic,label:'x'.repeat(300)}]),/PBS/);
 assert.throws(()=>validateOverlays([{}]),/BlockID/);
 assert.throws(()=>validateOverlays({}),/数组/);
});
