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
