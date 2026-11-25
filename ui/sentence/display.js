/** Read-only display projection; neither source nor candidate is mutated. */
export function blockAtOffset(blocks,offset){
 if(!blocks.length)return null;
 let lo=0,hi=blocks.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(blocks[mid].from<=offset)lo=mid+1;else hi=mid;}
 return blocks[Math.max(0,lo-1)];
}

/** The original Sentence Lab boundary union, mapped to V2's immutable UTF-16 source.
 * The end of the final source fragment defines a sentence boundary, just as
 * the original benchmark's sentences[].fragments.at(-1).to did. */
export function boundaryDisplay(snapshot,results){
 const ids=['intl','sentence-splitter','wink-nlp'];
 if(snapshot.documentVersion!==results.documentVersion)throw Error('Candidate source version mismatch');
 const panes=Object.fromEntries(['source',...ids].map(id=>[id,{marks:[],count:0,failed:0}]));
 for(const [i,block] of snapshot.blocks.entries()){
  const row=results.blocks[i];
  if(row?.logicalId!==block.logicalId||row.sourceSha256!==block.sha256)throw Error('Candidate block identity mismatch');
  const byPos=new Map();
  for(const id of ids){
   const candidate=row.candidates.find(c=>c.engine===id);
   if(!candidate||candidate.error){panes[id].failed++;continue;}
   panes[id].count+=candidate.units.length;
   for(const unit of candidate.units){
    const end=unit.sourceRanges.at(-1)?.to;
    if(!Number.isInteger(end)||end<=0||end>block.text.length)throw Error('Invalid sentence boundary');
    const pos=block.from+end;
    if(!byPos.has(pos))byPos.set(pos,new Set());
    byPos.get(pos).add(id);
   }
  }
  for(const [pos,votes] of byPos){
   const agreed=ids.every(id=>votes.has(id)),style=agreed?'ocr-sb-agreed':'ocr-sb-split';
   const names=ids.filter(id=>votes.has(id));
   const title='句界 · '+names.join(' / ')+' · MD '+pos;
   panes.source.marks.push({pos,label:agreed?'│':'┆',style,title});
   for(const id of names)panes[id].marks.push({pos,label:'│',style,title});
  }
 }
 return panes;
}
