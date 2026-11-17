/** Pure direct contract: every visible built-in example is recognized by
 * exactly the installed regex source, not a divergent documentation regex.
 */
import assert from 'node:assert/strict';
import {NOTE_RULE_PRESETS,NOTE_REFERENCE_RULES,NOTE_BODY_RULES,
  validateNoteMatchConfig,projectNoteMatchIndex} from '../ui/lab-ocr/note-match-index.js';
const ids=[...NOTE_REFERENCE_RULES,...NOTE_BODY_RULES];
assert.deepEqual(Object.keys(NOTE_RULE_PRESETS),ids);
for(const id of ids){
  const item=NOTE_RULE_PRESETS[id];
  assert(item?.label&&item?.example&&item?.pattern,`Incomplete preset ${id}`);
  const slash=item.pattern.lastIndexOf('/');
  const regex=new RegExp(item.pattern.slice(1,slash),item.pattern.slice(slash+1));
  assert(regex.test(item.example),`Preset example must match real regex: ${id}`);
  assert.equal(item.id,id);
}
const config=validateNoteMatchConfig({
  referenceRules:['ref.html-sup','ref.md-footnote'],
  bodyRules:['body.number-dot','body.md-footnote'],
  scope:'chapter',chapterLevel:2,continuation:'same-block',weakAutoMatch:false,
});
const texts=['## Chapter One','Source text<sup>7</sup> and normalized[^8].',
  '## Notes','7. The original note.','[^8]: The converted note.'];
const md=texts.map((text,i)=>({line_id:`preset-${i}`,line_no:i+1,
  block_id:100+i,text}));
const result=projectNoteMatchIndex(md,[],config);
assert.deepEqual(result.references.map(item=>item.number),['7','8']);
assert.deepEqual(result.bodies.map(item=>item.number),['7','8']);
assert.equal(result.stats.matched,2);
assert.equal(result.configuration.scope,'chapter');
console.log('LAB_OCR_NOTE_RULE_PRESETS_DIRECT_PASS',ids.length);
