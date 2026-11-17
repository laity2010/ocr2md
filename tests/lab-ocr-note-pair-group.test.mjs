import assert from 'node:assert/strict';
import {projectNoteMatchIndex} from '../ui/lab-ocr/note-match-index.js';
import {planNotePairGroupConversion} from '../ui/lab-ocr/note-pair-conversion.js';
const texts=['Assessing taxes<sup>9</sup> and overseas<sup>10</sup> Hence.',
  '## Notes','9. For a corporation, capital gains taxes apply.',
  '10. International taxes are complex.'];
const mdRows=texts.map((text,i)=>({line_no:i+1,line_id:`pbs-${i}`,
  block_id:i+50,text}));
const index=projectNoteMatchIndex(mdRows,[]);
assert.deepEqual(index.references.map(x=>x.number),['9','10']);
const pairs=index.references.map(ref=>{
 const body=index.bodies.find(x=>x.number===ref.number);
 assert(body);return {referenceId:ref.candidate_id,bodyId:body.candidate_id,
  review:{decision:'待转换',valid:true,revision:'a'.repeat(32),
   body_id:body.candidate_id,ref_line_id:ref.line_id,ref_block_id:ref.block_id,
   ref_from:ref.from,ref_to:ref.to,ref_raw:ref.raw,
   ref_source_text:mdRows.find(x=>x.line_id===ref.line_id).text,
   body_line_id:body.line_id,body_block_id:body.block_id,
   body_from:body.from,body_to:body.to,body_raw:body.raw,
   body_source_text:mdRows.find(x=>x.line_id===body.line_id).text}};
});
const before=JSON.stringify(mdRows);
const plan=planNotePairGroupConversion({mdRows,pairs});
assert.equal(JSON.stringify(mdRows),before);
assert.equal(plan.members.length,2);
assert.equal(plan.updates.length,3);
assert.deepEqual(plan.updates.map(x=>x.lineNo),[1,3,4]);
assert.equal(plan.updates[0].afterText,
  'Assessing taxes[^9] and overseas[^10] Hence.');
const ix9=plan.updates[0].afterText.indexOf('[^9]');
const ix10=plan.updates[0].afterText.indexOf('[^10]');
assert.equal(plan.members[0].convertedReferenceId,`ref:pbs-0:${ix9}:ref.md-footnote`);
assert.equal(plan.members[1].convertedReferenceId,`ref:pbs-0:${ix10}:ref.md-footnote`);
assert(ix10<index.references[1].from,'10 offset shifts left after replacing 9');
assert(plan.updates[1].afterText.startsWith('[^9]: '));
assert(plan.updates[2].afterText.startsWith('[^10]: '));
assert.throws(()=>planNotePairGroupConversion({mdRows,pairs:[pairs[0],pairs[0]]}),/重复/);
assert.throws(()=>planNotePairGroupConversion({mdRows,pairs:[pairs[0],
  {...pairs[1],review:{...pairs[1].review,valid:false}}]}),/没有有效/);
assert.throws(()=>planNotePairGroupConversion({mdRows,pairs:[pairs[0]]}),/至少 2 个注引/);
const partial=mdRows.map(row=>({...row}));
const originalText=partial[0].text;
partial[0].text=originalText.replace('<sup>10</sup>','[^10]');
partial[3].text='[^10]: International taxes are complex.';
const indexPartial=projectNoteMatchIndex(partial,[]);
const ref9=indexPartial.references.find(ref=>ref.number==='9');
const ref10=indexPartial.references.find(ref=>ref.number==='10');
const body9=indexPartial.bodies.find(body=>body.number==='9');
const partialReview={...pairs[0].review,
  ref_source_text:partial[0].text,body_source_text:partial[2].text,
  ref_from:ref9.from,ref_to:ref9.to,ref_raw:ref9.raw,
  body_id:body9.candidate_id};
const oldReceipt={ref_id:pairs[1].referenceId,revision:'a'.repeat(32),
  conversion:{converted_ref_id:ref10.candidate_id,
    converted_body_id:indexPartial.bodies.find(x=>x.number==='10').candidate_id,
    updates:[{line_id:'pbs-0'},{line_id:'pbs-3'}]},
  convertedLineTexts:{'pbs-0':partial[0].text,'pbs-3':partial[3].text}};
const afterPartial=planNotePairGroupConversion({mdRows:partial,
  pairs:[{referenceId:ref9.candidate_id,bodyId:body9.candidate_id,
    review:partialReview}],anchors:[{referenceId:oldReceipt.ref_id,saved:oldReceipt}]});
assert.equal(afterPartial.members.length,1);
assert.equal(afterPartial.anchors.length,1);
assert.equal(afterPartial.updates[0].afterText,
  'Assessing taxes[^9] and overseas[^10] Hence.');
assert.equal(afterPartial.anchors[0].convertedReferenceId,
  `ref:pbs-0:${afterPartial.updates[0].afterText.indexOf('[^10]')}:ref.md-footnote`);
console.log('LAB_OCR_NOTE_GROUP_9_10_DIRECT_PASS');
