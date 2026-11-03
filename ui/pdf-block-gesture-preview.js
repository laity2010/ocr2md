/** Read-only PDF gesture intent. No CMD/source/layout mutations.
 * The target is always the actual hit label; a native child additionally
 * reports its parent as a description, not a structural operation.
 */
export function describePDFBlockGesture({sourceId,targetId,placement}){
  const valid=/^p\d+b\d+(?:s\d+(?:\.\d+)*)?$/;
  if(!valid.test(sourceId||'')||!valid.test(targetId||'')||
     !['before','child','after'].includes(placement)||sourceId===targetId)
    throw Error('PDF 手势落点无效');
  const parent=targetId.replace(/s\d+(?:\.\d+)*$/,'');
  const meaning=placement==='before'? `拟移至 ${targetId} 之前`:
    placement==='after'? `拟移至 ${targetId} 之后`:
    `拟归入 ${parent} 的子块${parent!==targetId?`（落在 ${targetId}）`:''}`;
  return Object.freeze({sourceId,targetId,placement,
    message:`PDF 手势预演 · ${sourceId} → ${targetId} · ${meaning} · 仅提示，未修改 CMD、编号或覆盖框`});
}
