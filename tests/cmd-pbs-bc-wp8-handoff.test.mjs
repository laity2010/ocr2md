/** WP8 release-candidate smoke: one CMD document, semantic cross-page BC
 * membership and independent PDF overlay override survive conversion/reload.
 * No editor, disk write, network, fixture mutation, or user data access. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {readCMDBlockChains,projectCMDBlockTable,planCMDMergeBlockChains,
  planCMDMoveBlockChainMember,planCMDExtractBlockChainMember} from '../ui/cmd-block-chains.js';
import {planCMDPDFBBoxEdit,applyCMDPDFBBoxOverrides} from '../ui/cmd-pdf-bbox.js';
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const source=toMarkdown(raw),originalLayout=await queryCMDLayout(source);
const apply=(s,plan)=>{
  assert(plan.changed>0,'the operation must be meaningful');
  const next=[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,e)=>{
    assert.equal(text.slice(e.from,e.to),e.expected);
    return text.slice(0,e.from)+e.insert+text.slice(e.to);
  },s);
  assert.equal(toMineruJSON(next),raw,'preserve byte-exact original OCR JSON after EVERY step');
  assert.equal(readCMDBlockChains(next).invalid.length,0);
  return next;
};
const member=(s,id)=>readCMDBlockChains(s).chains.find(c=>c.members.includes(id));
let edited=apply(source,planCMDMergeBlockChains(source,'p0b0','p4b0s1'));
assert.deepEqual(member(edited,'p0b0').members,['p0b0','p4b0s1']);
edited=apply(edited,planCMDMoveBlockChainMember(edited,'p4b0s1','p0b0','before'));
assert.deepEqual(member(edited,'p4b0s1').members,['p4b0s1','p0b0']);
const native=originalLayout.pages[4].regions.find(x=>x.blockIndex===0).subRegions.find(x=>x.path[0]===1);
assert(native?.bbox?.length===4,'native child PDF rectangle must be present');
const rect=[...native.bbox];rect[0]=Math.max(0,rect[0]-.5);
if(rect[0]===native.bbox[0])rect[2]=Math.min(originalLayout.pages[4].pageSize[0],rect[2]+.5);
assert.notDeepEqual(rect,native.bbox);
const sourceWithChainOnly=edited;
edited=apply(edited,planCMDPDFBBoxEdit(edited,originalLayout,'p4b0s1',rect));
assert.deepEqual(member(edited,'p4b0s1').members,['p4b0s1','p0b0'],
  'PDF metadata must not modify BC membership or order');
const nativeAfter=await queryCMDLayout(edited),effective=applyCMDPDFBBoxOverrides(nativeAfter,edited);
assert.deepEqual(nativeAfter.pages[4].regions.find(r=>r.blockIndex===0)
  .subRegions.find(r=>r.path[0]===1).bbox,native.bbox,'sealed original is immutable');
assert.deepEqual(effective.pages[4].regions.find(r=>r.blockIndex===0)
  .subRegions.find(r=>r.path[0]===1).bbox,rect,'override survives reload');
const inventory=await inspectCMDTextBlocks(edited);
const ag=projectCMDBlockTable(edited,inventory.rows,effective,readCMDBlockChains(edited),inventory.children);
assert.deepEqual([ag.summary.parents,ag.summary.children,ag.summary.unanchored], [224,43,0]);
const child=ag.rows.find(r=>r.id==='p4b0s1'),root=ag.rows.find(r=>r.id==='p0b0');
assert.deepEqual(child.chainMembers,['p4b0s1','p0b0']);
assert.deepEqual(child.bbox,rect);
assert.equal(child.bboxSource,'人工修正');
assert.equal(child.ocrBBoxText,native.bbox.join(', '));
assert.equal(root.chainId,child.chainId);
assert.equal(root.bboxSource,'原始 OCR');
assert.equal(planCMDPDFBBoxEdit(edited,originalLayout,'p4b0s1',rect).changed,0);
edited=apply(edited,planCMDPDFBBoxEdit(edited,originalLayout,'p4b0s1',null));
assert.equal(edited,sourceWithChainOnly,'clearing overlay must retain the BC arrangement byte-for-byte');
edited=apply(edited,planCMDExtractBlockChainMember(edited,'p4b0s1'));
assert.equal(member(edited,'p4b0s1').members.length,1);
assert.equal(member(edited,'p0b0').members.length,1);
assert.equal(readCMDBlockChains(edited).atoms.length,267);
assert.equal(toMineruJSON(edited),raw);
console.log('WP8_PBS_BC_HANDOFF_PASS',{atoms:267,parents:224,children:43,
  crossPageChain:true,pdfCorrected:true,agProjection:true,resetPreservesBC:true,ocrByteExact:true});
