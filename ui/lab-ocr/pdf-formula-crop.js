/** Pure clipping math: immutable OCR coordinates -> PDF.js canvas transform.
 * The rendered source page is not rewritten and no image bytes are persisted.
 */
export function planFormulaCrop(bbox,pageSize,viewport,{padding=6,maxWidth=520,maxHeight=250}={}){
  if(!Array.isArray(pageSize)||pageSize.length!==2||
    !pageSize.every(n=>Number.isFinite(n)&&n>0)||
    !Array.isArray(bbox)||bbox.length!==4||!bbox.every(Number.isFinite)||
    !(bbox[0]>=0&&bbox[1]>=0&&bbox[2]>bbox[0]&&bbox[3]>bbox[1])||
    bbox[2]>pageSize[0]||bbox[3]>pageSize[1]||
    !Number.isFinite(viewport?.width)||!Number.isFinite(viewport?.height)||
    viewport.width<=0||viewport.height<=0)return null;
  const aspect=pageSize[0]/pageSize[1];
  const actual=viewport.width/viewport.height;
  if(Math.abs(aspect-actual)>actual*.04)return null;
  const pad=Math.max(0,Math.min(20,Number(padding)||0));
  const clip=[Math.max(0,bbox[0]-pad),Math.max(0,bbox[1]-pad),
    Math.min(pageSize[0],bbox[2]+pad),Math.min(pageSize[1],bbox[3]+pad)];
  const nativeWidth=(clip[2]-clip[0])*viewport.width/pageSize[0];
  const nativeHeight=(clip[3]-clip[1])*viewport.height/pageSize[1];
  const scale=Math.min(2,Math.max(.2,Math.min(maxWidth/nativeWidth,maxHeight/nativeHeight)));
  const pxPerSourceX=viewport.width*scale/pageSize[0];
  const pxPerSourceY=viewport.height*scale/pageSize[1];
  return {scale,width:Math.max(1,Math.ceil((clip[2]-clip[0])*pxPerSourceX)),
    height:Math.max(1,Math.ceil((clip[3]-clip[1])*pxPerSourceY)),
    translateX:-clip[0]*pxPerSourceX,translateY:-clip[1]*pxPerSourceY,
    clip};
}
