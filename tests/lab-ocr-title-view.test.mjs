/** Title AG is a read-only view of the complete resident Markdown, not SQL. */
import assert from 'node:assert/strict';
import {projectTitleMdRows,titleSourceParts} from '../ui/lab-ocr/title-view.js';
const blocks=[
  {block_id:11,block_type:'title',pbs:'p1b0',global_page:0,level:2,content_preview:'Original A'},
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
const old=structuredClone(lines);
const titleRows=projectTitleMdRows(lines,blocks);
assert.deepEqual(titleRows.map(r=>r.line_id),['a','b','d']);
assert.deepEqual(titleRows.map(r=>r.line_no),[1,2,4],
  'Do not renumber or discard source evidence, even blank MD lines');
assert.deepEqual(titleRows.map(r=>r.level),[2,2,3]);
assert.deepEqual(titleRows.map(r=>r.pbs),['p1b0','p1b0','p5b0'],
  'Title view covers all document pages, not only the current PDF page');
assert.deepEqual(titleSourceParts('### Heading B'),
  {level:3,marker:'###',remainder:' Heading B'});
assert.deepEqual(titleSourceParts('####### Not a heading'),
  {level:null,marker:'',remainder:'####### Not a heading'});
assert.deepEqual(titleSourceParts('Plain MinerU title'),
  {level:null,marker:'',remainder:'Plain MinerU title'},
  'Never fabricate Markdown syntax from the MinerU Level field');
assert.deepEqual(lines,old,'Title selection cannot change MD StateField rows');
console.log('LAB_OCR_TITLE_VIEW_PASS');
