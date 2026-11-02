/** User-requested OCR structure correction: original parent p1b5 ("Top Award")
 * is shown as the next child p1b3s1 of image p1b3, following native p1b3s0.
 * The immutable physical provenance and PDF bbox stay attached to p1b5. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDReparentPBS,projectCMDBlockTable,planCMDMoveBlockChainMember} from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {sourceBlocks,sourceSubblocks} from '../ui/pdf-source-locations.js';
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(original);
const layout=await queryCMDLayout(source), inventory=await inspectCMDTextBlocks(source);
const plan=planCMDReparentPBS(source,'p1b5','p1b3s0');
assert.deepEqual([plan.changed,plan.newId,plan.origin],[2,'p1b3s1','p1b5']);
for(const {from,to,expected} of plan.edits)assert.equal(source.slice(from,to),expected);
const changed=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>
  text.slice(0,e.from)+e.insert+text.slice(e.to),source);
const marker='<!-- cmd:block:v1 id="p1b3s1" origin="p1b5" -->';
const child='<!-- cmd:block:v1 id="p1b3s0" -->',next='<!-- cmd:block:v1 id="p1b4" -->';
assert(changed.indexOf(child)<changed.indexOf(marker)&&changed.indexOf(marker)<changed.indexOf(next));
assert(changed.indexOf(marker)<changed.indexOf('Top Award')&&
  changed.indexOf('Top Award')<changed.indexOf(next));
assert(!changed.slice(changed.indexOf(next)).includes('<!-- cmd:block:v1 id="p1b5" -->'));
assert.equal(changed.match(/Top Award/g)?.length,1,'entire OCR text block moves once');
assert.equal(toMineruJSON(changed),original,'unmodified original OCR JSON must survive rename');
const bc=readCMDBlockChains(changed);assert.deepEqual(bc.invalid,[]);
assert.deepEqual([bc.summary.atoms,bc.summary.chains],[267,267]);
assert(!bc.atoms.some(a=>a.id==='p1b5'));
assert.equal(bc.atoms.find(a=>a.id==='p1b3s1')?.origin,'p1b5');
assert.equal(bc.atoms.find(a=>a.id==='p1b3s1')?.kind,'child');
const table=projectCMDBlockTable(changed,inventory.rows,layout,bc,inventory.children);
assert.equal(table.rows.length,267,'reparent does not create a new OCR block');
assert.equal(table.summary.unanchored,0,'original source p1b5 must not appear missing');
const sourceRow=table.rows.find(a=>a.id==='p1b3s1');
const native=table.rows.find(a=>a.id==='p1b3s0');
assert.equal(table.rows.some(a=>a.id==='p1b5'),false);
assert.deepEqual([sourceRow.kind,sourceRow.parentId,sourceRow.origin,sourceRow.pageIndex,sourceRow.blockIndex,
  sourceRow.type,sourceRow.text],[ 'child','p1b3','p1b5',1,5,'text','Top Award']);
assert.deepEqual(sourceRow.bbox,layout.pages[1].regions.find(r=>r.blockIndex===5).bbox);
assert.equal(native.parentId,'p1b3');
assert.equal(table.summary.parents,223);assert.equal(table.summary.children,44);
assert.equal(sourceBlocks(changed).length,224,'original physical parent PDF overlays unchanged');
assert.equal(sourceSubblocks(changed).length,43,'no invented native OCR child overlay');
assert.throws(()=>planCMDReparentPBS(changed,'p1b5','p1b3s0'),/Unknown PBS/);
assert.throws(()=>planCMDReparentPBS(source,'p1b3','p1b3s0'),/already has children/i);
assert.throws(()=>planCMDReparentPBS(source,'p1b5','p1b4'),/native child/i);
assert.throws(()=>planCMDReparentPBS(source,'p1b5','p1b3s0.0'),/Unknown PBS/i);
assert.throws(()=>planCMDReparentPBS(source,'p1b5','p4b0s0'),/same-page/i);
assert.throws(()=>toMineruJSON(changed.replace('origin="p1b5"','origin="p1b4"')),/INVALID/);
assert.throws(()=>toMineruJSON(changed.replace('id="p1b3s1"','id="p1b3s0"')),/INVALID/);
assert.equal(source.slice(source.indexOf('<!-- minerujson:source:v1:')),
  changed.slice(changed.indexOf('<!-- minerujson:source:v1:')));
const planMove=planCMDMoveBlockChainMember(changed,'p1b3s1','p1b3s0','after');
assert.equal(planMove.changed,2,'BC operation must use visible ID while retaining origin');
console.log('CMD_PBS_REPARENT_SOURCE_PASS',{from:'p1b5',target:'p1b3s0',to:plan.newId,
  atoms:267,logicalParents:223,logicalChildren:44,originalPDF:224,originalOCRByteExact:true,sourceMoved:true});
