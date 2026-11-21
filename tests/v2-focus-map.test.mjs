import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {logicalAtOffset,logicalAtSourceLine,logicalForAG,pageForLogical} from '../ui/v2-focus-map.js';
const doc=EditorState.create({doc:'# heading\n\nbody\n\n\n\nlast\n\n'}).doc;
const rows=[
 {logicalId:100,baseBlockId:1,logicalOrder:1,from:0,to:9},
 {logicalId:301,baseBlockId:57,logicalOrder:2,from:11,to:15},
 {logicalId:405,baseBlockId:61,logicalOrder:3,from:17,to:17},
 {logicalId:502,baseBlockId:140,logicalOrder:4,from:19,to:23},
];
assert.equal(logicalAtOffset(rows,0).logicalId,100);
assert.equal(logicalAtOffset(rows,10).logicalId,100,'separator belongs to preceding block');
assert.equal(logicalAtOffset(rows,11).logicalId,301);
assert.equal(logicalAtOffset(rows,17).logicalId,405,'empty block retains identity');
assert.equal(logicalAtOffset(rows,23).logicalId,502);
assert.equal(logicalAtSourceLine(rows,doc,3).logicalId,301);
assert.equal(logicalAtOffset(rows,-1),null);
assert.equal(logicalForAG(rows,'logical_block',{logical_id:301}).baseBlockId,57);
assert.equal(logicalForAG(rows,'mineru_base',{blockid:140}).logicalId,502);
assert.equal(logicalForAG(rows,'mineru_base',{blockid:2}),null);
assert.equal(logicalForAG(rows,'bad',{blockid:2}),null);
assert.equal(pageForLogical(rows[3],'mineru_base'),120);
assert.equal(pageForLogical(rows[3],'logical_block'),0);
assert.equal(pageForLogical({logicalOrder:128,baseBlockId:200},'logical_block'),120);
console.log('V2_FOCUS_MAP_PURE_PASS');
