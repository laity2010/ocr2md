/** A PDF chip's visible PBS number is a current CMD logical identity. Its
 * physical OCR origin may have an entirely different page/block index. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDInsertPBSParentAfter,planCMDAbsorbReviewedParent,planCMDPromotePBSChild,readCMDBlockChains} from '../ui/cmd-block-chains.js';
import {mapCMDVisibleLabelSources,projectCMDSourceBlockLabels} from '../ui/cmd-block-labels.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
const apply=(source,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((doc,edit)=>{
  assert.equal(doc.slice(edit.from,edit.to),edit.expected);
  return doc.slice(0,edit.from)+edit.insert+doc.slice(edit.to);
},source);
export function seededRenumberedSource(){
  let text=original;
  text=apply(text,planCMDInsertPBSParentAfter(text,'p1b5','p1b6'));
  text=apply(text,planCMDAbsorbReviewedParent(text,'p6b7','p6b6'));
  // Use a genuine native OCR child; promoting a previously absorbed
  // independent parent exercises a separate structural operation.
  const promotion=planCMDPromotePBSChild(text,'p3b0s1');
  text=apply(text,promotion);
  return {source:text,promotedId:promotion.newId};
}
const {source,promotedId}=seededRenumberedSource();
const atoms=readCMDBlockChains(source).atoms;
const map=mapCMDVisibleLabelSources(source);
const labels=projectCMDSourceBlockLabels(source);
for(const id of ['p0b0','p1b6','p1b7','p1b8','p6b6s1',promotedId,'p3b0s0']){
  const atom=atoms.find(a=>a.id===id),target=map.get(id);
  assert(atom,`CMD atom ${id} missing`);
  assert(target,`PDF ${id} must resolve to a source anchor`);
  assert.equal(target.sourceLine,atom.sourceLine,`${id} must use current CMD tag line`);
  assert(target.contentLine===null||target.contentLine>=target.sourceLine);
  assert(target.contentLine===null||target.contentLine<=target.scopeEndLine);
}
assert.notEqual(map.get('p1b7').sourceLine,map.get('p1b8').sourceLine);
assert.notEqual(map.get('p6b6s1').sourceLine,map.get('p6b7')?.sourceLine);
assert.equal(labels.filter(r=>r.label==='p1b7').length,1,'current ID must map to only one tag');
assert.equal(map.size,atoms.length,'current parent and child labels must all map');
console.log('PDF_CMD_RENUMBER_SOURCE_LOCATION_PASS',JSON.stringify({atoms:atoms.length,promotedId}));
