import test from 'node:test';
import assert from 'node:assert/strict';
import {blockAtOffset,candidateDisplay} from '../ui/sentence/display.js';
test('logical block selection uses exact UTF16 offsets and retains previous block in separator',()=>{
 const a={from:0,to:3},b={from:5,to:10};const blocks=[a,b];
 assert.equal(blockAtOffset([],0),null);
 for(const pos of [0,2,3,4])assert.equal(blockAtOffset(blocks,pos),a);
 for(const pos of [5,9,10])assert.equal(blockAtOffset(blocks,pos),b);
});
test('sentence color projection retains exact source and leaves protected content raw',()=>{
 const block={text:'A B. $x$ C.'};
 const candidate={units:[{sourceRanges:[{from:0,to:1},{from:2,to:4}]},{sourceRanges:[{from:9,to:11}]}]};
 const d=candidateDisplay(block,candidate);
 assert.equal(d.text,block.text);
 assert.deepEqual(d.marks,[{from:0,to:4,unit:0,className:'sentence-unit-even'},{from:9,to:11,unit:1,className:'sentence-unit-odd'}]);
 assert.equal(d.label,'2 句');assert.deepEqual(candidateDisplay(block,{error:'bad'}),{text:block.text,marks:[],label:'分句失败'});
 assert.equal(candidateDisplay(block,{units:[]}).label,'0 句');
});
