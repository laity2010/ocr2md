import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
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
test('Lab source substitution is restricted to named Vite imports',()=>{
  const plugin=readFileSync(new URL('../scripts/v6_lab_profile.mjs',import.meta.url),'utf8');
  assert.match(plugin,/resolveId\(source,importer\)/);
  assert.doesNotMatch(plugin,/transform\(code,id\)|code\.replace|code=code\.replace|replaceOnce\(/ );
  const source=readFileSync(new URL('../ui/workspace.js',import.meta.url),'utf8');
  assert.match(source,/onLayoutReady\?\.\(layoutPort\)/);
  assert.match(source,/if\(wcpRuntime\?\.preservePreviewNodes\)/);
  assert.doesNotMatch(source,/patchLabMarkdown\(/);
});

test('WCP chapter query has no Grid mutation capability',()=>{
  const file=readFileSync(new URL('../labs/cm-html/wp0-2/ag-query.js',import.meta.url),'utf8');
  assert.match(file,/applyChapterQuery\(/);
  assert.doesNotMatch(file,/\.api\b|setGridOption\(|getGridOption\(|onFilterChanged\(/);
});

test('Chapter, Media and LaTeX AGs own their public semantic query implementations',()=>{
  for(const name of ['outline-grid.js','media-module.js','latex-module.js']){
    const source=readFileSync(new URL('../ui/'+name,import.meta.url),'utf8');
    assert.match(source,/createVirtualAGQuery\(/,name);
    assert.match(source,/setVirtualQuery:virtualQuery\.setVirtualQuery/,name);
  }
});
