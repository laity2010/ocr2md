/** WP4 CMD-owned child-inclusive AG data shape, without editing user files. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {projectCMDBlockTable,readCMDBlockChains,planCMDMergeBlockChains} from '../ui/cmd-block-chains.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw);
const parent=await inspectCMDTextBlocks(source),layout=await queryCMDLayout(source);
const before=readCMDBlockChains(source),view=projectCMDBlockTable(source,parent.rows,layout,before,parent.children);
assert.equal(parent.rows.length,224);
assert.deepEqual([view.rows.length,view.summary.parents,view.summary.children,view.summary.unanchored,view.summary.chains],
  [267,224,43,0,267]);
assert.equal(new Set(view.rows.map(r=>r.id)).size,267);
const child=view.rows.find(r=>r.id==='p4b0s1');
assert(child&&child.kind==='child'&&child.parentId==='p4b0'&&child.depth===1);
assert.equal(child.originalText,parent.children.find(x=>x.id===child.id).text);
assert.equal(child.ocrBBoxText,parent.children.find(x=>x.id===child.id).originalBBox.join(', '));
assert(child.sourceLine>0&&child.from>=0&&child.format==='cmd-v1');
assert.equal(child.chainSize,1);assert.equal(child.chainLabel,'单块');
assert(child.sourceText.length>0||child.text.length===0,'child must only show its OWN text');
assert(!child.bbox||child.bbox.length===4,'child bbox comes from validated native child, not parent');
const missingChild=view.rows.filter(r=>r.kind==='child'&&!r.bbox);
assert(missingChild.every(r=>r.geometry===false&&r.geometryLabel==='无有效子块坐标'));
const mergedPlan=planCMDMergeBlockChains(source,'p0b0','p8b0');
const merged=[...mergedPlan.edits].sort((a,b)=>b.from-a.from).reduce((s,e)=>{
  assert.equal(s.slice(e.from,e.to),e.expected);
  return s.slice(0,e.from)+e.insert+s.slice(e.to);
},source);
const projected=projectCMDBlockTable(merged,parent.rows,layout,undefined,parent.children);
assert.equal(projected.summary.chains,266);
const first=projected.rows.find(r=>r.id==='p0b0');
const last=projected.rows.find(r=>r.id==='p8b0');
assert.deepEqual(first.chainMembers,['p0b0','p8b0']);
assert.equal(last.chainPrev,'p0b0');assert.equal(last.chainPosition,2);
assert.equal(last.chainId,first.chainId);
assert.equal(toMineruJSON(merged),raw,'sealed original MinerU preserved');
assert.equal(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8'),raw);
console.log('CMD_PBS_BC_WP4_PROJECTION_PASS',{parents:224,children:43,chains:267,
  mergedChains:projected.summary.chains,childWithoutValidBBox:missingChild.length});
