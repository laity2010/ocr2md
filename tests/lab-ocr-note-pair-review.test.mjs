import assert from 'node:assert/strict';
import {projectNoteMatchRows} from '../ui/lab-ocr/note-match-view.js';
import {projectReviewedNoteRows,NOTE_REVIEW_DECISIONS} from '../ui/lab-ocr/note-pair-review.js';
const texts=['A<sup>1</sup> and repeated <sup>1</sup>.',
  '## Notes','1. This is a body'];
const md=texts.map((text,i)=>({line_no:i+1,line_id:'id'+i,block_id:i+30,text}));
const blocks=md.map((x,i)=>({block_id:x.block_id,pbs:'p1b'+i,
  block_type:'text',block_group:'para_blocks'}));
const original=JSON.stringify(md);
const projection=projectNoteMatchRows(md,blocks);
const references=projection.index.references;
const body=projection.index.bodies[0];
assert.equal(references.length,2);
assert.deepEqual(NOTE_REVIEW_DECISIONS,['待定','待转换','忽略']);
const fresh=projectReviewedNoteRows(projection,new Map(),md);
assert(fresh.every(row=>row.review==='待定'));
const ignored={ref_id:references[0].candidate_id,decision:'忽略',
  revision:'r1',valid:true,ref_line_id:references[0].line_id,
  ref_block_id:references[0].block_id,ref_from:references[0].from,
  ref_to:references[0].to,ref_raw:references[0].raw,
  ref_source_text:md[0].text};
const notes=new Map([[ignored.ref_id,ignored]]);
const hidden=projectReviewedNoteRows(projection,notes,md);
assert.equal(hidden.length,2,'One ignored citation hides only its two paired rows');
const shown=projectReviewedNoteRows(projection,notes,md,{showIgnored:true});
assert.equal(shown.length,4);
assert.equal(shown.filter(x=>x.review==='忽略').length,2);
assert.equal(shown.find(x=>x.reference_id===ignored.ref_id).status,'已忽略');
const confirmed={...ignored,ref_id:references[1].candidate_id,
  decision:'待转换',ref_line_id:references[1].line_id,
  ref_from:references[1].from,ref_to:references[1].to,ref_raw:references[1].raw,
  body_id:body.candidate_id,body_line_id:body.line_id,body_block_id:body.block_id,
  body_from:body.from,body_to:body.to,body_raw:body.raw,body_source_text:md[2].text};
notes.set(confirmed.ref_id,confirmed);
const reviewed=projectReviewedNoteRows(projection,notes,md,{showIgnored:true});
assert.equal(reviewed.filter(x=>x.review==='待转换').length,2);
assert.equal(reviewed.find(x=>x.reference_id===confirmed.ref_id).status,'已确认');
assert.equal(reviewed.find(x=>x.reference_id===confirmed.ref_id).selected_body_id,body.candidate_id);
assert.equal(reviewed.find(x=>x.review==='待转换').review_note,'已人工确定配对，尚未转换 Markdown');
const stale=md.map(r=>r.line_id==='id0'?{...r,text:'B<sup>1</sup> and repeated <sup>1</sup>.'}:r);
assert.equal(projectReviewedNoteRows(projectNoteMatchRows(stale,blocks),notes,stale,{showIgnored:true})
  .filter(x=>x.review==='需复核').length,4,'Any change to source invalidates both same-line decisions');
const otherBody=md.map(r=>r.line_id==='id2'?{...r,text:'1. Edited body'}:r);
assert.equal(projectReviewedNoteRows(projectNoteMatchRows(otherBody,blocks),notes,otherBody,{showIgnored:true})
  .filter(x=>x.review==='需复核').length,2,'Changing body invalidates only confirmed decision');
// Multiple same-number bodies remain explicit user choices, never choose
// an arbitrary nearest body from the conflict group.
const conflictedMd=[
  {line_no:1,line_id:'r',block_id:51,text:'Ref<sup>1</sup>'},
  {line_no:2,line_id:'h',block_id:52,text:'## Notes'},
  {line_no:3,line_id:'b1',block_id:53,text:'1. First candidate'},
  {line_no:4,line_id:'b2',block_id:54,text:'1. Second candidate'},
];
const ambiguous=projectNoteMatchRows(conflictedMd,[]);
const pairRow=ambiguous.rows.find(x=>x.kind==='注引');
assert.equal(pairRow.body_choices.length,2);
assert.equal(pairRow.status,'编号冲突');
const chosen=ambiguous.index.bodies[1];
const manual=new Map([[pairRow.reference_id,{
  valid:true,decision:'待转换',revision:'r2',ref_line_id:'r',ref_block_id:51,
  ref_from:3,ref_to:15,ref_raw:'<sup>1</sup>',ref_source_text:'Ref<sup>1</sup>',
  body_id:chosen.candidate_id,body_line_id:chosen.line_id,body_block_id:chosen.block_id,
  body_from:chosen.from,body_to:chosen.to,body_raw:chosen.raw,
  body_source_text:conflictedMd[3].text,
}]]);
const resolved=projectReviewedNoteRows(ambiguous,manual,conflictedMd,{showIgnored:true});
assert(resolved.some(x=>x.review==='待转换'&&x.selected_body_id===chosen.candidate_id));
assert.equal(JSON.stringify(md),original);
console.log('LAB_OCR_NOTE_PAIR_REVIEW_PROJECTION_DIRECT_PASS');
