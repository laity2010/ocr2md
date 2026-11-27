import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleSnapshot} from './translation-original-fixture.mjs';
import {preparedFixture} from './translation-preparation-fixture.mjs';
import {createTranslationJSON,indexJSONSentences} from '../ui/translation/export-json.js';
import {sha256} from '../ui/translation/original-sentences.js';

test('export exact prepared text, grouped MDLine, stable identity, no protected values or raw',async()=>{
 const table=preparedFixture(await sampleSnapshot(' 😀 ⟦P0⟧',true,true)),before=JSON.stringify(table);
 const a=await createTranslationJSON(table),b=await createTranslationJSON(table),data=JSON.parse(a.text);
 assert.deepEqual(a,b);
 assert.equal(data.schema,'ocr2md-trans/v1');assert.equal(data.target_language,'zh-CN');
 assert.equal(data.source_sha256,table.source_document_hash);assert.equal(data.sentence_sha256,table.sentence_sha256);
 const {task_id,...input}=data;assert.equal(task_id,await sha256(JSON.stringify(input)));
 assert.equal(a.count,table.rows.filter(r=>r.translatable).length);
 assert.deepEqual(data.mdlines.flatMap(l=>l.sentences.map(s=>[l.source_line,l.type,l.level,s.sentence_index,s.text])),
 table.rows.filter(r=>r.translatable).map(r=>[r.source_line,r.type,r.level,r.sentence_index,r.text]));
 assert(data.mdlines.every(l=>Object.keys(l).join(',')==='source_line,type,level,sentences'&&l.sentences.every(s=>Object.keys(s).join(',')==='sentence_index,text')));
 assert(!a.text.includes('$$x=1$$'));assert(!a.text.includes('$r_t$'));
 assert.equal(JSON.stringify(table),before);assert(a.text.endsWith('\n'));
 assert.notEqual(JSON.parse((await createTranslationJSON(table,{targetLanguage:'ja'})).text).task_id,task_id);
 assert.equal(await createTranslationJSON(null),null);
});
test('export rejects altered text, identity and source; empty table generates zero tasks',async()=>{
 const table=preparedFixture(await sampleSnapshot('',true,true));
 for(const mutate of [t=>t.rows[0].text+='x',t=>t.rows[0].source_line=0,t=>t.source_document_hash='0'.repeat(64)]){
   const bad=structuredClone(table);mutate(bad);await assert.rejects(createTranslationJSON(bad));
 }
 const empty={...table,rows:[],source_document_hash:await sha256('')};
 const a=await createTranslationJSON(empty);assert.equal(a.count,0);assert.deepEqual(JSON.parse(a.text).mdlines,[]);
});


test('JSON display index uses exact compound identity, not text or original line number',async()=>{
 const table=preparedFixture(await sampleSnapshot(' 😀 "text" \\n',true,true));
 const artifact=await createTranslationJSON(table);
 const lines=artifact.text.split('\n'),index=indexJSONSentences(artifact.text);
 assert.equal(index.size,artifact.count);
 for(const row of table.rows){
   const key=row.source_line+':'+row.sentence_index;
   if(!row.translatable){assert.equal(index.has(key),false);continue;}
   const line=index.get(key);
   assert.equal(lines[line-1],'          "text": '+JSON.stringify(row.text));
   assert.equal(lines[line-2],'          "sentence_index": '+row.sentence_index+',');
 }
 assert.equal(indexJSONSentences('').size,0);
 assert.deepEqual([...indexJSONSentences(artifact.text)], [...index]);
});
