/** Source tags and AG rows always refer to the CURRENT CMD PBS ID; PDF is
 * drawn at its immutable OCR origin. Regression for p1b12 vs PDF p1b10
 * and AG selecting unrelated p1b2 after reordered groups. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown} from '../packages/minerujson-md/dist/index.js';
import {planCMDInsertPBSParentAfter,readCMDBlockChains,projectCMDAtomLocations,
  resolveCMDBlockFocusRow} from '../ui/cmd-block-chains.js';
import {mapCMDVisibleLabelSources,sourceBlockScopes} from '../ui/cmd-block-labels.js';
import {sourceLabelLocations,sourcePDFLocationAtLine} from '../ui/pdf-source-locations.js';
const original=toMarkdown(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'));
export function makeThreePaneRenumberedDocument(){
  const plan=planCMDInsertPBSParentAfter(original,'p1b10','p1b11');
  const source=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((doc,edit)=>{
    assert.equal(doc.slice(edit.from,edit.to),edit.expected);
    return doc.slice(0,edit.from)+edit.insert+doc.slice(edit.to);
  },original);
  return {source,plan};
}
const {source}=makeThreePaneRenumberedDocument();
const model=readCMDBlockChains(source);
const locations=projectCMDAtomLocations(source,model);
const labelLocations=mapCMDVisibleLabelSources(source);
const pdfLocations=sourceLabelLocations(source);
const item=locations.find(x=>x.id==='p1b12');
assert(item,'new visible PBS p1b12 missing');
assert.equal(item.origin,'p1b10','moving physical p1b10 must not change immutable origin');
assert.equal(item.pageIndex,1);
assert.equal(item.blockIndex,10);
assert.equal(item.path.length,0);
assert(item.contentLine>item.sourceLine&&item.contentLine<=item.scopeEndLine);
assert.equal(pdfLocations.get('p1b12').origin,item.origin);
assert.deepEqual({id:sourcePDFLocationAtLine(pdfLocations,item.contentLine).id,
  page:sourcePDFLocationAtLine(pdfLocations,item.contentLine).pageIndex,
  block:sourcePDFLocationAtLine(pdfLocations,item.contentLine).blockIndex},
  {id:'p1b12',page:1,block:10});
assert.equal(labelLocations.get('p1b12').contentLine,item.contentLine);
assert.equal(labelLocations.size,model.atoms.length,'all valid current CMD atoms have exact source locations');
// Prove this is a real regression fixture, not a no-op where physical and
// visible labels coincidentally happened to match.
const old=sourceBlockScopes(source).find(x=>x.sourceLine===item.sourceLine);
assert.equal(old.blockIndex,12,'legacy source-p/b path still confuses visible id for original geometry');
const allRows=locations.map(x=>({...x,pdfPage:x.pageIndex+1}));
for(const reordered of [allRows,allRows.toReversed(),
  allRows.toSorted((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:false}))]){
  for(const focus of [{sourceLine:item.sourceLine},{sourceLine:item.contentLine},
    {sourceLine:item.sourceLine,elementId:'p1b12'},
    {sourceLine:item.contentLine,elementId:'mineru:1:10:parent'}]){
    assert.equal(resolveCMDBlockFocusRow(reordered,focus)?.id,'p1b12',
      `AG must pick CMD p1b12 independent of row presentation order (${JSON.stringify(focus)})`);
  }
}
assert.equal(resolveCMDBlockFocusRow(allRows,{sourceLine:item.sourceLine-1})?.id==='p1b12',false,
  'the previous line cannot already belong to p1b12');
assert.equal(resolveCMDBlockFocusRow(allRows,{sourceLine:0}),null);
assert.equal(resolveCMDBlockFocusRow(allRows.filter(row=>row.id!=='p1b12'),
  {sourceLine:item.contentLine,elementId:'p1b12'}),null,
  'stale AG inventory must not silently select a different block');
assert.equal(resolveCMDBlockFocusRow(allRows,{sourceLine:item.sourceLine,elementId:'p1b2'})?.id,'p1b2',
  'exact current explicit PBS IDs always win');
const child=locations.find(a=>a.id==='p3b0s1');
if(child){assert.equal(resolveCMDBlockFocusRow(allRows,{sourceLine:child.sourceLine,
  elementId:'mineru:3:0:1'})?.id,child.id,'native child physical locator maps back to CMD ID');}
console.log('THREE_PANE_CMD_IDENTITY_PASS',JSON.stringify({atoms:locations.length,
  id:item.id,physical:item.origin,tag:item.sourceLine,body:item.contentLine}));
