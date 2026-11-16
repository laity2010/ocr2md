import assert from 'node:assert/strict';
import {textOfRows,validateMdRows,reconcileMdText,mdSplice,createMdRuntime,
  editedMdRuntime,acknowledgeMdRuntime,mdRowAtPosition,mdLineOffset,
  reviewBlockOrder,reorderMdByBlocks} from '../ui/lab-ocr/md-runtime.js';
const rows=[
 {line_id:'a',line_no:1,block_id:10,text:'# Title'},
 {line_id:'b',line_no:2,block_id:10,text:''},
 {line_id:'c',line_no:3,block_id:11,text:'Paragraph'},
 {line_id:'d',line_no:4,block_id:11,text:''},
];
assert.equal(textOfRows(rows),'# Title\n\nParagraph\n');
assert.equal(textOfRows([{line_id:'x',line_no:1,block_id:null,text:'abc'}]),'abc');
assert.equal(textOfRows([{line_id:'x',line_no:1,block_id:null,text:'abc'},
 {line_id:'z',line_no:2,block_id:null,text:''}]),'abc\n');
assert.deepEqual(rows.map(r=>r.line_id),validateMdRows(rows).map(r=>r.line_id));
let number=0;
const makeId=()=> 'new-'+(++number);
let a=reconcileMdText(rows,'# Title\n\nExtra\nParagraph\n',makeId);
assert.deepEqual(a.map(r=>r.line_id),['a','b','new-1','c','d']);
assert.equal(a[2].block_id,10);
assert.equal(textOfRows(a),'# Title\n\nExtra\nParagraph\n');
let splice=mdSplice(rows,a);
assert.deepEqual(splice,{start:3,deleteCount:0,
 insert:[{line_id:'new-1',block_id:10,text:'Extra'}]});
a=reconcileMdText(a,'# Edited\n\nExtra\nParagraph\n',makeId);
assert.equal(a[0].line_id,'a');
assert.equal(a[0].text,'# Edited');
assert.equal(a[2].line_id,'new-1');
assert.equal(mdLineOffset(a,4),a.slice(0,3).reduce((n,r)=>n+r.text.length+1,0));
assert.equal(mdRowAtPosition(textOfRows(a),mdLineOffset(a,4)),4);
let state=createMdRuntime(rows,0);
state=editedMdRuntime(state,'# Changed\n\nParagraph\n',makeId);
assert.equal(state.dirty,true);
const saved=state.rows;
state=editedMdRuntime(state,'# Changed\n\nParagraph more\n',makeId);
state=acknowledgeMdRuntime(state,saved,1);
assert.equal(state.revision,1);
assert.equal(state.dirty,true);
assert.equal(state.savedRows[0].text,'# Changed');
// Native CM6 Undo restores both text and stable SQL line identities after
// the one-item line-gutter Delete action; Redo and another Undo are safe.
const prior=[
 {line_id:'p',line_no:1,block_id:12,text:'Before'},
 {line_id:'q',line_no:2,block_id:13,text:'Deleted middle'},
 {line_id:'r',line_no:3,block_id:14,text:'After'},
];
let deletion=createMdRuntime(prior);
const tombstone={row:{...prior[1]},previousId:'p',followingId:'r'};
deletion=editedMdRuntime(deletion,'Before\nAfter',makeId,{deletedLine:tombstone});
assert.deepEqual(deletion.rows.map(row=>row.line_id),['p','r']);
deletion=editedMdRuntime(deletion,'Before\nDeleted middle\nAfter',makeId);
assert.deepEqual(deletion.rows,prior,'Undo restores original LineID/BlockID');
assert.equal(deletion.dirty,false);
deletion=editedMdRuntime(deletion,'Before\nAfter',makeId);
assert.deepEqual(deletion.rows.map(row=>row.line_id),['p','r']);
deletion=editedMdRuntime(deletion,'Before\nDeleted middle\nAfter',makeId);
assert.deepEqual(deletion.rows,prior,'Repeated Undo uses same LineID');
const blockRows=[
 [10,null,0,'p1b0'],[11,10,0,'p1b0s0'],
 [20,null,1,'p1b1'],[21,20,0,'p1b1s0'],
].map(([block_id,parent_block_id,sibling_order,pbs])=>({
 block_id,parent_block_id,sibling_order,pbs,global_page:0,absorbed_into_block_id:null
}));
assert.deepEqual(reviewBlockOrder(blockRows),[10,11,20,21]);
const moved=blockRows.map(row=>({...row}));
moved[2].absorbed_into_block_id=10;moved[2].parent_block_id=null;
moved[3].parent_block_id=10;moved[3].sibling_order=1;moved[3].pbs='p1b0s1';
assert.deepEqual(reviewBlockOrder(moved),[10,11,21]);
const edited=[
 {line_id:'a',line_no:1,block_id:10,text:'heading'},
 {line_id:'b',line_no:2,block_id:10,text:''},
 {line_id:'c',line_no:3,block_id:20,text:'user corrected wrapper'},
 {line_id:'d',line_no:4,block_id:20,text:''},
 {line_id:'e',line_no:5,block_id:11,text:'child A'},
 {line_id:'f',line_no:6,block_id:21,text:'child B'},
];
const reordered=reorderMdByBlocks(edited,moved);
assert.deepEqual(reordered.map(row=>row.line_id),['a','b','c','e','f']);
assert.equal(reordered[2].block_id,10);
assert.equal(reordered[2].text,'user corrected wrapper');
assert.deepEqual(reordered.map(row=>row.line_no),[1,2,3,4,5]);
console.log('LAB_OCR_MD_RUNTIME_PASS');
