import test from 'node:test';
import assert from 'node:assert/strict';
import {blockAtOffset,boundaryDisplay} from '../ui/sentence/display.js';
test('logical block selection uses exact UTF16 offsets and retains previous block in separator',()=>{
 const a={from:0,to:3},b={from:5,to:10};const blocks=[a,b];
 assert.equal(blockAtOffset([],0),null);
 for(const pos of [0,2,3,4])assert.equal(blockAtOffset(blocks,pos),a);
 for(const pos of [5,9,10])assert.equal(blockAtOffset(blocks,pos),b);
});
test('original Sentence Lab union: green consensus, amber disagreement and exact absolute positions',()=>{
 const block={logicalId:1,sha256:'a',from:10,text:'A. B. $x$ C.'};
 const snapshot={documentVersion:'v',blocks:[block]};
 const candidate=(engine,ends)=>({engine,units:ends.map(to=>({sourceRanges:[{from:to-1,to}]}))});
 const row={logicalId:1,sourceSha256:'a',candidates:[candidate('intl',[2,5,12]),candidate('sentence-splitter',[5,12]),candidate('wink-nlp',[2,5,12])]};
 const results={documentVersion:'v',blocks:[row]};
 const d=boundaryDisplay(snapshot,results),pick=marks=>marks.map(({pos,label,style})=>({pos,label,style}));
 assert.deepEqual(pick(d.source.marks),[{pos:12,label:'┆',style:'ocr-sb-split'},{pos:15,label:'│',style:'ocr-sb-agreed'},{pos:22,label:'│',style:'ocr-sb-agreed'}]);
 assert.deepEqual(pick(d['sentence-splitter'].marks),[{pos:15,label:'│',style:'ocr-sb-agreed'},{pos:22,label:'│',style:'ocr-sb-agreed'}]);
 assert.equal(d.intl.count,3);assert.equal(d['sentence-splitter'].count,2);
 assert.throws(()=>boundaryDisplay(snapshot,{...results,documentVersion:'wrong'}));
 assert.equal(boundaryDisplay(snapshot,{...results,blocks:[{...row,candidates:row.candidates.slice(0,2)}]})['wink-nlp'].failed,1);
});
