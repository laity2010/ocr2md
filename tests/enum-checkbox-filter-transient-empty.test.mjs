import assert from 'node:assert/strict';
import {EnumCheckboxFilter} from '../ui/enum-checkbox-filter.js';
const filter=Object.create(EnumCheckboxFilter.prototype);
filter.selected=new Set(['p8b3s0']);
filter.values=[];
filter.normaliseSelection();
assert.deepEqual([...filter.selected],['p8b3s0'],
 'empty loading rowData must not clear a user-selected text block');
filter.values=['p4b1s2','p8b3s0','p9b1s1'];
filter.normaliseSelection();
assert.deepEqual([...filter.selected],['p8b3s0'],
 'selected filter must survive replacement candidate list');
filter.values=['p4b1s2','p9b1s1'];
filter.normaliseSelection();
assert.deepEqual([...filter.selected],[],
 'genuinely removed selection must not point to a fabricated block');
console.log('AG_ENUM_FILTER_TRANSIENT_EMPTY_PRESERVE_PASS');
