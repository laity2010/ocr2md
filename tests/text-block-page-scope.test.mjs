import assert from 'node:assert/strict';
import {filterTextBlockPageRows} from '../ui/text-block-page-scope.js';
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
console.log('TEXT_BLOCK_AG_PAGE_SCOPE_PASS',rows.length);
