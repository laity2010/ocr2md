import assert from 'node:assert/strict';
import {filterLogicalAG} from '../ui/v2-logical-ag-filter.js';

const rows=[
  {logical_id:1,p:0,b:0,s:0},
  {logical_id:2,p:0,b:2,s:0},
  {logical_id:3,p:1,b:0,s:0},
  {logical_id:4,p:1,b:3,s:1},
  {logical_id:5,p:3,b:0,s:0},
];
assert.deepEqual(filterLogicalAG(rows,3),{p:1,rows:rows.slice(2,4)});
assert.deepEqual(filterLogicalAG(rows,5),{p:3,rows:rows.slice(4)});
assert.deepEqual(filterLogicalAG(rows,4,true),{p:1,rows});
assert.deepEqual(filterLogicalAG(rows,null),{p:0,rows:rows.slice(0,2)});
assert.deepEqual(filterLogicalAG([],null),{p:null,rows:[]});
assert.throws(()=>filterLogicalAG(null,3),/尚未加载/);
console.log('V2_LOGICAL_AG_P_FILTER_PASS');
