import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {inspectCMDTextBlocks,queryCMDLayout} from '../ui/cmd-text-blocks.js';
import {scanCMDContinuationCandidates} from '../ui/cmd-block-continuations.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const inventory=await inspectCMDTextBlocks(source),layout=await queryCMDLayout(source);
const result=scanCMDContinuationCandidates(inventory,layout);
assert.equal(result.summary.pages,22);
assert.equal(result.summary.blocks,224);
assert.equal(result.summary.candidates,5);
assert.equal(result.summary.acrossColumn,4);
assert.equal(result.summary.acrossPage,1);
assert.equal(result.summary.high,5);
assert.equal(new Set(result.candidates.map(c=>c.id)).size,5,'deduplicate candidate IDs');
for(const id of ['p6b6--p6b7','p8b3--p8b4','p13b3--p13b4','p15b5--p15b6','p15b11--p16b0']){
 const row=result.candidates.find(c=>c.id===id);
 assert(row,`missing true reading-seam candidate ${id}`);
 assert(row.status==='待审阅'&&row.fromBbox.length===4&&row.toBbox.length===4);
 assert(row.evidence.length>=3);
}
const known=result.candidates.find(c=>c.id==='p6b6--p6b7');
assert(known.fromTail.endsWith('about'));
assert(known.toHead.startsWith('3 percentage points'));
assert(!result.candidates.some(c=>c.id==='p5b6--p6b0'),'blank right column is a blocking layout');
assert(!result.candidates.some(c=>c.id==='p12b7--p13b0'),'continued figure caption is not continuous body');
assert(!result.candidates.some(c=>c.id==='p8b7--p9b0'),'footer equation blocks direct text continuation');
assert.throws(()=>scanCMDContinuationCandidates(inventory,{pages:[]}),/CMD/);
const edited=source.replace('Warren Bufet','Warren Buffett');
const after=scanCMDContinuationCandidates(await inspectCMDTextBlocks(edited),await queryCMDLayout(edited));
assert.deepEqual(after.candidates.map(c=>c.id),result.candidates.map(c=>c.id),
 'later Markdown edits must not change original geometry/text continuation evidence');
const fixtureDir='.v6/evidence/wp3';mkdirSync(fixtureDir,{recursive:true});
writeFileSync(`${fixtureDir}/buffett-candidate-audit.json`,JSON.stringify({
 algorithm:'CMD bbox reading-boundary candidate scan, NO merges or corrections',
 summary:result.summary,pageLayouts:result.pageLayouts,candidates:result.candidates,
 excludedTransitions:result.skipped,
},null,2)+'\n');
assert.equal(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8'),source);
console.log('WP3_CANDIDATE_PASS',result.summary,'evidence',`${fixtureDir}/buffett-candidate-audit.json`);
