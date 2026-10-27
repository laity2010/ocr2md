import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {labProfile,labVitePlugin} from '../scripts/v6_lab_profile.mjs';

test('production profile is unchanged and lab routes core assets only to scoped endpoints',()=>{
 const fake=mkdtempSync(join(tmpdir(),'v6-lab-contract-'));
 try{
  const dir=join(fake,'labs','check');mkdirSync(join(dir,'modules'),{recursive:true});
  const override=join(dir,'modules','latex-module.js');writeFileSync(override,"export const unique='lab';\n");
  writeFileSync(join(dir,'lab.json'),JSON.stringify({modules:{latex:'./modules/latex-module.js'}}));
  assert.equal(labProfile(fake,''),null);
  assert.throws(()=>labProfile(fake,'../escape'),/Invalid V6_LAB_ID/);
  const profile=labProfile(fake,'check');const plugin=labVitePlugin(fake,profile);
  assert.equal(plugin.resolveId('./latex-module.js',join(fake,'ui','workspace.js')),override);
  assert.equal(plugin.resolveId('./latex-module.js',join(fake,'labs','check','modules','whatever.js')),undefined);
  assert.equal(plugin.resolveId('./media-module.js',join(fake,'ui','workspace.js')),undefined);
  // Source rewriting is forbidden; Lab differences only route named imports.
  assert.equal(plugin.transform,undefined);
  assert.equal(plugin.resolveId('./latex-module.js',join(fake,'ui','main.js')),override);
  writeFileSync(join(dir,'lab.json'),JSON.stringify({modules:{latex:'../ui/latex-module.js'}}));
  assert.throws(()=>labProfile(fake,'check'),/Lab modules must be local/);
 }finally{rmSync(fake,{recursive:true});}
});
