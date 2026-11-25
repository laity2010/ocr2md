/** Read PDF.js native text layer items bounded by one MinerU overlay rectangle.
 * Coordinate authority: page.getViewport({scale:1}) (rotation included).
 * No OCR, Markdown, DOM text-layer selection or user file write.
 */
// Same affine transform as PDF.js Util.transform, kept pure so the region
// algorithm can run in Node tests without importing browser PDF.js workers.
const multiply=(v,t)=>[
  v[0]*t[0]+v[2]*t[1],v[1]*t[0]+v[3]*t[1],
  v[0]*t[2]+v[2]*t[3],v[1]*t[2]+v[3]*t[3],
  v[0]*t[4]+v[2]*t[5]+v[4],v[1]*t[4]+v[3]*t[5]+v[5],
];

/** @returns {string} Native PDF text in original page reading-line order. */
export function pdfTextInBox(textContent,viewport,pageSize,bbox){
  if(!Array.isArray(pageSize)||pageSize.length!==2||
     !pageSize.every(n=>Number.isFinite(n)&&n>0)||
     !Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
     !viewport?.transform||!Number.isFinite(viewport.width)||
     !Number.isFinite(viewport.height)||viewport.width<=0||viewport.height<=0||
     !Array.isArray(textContent?.items))return '';
  const [w,h]=pageSize;
  // Incompatible MinerU coordinate axes mean an overlay must not silently
  // borrow text from an unrelated region of the actual PDF.
  if(Math.abs(w/h-viewport.width/viewport.height)>viewport.width/viewport.height*.04)
    return '';
  const scaleX=w/viewport.width,scaleY=h/viewport.height;
  const [x1,y1,x2,y2]=bbox;
  if(x2<=x1||y2<=y1)return '';
  const hits=[];
  for(const item of textContent.items){
    if(typeof item?.str!=='string'||!item.str.trim()||
       !Array.isArray(item.transform)||item.transform.length!==6)continue;
    const [a,b,c,d,x,y]=multiply(viewport.transform,item.transform);
    const norm=Math.hypot(a,b),vertical=Math.hypot(c,d);
    const width=Number(item.width)*(viewport.scale??1);
    const height=Number(item.height)*(viewport.scale??1);
    if(!(norm>0&&vertical>0&&width>0&&height>0))continue;
    // TextItem.width/height are PDF.js transformed glyph extents at scale 1.
    // Form the 4-corner quadrilateral from baseline + glyph's vertical axis;
    // this also works on rotated PDF pages without guessing the PDF y axis.
    const dx=a/norm*width,dy=b/norm*width;
    const hx=c/vertical*height,hy=d/vertical*height;
    const xs=[x,x+dx,x+hx,x+dx+hx].map(n=>n*scaleX);
    const ys=[y,y+dy,y+hy,y+dy+hy].map(n=>n*scaleY);
    const left=Math.min(...xs),right=Math.max(...xs);
    const top=Math.min(...ys),bottom=Math.max(...ys);
    const iw=Math.max(0,Math.min(right,x2)-Math.max(left,x1));
    const ih=Math.max(0,Math.min(bottom,y2)-Math.max(top,y1));
    if((right-left)<1e-6||(bottom-top)<1e-6||
       iw/(right-left)<.50||ih/(bottom-top)<.50)continue;
    hits.push({str:item.str.trim(),left,right,top,bottom,
      cy:(top+bottom)/2,height:bottom-top});
  }
  if(!hits.length)return '';
  // The PDF items are often delivered in content-stream order rather than
  // visual reading order. Group equal baselines, then arrange each row x-wise.
  hits.sort((a,b)=>a.cy-b.cy||a.left-b.left);
  const lines=[];
  for(const hit of hits){
    const last=lines.at(-1);
    if(last&&Math.abs(hit.cy-last.center)<=Math.max(1.5,
      Math.min(hit.height,last.height)*.40)){
      last.hits.push(hit);
      const n=last.hits.length;
      last.center+=(hit.cy-last.center)/n;
    }else lines.push({hits:[hit],center:hit.cy,height:hit.height});
  }
  return lines.map(({hits:row})=>{
    row.sort((a,b)=>a.left-b.left);
    let result='',prior=null;
    for(const item of row){
      const gap=prior?item.left-prior.right:0;
      if(prior&&gap>Math.max(1.1,Math.min(prior.height,item.height)*.13))result+=' ';
      result+=item.str;
      prior=item;
    }
    return result;
  }).filter(Boolean).join('\n');
}
