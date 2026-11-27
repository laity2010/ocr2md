// Independent browser-side validation of the server's canonical template.
export function placeholderPrefix(raw){let p='⟦P';while(raw.includes(p))p+='_';return p;}
export function placeholder(raw,i){return placeholderPrefix(raw)+i+'⟧';}
export function template(raw,protectedRanges){
  let pos=0;const parts=[];
  for(const [i,p] of protectedRanges.entries()){
    if(!(pos<=p.from&&p.from<p.to&&p.to<=raw.length&&raw.slice(p.from,p.to)===p.text))throw Error('保护范围不一致');
    parts.push(raw.slice(pos,p.from),placeholder(raw,i));pos=p.to;
  }
  parts.push(raw.slice(pos));return parts.join('');
}
export function refill(text,raw,protectedRanges){
  const prefix=placeholderPrefix(raw),tokens=new Map(protectedRanges.map((p,i)=>[placeholder(raw,i),p.text])),seen=new Set();
  if(text.split(prefix).length-1!==tokens.size)throw Error('回填占位符数量错误');
  const result=text.replace(new RegExp(prefix+'[0-9]+⟧','g'),token=>{
    if(!tokens.has(token)||seen.has(token))throw Error('回填占位符未知或重复');
    seen.add(token);return tokens.get(token);
  });
  if(seen.size!==tokens.size)throw Error('回填占位符缺失或畸形');
  return result;
}
