/** Read-only coordinate index. RAW is the sole text source, including blank LF. */
const require=(ok,message)=>{if(!ok)throw Error(message);};
export function createReadingDocument(original,preparation=null){
  if(!original)return null;
  require(!preparation||(preparation.source_document_hash===original.source_document_hash&&preparation.sentence_sha256===original.sentence_sha256&&preparation.rows.length===original.rows.length),'保护来源不一致');
  const parts=[],ranges=[],sentences=[],byKey=new Map(),lineStarts=[0];let from=0,line=1,column=0;
  for(const [i,row] of original.rows.entries()){
    require(row.source_line===line&&row.from_utf16===column,'MDLine 物理坐标不一致');
    const to=from+row.raw.length,key=row.source_line+':'+row.sentence_index;
    require(!byKey.has(key),'重复原句身份');
    const entry=Object.freeze({key,from,to,line:row.source_line,index:row.sentence_index});
    byKey.set(key,entry);sentences.push(entry);parts.push(row.raw);
    if(preparation){
      const p=preparation.rows[i];
      require(p.raw===row.raw&&p.source_line===row.source_line&&p.sentence_index===row.sentence_index,'保护原句身份不一致');
      let previous=0;
      for(const span of p.protected){
        require(span.from>=previous&&span.to>span.from&&span.to<=row.raw.length&&row.raw.slice(span.from,span.to)===span.text,'保护范围不一致');
        ranges.push(Object.freeze({from:from+span.from,to:from+span.to,kind:span.kind,text:span.text}));previous=span.to;
      }
    }
    for(let n=0;n<row.raw.length;n++){
      if(row.raw[n]==='\n'){line++;column=0;lineStarts.push(from+n+1);}
      else column++;
    }
    from=to;
  }
  const text=parts.join('');
  function atOffset(offset){
    if(!Number.isInteger(offset)||offset<0||offset>text.length||!sentences.length)return null;
    let lo=0,hi=sentences.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(sentences[mid].from<=offset)lo=mid+1;else hi=mid;}
    return sentences[Math.max(0,lo-1)];
  }
  function lineOffset(number){return number>lineStarts.length?text.length:lineStarts[Math.max(0,number-1)]??0;}
  return Object.freeze({text,ranges:Object.freeze(ranges),sentences:Object.freeze(sentences),lineStarts:Object.freeze(lineStarts),atOffset,lineOffset,byKey:key=>byKey.get(key)??null});
}
