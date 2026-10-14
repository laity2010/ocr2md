import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const check=resolve('ui-spikes/v4-directory/scripts/check-plugin-boundaries.mjs');
function project(files){
 const root=mkdtempSync(join(tmpdir(),'v4-plugin-boundary-'));
 for(const [path,content] of Object.entries(files)){
  const file=join(root,path);mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,content);
 }
 return root;
}
function testCheck(files){
 const root=project(files);
 try{return spawnSync(process.execPath,[check],{cwd:process.cwd(),env:{...process.env,V4_PLUGIN_ROOT:root},encoding:'utf8',timeout:45000})}
 finally{rmSync(root,{recursive:true,force:true})}
}
test('independent media scanner stays inside plugin directory',()=>{
 const result=testCheck({'media/index.js':"import {scan} from './scan.js';export const media=scan;",'media/scan.js':'export const scan=()=>[];'});
 assert.equal(result.status,0,result.stderr);
});
test('cross-plugin import rejected',()=>{
 const result=testCheck({'media/index.js':"import '../workspace/workspace.js';",'workspace/workspace.js':'export const view=1;'});
 assert.equal(result.status,1);assert.match(result.stderr,/cross-plugin import/);
});
test('shell source is not a plugin dependency',()=>{
 const result=testCheck({'media/index.js':"import '../../../app.js';"});
 assert.equal(result.status,1);assert.match(result.stderr,/non-contract external dependency/);
});
test('a media UI cannot directly import filesystem internals',()=>{
 const result=testCheck({'media/index.js':"import '../filesystem/workspace-fs.js';",'filesystem/workspace-fs.js':'export const secret=1;'});
 assert.equal(result.status,1);assert.match(result.stderr,/cross-plugin import/);
});
