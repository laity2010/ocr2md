import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleSnapshot} from './translation-original-fixture.mjs';
import {preparedFixture} from './translation-preparation-fixture.mjs';
import {createReadingDocument} from '../ui/translation/document.js';
import {createComparisonDocument} from '../ui/translation/comparison-document.js';
import {nearestSentence,fractionWithin,anchorHeight} from '../ui/translation/scroll-anchor.js';
import {placeholder} from '../ui/translation/refill.js';
test('right projection uses exact prepared text, same sentence keys, no mutation, protected tokens only',async()=>{
 const original=await sampleSnapshot(' ⟦P0⟧ 😀',true,true),table=preparedFixture(original);
 const before=JSON.stringify(table),left=createReadingDocument(table,{pending:true}),right=createComparisonDocument(table.rows);
 const rows=table.rows.filter(r=>r.translatable);
 assert.equal(right.text,rows.map(r=>r.text).join('\n'));
 assert.deepEqual(right.sentences.map(r=>r.key),left.sentences.map(r=>r.key));
 for(const r of rows){
   const key=r.source_line+':'+r.sentence_index,item=right.byKey(key);
   assert.equal(right.text.slice(item.from,item.to),r.text);
   assert.equal(right.atOffset(item.from).key,key);
   for(const [i,p] of r.protected.entries())assert(right.ranges.some(s=>s.from>=item.from&&s.to<=item.to&&s.text===placeholder(r.raw,i)&&right.text.slice(s.from,s.to)===s.text));
 }
 assert.equal(JSON.stringify(table),before);
 assert.equal(createComparisonDocument(table.rows.filter(r=>!r.translatable)).text,'');
 const bad=structuredClone(table);bad.rows[0].text+='x';assert.throws(()=>createComparisonDocument(bad.rows),/不一致/);
});
test('scroll anchor maps omitted regions and different visual heights by shared identity',()=>{
 const rows=[
   {source_line:1,sentence_index:0,raw:'First.\n',protected:[],translatable:true},
   {source_line:2,sentence_index:0,raw:'$x$\n',protected:[{from:0,to:4,kind:'latex',text:'$x$\n'}],translatable:false},
   {source_line:3,sentence_index:0,raw:'Last.\n',protected:[],translatable:true}
 ];
 const left=createReadingDocument({rows},{pending:true});
 assert.equal(nearestSentence(left,left.lineOffset(2)).key,'3:0');
 assert.equal(nearestSentence(left,0).key,'1:0');
 assert.equal(nearestSentence(createReadingDocument({rows:[]},{pending:true}),0),null);
 assert.equal(fractionWithin(10,90,30),.25);assert.equal(anchorHeight(100,140,.25),110);
 assert.equal(fractionWithin(10,90,-1),0);assert.equal(anchorHeight(100,140,2),140);
});
