import assert from 'node:assert/strict';
import {projectMdAgRows,mdLineKind} from '../ui/lab-ocr/md-ag-projection.js';
import {pbsPageKey} from '../ui/lab-ocr/pbs-page-filter.js';
const original=[
 {line_id:'a',line_no:1,block_id:1,text:'## Title'},
 {line_id:'b',line_no:2,block_id:1,text:''},
 {line_id:'c',line_no:3,block_id:2,text:'Body'},
 {line_id:'d',line_no:4,block_id:null,text:'   '},
];
const blocks=[{block_id:1,pbs:'p1b0'}, {block_id:2,pbs:'p3b5s1'}];
const projected=projectMdAgRows(original,blocks);
assert.deepEqual(projected.map(r=>r.pbs),['p1b0','p1b0','p3b5s1','']);
assert.deepEqual(projected.map(r=>r.line_no),[1,2,3,4]);
assert.deepEqual(projected.map(r=>mdLineKind(r.text)),['非空行','空行','非空行','空行']);
assert.deepEqual(projected.map(r=>pbsPageKey(r.pbs)),['p1','p1','p3','']);
assert.equal(original[0].pbs,undefined,'PBS must never be written to MD rows');
const renamed=projectMdAgRows(original,[{block_id:1,pbs:'p4b1'},blocks[1]]);
assert.equal(renamed[0].pbs,'p4b1');
assert.equal(renamed[0].line_id,'a');
assert.equal(original[0].text,'## Title');
console.log('LAB_OCR_MD_AG_PROJECTION_PASS');
