import assert from 'node:assert/strict';
import {resolvePDFFragmentId} from '../ui/pdf-pbs-fragment-id.js';
// The original MinerU table-body role is NOT a virtual parent-body alias.
assert.equal(resolvePDFFragmentId({bodyChildId:null},{role:'body',path:[0]},'p4b0s0'),'p4b0s0');
assert.equal(resolvePDFFragmentId({bodyChildId:null},{role:'body',path:[2]},'p4b0s2'),'p4b0s2');
// Original OCR body may be renamed only through the native-child origin map.
assert.equal(resolvePDFFragmentId({bodyChildId:null,nativeChildren:{p4b0s0:'p4b2s0'}},
 {role:'body',path:[0]},'p4b0s0'),'p4b2s0');
// A virtual s0 is disambiguated by explicit provenance, not its role string.
assert.equal(resolvePDFFragmentId({bodyChildId:'p1b4s0'},
 {role:'body',virtualBody:true,path:[0]},'p1b4s0'),'p1b4s0');
assert.throws(()=>resolvePDFFragmentId({bodyChildId:null},
 {role:'body',virtualBody:true,path:[0]},'p1b4s0'),/Invalid virtual/);
assert.equal(resolvePDFFragmentId({bodyChildId:null},
 {role:'caption'},'p1b3s1'),'p1b3s1');
console.log('PDF_NATIVE_BODY_VS_VIRTUAL_S0_PASS');
