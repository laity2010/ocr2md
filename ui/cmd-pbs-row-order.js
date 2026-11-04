/** Sort text-block AG rows by their CURRENT visible PBS identity, not by
 * historical OCR source position, locale lexicography or chain projection.
 * A parent precedes its children and every numeric child path sorts as 0,1,2.
 * This is view-only; CM6 source / physical OCR boxes are never rewritten.
 */
export function compareCMDPBSIds(left,right){
  const parse=id=>{
    const m=/^p(\d+)b(\d+)(?:s(\d+(?:\.\d+)*))?$/.exec(String(id||''));
    return m?[Number(m[1]),Number(m[2]),...(m[3]?m[3].split('.').map(Number):[])]:null;
  };
  const a=parse(left),b=parse(right);
  if(!a||!b)return String(left).localeCompare(String(right),'en',{numeric:true});
  for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];
  return a.length-b.length;
}
export function sortCMDPBSRows(rows){
  return [...rows].sort((a,b)=>compareCMDPBSIds(a.id,b.id));
}
