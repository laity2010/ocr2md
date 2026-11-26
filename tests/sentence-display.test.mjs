import test from 'node:test';
import assert from 'node:assert/strict';
import {lineAtOffset,boundaryDisplay,isDisputed,reviewProjection,lineCandidateDisplay,projectSentenceRows} from '../ui/sentence/display.js';
test('MDLine selection uses exact UTF16 offsets and retains previous block in separator',()=>{
 const a={from:0,to:5,eol:'\n'},b={from:5,to:10,eol:''};const lines=[a,b];
 assert.equal(lineAtOffset([],0),null);
 for(const pos of [0,2,3,4])assert.equal(lineAtOffset(lines,pos),a);
 for(const pos of [5,9,10])assert.equal(lineAtOffset(lines,pos),b);
 assert.equal(lineAtOffset([{...b,eol:'\n'}],10),null);
});
test('original Sentence Lab union: green consensus, amber disagreement and exact absolute positions',()=>{
 const block={sourceLine:1,sha256:'a',from:10,text:'A. B. $x$ C.'};
 const snapshot={documentVersion:'v',lines:[block]};
 const candidate=(engine,ends)=>({engine,units:ends.map(to=>({sourceRanges:[{from:to-1,to}]}))});
 const row={sourceLine:1,sourceSha256:'a',candidates:[candidate('intl',[2,5,12]),candidate('sentence-splitter',[5,12]),candidate('wink-nlp',[2,5,12])]};
 const results={documentVersion:'v',lines:[row]};
 const d=boundaryDisplay(snapshot,results),pick=marks=>marks.map(({pos,label,style})=>({pos,label,style}));
 assert.deepEqual(pick(d.source.marks),[{pos:12,label:'┆',style:'ocr-sb-split'},{pos:15,label:'│',style:'ocr-sb-agreed'},{pos:22,label:'│',style:'ocr-sb-agreed'}]);
 assert.deepEqual(pick(d['sentence-splitter'].marks),[{pos:15,label:'│',style:'ocr-sb-agreed'},{pos:22,label:'│',style:'ocr-sb-agreed'}]);
 assert.equal(d.intl.count,3);assert.equal(d['sentence-splitter'].count,2);
 assert.throws(()=>boundaryDisplay(snapshot,{...results,documentVersion:'wrong'}));
 assert.equal(boundaryDisplay(snapshot,{...results,lines:[{...row,candidates:row.candidates.slice(0,2)}]})['wink-nlp'].failed,1);
});

test('review projection filters unresolved disagreements without changing input',()=>{
 const candidate=(engine,ends)=>({engine,units:ends.map(to=>({sourceRanges:[{from:to-1,to}]}))});
 const lines=[{sourceLine:1,sha256:'a',from:0,to:6,text:'A. B.',eol:'\n'},{sourceLine:2,sha256:'b',from:6,to:11,text:'C. D.',eol:''}];
 const snapshot={documentVersion:'v',markdown:'A. B.\nC. D.',lines};
 const results={documentVersion:'v',lines:lines.map((b,i)=>({sourceLine:b.sourceLine,sourceSha256:b.sha256,candidates:[candidate('intl',[2,5]),candidate('sentence-splitter',i?[5]:[2,5]),candidate('wink-nlp',[2,5])]}))};
 assert.equal(isDisputed(results.lines[0]),false);assert.equal(isDisputed(results.lines[1]),true);
 const filtered=reviewProjection(snapshot,results,false,new Map());
 assert.equal(filtered.snapshot.markdown,'C. D.');assert.equal(filtered.snapshot.lines[0].sourceFrom,6);
 assert.equal(boundaryDisplay(filtered.snapshot,filtered.results).source.marks[0].title,'句界 · intl / wink-nlp · MD 8');
 assert.equal(reviewProjection(snapshot,results,false,new Map([[2,'intl']])).snapshot.markdown,'');
 assert.equal(reviewProjection(snapshot,results,true,new Map([[2,'intl']])).snapshot,snapshot);
 assert.equal(snapshot.markdown,'A. B.\nC. D.');
});

test('focused MDLine keeps complete original text and all local engine boundaries',()=>{
 const b={from:10,text:'A. B. $x$ C.'};
 const c=(ends)=>({units:ends.map(to=>({sourceRanges:[{from:to-1,to}]}))});
 const mark=(pos,style='ocr-sb-agreed')=>({pos,label:'│',style,title:'end '+pos});
 const a=c([2,5,12]),joined=c([12]),end=mark(22);
 assert.deepEqual(lineCandidateDisplay(b,a,[mark(10),mark(12,'ocr-sb-split'),mark(15),end,mark(23)]),
  {text:b.text,marks:[{...mark(12,'ocr-sb-split'),pos:2},{...mark(15),pos:5},{...end,pos:12}],label:'3 句'});
 assert.deepEqual(lineCandidateDisplay(b,joined,[end]),{text:b.text,marks:[{...end,pos:12}],label:'1 句'});
 assert.deepEqual(lineCandidateDisplay(b,{units:[]}),{text:b.text,marks:[],label:'无分句'});
 assert.deepEqual(lineCandidateDisplay(b,{error:'bad'}),{text:'',marks:[],label:'分句失败'});
});


test('pending MDLine retains all original trailing blanks; grid shares exact line set',()=>{
 const texts=['A. B.','','  ','hidden','','C. D.','','E. F.',''];
 let from=0;
 const lines=texts.map((text,i)=>{
  const eol='\n',line={sourceLine:i+1,sha256:'hash'+i,from,to:from+text.length+1,text,eol,textTo:from+text.length};
  from=line.to;return line;
 });
 const snapshot={documentVersion:'v',markdown:texts.join('\n')+'\n',lines};
 const results={documentVersion:'v',lines:lines.map(line=>({sourceLine:line.sourceLine,sourceSha256:line.sha256,
  reviewState:[1,6,8].includes(line.sourceLine)?'disputed':'no_split',candidates:[]}))};
 const rows=lines.map(line=>({source_line:line.sourceLine,sentence_index:0,sentence_text:line.text,
  review_state:results.lines[line.sourceLine-1].reviewState,adopted_engine:null}));
 const choices=new Map([[6,'intl']]);
 const filtered=reviewProjection(snapshot,results,false,choices);
 assert.equal(filtered.snapshot.markdown,'A. B.\n\n  \nE. F.\n\n');
 assert.deepEqual(filtered.snapshot.lines.map(l=>l.sourceLine),[1,2,3,8,9]);
 assert.deepEqual(filtered.results.lines.map(l=>l.sourceLine),[1,2,3,8,9]);
 assert.deepEqual(projectSentenceRows(rows,filtered.snapshot.lines,choices).map(r=>r.source_line),[1,2,3,8,9]);
 const all=projectSentenceRows(rows,lines);
 assert.equal(all[5],rows[5]);
 assert.equal(all[5].review_state,'disputed');
 assert.equal(all[5].sentence_text,'C. D.');
 assert.equal(reviewProjection(snapshot,results,true,choices).snapshot.markdown,snapshot.markdown);
 assert.equal(reviewProjection(snapshot,results,false,new Map([[1,'intl'],[6,'intl'],[8,'intl']])).snapshot.markdown,'');
});
