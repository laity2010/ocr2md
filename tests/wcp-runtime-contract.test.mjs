import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {labProfile} from '../scripts/v6_lab_profile.mjs';
import {moduleParityPlugin} from '../scripts/v6_module_parity.mjs';
import {createWCPRuntime} from '../ui/wcp-runtime.js';

test('WCP owns declared, default-inert extension points',()=>{
  const runtime=createWCPRuntime();
  assert(Object.isFrozen(runtime));
  assert.deepEqual(runtime.editorExtensions,[]);
  for(const key of ['wrapCMD','onCMReady','onAGReady','onPreviewInit','renderPreview','onLayoutReady'])
    assert.equal(typeof runtime[key],'function',key);
  assert.equal(runtime.preservePreviewNodes,false);
  assert.equal(runtime.renderPreview('abc',{},v=>v),'abc');
});
test('AG-to-WCP bridge is bounded and cannot expose raw module objects',()=>{
  const source=readFileSync(new URL('../ui/workspace.js',import.meta.url),'utf8');
  const match=/const bridge=Object.freeze\(\{([\s\S]*?)\}\);/.exec(source);
  assert(match,'explicit bounded WCP bridge required');
  assert.match(match[1],/getChapterIndex:/);
  assert.match(match[1],/getStartNumber:/);
  assert.match(match[1],/applyChapterQuery:/);
  assert.doesNotMatch(match[1],/views:|getCMD:|getMarkdown:|api:|view:/);
});
test('Lab and Main share exact business module graph; overrides are forbidden',()=>{
  const root=mkdtempSync(join(tmpdir(),'v6-am-module-mirror-'));
  try{
    const lab=join(root,'labs','audit');mkdirSync(lab,{recursive:true});
    writeFileSync(join(lab,'lab.json'),'{}\n');
    const profile=labProfile(root,'audit');
    assert.equal(profile.base,'/labs/audit/');
    assert(!Object.hasOwn(profile,'replacements'));
    assert.equal(typeof moduleParityPlugin(root,profile).generateBundle,'function');
    writeFileSync(join(lab,'lab.json'),JSON.stringify({modules:{media:'./modules/fake.js'}}));
    assert.throws(()=>labProfile(root,'audit'),/LAB_MODULE_OVERRIDE_FORBIDDEN/);
    const runtimeModule=readFileSync(new URL('../scripts/v6_lab_profile.mjs',import.meta.url),'utf8');
    assert.doesNotMatch(runtimeModule,/resolveId\(|transform\(code|code\.replace|replaceOnce\(/);
    const main=readFileSync(new URL('../ui/main.js',import.meta.url),'utf8');
    assert.match(main,/import \{createWCPRuntime\} from '\.\/wcp-wcp-virtual-chapters\.js'/);
    const source=readFileSync(new URL('../ui/workspace.js',import.meta.url),'utf8');
    assert.match(source,/onLayoutReady\?\.\(layoutPort\)/);
    assert.match(source,/if\(wcpRuntime\?\.preservePreviewNodes\)/);
    assert.doesNotMatch(source,/patchLabMarkdown\(/);
  }finally{rmSync(root,{recursive:true,force:true})}
});

test('WCP chapter query has no Grid mutation capability',()=>{
  const file=readFileSync(new URL('../ui/wcp-ag-query.js',import.meta.url),'utf8');
  assert.match(file,/applyChapterQuery\(/);
  assert.doesNotMatch(file,/\.api\b|setGridOption\(|getGridOption\(|onFilterChanged\(/);
});

test('Chapter, Media and LaTeX AGs own their public semantic query implementations',()=>{
  for(const name of ['outline-grid.js','media-module.js','latex-module.js']){
    const source=readFileSync(new URL('../ui/'+name,import.meta.url),'utf8');
    assert.match(source,/createVirtualAGQuery\(/,name);
    if(name==='media-module.js'||name==='latex-module.js'){
      assert.match(source,/setVirtualQuery\(intent\)/,'AG must accept operation-scope intent');
      assert.match(source,/virtualQuery\.setVirtualQuery\(intent\)/,'AG must delegate Grid query to its owner');
      assert.match(source,/operationScope/,'AG must retain WCP operation scope');
    }else assert.match(source,/setVirtualQuery:virtualQuery\.setVirtualQuery/,name);
  }
});
