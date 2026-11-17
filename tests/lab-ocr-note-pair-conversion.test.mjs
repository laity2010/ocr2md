import assert from 'node:assert/strict';
import {projectNoteMatchIndex} from '../ui/lab-ocr/note-match-index.js';
import {planNotePairConversion} from '../ui/lab-ocr/note-pair-conversion.js';
function check(lines,selected=0,bodyAt=0,config={}){
 const md=lines.map((text,i)=>({line_no:i+1,line_id:'line-'+i,block_id:101+i,text}));
 const idx=projectNoteMatchIndex(md,[],config);
 const ref=idx.references[selected],body=idx.bodies[bodyAt];
 assert(ref&&body);
 const review={decision:'待转换',valid:true,body_id:body.candidate_id,
   ref_line_id:ref.line_id,ref_block_id:ref.block_id,ref_from:ref.from,
   ref_to:ref.to,ref_raw:ref.raw,ref_source_text:md.find(x=>x.line_id===ref.line_id).text,
   body_line_id:body.line_id,body_block_id:body.block_id,body_from:body.from,
   body_to:body.to,body_raw:body.raw,body_source_text:md.find(x=>x.line_id===body.line_id).text};
 const snapshot=JSON.stringify(md);
 const args={mdRows:md,configuration:config,referenceId:ref.candidate_id,
   bodyId:body.candidate_id,review};
 const plan=planNotePairConversion(args);
 assert.equal(JSON.stringify(md),snapshot,'Planner cannot edit source');
 return {md,idx,plan,args};
}
const a=check(['Foo<sup>1</sup> bar','## Notes','1. First body']);
assert.deepEqual(a.plan.updates.map(x=>[x.lineNo,x.afterText]),
  [[1,'Foo[^1] bar'],[3,'[^1]: First body']]);
assert.equal(a.plan.convertedReferenceId,'ref:line-0:3:ref.md-footnote');
const escaped=check(['A\\<sup>2\\</sup>','## Notes','2) Body here']);
assert.deepEqual(escaped.plan.updates.map(x=>x.afterText),
  ['A[^2]','[^2]: Body here']);
const repeated=check(['See <sup>1</sup> and <sup>1</sup> here.',
  '## Notes','1. Shared definition']);
assert.equal(repeated.idx.references.length,2);
assert.equal(repeated.plan.updates.length,2);
assert.equal(repeated.md[0].text,'See <sup>1</sup> and <sup>1</sup> here.');
const alreadyBody=check(['A<sup>1</sup>','## Notes','[^1]: Already normalized']);
assert.deepEqual(alreadyBody.plan.updates.map(x=>x.afterText),['A[^1]']);
assert.throws(()=>planNotePairConversion({...a.args,review:{...a.args.review,valid:false}}),/没有有效/);
assert.throws(()=>planNotePairConversion({...a.args,review:{...a.args.review,ref_source_text:'tampered'}}),/原文证据/);
assert.throws(()=>check(['See<sup>1</sup>','## Notes','1. First','1. Duplicate']),/相同注号/);
// A physically separate, unindented paragraph is never silently absorbed
// into the footnote by the multiline mode.
assert.throws(()=>check(['See<sup>1</sup>','## Notes','1. First','Not indented next paragraph'],0,0,
  {continuation:'notes-section'}),/没有明确缩进/);
const multi=check(['See<sup>1</sup>','## Notes','1. First','  continued','',
  '    second paragraph'],0,0,{continuation:'notes-section'});
assert.deepEqual(multi.plan.updates.map(x=>x.afterText),
  ['See[^1]','[^1]: First','      continued','        second paragraph']);
assert.equal(multi.plan.continuationLineIds.length,3);
console.log('LAB_OCR_NOTE_PAIR_CONVERSION_DIRECT_PASS');
