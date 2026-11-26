/** Read-only display projection; neither source nor candidate is mutated. */
export function lineAtOffset(lines,offset){
 if(!lines.length||!Number.isInteger(offset)||offset<0||offset>lines.at(-1).to||(offset===lines.at(-1).to&&lines.at(-1).eol))return null;
 let lo=0,hi=lines.length;
 while(lo<hi){const mid=(lo+hi)>>>1;if(lines[mid].from<=offset)lo=mid+1;else hi=mid;}
 return lines[Math.max(0,lo-1)];
}

/** The original Sentence Lab boundary union, mapped to V2's immutable UTF-16 source.
 * The end of the final source fragment defines a sentence boundary, just as
 * the original benchmark's sentences[].fragments.at(-1).to did. */
export function boundaryDisplay(snapshot,results){
 const ids=['intl','sentence-splitter','wink-nlp'];
 if(snapshot.documentVersion!==results.documentVersion)throw Error('Candidate source version mismatch');
 const panes=Object.fromEntries(['source',...ids].map(id=>[id,{marks:[],count:0,failed:0}]));
 for(const [i,line] of snapshot.lines.entries()){
  const row=results.lines[i];
  if(row?.sourceLine!==line.sourceLine||row.sourceSha256!==line.sha256)throw Error('Candidate line identity mismatch');
  const byPos=new Map();
  for(const id of ids){
   const candidate=row.candidates.find(c=>c.engine===id);
   if(!candidate||candidate.error){panes[id].failed++;continue;}
   const ends=candidate.boundaries??candidate.units.map(u=>u.sourceRanges.at(-1)?.to);
   panes[id].count+=candidate.boundaries?(ends.length?ends.length+1:0):candidate.units.length;
   for(const end of ends){
    if(!Number.isInteger(end)||end<=0||end>line.text.length)throw Error('Invalid sentence boundary');
    const pos=line.from+end;
    if(!byPos.has(pos))byPos.set(pos,new Set());
    byPos.get(pos).add(id);
   }
  }
  for(const [pos,votes] of byPos){
   const agreed=ids.every(id=>votes.has(id)),style=agreed?'ocr-sb-agreed':'ocr-sb-split';
   const names=ids.filter(id=>votes.has(id));
   const title='句界 · '+names.join(' / ')+' · MD '+((line.sourceFrom??line.from)+pos-line.from);
   panes.source.marks.push({pos,label:agreed?'│':'┆',style,title});
   for(const id of names)panes[id].marks.push({pos,label:'│',style,title});
  }
 }
 return panes;
}


// Pure review projection. The full source remains immutable; filtered views
// keep a source offset for each logical line and share one identical document.
export function isDisputed(row){
 if(row.reviewState)return ['disputed','adopted'].includes(row.reviewState);
 const ids=['intl','sentence-splitter','wink-nlp'];
 const candidates=ids.map(id=>row.candidates.find(c=>c.engine===id));
 if(candidates.some(c=>!c||c.error))return false;
 const signatures=candidates.map(c=>JSON.stringify(c.units.map(u=>u.sourceRanges.at(-1)?.to)));
 return signatures.some(s=>s!==signatures[0]);
}
export function reviewProjection(snapshot,results,all,adopted){
 if(snapshot.documentVersion!==results.documentVersion)throw Error('Candidate source version mismatch');
 const rows=results.lines;
 if(all)return {snapshot,results};
 let markdown='';const lines=[],visibleRows=[];
 for(const [i,b] of snapshot.lines.entries()){
  const row=rows[i];
  if(row?.sourceLine!==b.sourceLine||row.sourceSha256!==b.sha256)throw Error('Candidate line identity mismatch');
  if(!isDisputed(row)||adopted.has(b.sourceLine))continue;
  const from=markdown.length;markdown+=b.text+b.eol;
  lines.push({...b,sourceFrom:b.from,from,textTo:from+b.text.length,to:markdown.length});
  visibleRows.push(row);
 }
 return {snapshot:{...snapshot,markdown,lines},results:{...results,lines:visibleRows}};
}

// Project all boundaries of the focused logical line to local CM6 offsets.
// Keep original Markdown, including protected material, without re-splitting.
export function lineCandidateDisplay(line,candidate,marks=[]){
 if(!candidate||candidate.error)return {text:'',marks:[],label:'分句失败'};
 const end=line.from+line.text.length;
 return {text:line.text,marks:marks.filter(m=>m.pos>line.from&&m.pos<=end).map(m=>({...m,pos:m.pos-line.from})),
  label:candidate.boundaries?(candidate.boundaries.length?(candidate.boundaries.length+1)+' 句':'无分句'):(candidate.units.length?candidate.units.length+' 句':'无分句')};
}
