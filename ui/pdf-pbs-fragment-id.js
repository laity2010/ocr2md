/** A native MinerU subregion can legitimately have role="body" (notably
 * table cells). That semantic OCR role must NOT be confused with the
 * virtual parent-body-s0 created during user structural correction.
 * Only an explicit virtualBody flag may use the root's bodyChildId. */
export function resolvePDFFragmentId(row,part,physicalId){
  if(part.virtualBody===true){
    if(typeof row.bodyChildId!=='string'||!/^p\d+b\d+s0$/.test(row.bodyChildId))
      throw Error('Invalid virtual parent body-s0 PDF projection');
    return row.bodyChildId;
  }
  return row.nativeChildren?.[physicalId]||physicalId;
}
