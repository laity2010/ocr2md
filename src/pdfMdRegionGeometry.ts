/** WP5 visual-only PDF.js overlay geometry. Coordinates from MinerU are in
 * already-rotated page visual space, top-left origin; NEVER rotate again. */
import type { MappingPdfRegion } from "./mineruMappingSidecar";
export interface ViewerPageSize { readonly width:number;readonly height:number; }
export interface PdfOverlayPercent { readonly left:number;readonly top:number;readonly width:number;readonly height:number; }
function positiveSize(size:ViewerPageSize):boolean {
  return Number.isFinite(size.width)&&Number.isFinite(size.height)&&size.width>0&&size.height>0;
}
export function pdfRegionOverlayPercent(region:MappingPdfRegion,
  pdfViewport:ViewerPageSize,domContent:ViewerPageSize):PdfOverlayPercent {
  const [srcW,srcH]=region.pageSize;
  const [x0,y0,x1,y1]=region.bbox;
  if(!Number.isSafeInteger(region.pageIndex)||region.pageIndex<0||
    region.pdfPageNumber!==region.pageIndex+1||
    !positiveSize({width:srcW,height:srcH})||!positiveSize(pdfViewport)||!positiveSize(domContent)||
    ![x0,y0,x1,y1].every(Number.isFinite)||x0<0||y0<0||x0>=x1||y0>=y1||x1>srcW||y1>srcH){
    throw Error("PDF_COORDINATE_INVALID: OCR page or bbox is invalid");
  }
  // Page crop/rotation mismatch must stop navigation instead of showing a
  // convincing but false overlay. Uniform scaling is allowed; 2% tolerance
  // covers rounded MinerU dimensions and CSS/viewer viewport rounding.
  const ratio=(x:ViewerPageSize)=>x.width/x.height;
  const sourceRatio=srcW/srcH;
  for(const observed of [pdfViewport,domContent]) {
    if(Math.abs(ratio(observed)/sourceRatio-1)>0.02)
      throw Error("PDF_COORDINATE_MISMATCH: PDF viewport/crop/rotation differs from OCR page");
  }
  const expected=[x0/srcW,y0/srcH,x1/srcW,y1/srcH];
  if(region.normalizedBBox.length!==4 || region.normalizedBBox.some((v,i)=>
    !Number.isFinite(v)||v<0||v>1||Math.abs(expected[i]-v)>0.00001)){
    throw Error("PDF_COORDINATE_MISMATCH: Sidecar normalized bbox is inconsistent");
  }
  return {left:expected[0]*100,top:expected[1]*100,
    width:(expected[2]-expected[0])*100,height:(expected[3]-expected[1])*100};
}
