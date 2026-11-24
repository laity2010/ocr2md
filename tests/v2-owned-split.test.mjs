import assert from 'node:assert/strict';
import * as legacy from '../ui/v2-legacy-block-id.js';
assert.deepEqual(Object.keys(legacy).sort(),['SYNTHETIC_ID_MAX','SYNTHETIC_ID_MIN','isSyntheticId']);
assert(legacy.isSyntheticId(2**48));
assert(legacy.isSyntheticId(2**49-1));
for(const id of [0,267,2**48-1,2**49,NaN,'281474976710656'])assert(!legacy.isSyntheticId(id));
console.log('WP25B_RETIRED_SPLIT_ID_READONLY_PASS');
