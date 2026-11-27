/** Read-only sentence projection of the actual AI input, never a new authority. */
import {placeholder,template,refill} from './refill.js';
export function createComparisonDocument(rows){
  const parts=[],ranges=[],sentences=[],byKey=new Map();let from=0;
  for(const row of rows){
    if(!row.translatable)continue;
    if(template(row.raw,row.protected)!==row.text||refill(row.text,row.raw,row.protected)!==row.raw)throw Error('待译句回填不一致');
    const key=row.source_line+':'+row.sentence_index;
    if(byKey.has(key))throw Error('重复待译句身份');
    const to=from+row.text.length;
    const entry=Object.freeze({key,from,to,line:row.source_line,index:row.sentence_index});
    byKey.set(key,entry);sentences.push(entry);parts.push(row.text);
    let start=0;
    for(const [i,p] of row.protected.entries()){
      const token=placeholder(row.raw,i),offset=row.text.indexOf(token,start);
      if(offset<0)throw Error('回填占位符缺失');
      ranges.push(Object.freeze({from:from+offset,to:from+offset+token.length,kind:p.kind,text:token}));
      start=offset+token.length;
    }
    // UI-only sentence separator; never stored in the translation table.
    from=to+1;
  }
  const text=parts.join('\n');
  function atOffset(offset){
    if(!Number.isInteger(offset)||offset<0||offset>text.length||!sentences.length)return null;
    let lo=0,hi=sentences.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(sentences[mid].from<=offset)lo=mid+1;else hi=mid;}
    return sentences[Math.max(0,lo-1)];
  }
  return Object.freeze({text,ranges:Object.freeze(ranges),sentences:Object.freeze(sentences),atOffset,byKey:key=>byKey.get(key)??null});
}
