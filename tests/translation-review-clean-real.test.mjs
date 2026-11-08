/** Mandatory full-document Lab acceptance against the actual sealed 402-row input. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildCleanReviewedMD,restoreReviewedMD} from '../ui/translation-review-clean-md.js';

const path=process.env.OCR2MD_TRANSLATION_INPUT_DIR||
  join('labs','sentence-benchmark','.runtime','translation-review','input');
const source=readFileSync(join(path,'document.md'),'utf8');
const input=JSON.parse(readFileSync(join(path,'translation-units.json'),'utf8'));
assert.equal(createHash('sha256').update(source).digest('hex'),input.sourceSha256);
assert.equal(input.rows.length,402,'this locked real WP1 acceptance covers exactly 402 sealed units');
const result=buildCleanReviewedMD(source,input.rows);
assert.equal(restoreReviewedMD(result),source);
assert.equal(result.anchors.length,input.rows.length);
assert.equal(result.stats.sentenceBreaks,209);
assert.equal(result.stats.restored,true);
assert(!/<!--\s*(?:minerujson|cmd|ocr2md):/.test(result.doc));
for(const row of input.rows){
  const at=result.anchors.find(x=>x.id===row.id);
  assert(at&&at.from<at.to,`missing or empty anchor ${row.id}`);
  assert(result.doc.slice(at.from,at.to).trim(),`empty projected unit ${row.id}`);
}
const originalMedia=[...source.matchAll(/!\[[^\]]*\]\([^\n)]+\)/g)].map(x=>x[0]);
const cleanMedia=[...result.doc.matchAll(/!\[[^\]]*\]\([^\n)]+\)/g)].map(x=>x[0]);
assert.deepEqual(cleanMedia,originalMedia,'media references must remain unchanged and ordered');
const findFootnotes=s=>[...s.matchAll(/\[\^[^\]]+\]/g)].map(x=>x[0]);
assert.deepEqual(findFootnotes(result.doc),findFootnotes(source),'footnotes unchanged and ordered');
console.log('WP1_REAL_402_PASS',JSON.stringify({
  sourceSha256:input.sourceSha256,sourceLength:source.length,
  cleanLength:result.doc.length,units:result.stats.units,
  sentenceBreaks:result.stats.sentenceBreaks,
  provenanceRemoved:result.stats.provenanceRemoved,
  mediaReferences:cleanMedia.length,
  footnoteReferences:findFootnotes(result.doc).length,
  exactSourceRestoration:true
}));
