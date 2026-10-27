import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {moduleParityPlugin} from '../scripts/v6_module_parity.mjs';

test('module parity plugin records used, verified source graph and rejects Lab-only code modules',()=>{
 const root=mkdtempSync(join(tmpdir(),'ocr-lab-parity-'));
 try{
  mkdirSync(join(root,'ui'));mkdirSync(join(root,'node_modules','pkg'),{recursive:true});
  writeFileSync(join(root,'ui','main.js'),'console.log("real app")\n');
  writeFileSync(join(root,'node_modules','pkg','index.js'),'export {}\n');
  const plugin=moduleParityPlugin(root,{name:'check'});
  const emitted=[];
  plugin.generateBundle.call({getModuleIds:()=>[join(root,'ui','main.js'),join(root,'node_modules','pkg','index.js')],emitFile:f=>emitted.push(f)});
  assert.equal(emitted[0].fileName,'module-graph.json');
  const graph=JSON.parse(emitted[0].source);
  assert.equal(graph.moduleCount,2);
  assert.deepEqual(graph.modules.map(x=>x[0]),['node_modules/pkg/index.js','ui/main.js']);
  writeFileSync(join(root,'ui','main.js'),'console.log("different")\n');
  const files=[];
  plugin.generateBundle.call({getModuleIds:()=>[join(root,'ui','main.js')],emitFile:f=>files.push(f)});
  assert.notEqual(JSON.parse(files[0].source).moduleGraphSha256,graph.moduleGraphSha256);
  const folder=join(root,'labs','check');mkdirSync(folder,{recursive:true});
  const other=join(folder,'extra.js');writeFileSync(other,'export {}\n');
  assert.throws(()=>plugin.generateBundle.call({getModuleIds:()=>[other],emitFile:()=>{}}),/LAB_MODULE_GRAPH_ESCAPE/);
 }finally{rmSync(root,{recursive:true,force:true})}
});
