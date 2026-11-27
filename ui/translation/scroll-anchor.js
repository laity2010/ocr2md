/** Scroll synchronization is keyed by sentence, not pixels or line numbers. */
export function nearestSentence(model,pos){
  const exact=model.atOffset(pos);
  if(exact)return exact;
  const rows=model.sentences;
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(rows[mid].from<pos)lo=mid+1;else hi=mid;}
  return rows[lo]??rows.at(-1)??null;
}
export function fractionWithin(top,bottom,y){
  return Math.max(0,Math.min(1,(y-top)/Math.max(1,bottom-top)));
}
export function anchorHeight(top,bottom,fraction){
  return top+Math.max(0,bottom-top)*Math.max(0,Math.min(1,fraction));
}

/** A wholly protected source sentence has no right-hand counterpart.
 * During scrolling, use the next comparable sentence, or the last at EOF.
 * This is an anchor only: clicks never select an unrelated sentence.
 */
export function comparisonAnchor(anchor,full,prepared){
  if(!anchor||!full||!prepared?.sentences.length)return null;
  if(prepared.byKey(anchor.key))return anchor;
  const source=full.byKey(anchor.key);
  if(!source)return null;
  const rows=prepared.sentences;
  let lo=0,hi=rows.length;
  while(lo<hi){const mid=(lo+hi)>>1,r=rows[mid];if(r.line<source.line||(r.line===source.line&&r.index<source.index))lo=mid+1;else hi=mid;}
  return lo<rows.length?{key:rows[lo].key,fraction:0}:{key:rows.at(-1).key,fraction:1};
}
