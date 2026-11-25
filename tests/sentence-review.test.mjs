import test from 'node:test';
import assert from 'node:assert/strict';
import {logicalRows,logicalColumns,validatePDFMap} from '../ui/sentence/review.js';
const block=Object.freeze({logicalId:1,baseBlockId:2,parentId:null,logicalOrder:1,p:0,b:0,s:0,blockType:'text',text:'A.\\n\\n'});
const snapshot=Object.freeze({blocks:Object.freeze([block])});
test('logical table projection is exact and read-only',()=>{
 const rows=logicalRows(snapshot);assert.equal(rows[0].md_block,block.text);assert.equal(rows[0].pbs,'p0b0s0');assert.equal(rows[0].logical_id,1);
 const columns=logicalColumns(rows);assert.deepEqual(columns.slice(0,3).map(c=>c.field),['pbs','block_type','md_block']);assert(columns.every(c=>c.editable===false&&c.suppressHeaderFilterButton===false));assert.equal(columns[0].pinned,'left');assert.equal(columns[1].sortable,false);
});
test('PDF projection identity is rejected when stale',()=>{
 const map={logicalCount:1,covers:[{logicalId:1,baseBlockId:2,logicalOrder:1,pbs:'p0b0s0'}],unmappedLogicalIds:[]};
 assert.equal(validatePDFMap(snapshot,map),map);assert.throws(()=>validatePDFMap(snapshot,{...map,covers:[{...map.covers[0],pbs:'p0b2s0'}]}));assert.throws(()=>validatePDFMap(snapshot,{...map,unmappedLogicalIds:[1]}));
});
