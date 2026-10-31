import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {inspectCMDTextBlocks,queryCMDLayout,queryCMDBlockGeometry} from '../ui/cmd-text-blocks.js';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const initial=toMarkdown(source);
const sample='.v6/tests/text-blocks/buffett-reinitialized.minerujson.md';
mkdirSync('.v6/tests/text-blocks',{recursive:true});writeFileSync(sample,initial);
assert.equal(toMineruJSON(initial),source,'reinitialized sample must be byte-exact');
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
const chart=layout.pages[13].regions.find(r=>r.blockIndex===1);
assert.equal(chart.type,'chart');
assert.deepEqual(chart.bbox,[219,108,529,357]);
assert.deepEqual(chart.subRegions,[
  {type:'chart_caption',role:'caption',bbox:[217,82,494,107]},
  {type:'chart_caption',role:'note',bbox:[206,371,539,490]},
]);
const table=layout.pages[14].regions.find(r=>r.blockIndex===0);
assert.equal(table.type,'table');
assert.deepEqual(table.subRegions,[
  {type:'table_caption',role:'caption',bbox:[57,89,484,104]},
  {type:'table_footnote',role:'note',bbox:[50,341,523,363]},
]);
assert(Object.isFrozen(chart.subRegions)&&Object.isFrozen(chart.subRegions[1].bbox),
  'child evidence geometry must remain immutable and share parent Block identity');
assert.equal(await queryCMDBlockGeometry(initial,99,0),null);
assert.equal(readFileSync(sample,'utf8'),initial,'no CMD writes during inventory');
const altered=initial.replace('<!-- minerujson:block:v1:13:0 -->','');
const missing=await inspectCMDTextBlocks(altered);
assert.equal(missing.summary.missing,1);
assert.equal(missing.rows.find(x=>x.id==='p13b0').anchorStatus,'缺少锚点');
const duplicate=await inspectCMDTextBlocks(initial.replace('<!-- minerujson:block:v1:13:0 -->','<!-- minerujson:block:v1:13:0 -->\n<!-- minerujson:block:v1:13:0 -->'));
assert.equal(duplicate.summary.duplicates,1);
const broken=initial.replace(/(<!-- minerujson:source:v1:)[a-f0-9]/,'$1f');
await assert.rejects(inspectCMDTextBlocks(broken),/SHA-256/);
await assert.rejects(queryCMDLayout(broken),/SHA-256/);
assert.deepEqual((await queryCMDLayout(initial)).pages[6].regions[2].bbox,[51,215,273,272]);
console.log('CMD_TEXT_BLOCKS_PASS',baseline.summary,'isolatedSample',sample);
