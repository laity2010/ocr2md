import assert from 'node:assert/strict';
import {indexBlockParents,blockHighlight} from '../ui/lab-ocr/pbs-family.js';
const boxes=[
 {blockId:100,pbs:'p1b0',parentBlockId:null},
 {blockId:101,pbs:'p1b0s0',parentBlockId:100},
 {blockId:102,pbs:'p1b0s1',parentBlockId:100},
 {blockId:103,pbs:'p1b0s1s0',parentBlockId:102},
 {blockId:200,pbs:'p1b1',parentBlockId:null},
 {blockId:201,pbs:'p1b1s0',parentBlockId:200},
 {blockId:300,pbs:'p1b02',parentBlockId:300}, // malformed self-reference: no loop
 {blockId:301,pbs:'p1b03',parentBlockId:302}, // malformed cycle: no loop
 {blockId:302,pbs:'p1b04',parentBlockId:301},
];
const parents=indexBlockParents(new Map(),boxes);
const result=(ids,selected)=>blockHighlight(ids,selected,parents);
assert.equal(result(['100'],100),'direct');
assert.equal(result(['101'],100),'family');
assert.equal(result(['102'],100),'family');
assert.equal(result(['103'],100),'family');
assert.equal(result(['103'],102),'family');
assert.equal(result(['100'],101),'none','Child selection does not light parent');
assert.equal(result(['102'],101),'none','Child selection does not light sibling');
assert.equal(result(['201'],100),'none','Unrelated family stays off');
assert.equal(result(['101'],101),'direct','Direct selection outranks family');
assert.equal(result(['10','100'],100),'direct','Alias IDs must remain addressable');
assert.equal(result(['10','101'],100),'family','Alias child is included');
assert.equal(result(['300'],100),'none');
assert.equal(result(['301'],100),'none','Malformed cycle cannot hang');
assert.equal(result(['100'],null),'none');
// Source Block IDs and parent links must survive PBS renames.
indexBlockParents(parents,[{blockId:101,pbs:'p42b109s999',parentBlockId:100}]);
assert.equal(result(['101'],'100'),'family');
console.log('LAB_OCR_PBS_FAMILY_PASS',JSON.stringify({rows:parents.size,grandchild:true,alias:true,cycleGuard:true}));
