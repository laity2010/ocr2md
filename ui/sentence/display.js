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
   const title='句界 · '+names.join(' / ')+' · MD '+((block.sourceFrom??block.from)+pos-block.from);
   panes.source.marks.push({pos,label:agreed?'│':'┆',style,title});
   for(const id of names)panes[id].marks.push({pos,label:'│',style,title});
  }
 }
 return panes;
}


// Pure review projection. The full source remains immutable; filtered views
// keep a source offset for each logical block and share one identical document.
export function isDisputed(row){
 const ids=['intl','sentence-splitter','wink-nlp'];
 const candidates=ids.map(id=>row.candidates.find(c=>c.engine===id));
 if(candidates.some(c=>!c||c.error))return false;
 const signatures=candidates.map(c=>JSON.stringify(c.units.map(u=>u.sourceRanges.at(-1)?.to)));
 return signatures.some(s=>s!==signatures[0]);
}
export function reviewProjection(snapshot,results,all,adopted){
 if(snapshot.documentVersion!==results.documentVersion)throw Error('Candidate source version mismatch');
 const rows=results.blocks;
 if(all)return {snapshot,results};
 let markdown='';const blocks=[],visibleRows=[];
 for(const [i,b] of snapshot.blocks.entries()){
  const row=rows[i];
  if(row?.logicalId!==b.logicalId||row.sourceSha256!==b.sha256)throw Error('Candidate block identity mismatch');
  if(!isDisputed(row)||adopted.has(b.logicalId))continue;
  if(markdown&&!markdown.endsWith('\n'))markdown+='\n\n';
  const from=markdown.length;markdown+=b.text;
  blocks.push({...b,sourceFrom:b.from,from,to:markdown.length});
  visibleRows.push(row);
 }
 return {snapshot:{...snapshot,markdown,blocks},results:{...results,blocks:visibleRows}};
}

// One existing candidate sentence at a source cursor. Preserve its exact
// Markdown substring, including protected material between source fragments.
export function sentenceAtOffset(block,candidate,offset,marks=[]){
 if(!candidate||candidate.error)return {text:'',marks:[],label:'分句失败'};
 const units=candidate.units;
 if(!units.length)return {text:'',marks:[],label:'无分句'};
 const local=Math.max(0,Math.min(block.text.length,offset-block.from));
 let index=units.findIndex(u=>u.sourceRanges.at(-1).to>local);
 if(index<0)index=units.length-1;
 const ranges=units[index].sourceRanges;
 const from=ranges[0].from,to=ranges.at(-1).to;
 return {text:block.text.slice(from,to),marks:marks.filter(m=>m.pos===block.from+to).map(m=>({...m,pos:to-from})),label:(index+1)+' / '+units.length+' 句'};
}
