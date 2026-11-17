import assert from 'node:assert/strict';
import {projectNoteMatchRows,resolveNoteMatchFocus} from '../ui/lab-ocr/note-match-view.js';
const source=['We saw<sup>1</sup> and repeated[^1] and <sup>2</sup>.',
  '## Notes','1. First note','2. Second note','3. Orphan'];
const md=source.map((text,i)=>({line_no:i+1,line_id:'l'+i,block_id:100+i,text}));
const blocks=md.map((r,i)=>({block_id:r.block_id,pbs:'p1b'+i,global_page:0,
  block_type:'text',block_group:'para_blocks'}));
const snap=JSON.stringify({md,blocks});
const {rows,index}=projectNoteMatchRows(md,blocks);
assert.equal(index.stats.references,3);
assert.equal(rows.length,7); // 3 pairs × (ref+body) + orphan
assert.deepEqual(rows.map(row=>row.kind),['注引','注文','注引','注文','注引','注文','注文']);
assert.equal(rows[0].number,'1');assert.equal(rows[2].number,'1');
assert.equal(rows[1].line_id,rows[3].line_id,'Repeated references share a body');
assert.notEqual(rows[1].note_row_id,rows[3].note_row_id,'AG row ID must remain unique');
assert.equal(rows.at(-1).status,'缺注引');
const ref=resolveNoteMatchFocus(rows[0],md,blocks);
const body=resolveNoteMatchFocus(rows[1],md,blocks);
assert.deepEqual([ref.lineNo,ref.blockId,ref.page,ref.from], [1,100,1,6]);
assert.deepEqual([body.lineNo,body.blockId,body.page,body.from], [3,102,1,0]);
assert.equal(resolveNoteMatchFocus({...rows[0],raw:'edited'},md,blocks),null);
assert.equal(resolveNoteMatchFocus({...rows[0],block_id:999},md,blocks),null);
const missing=projectNoteMatchRows([...md.slice(0,3),md[4]].map((r,i)=>({...r,line_no:i+1})),blocks);
assert(missing.rows.some(row=>row.kind==='注文'&&row.status==='缺注文'&&row.line_id===null));
assert.equal(resolveNoteMatchFocus(missing.rows.find(row=>row.line_id===null),md,blocks),null);
assert.equal(JSON.stringify({md,blocks}),snap);
console.log('LAB_OCR_NOTE_MATCH_VIEW_DIRECT_PASS');
