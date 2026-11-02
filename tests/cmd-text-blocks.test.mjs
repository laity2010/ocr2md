import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {inspectCMDTextBlocks,queryCMDLayout,queryCMDBlockGeometry,enclosingChildBBox} from '../ui/cmd-text-blocks.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const initial=toMarkdown(source);
const sample='.v6/tests/text-blocks/buffett-reinitialized.minerujson.md';
mkdirSync('.v6/tests/text-blocks',{recursive:true});writeFileSync(sample,initial);
assert.equal(toMineruJSON(initial),source,'reinitialized sample must be byte-exact');
assert.deepEqual(enclosingChildBBox([], [1,2,3,4]),[1,2,3,4]);
assert.deepEqual(enclosingChildBBox([{bbox:[9,10,20,30]},{bbox:[5,12,11,40]}], [8,11,19,33]),[5,10,20,40]);
const baseline=await inspectCMDTextBlocks(initial);
assert.equal(baseline.summary.pages,22);assert.equal(baseline.summary.blocks,224);
assert.equal(baseline.summary.matched,224);assert.equal(baseline.summary.missing,0);
assert.equal(baseline.summary.duplicates,0);assert.equal(baseline.summary.unknown,0);
assert.equal(baseline.summary.readable,215);
assert.equal(baseline.summary.metadataOnly,9);
assert.deepEqual(baseline.rows.find(row=>row.id==='p6b2').bbox,[51,215,273,272]);
const layout=await queryCMDLayout(initial);
assert.equal(layout.source,'CMD-sealed-minerujson');
assert.equal(layout.pages.length,22);
assert.equal(layout.pages.reduce((n,p)=>n+p.regions.length,0),224);
assert.deepEqual(layout.pages[6].pageSize,[594,783]);
const block=await queryCMDBlockGeometry(initial,6,2);
assert.deepEqual(block.bbox,[51,215,273,272]);
assert(Array.isArray(block.lines)&&block.lines.length>0);
assert.deepEqual(block.lines[0].bbox,[53,216,267,234]);
assert(Array.isArray(block.lines[0].spans[0].bbox));
assert(Object.isFrozen(layout.pages[6].regions[2].bbox),'layout is immutable');
assert(Object.isFrozen(layout.pages[6].regions[2].originalBBox));
const chart=layout.pages[13].regions.find(r=>r.blockIndex===1);
assert.equal(chart.type,'chart');
assert.deepEqual(chart.originalBBox,[219,108,529,357]);
assert.deepEqual(chart.bbox,[206,82,539,490],'chart parent encloses ALL eligible children');
assert.deepEqual(chart.subRegions,[
  {type:'chart_caption',role:'caption',bbox:[217,82,494,107],path:[0]},
  {type:'chart_body',role:'body',bbox:[219,108,529,357],path:[1]},
  {type:'chart_caption',role:'note',bbox:[206,371,539,490],path:[2]},
]);
const table=layout.pages[14].regions.find(r=>r.blockIndex===0);
assert.equal(table.type,'table');
assert.deepEqual(table.originalBBox,[51,110,521,335]);
assert.deepEqual(table.bbox,[50,89,523,363],'caption + body + note must expand parent');
assert.deepEqual(table.subRegions,[
  {type:'table_caption',role:'caption',bbox:[57,89,484,104],path:[0]},
  {type:'table_body',role:'body',bbox:[51,110,521,335],path:[1]},
  {type:'table_footnote',role:'note',bbox:[50,341,523,363],path:[2]},
]);
const screenshotTable0=layout.pages[3].regions.find(r=>r.blockIndex===0);
const screenshotTable1=layout.pages[3].regions.find(r=>r.blockIndex===1);
assert.deepEqual(screenshotTable0.originalBBox,[68,111,538,458]);
assert.deepEqual(screenshotTable0.bbox,[68,89,538,458]);
assert.deepEqual(screenshotTable1.bbox,[68,464,539,684], 'conflicting foreign-page child cannot stretch another table');
assert.deepEqual(layout.pages[4].regions[0].bbox,[50,89,521,339]);
assert.deepEqual(layout.pages[4].regions[0].originalBBox,[51,122,521,310]);
assert.deepEqual(screenshotTable0.subRegions,[
  {type:'table_caption',role:'caption',bbox:[74,89,523,104],path:[0]},
  {type:'table_body',role:'body',bbox:[68,111,538,458],path:[1]},
]);
assert.deepEqual(screenshotTable1.subRegions.map(c=>c.type),['table_body'],
  'p3b1 body is real, but its false Notes child overlaps previous table and is suppressed');
assert.deepEqual((await queryCMDBlockGeometry(initial,3,1)).bbox,[68,464,539,684],
  'the original table geometry and provenance remain available');
assert.deepEqual((await queryCMDBlockGeometry(initial,3,0)).bbox,[68,111,538,458],
  'raw query must not overwrite sealed parent evidence');
assert.deepEqual((await queryCMDBlockGeometry(initial,3,0)).coverageBBox,[68,89,538,458]);
assert(Object.isFrozen(chart.subRegions)&&Object.isFrozen(chart.subRegions[1].bbox)&&
  Object.isFrozen(chart.subRegions[1].path),
  'child evidence geometry must remain immutable and share parent Block identity');
assert.equal(await queryCMDBlockGeometry(initial,99,0),null);
assert.equal(readFileSync(sample,'utf8'),initial,'no CMD writes during inventory');
const altered=initial.replace('<!-- cmd:block:v1 p="13" b="0" -->','');
const missing=await inspectCMDTextBlocks(altered);
assert.equal(missing.summary.missing,1);
assert.equal(missing.rows.find(x=>x.id==='p13b0').anchorStatus,'缺少锚点');
const duplicate=await inspectCMDTextBlocks(initial.replace('<!-- cmd:block:v1 p="13" b="0" -->','<!-- cmd:block:v1 p="13" b="0" -->\n<!-- cmd:block:v1 p="13" b="0" -->'));
assert.equal(duplicate.summary.duplicates,1);
const broken=initial.replace(/(<!-- minerujson:source:v1:)[a-f0-9]/,'$1f');
await assert.rejects(inspectCMDTextBlocks(broken),/SHA-256/);
await assert.rejects(queryCMDLayout(broken),/SHA-256/);
assert.deepEqual((await queryCMDLayout(initial)).pages[6].regions[2].bbox,[51,215,273,272]);
console.log('CMD_TEXT_BLOCKS_PASS',baseline.summary,'isolatedSample',sample);
