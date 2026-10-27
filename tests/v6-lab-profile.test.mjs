import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {labProfile} from '../scripts/v6_lab_profile.mjs';

test('Lab profile changes only environment identity and rejects business module replacement',()=>{
 const fake=mkdtempSync(join(tmpdir(),'v6-lab-mirror-'));
 try{
  const dir=join(fake,'labs','check');mkdirSync(join(dir,'modules'),{recursive:true});
  assert.equal(labProfile(fake,''),null);
  assert.throws(()=>labProfile(fake,'../escape'),/Invalid V6_LAB_ID/);
  writeFileSync(join(dir,'lab.json'),'{}\n');
  const lab=labProfile(fake,'check');
  assert.equal(lab.base,'/labs/check/');
  assert.equal(lab.name,'check');
  assert.equal(Object.hasOwn(lab,'replacements'),false);
  writeFileSync(join(dir,'lab.json'),JSON.stringify({modules:{}}));
  assert.equal(labProfile(fake,'check').base,'/labs/check/');
  writeFileSync(join(dir,'lab.json'),JSON.stringify({modules:{latex:'./modules/latex-module.js'}}));
  assert.throws(()=>labProfile(fake,'check'),/LAB_MODULE_OVERRIDE_FORBIDDEN/);
  writeFileSync(join(dir,'lab.json'),JSON.stringify({apiReplacement:true}));
  assert.throws(()=>labProfile(fake,'check'),/Lab config/);
 }finally{rmSync(fake,{recursive:true});}
});
