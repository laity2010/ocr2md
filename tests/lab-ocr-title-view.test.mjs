/** Dynamic outline is derived from the *current* CM6 Markdown source. */
import assert from 'node:assert/strict';
import {projectLiveMdRows,projectTitleMdRows,titleSourceParts} from '../ui/lab-ocr/title-view.js';
const blocks=[
  {block_id:11,block_type:'title',pbs:'p1b0',global_page:0,level:2,content_preview:'Original OCR title'},
  {block_id:12,block_type:'text',pbs:'p1b1',global_page:0,level:null},
  {block_id:13,block_type:'title',pbs:'p5b0',global_page:4,level:3},
];
const lines=[
  {line_id:'a',line_no:1,block_id:11,text:'## Heading A'},
  {line_id:'b',line_no:2,block_id:11,text:''},
  {line_id:'c',line_no:3,block_id:12,text:'Body'},
  {line_id:'d',line_no:4,block_id:13,text:'### Heading B'},
  {line_id:'e',line_no:5,block_id:null,text:'Unowned note'},
];
const original=structuredClone(lines),ocr=structuredClone(blocks);
const titleRows=projectTitleMdRows(lines,blocks);
assert.deepEqual(titleRows.map(r=>r.line_id),['a','d']);
assert.deepEqual(titleRows.map(r=>r.line_no),[1,4]);
assert.deepEqual(titleRows.map(r=>r.level),[2,3]);
assert.deepEqual(titleRows.map(r=>r.pbs),['p1b0','p5b0'],
  'Outline covers all pages, keeps PBS/LineID stable and excludes blank lines');
const demoted=lines.map(row=>row.line_no===4?{...row,text:'Heading B'}:row);
assert.deepEqual(projectTitleMdRows(demoted,blocks).map(r=>r.line_id),['a'],
  'Removing the hash from original OCR title removes it from outline');
const former=projectLiveMdRows(demoted,blocks)[3];
assert.equal(former.block_type,'text');
assert.equal(former.level,null,'Cancelled title must not retain stale OCR Level 3');
assert.equal(former.pbs,'p5b0');
const rescaled=demoted.map(row=>row.line_no===1?{...row,text:'#### Heading A'}:row);
assert.deepEqual(projectTitleMdRows(rescaled,blocks).map(r=>r.level),[4],
  'Heading level changes immediately with current source # count');
const promoted=rescaled.map(row=>row.line_no===3?{...row,text:'# Body'}:row);
assert.deepEqual(projectTitleMdRows(promoted,blocks).map(r=>[r.line_id,r.level]),
  [['a',4],['c',1]],'Plain OCR text can be promoted to heading by editing source');
assert.equal(projectLiveMdRows(promoted,blocks)[2].block_type,'title');
assert.deepEqual(titleSourceParts('### Heading B'),
  {level:3,marker:'###',remainder:' Heading B'});
assert.deepEqual(titleSourceParts('####### Not a heading'),
  {level:null,marker:'',remainder:'####### Not a heading'});
assert.deepEqual(titleSourceParts('##Not a heading'),
  {level:null,marker:'',remainder:'##Not a heading'});
assert.deepEqual(titleSourceParts('Plain MinerU title'),
  {level:null,marker:'',remainder:'Plain MinerU title'},
  'Never fabricate Markdown syntax from the MinerU Level field');
assert.deepEqual(lines,original,'No write to original resident MD line objects');
assert.deepEqual(blocks,ocr,'No write to immutable OCR Block type and level');
console.log('LAB_OCR_TITLE_VIEW_PASS');
