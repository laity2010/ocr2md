/** Read-only display projection; neither source nor candidate is mutated. */
export function blockAtOffset(blocks,offset){
 if(!blocks.length)return null;
 let lo=0,hi=blocks.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(blocks[mid].from<=offset)lo=mid+1;else hi=mid;}
 return blocks[Math.max(0,lo-1)];
}
export function candidateDisplay(block,candidate){
 const marks=[];
 if(candidate&&!candidate.error){
  for(const [index,unit] of candidate.units.entries()){
   // Include inter-word whitespace, but leave protected raw fragments uncolored.
   for(const {from,to} of unit.sourceRanges){
    const last=marks.at(-1);
    if(last?.unit===index&&/^\s*$/u.test(block.text.slice(last.to,from)))last.to=to;
    else marks.push({from,to,unit:index,className:index%2?'sentence-unit-odd':'sentence-unit-even'});
   }
  }
 }
 return {text:block.text,marks,label:candidate?.error?'分句失败':candidate?candidate.units.length+' 句':'未分句'};
}
