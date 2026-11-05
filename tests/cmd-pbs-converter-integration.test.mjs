/** WP1: new MinerU -> CMD PBS conversion and every source-derived consumer.
 * Uses only synthetic in-memory conversion; no live document or PDF writes. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {readCMDBlockChains,planCMDBlockChainArrangement} from '../ui/cmd-block-chains.js';
import {projectCMDSourceBlockLabels} from '../ui/cmd-block-labels.js';
import {sourceBlocks,sourceSubblocks} from '../ui/pdf-source-locations.js';
import {planCMDSubblockAnnotations,inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {projectCMDLogicalTextBlocks} from '../ui/cmd-block-joins.js';
import {buildOutline} from '../ui/outline-index.js';
import {extractTextBlocks,reconstructSource} from '../ui/cmd-sentences.js';

const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const original=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const next=toMarkdown(raw);
assert.equal(toMineruJSON(next),raw,'original OCR JSON exact bytes must roundtrip');
assert.equal(toMineruJSON(original),raw,'legacy files remain readable unchanged');
assert.equal((next.match(/^<!-- cmd:block:v1 id="p\d+b\d+" -->$/gm)||[]).length,224);
assert.equal((next.match(/^<!-- cmd:block:v1 id="p\d+b\d+s[\d.]+" -->$/gm)||[]).length,43);
assert.equal((next.match(/<!-- minerujson:block:v1:/g)||[]).length,0);
const parsed=readCMDBlockChains(next);
assert.equal(parsed.invalid.length,0);
assert.deepEqual(parsed.summary,{atoms:267,chains:267,singleton:267,multiple:0});
assert(parsed.atoms.some(x=>x.id==='p4b0s2'));
const labels=projectCMDSourceBlockLabels(next);
assert.equal(labels.length,267);
assert.equal(labels.filter(x=>x.kind==='parent').length,224);
assert.equal(labels.filter(x=>x.kind==='child').length,43);
assert.equal(sourceBlocks(next).length,224);
assert.equal(sourceSubblocks(next).length,43);
// The native p4b0s0 caption is actual OCR text in this sealed fixture.
// Requiring "structure" here hid a valid child body and contradicted the
// source-order p4b0s0/p4b0s1/p4b0s2 converter contract.
const caption=labels.find(x=>x.id==='p4b0s0');
assert.equal(caption?.sourceKind,'content','original p4b0s0 caption must not be lost');
assert(next.split('\n').slice(caption.sourceLine,caption.scopeEndLine)
  .some(line=>line.includes('Table 1.')&&line.includes('continued')),
  'caption body must remain in the exact original source-tag scope');
assert.equal(labels.find(x=>x.id==='p4b0')?.sourceKind,'structure',
  'parent has no independent body before its first native child');
const annotations=await planCMDSubblockAnnotations(next);
assert.equal(annotations.existing,43);
assert.equal(annotations.inserted,0);
assert.equal(annotations.edits.length,0,'new documents need no separate child annotation step');
const inventory=await inspectCMDTextBlocks(next);
assert.equal(inventory.summary.blocks,224);
assert.equal(inventory.summary.matched,224);
assert.equal(inventory.summary.duplicates,0);
const layout=await queryCMDLayout(next);
assert.equal(layout.pages.length,22);
assert.equal(layout.pages[4].regions.find(x=>x.blockIndex===0).subRegions.length,3);
const logical=projectCMDLogicalTextBlocks(next,inventory.rows);
assert.equal(logical.blocks.length,224);
assert.equal(logical.invalid.length,0);
const outline=buildOutline(next);
assert(outline.some(x=>x.pdfPage===1&&x.title.includes('Bufett')));
const sentences=extractTextBlocks(next);
assert.equal(reconstructSource(sentences),next,'sentence projection is lossless');
// Explicit new BC relation spans two distinct original PDF pages and
// survives roundtrip and reload, leaving every original OCR bbox unchanged.
const chains=parsed.chains.map(chain=>({members:chain.members}));
const a=chains.findIndex(c=>c.members[0]==='p3b0s0');
const b=chains.findIndex(c=>c.members[0]==='p4b0s2');
assert(a>=0&&b>=0);
chains.splice(Math.max(a,b),1);chains.splice(Math.min(a,b),1);
chains.push({id:'bc-wp1-example',type:'table',members:['p3b0s0','p4b0s2'],
  roles:{p3b0s0:'header',p4b0s2:'note'}});
const plan=planCMDBlockChainArrangement(next,chains);
assert.equal(plan.changed,2);
const withChain=[...plan.edits].sort((a,b)=>b.from-a.from)
  .reduce((s,e)=>s.slice(0,e.from)+e.insert+s.slice(e.to),next);
assert.equal(toMineruJSON(withChain),raw,'BC relations cannot change sealed original JSON');
assert.equal(readCMDBlockChains(withChain).summary.chains,266);
assert.deepEqual(readCMDBlockChains(withChain).chains.find(c=>c.id==='bc-wp1-example').members,
  ['p3b0s0','p4b0s2']);
assert.equal(sourceSubblocks(withChain).length,43);
const unknown=next.replace('<!-- cmd:block:v1 id="p4b0s1" -->',
  '<!-- cmd:block:v1 id="p4b0s9" -->');
assert.throws(()=>toMineruJSON(unknown),/INVALID/);
assert.deepEqual(readCMDBlockChains(original).summary,
  {atoms:224,chains:224,singleton:224,multiple:0});
console.log('CMD_PBS_CONVERTER_INTEGRATION_PASS',{parents:224,children:43,
  oldParents:224,chainsAfterLink:266,sourceBytes:next.length});
