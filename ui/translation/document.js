/** Read-only coordinate index. RAW is the sole text source, including blank LF. */
const require=(ok,message)=>{if(!ok)throw Error(message);};
export function createReadingDocument(table,{pending=false}={}){
  if(!table)return null;
  const parts=[],ranges=[],sentences=[],byKey=new Map(),lineStarts=[0];let from=0,line=1;
  for(const row of table.rows){
    require(row.source_line===line,'MDLine 物理坐标不一致');
    const include=!pending||row.translatable;
    // Preserve original physical line numbers in the reading-only projection.
    // An omitted sentence contributes only its original LF separators.
    const visible=include?row.raw:row.raw.replace(/[^\n]/g,'');
    const to=from+visible.length,key=row.source_line+':'+row.sentence_index;
    require(!byKey.has(key),'重复原句身份');
    const entry=Object.freeze({key,from,to,line:row.source_line,index:row.sentence_index});
    if(include){byKey.set(key,entry);sentences.push(entry);}
    parts.push(visible);
    let previous=0;
    for(const span of row.protected){
      require(span.from>=previous&&span.to>span.from&&span.to<=row.raw.length&&row.raw.slice(span.from,span.to)===span.text,'保护范围不一致');
      if(include)ranges.push(Object.freeze({from:from+span.from,to:from+span.to,kind:span.kind,text:span.text}));previous=span.to;
    }
    for(let n=0;n<visible.length;n++){
      if(visible[n]==='\n'){line++;lineStarts.push(from+n+1);}
    }
    from=to;
  }
  const text=parts.join('');
  function atOffset(offset){
    if(!Number.isInteger(offset)||offset<0||offset>text.length||!sentences.length)return null;
    let lo=0,hi=sentences.length;
    while(lo<hi){const mid=(lo+hi)>>1;if(sentences[mid].from<=offset)lo=mid+1;else hi=mid;}
    const row=sentences[Math.max(0,lo-1)];
    if(pending&&(offset<row.from||offset>=row.to&&!(offset===text.length&&offset===row.to)))return null;
    return row;
  }
  function lineOffset(number){return number>lineStarts.length?text.length:lineStarts[Math.max(0,number-1)]??0;}
  return Object.freeze({text,ranges:Object.freeze(ranges),sentences:Object.freeze(sentences),lineStarts:Object.freeze(lineStarts),atOffset,lineOffset,byKey:key=>byKey.get(key)??null});
}
