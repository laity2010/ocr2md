import assert from 'node:assert/strict';
import {projectNoteMatchRows,resolveNoteMatchFocus,
  compareNoteNumbers,findMissingNoteNumbers} from '../ui/lab-ocr/note-match-view.js';
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
// Numeric rather than lexical labels, then alphabetic and symbolic styles.
assert.equal(compareNoteNumbers('2','10')<0,true);
assert.equal(compareNoteNumbers('10','2')>0,true);
assert.equal(compareNoteNumbers('2','02'),0);
assert.equal(compareNoteNumbers('10','a')<0,true);
assert.equal(compareNoteNumbers('a','b')<0,true);
assert.equal(compareNoteNumbers('*','†')<0,true);
assert.equal(compareNoteNumbers('†','‡')<0,true);

// Unlike source order, the group starts at number 1 even when a later
// source line was recognized first. 3..9 are suggested missing numbers.
const numeric=['Early in the book<sup>10</sup> and <sup>2</sup> and <sup>1</sup>.',
  '## Notes','1. First','2. Second','10. Tenth'];
const numericMd=numeric.map((text,i)=>({line_no:i+1,line_id:`sort-${i}`,
  block_id:200+i,text}));
const numericBlocks=numeric.map((_,i)=>({block_id:200+i,pbs:`p${i+1}b0`,
  block_type:'text',block_group:'para_blocks'}));
const sorted=projectNoteMatchRows(numericMd,numericBlocks);
assert.deepEqual([...new Set(sorted.rows.map(r=>r.number))],
  ['1','2','3','4','5','6','7','8','9','10']);
assert.deepEqual(sorted.missing_note_numbers.map(x=>x.number),
  ['3','4','5','6','7','8','9']);
assert.deepEqual(sorted.rows.filter(r=>r.status==='疑似缺号').map(r=>r.number),
  ['3','4','5','6','7','8','9']);
for(const gap of sorted.rows.filter(r=>r.status==='疑似缺号')){
  assert.equal(gap.kind,'缺号');
  assert.equal(gap.line_id,null);assert.equal(gap.block_id,null);
  assert.equal(gap.line_no,null);assert.equal(gap.pbs,'');
  assert.equal(resolveNoteMatchFocus(gap,numericMd,numericBlocks),null);
  assert(gap.reason.includes('请检查 OCR'));
}
assert.equal(sorted.rows[0].kind,'注引');
assert.equal(sorted.rows[1].kind,'注文');
assert.equal(sorted.rows.at(-1).number,'10');
assert.equal(findMissingNoteNumbers(sorted.index).length,7);

// In chapter scope, restarting numbering must not create a global gap.
const chapterSource=['# Chapter A','A<sup>1</sup> and <sup>3</sup>',
  '## Notes','1. A-one','3. A-three',
  '# Chapter B','B<sup>1</sup> and <sup>2</sup>',
  '## Notes','1. B-one','2. B-two'];
const chapterMd=chapterSource.map((text,i)=>({line_no:i+1,line_id:`chapter-${i}`,
  block_id:300+i,text}));
const chapters=projectNoteMatchRows(chapterMd,[],{scope:'chapter',chapterLevel:1});
assert.deepEqual(chapters.missing_note_numbers.map(x=>x.number),['2']);
assert.equal(chapters.missing_note_numbers[0].scope,'chapter:chapter-0');
assert.equal(chapters.rows.filter(x=>x.status==='疑似缺号').length,1);
assert.equal(projectNoteMatchRows(chapterMd,[],{scope:'book'}).missing_note_numbers.length,0);
assert.deepEqual(projectNoteMatchRows([{line_no:1,line_id:'a',text:'Seen<sup>5</sup>'}],[])
  .missing_note_numbers,[],'Without an earlier known number, do not invent leading gaps');
console.log('LAB_OCR_NOTE_MATCH_VIEW_DIRECT_PASS');
