/** A reviewed child originally sourced from a whole OCR parent is also independently promotable. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDReparentPBS,planCMDPromotePBSChild,readCMDBlockChains,projectCMDBlockTable} from '../ui/cmd-block-chains.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const apply=(text,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from)
  .reduce((cur,e)=>cur.slice(0,e.from)+e.insert+cur.slice(e.to),text);
const joined=apply(source,planCMDReparentPBS(source,'p1b5','p1b3s0'));
assert.equal(toMineruJSON(joined),raw);
assert(joined.includes('<!-- cmd:block:v1 id="p1b3s1" origin="p1b5" -->'));
const planned=planCMDPromotePBSChild(joined,'p1b3s1');
assert.equal(planned.newId,'p1b14');assert.equal(planned.origin,'p1b5');
const separated=apply(joined,planned);
assert(separated.includes('<!-- cmd:block:v1 id="p1b14" origin="p1b5" -->'));
assert(!separated.includes('id="p1b3s1"'));
assert(separated.indexOf('id="p1b13"')<separated.indexOf('id="p1b14"'));
assert(separated.indexOf('id="p1b14"')<separated.indexOf('Top Award'));
assert(separated.indexOf('Top Award')<separated.indexOf('<!-- minerujson:page:v1:2'));
assert.equal(toMineruJSON(separated),raw);
const data=readCMDBlockChains(separated);
assert.deepEqual(data.invalid,[]);assert.equal(data.atoms.length,267);
const current=data.atoms.find(a=>a.id==='p1b14');
assert.equal(current?.origin,'p1b5');assert.equal(current?.kind,'parent');
const inv=await inspectCMDTextBlocks(separated),layout=await queryCMDLayout(separated);
const table=projectCMDBlockTable(separated,inv.rows,layout,data,inv.children);
const row=table.rows.find(a=>a.id==='p1b14');
assert.equal(row?.origin,'p1b5');assert.equal(row?.kind,'parent');
assert.equal(row?.blockIndex,5);assert.equal(row?.pageIndex,1);
assert(row?.bbox?.length===4);
assert.equal(table.rows.filter(a=>a.id==='p1b3s1'||a.id==='p1b5').length,0);
assert.equal(source.slice(source.indexOf('<!-- minerujson:source:v1:')),
  separated.slice(separated.indexOf('<!-- minerujson:source:v1:')));
assert.throws(()=>planCMDPromotePBSChild(separated,'p1b3s1'),/original or reviewed direct child/);
console.log('REVIEWED_PBS_CHILD_PROMOTION_PASS',{from:'p1b3s1',to:'p1b14',origin:'p1b5',
  parents:225,children:42,originalJSONByteExact:true});
