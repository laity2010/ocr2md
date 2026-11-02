/** CMD labels are the single model for CM6 gutter + PDF original/child chips. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectCMDSourceBlockLabels} from '../ui/cmd-block-labels.js';
import {sourceBlockScopes} from '../ui/pdf-source-locations.js';
import {planCMDSubblockAnnotations} from '../ui/cmd-text-blocks.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const original=projectCMDSourceBlockLabels(source);
assert.equal(original.length,224);
assert.equal(original.filter(x=>x.kind==='parent').length,224);
assert.equal(original.filter(x=>x.kind==='child').length,0);
assert.deepEqual(original.map(x=>x.sourceLine),sourceBlockScopes(source).map(x=>x.sourceLine));
const byId=(items,id)=>items.find(x=>x.id===id);
assert.equal(byId(original,'p4b0').sourceKind,'structure');
assert.equal(byId(original,'p13b0').sourceKind,'content');
assert.equal(byId(original,'p4b0').label,'p4b0');
assert.equal(byId(original,'p4b0').elementId,'mineru:4:0:parent');
const plan=await planCMDSubblockAnnotations(source);
const annotated=[...plan.edits].sort((a,b)=>b.from-a.from)
  .reduce((s,edit)=>s.slice(0,edit.from)+edit.insert+s.slice(edit.to),source);
const marked=projectCMDSourceBlockLabels(annotated);
assert.equal(marked.filter(x=>x.kind==='parent').length,224);
assert.equal(marked.filter(x=>x.kind==='child').length,43);
assert.equal(byId(marked,'p4b0s0').label,'p4b0s0');
assert.equal(byId(marked,'p4b0s0').sourceKind,'structure');
assert.equal(byId(marked,'p3b0s0').sourceKind,'content');
assert.equal(byId(marked,'p3b0s1').elementId,'mineru:3:0:1');
assert.equal(byId(marked,'p3b0').sourceKind,'structure',
  'a parent never steals text from its first child');
assert.equal(byId(marked,'p3b0s0').sourceLine,sourceBlockScopes(annotated)
  .find(x=>x.kind==='child'&&x.pageIndex===3&&x.blockIndex===0&&x.path[0]===0).sourceLine);
const token='<!-- minerujson:block:v1:2:8 -->';
assert.equal(source.split(token).length,2);
const joined=source.replace(token,'<!-- ocr2md:block-join:v1 prev="p2b7" target="p2b8" -->\n'+token);
const after=projectCMDSourceBlockLabels(joined);
assert.equal(byId(after,'p2b8').label,'p2b7','joined original label displays parent logical ID');
assert.equal(byId(after,'p2b9').label,'p2b8','following parent renumbers only on same page');
assert.equal(byId(after,'p3b0').label,'p3b0','other page numbering remains stable');
assert.equal(byId(after,'p2b8').id,'p2b8','original source identity must never be renumbered');
assert.equal(source.includes('ocr2md:block-join'),false,'test fixture remains unmodified');
console.log('CMD_SOURCE_BLOCK_LABELS_PASS', {parents:224,children:43,empty:'p4b0s0',logical:'p2b8→p2b7'});
