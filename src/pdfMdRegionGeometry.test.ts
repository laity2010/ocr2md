import * as assert from "node:assert/strict";
import { pdfRegionOverlayPercent } from "./pdfMdRegionGeometry";
import type { MappingPdfRegion } from "./mineruMappingSidecar";
function region(pageIndex:number,size:readonly [number,number],bbox:readonly [number,number,number,number]):MappingPdfRegion {
  return {pageIndex,pdfPageNumber:pageIndex+1,pageSize:size,bbox,
    normalizedBBox:[bbox[0]/size[0],bbox[1]/size[1],bbox[2]/size[0],bbox[3]/size[1]]};
}
const first=region(0,[634,833],[63.4,83.3,317,416.5]);
assert.deepEqual(pdfRegionOverlayPercent(first,{width:634.32,height:833.04},{width:317,height:416.5}),
  {left:10,top:10,width:40,height:40});
for(const page of [8,11]){
  const rotated=region(page-1,[783,594],[78.3,59.4,391.5,297]);
  const over=pdfRegionOverlayPercent(rotated,{width:783,height:594},{width:522,height:396});
  assert.ok(Math.abs(over.left-10)<1e-9&&Math.abs(over.top-10)<1e-9);
  assert.throws(()=>pdfRegionOverlayPercent(rotated,{width:594,height:783},{width:522,height:396}),/PDF_COORDINATE_MISMATCH/);
}
const invalid=region(3,[594,783],[200,100,100,300]);
assert.throws(()=>pdfRegionOverlayPercent(invalid,{width:594,height:783},{width:594,height:783}),/INVALID/);
assert.throws(()=>pdfRegionOverlayPercent(region(2,[594,783],[20,30,220,130]),
  {width:594,height:783},{width:783,height:594}),/MISMATCH/);
const corrupt={...first,normalizedBBox:[.01,.01,.02,.03] as const};
assert.throws(()=>pdfRegionOverlayPercent(corrupt,{width:634,height:833},{width:634,height:833}),/MISMATCH/);
console.log('WP5_PDF_OVERLAY_GEOMETRY_UNIT_OK regular=1 rotated=8,11 invalidBBoxRejected=1 cropMismatchBlocked=1');
