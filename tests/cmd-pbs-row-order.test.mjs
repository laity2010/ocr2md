import assert from 'node:assert/strict';
import {compareCMDPBSIds,sortCMDPBSRows} from '../ui/cmd-pbs-row-order.js';
const scrambled=['p4b1s1','p4b1','p4b0s2','p4b0s0','p4b0','p4b0s1','p4b1s0','p4b1s2','p10b2','p2b10','p2b2','p4b0s1.10','p4b0s1.2'];
const rows=scrambled.map((id,i)=>({id,sourceLine:200+i,origin:'immutable'}));
const sorted=sortCMDPBSRows(rows);
assert.deepEqual(sorted.map(row=>row.id),[
  'p2b2','p2b10','p4b0','p4b0s0','p4b0s1','p4b0s1.2','p4b0s1.10','p4b0s2',
  'p4b1','p4b1s0','p4b1s1','p4b1s2','p10b2']);
assert.deepEqual(rows.map(row=>row.id),scrambled,'view sorting must leave original source order intact');
assert.equal(sorted.find(row=>row.id==='p4b0s1').sourceLine,205,'source location stays attached to its label');
assert(compareCMDPBSIds('p4b0s1','p4b0s2')<0);
assert(compareCMDPBSIds('p4b0','p4b0s0')<0);
console.log('CMD_PBS_AG_NUMBER_ORDER_PASS');
