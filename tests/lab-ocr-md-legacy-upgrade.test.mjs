/** Migration is opt-in and only exact untouched OCR projections are eligible. */
import assert from 'node:assert/strict';
import {planLegacyMdUpgrade} from '../ui/lab-ocr/md-legacy-upgrade.js';
import {createMdRuntime,migratedMdRuntime,editedMdRuntime,mdSplice} from '../ui/lab-ocr/md-runtime.js';
const image='https://cdn-mineru.openxlab.org.cn/result/math.jpg';
const bs=[
  {block_id:100,parent_block_id:null,block_type:'text',pbs:'p6b5',
   block_json:JSON.stringify({type:'text',lines:[{spans:[{content:'We can compute leverage:'}]}]})},
  {block_id:101,parent_block_id:100,block_type:'interline_equation',pbs:'p6b5s0',
   block_json:JSON.stringify({type:'interline_equation',lines:[{spans:[{
     type:'interline_equation',content:'E = mc^2',image_path:image}]}]})},
  {block_id:102,parent_block_id:100,block_type:'text',pbs:'p6b5s1',
   block_json:JSON.stringify({type:'text',lines:[{spans:[{content:'where E is energy.'}]}]})},
  {block_id:103,parent_block_id:null,block_type:'text',pbs:'p6b6',
   block_json:JSON.stringify({type:'text',lines:[{spans:[{content:'Next parent.'}]}]})},
];
const items=[
  [100,'We can compute leverage:'],[100,''],
  [101,'```math'],[101,`![image](<${image}>)`],[101,'```'],[101,''],
  [102,'where E is energy.'],[102,''],
  [103,'Next parent.'],[103,''],
];
const rows=items.map(([block_id,text],i)=>({line_id:'old-'+i,block_id,text,line_no:i+1}));
const seal=structuredClone(rows),reference=structuredClone(bs);
let ids=0;
const plan=planLegacyMdUpgrade(rows,bs,()=>`new-${++ids}`);
assert.equal(plan.changed,true);
assert.deepEqual({formulas:plan.formulas,separators:plan.separators,skipped:plan.skipped},
  {formulas:1,separators:2,skipped:0});
assert.equal(plan.after,`We can compute leverage:\n$$\nE = mc^2\n$$\n[原始公式图](<${image}>)\nwhere E is energy.\n\nNext parent.\n`);
assert.equal(plan.rows.find(r=>r.text==='E = mc^2')?.block_id,101);
assert.equal(plan.rows.find(r=>r.text==='[原始公式图](<'+image+'>)')?.block_id,101);
assert.equal(plan.rows.find(r=>r.text==='where E is energy.')?.line_id,'old-6');
assert.equal(plan.rows.find(r=>r.text==='Next parent.')?.line_id,'old-8');
assert.equal(plan.rows.find(r=>r.text==='')?.block_id,102,
 'The blank between parent groups is retained and owned by the preceding block');
assert.deepEqual(rows,seal);assert.deepEqual(bs,reference,'Source/Block objects unchanged');
const state=createMdRuntime(rows,3);
const upgraded=migratedMdRuntime(state,plan.rows);
assert.equal(upgraded.dirty,true);
assert.equal(upgraded.revision,3);
const reverted=editedMdRuntime(upgraded,plan.before,()=>`fake-${++ids}`);
assert.deepEqual(reverted.rows,rows,'CM6 undo restores exact LineIDs/BlockIDs');
assert.equal(reverted.dirty,false);
const repeated=editedMdRuntime(reverted,plan.after,()=>`fake-${++ids}`);
assert.deepEqual(repeated.rows,plan.rows,'CM6 redo returns exact migrated line identifiers');
assert.equal(repeated.dirty,true);
assert.equal(Boolean(mdSplice(repeated.rows,plan.rows)),false);
// A manual formula correction must be preserved; no blind replacement.
const edited=rows.map(r=>r.line_id==='old-3'?{...r,text:'manual TeX correction'}:r);
const safe=planLegacyMdUpgrade(edited,bs,()=>`safe-${++ids}`);
assert.equal(safe.formulas,0);
assert.equal(safe.skipped,1);
assert(safe.after.includes('manual TeX correction'));
assert(safe.after.includes('```math'));
assert.equal(safe.separators,1,'Only known canonical separators may be removed');
// Even if a blank belongs to an original OCR block, never remove arbitrary
// additional empty lines or content that is no longer the old projection.
const double=rows.flatMap(r=>r.line_id==='old-1'?[r,{...r,line_id:'extra-blank',line_no:0}]:[r])
  .map((r,i)=>({...r,line_no:i+1}));
const safeguarded=planLegacyMdUpgrade(double,bs,()=>`safe2-${++ids}`);
assert(safeguarded.rows.some(r=>r.line_id==='extra-blank'));
assert.equal(safeguarded.separators,1);
assert.deepEqual(planLegacyMdUpgrade(plan.rows,bs,()=>`newer-${++ids}`).rows,plan.rows,
 'Migration is idempotent');
console.log('LAB_OCR_MD_LEGACY_UPGRADE_PASS');
