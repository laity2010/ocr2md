import test from 'node:test';
import assert from 'node:assert/strict';
import {blockAtOffset,boundaryDisplay,isDisputed,reviewProjection,sentenceAtOffset} from '../ui/sentence/display.js';
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

test('review projection filters unresolved disagreements without changing input',()=>{
 const candidate=(engine,ends)=>({engine,units:ends.map(to=>({sourceRanges:[{from:to-1,to}]}))});
 const blocks=[{logicalId:1,sha256:'a',from:0,to:5,text:'A. B.'},{logicalId:2,sha256:'b',from:7,to:12,text:'C. D.'}];
 const snapshot={documentVersion:'v',markdown:'A. B.\n\nC. D.',blocks};
 const results={documentVersion:'v',blocks:blocks.map((b,i)=>({logicalId:b.logicalId,sourceSha256:b.sha256,candidates:[candidate('intl',[2,5]),candidate('sentence-splitter',i?[5]:[2,5]),candidate('wink-nlp',[2,5])]}))};
 assert.equal(isDisputed(results.blocks[0]),false);assert.equal(isDisputed(results.blocks[1]),true);
 const filtered=reviewProjection(snapshot,results,false,new Map());
 assert.equal(filtered.snapshot.markdown,'C. D.');assert.equal(filtered.snapshot.blocks[0].sourceFrom,7);
 assert.equal(boundaryDisplay(filtered.snapshot,filtered.results).source.marks[0].title,'句界 · intl / wink-nlp · MD 9');
 assert.equal(reviewProjection(snapshot,results,false,new Map([[2,'intl']])).snapshot.markdown,'');
 assert.equal(reviewProjection(snapshot,results,true,new Map([[2,'intl']])).snapshot,snapshot);
 assert.equal(snapshot.markdown,'A. B.\n\nC. D.');
});

test('focused sentence uses engine-specific exact source spans and local marker coordinates',()=>{
 const b={from:10,text:'A. B. $x$ C.'};
 const c=(ends)=>({units:ends.map(([from,to])=>({sourceRanges:[{from,to}]}))});
 const a=c([[0,2],[3,12]]),joined=c([[0,12]]);
 const mark={pos:22,label:'│',style:'ocr-sb-agreed',title:'end'};
 assert.equal(sentenceAtOffset(b,a,11).text,'A.');
 assert.equal(sentenceAtOffset(b,joined,11).text,b.text);
 assert.equal(sentenceAtOffset(b,a,12).text,'B. $x$ C.');
 assert.deepEqual(sentenceAtOffset(b,a,22,[mark]),{text:'B. $x$ C.',marks:[{...mark,pos:9}],label:'2 / 2 句'});
 assert.equal(sentenceAtOffset(b,{units:[]},11).text,'');
 assert.equal(sentenceAtOffset(b,{error:'bad'},11).label,'分句失败');
});
