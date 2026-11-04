/** Page-local PDF rail progressive disclosure. Every PBS ID remains in DOM:
 * busy runs of labels are represented by one tappable 'N块' summary until
 * the user expands one run. Grouping is VISUAL ONLY, never CMD structure.
 *
 * Pass post-layout slots (physical paper CSS pixels). Avoid grouping sparse
 * labels, and cap group size so the user can inspect a small set at 1.5x.
 */
export function planPDFRailDensityGroups(slots,{maxGap=8,minSize=4,maxSize=6}={}){
  const result=[];
  for(const side of ['left','right']){
    const ordered=slots.filter(s=>s.side===side)
      .sort((a,b)=>a.top-b.top||a.id.localeCompare(b.id,undefined,{numeric:true}));
    let run=[];
    const flush=()=>{
      if(run.length>=minSize){
        for(let pos=0;pos<run.length;pos+=maxSize){
          const batch=run.slice(pos,pos+maxSize);
          // Keep a short tail combined into the preceding group rather than
          // hiding its members inside a useless 1- or 2-item group.
          if(batch.length<minSize&&result.length&&result.at(-1).side===side){
            const prev=result.at(-1);
            if(prev.ids.length+batch.length<=maxSize+2){
              prev.ids.push(...batch.map(s=>s.id));
              prev.lastId=batch.at(-1).id;continue;
            }
          }
          if(batch.length<minSize)continue;
          result.push({key:`${side}:${batch[0].id}:${batch.at(-1).id}`,
            side,ids:batch.map(s=>s.id),firstId:batch[0].id,
            lastId:batch.at(-1).id,slot:batch[0]});
        }
      }
      run=[];
    };
    for(const slot of ordered){
      const before=run.at(-1);
      const gap=before?slot.top-before.top-before.height:0;
      if(before&&(gap>maxGap||gap<-.5))flush();
      run.push(slot);
    }
    flush();
  }
  return result;
}
