import assert from 'node:assert/strict';
import {hitPDFRegion} from '../ui/pdf-region-hit.js';
const page={pageSize:[594,783],regions:[
  {blockIndex:0,bbox:[51,122,521,310],subRegions:[
    {bbox:[56,89,504,119],role:'caption'},
    {bbox:[50,317,521,339],role:'note'}]},
  {blockIndex:1,bbox:[188,403,522,623],subRegions:[]}]};
for(const [point,blockIndex,partIndex,role] of [
  [[200,100],0,0,'caption'],[[200,200],0,null,'body'],
  [[200,325],0,1,'note'],[[350,500],1,null,'body']]){
  const hit=hitPDFRegion(page,point);
  assert.deepEqual([hit?.blockIndex,hit?.partIndex,hit?.role],
    [blockIndex,partIndex,role],`wrong hit at ${point}`);
}
assert.equal(hitPDFRegion(page,[200,350]),null,'whitespace cannot select a neighboring table');
assert.equal(hitPDFRegion(page,[-2,130]),null);
const overlapping={pageSize:[594,783],regions:[{blockIndex:0,
  bbox:[50,80,540,340],subRegions:[{bbox:[70,90,520,110],role:'caption'}]}]};
assert.equal(hitPDFRegion(overlapping,[200,100])?.partIndex,0,
  'real child rectangle must win if parent bbox also contains it');
console.log('PDF_CHILD_REGION_HIT_PASS');
