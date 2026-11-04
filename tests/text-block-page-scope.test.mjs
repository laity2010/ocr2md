import assert from 'node:assert/strict';
import {filterTextBlockPageRows,textBlockPageFilterModel} from '../ui/text-block-page-scope.js';
const rows=[
  {id:'p0b0',pageIndex:0,pdfPage:1},
  {id:'p0b0s0',pageIndex:0,pdfPage:1},
  {id:'p1b0',pageIndex:1,pdfPage:2},
  {id:'p2b3',pageIndex:2,pdfPage:3},
  {id:'p1b1',pdfPage:2},
];
assert.deepEqual(filterTextBlockPageRows(rows,1).map(r=>r.id),['p0b0','p0b0s0']);
assert.deepEqual(filterTextBlockPageRows(rows,2).map(r=>r.id),['p1b0','p1b1']);
assert.deepEqual(filterTextBlockPageRows(rows,3).map(r=>r.id),['p2b3']);
assert.equal(filterTextBlockPageRows(rows,0).length,0);
assert.strictEqual(filterTextBlockPageRows(rows,2,true),rows,'全页模式不修改源清单');
const initial={type:{values:['text']},anchorStatus:{values:['已匹配']}};
const page1=textBlockPageFilterModel(initial,1);
assert.deepEqual(page1,{...initial,pdfPage:{values:['1']}},'default column filter is current PDF page');
assert.deepEqual(textBlockPageFilterModel({...page1,pdfPage:{values:['3']}},2),
  {...initial,pdfPage:{values:['2']}},'navigating to PDF page 2 replaces manual page 3');
assert.deepEqual(textBlockPageFilterModel(page1,1,true),initial,'checked 全部 clears only page filter');
assert.deepEqual(initial,{type:{values:['text']},anchorStatus:{values:['已匹配']}},
  'other field filters and original filter model must remain immutable');
assert.throws(()=>textBlockPageFilterModel(null,0),/positive integer/);
console.log('TEXT_BLOCK_AG_PAGE_SCOPE_PASS',rows.length);
