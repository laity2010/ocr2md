import assert from 'node:assert/strict';
import {titleRowsFromCM} from '../ui/v2-title-view.js';
const texts=['# First','## Second','### Third','#### Four','##### Five','###### Six',
  '####### invalid','#nospace','not a heading','```markdown','# fenced','```',
  '~~~','# fenced tilde','~~~','  ## indented wrong','\t# tab indent',
  '# Unicode 中文😀','', '# typed after load'];
const records=texts.map((_,i)=>({logical_id:i+1,md_block:'SQL STALE',
  block_type:i===8?'title':'text',logical_order:i+1,p:2,b:i,s:0}));
const source=texts.map((text,i)=>({logicalId:i+1,markdownText:text,
  logicalOrder:i+1,blockType:i===8?'title':'text',p:2,b:i,s:0}));
const old=JSON.stringify(records);
const result=titleRowsFromCM(records,source);
assert.deepEqual(result.map(r=>r.level),['#','##','###','####','#####','######','#','#']);
assert.deepEqual(result.map(r=>r.md_block),[...texts.slice(0,6),texts[17],texts[19]]);
assert.equal(result[1].logical_id,2);
assert.equal(result[1].pbs,'p2b1s0');
assert.equal(result[1].block_type,'text','live content, not stale SQL type, decides headings');
assert.equal(result[1].heading_level,2);
assert.equal(JSON.stringify(records),old,'SQL inventory unchanged');
assert.equal(JSON.stringify(source[8]),JSON.stringify({logicalId:9,
  markdownText:'not a heading',logicalOrder:9,blockType:'title',p:2,b:8,s:0}));
assert.throws(()=>titleRowsFromCM(null,[]),/CM6 正文/);
// Edited live text changes derived output without changing persisted SQL.
source[8].markdownText='# Newly edited';
assert.equal(titleRowsFromCM(records,source).some(r=>r.logical_id===9),true);
source[8].markdownText='not a heading';
assert.equal(titleRowsFromCM(records,source).some(r=>r.logical_id===9),false);
console.log('V2_TITLE_DERIVED_VIEW_DIRECT_PASS',result.length,'headings, six levels, CM6-only text, fenced-code excluded, no SQL mutation');
