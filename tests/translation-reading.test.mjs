import assert from 'node:assert/strict';
import test from 'node:test';
import {createReadingDocument} from '../ui/translation/document.js';
import {sampleSnapshot} from './translation-original-fixture.mjs';
import {preparedFixture} from './translation-preparation-fixture.mjs';
import {sha256,canonicalRows} from '../ui/translation/original-sentences.js';
test('lossless physical MDLine and sentence index, including trailing blank lines and UTF16',async()=>{
 const original=await sampleSnapshot(' 😀',true),preparation=preparedFixture(original);
 const model=createReadingDocument(preparation);
 assert.equal(model.text,original.rows.map(r=>r.raw).join(''));
 assert.equal(await sha256(model.text),original.source_document_hash);
 assert.deepEqual(model.lineStarts,[0,...Array.from(model.text.matchAll(/\n/g),m=>m.index+1)]);
 for(const [i,row] of original.rows.entries()){
   const item=model.byKey(row.source_line+':'+row.sentence_index);
   assert.equal(model.text.slice(item.from,item.to),row.raw);
   assert.equal(model.atOffset(item.from),item);
   assert.equal(item.from,model.lineOffset(row.source_line)+row.from_utf16);
   for(const p of preparation.rows[i].protected)assert(model.ranges.some(s=>s.from===item.from+p.from&&s.to===item.from+p.to&&model.text.slice(s.from,s.to)===p.text));
 }
 assert.equal(model.atOffset(model.lineOffset(2)).key,'1:0');
 assert.equal(model.atOffset(model.text.length).key,'5:0');
 assert.equal(createReadingDocument(null),null);
 const bad=structuredClone(preparation);bad.rows[1].source_line=99;
 assert.throws(()=>createReadingDocument(bad));
});
test('last line without LF has a real half-open interval; no extra line or newline',async()=>{
 const original=await sampleSnapshot();
 const last=original.rows.at(-1);last.raw=last.raw.slice(0,-1);
 original.source_document_hash=await sha256(original.rows.map(r=>r.raw).join(''));
 original.rows.forEach(r=>r.source_document_hash=original.source_document_hash);
 original.sentence_sha256=await sha256(canonicalRows(original.rows));
 const model=createReadingDocument(preparedFixture(original));
 assert.equal(model.text.endsWith('\n'),false);
 assert.equal(model.lineOffset(last.source_line+1),model.text.length);
});
