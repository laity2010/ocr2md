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
// OCR hard-wrap within one immutable BlockID is structural evidence that
// an unindented physical continuation still belongs to the SAME note.
const sameBlock=['See<sup>7</sup>','## Notes',
  '7. For example, Berkshire began by purchasing insurance businesses that delivered an',
  'underwriting profit. Even more important, float grew over time.'];
const note7=check(sameBlock,0,0,{continuation:'same-block'});
// `check` creates one block per line; emulate MinerU's actual single
// paragraph block by binding the continuation to its parent BlockID.
const sameRows=note7.md.map((row,i)=>i===3?{...row,block_id:note7.md[2].block_id}:row);
const idx7=projectNoteMatchIndex(sameRows,[],{continuation:'same-block'});
assert.equal(idx7.bodies.find(x=>x.number==='7').body_line_ids.length,2);
const a7=note7.args;
const plan7=planNotePairConversion({...a7,mdRows:sameRows,
  bodyId:idx7.bodies.find(x=>x.number==='7').candidate_id});
assert.deepEqual(plan7.updates.map(row=>[row.lineNo,row.afterText]),[
  [1,'See[^7]'],[3,'[^7]: For example, Berkshire began by purchasing insurance businesses that delivered an'],
  [4,'    underwriting profit. Even more important, float grew over time.'],
]);
assert.equal(plan7.continuationLineIds.length,1);
assert.deepEqual(note7.plan.updates.map(row=>row.lineNo),[1,3],
  'Same-block scanner must NOT include an unindented line in a different BlockID');
// With notes-section cross-block continuation, fail closed unless indentation
// is explicit (even though the scanner can find both lines).
assert.throws(()=>check(sameBlock,0,0,{continuation:'notes-section'}),
  /没有明确缩进/);
// Even inside one BlockID a blank line is a paragraph boundary; the next
// unindented line is not automatically swallowed into the same footnote.
const withBlank=['See<sup>7</sup>','## Notes','7. A sentence','',
  'Another paragraph without indentation'];
const base=withBlank.map((text,i)=>({line_no:i+1,line_id:'blank-'+i,
  block_id:i>=2?77:70+i,text}));
const scanned=projectNoteMatchIndex(base,[],{continuation:'same-block'});
const rb=scanned.references[0],bb=scanned.bodies[0];
assert.equal(bb.body_line_ids.length,3);
assert.throws(()=>planNotePairConversion({mdRows:base,referenceId:rb.candidate_id,
  bodyId:bb.candidate_id,review:{decision:'待转换',valid:true,
    body_id:bb.candidate_id,ref_line_id:rb.line_id,ref_block_id:rb.block_id,
    ref_from:rb.from,ref_to:rb.to,ref_raw:rb.raw,ref_source_text:base[0].text,
    body_line_id:bb.line_id,body_block_id:bb.block_id,
    body_from:bb.from,body_to:bb.to,body_raw:bb.raw,
    body_source_text:base[2].text}}),/没有明确缩进/);
console.log('LAB_OCR_NOTE_PAIR_CONVERSION_DIRECT_PASS');
