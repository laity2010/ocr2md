import assert from 'node:assert/strict';
import {pbsPageKey} from '../ui/lab-ocr/pbs-page-filter.js';
assert.equal(pbsPageKey('p4b0'),'p4');
assert.equal(pbsPageKey('p4b0s0'),'p4');
assert.equal(pbsPageKey('p11b20s3'),'p11');
assert.equal(pbsPageKey('p13b3d'),'p13');
assert.equal(pbsPageKey('p04b002s1'),'p4');
assert.equal(pbsPageKey('~merged:40'),'');
assert.equal(pbsPageKey('p1b3s1s0'),'p1');
assert.equal(pbsPageKey('p3b3evil'),'p3','Only the p-prefix matters');
for(const invalid of ['p3','p3b','x3b3',null,undefined])
  assert.equal(pbsPageKey(invalid),'');
const crossPage={pbs:'p6b4s2',global_page:6};
assert.equal(pbsPageKey(crossPage.pbs),'p6',
  'Filter by logical PBS p6, not physical global_page 6 / PDF page 7');
assert.equal(pbsPageKey({pbs:'p7b0',global_page:6}.pbs),'p7');
console.log('LAB_OCR_PBS_PAGE_FILTER_PASS');
