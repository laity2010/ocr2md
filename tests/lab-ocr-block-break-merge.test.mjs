import assert from 'node:assert/strict';
import {planBlockBreakMerge,emptyMdChildBlockIds} from '../ui/lab-ocr/block-break-merge.js';
import {projectBlockBreakRows} from '../ui/lab-ocr/block-break-view.js';
const blocks=[
 {block_id:436,pbs:'p16b4',parent_block_id:null,sibling_order:4,block_group:'para_blocks',block_type:'text',absorbed_into_block_id:null},
 {block_id:437,pbs:'p16b4s0',parent_block_id:436,sibling_order:0,block_group:'para_blocks',block_type:'text',absorbed_into_block_id:null},
];
const md=[
 {line_no:310,line_id:'line-a',block_id:436,text:'The insurance float provides a steady'},
 {line_no:311,line_id:'line-b',block_id:437,text:'source of financing that allows him.'},
 {line_no:312,line_id:'line-blank',block_id:437,text:''},
];
const candidate=projectBlockBreakRows(md,blocks)[0];
const snapshot=JSON.stringify([md,blocks]);
const plan=planBlockBreakMerge(candidate,md,blocks);
assert.equal(plan.joinedText,'The insurance float provides a steady source of financing that allows him.');
assert.deepEqual([plan.beforeLineId,plan.afterLineId,plan.beforeBlockId,plan.afterBlockId],
 ['line-a','line-b',436,437]);
const merged=md.map(row=>({...row,text:row.line_id==='line-a'?plan.joinedText:
  row.line_id==='line-b'?'':row.text}));
assert.deepEqual(emptyMdChildBlockIds(merged,blocks),[437]);
assert.deepEqual(emptyMdChildBlockIds(md,blocks),[]);
assert.equal(JSON.stringify([md,blocks]),snapshot,'Pure module must never mutate source');
assert.equal(merged[1].line_id,'line-b');assert.equal(merged[1].block_id,437);
assert.equal(merged[1].text,'');
for(const changed of [
 md.map(r=>r.line_id==='line-b'?{...r,block_id:999}:r),
 md.map(r=>r.line_id==='line-b'?{...r,line_no:315}:r),
 [...md,{line_no:313,line_id:'extra',block_id:437,text:'Second child line'}],
])assert.throws(()=>planBlockBreakMerge(candidate,changed,blocks));
const hyphen=[{...md[0],text:'our stock-selec-'},{...md[1],text:'tion strategy.'},md[2]];
const hc={...candidate,kind:'跨块断词',before_token:'selec-',after_token:'tion'};
assert.equal(planBlockBreakMerge(hc,hyphen,blocks).joinedText,'our stock-selection strategy.');
console.log('LAB_OCR_BLOCK_BREAK_MERGE_PLAN_PASS');
