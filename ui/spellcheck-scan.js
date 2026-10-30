/** Pure English word extraction from readable Markdown; every offset maps to CMD.
 * Skip fenced code, inline code/math, HTML/CMD/MinerU evidence, and URLs.
 */
export function spellcheckTokens(source){
  const words=[];
  let offset=0,inComment=false,inFence=null,inMath=false;
  const lines=source.split('\n');
  for(const line of lines){
    const fence=/^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if(fence){
      const marker=fence[1];
      if(!inFence)inFence={char:marker[0],length:marker.length};
      else if(marker[0]===inFence.char&&marker.length>=inFence.length&&
        line.slice(fence[0].length).trim()==='')inFence=null;
      offset+=line.length+1;continue;
    }
    if(inFence){offset+=line.length+1;continue;}
    const visible=[...line];
    const mask=(from,to)=>{for(let i=from;i<to;i++)visible[i]=' ';};
    // Exact offsets are retained: never transform Markdown characters.
    for(let i=0;i<line.length;){
      if(inComment){
        const end=line.indexOf('-->',i);if(end<0){mask(i,line.length);break;}
        mask(i,end+3);i=end+3;inComment=false;continue;
      }
      if(line.startsWith('<!--',i)){inComment=true;continue;}
      if(line.startsWith('![',i)||line.startsWith('[[',i)||line.startsWith('![[' ,i)){
        const end=line.indexOf(line.startsWith('![[' ,i)?']]':line.startsWith('![',i)?']':']]',i+2);
        if(end>=0){mask(i,end+2);i=end+2;continue;}
      }
      if(line[i]==='`'){
        const begin=i;while(line[i]==='`')i++;
        const sequence='`'.repeat(i-begin),end=line.indexOf(sequence,i);
        if(end>=0){mask(begin,end+sequence.length);i=end+sequence.length;continue;}
      }
      if(line[i]==='$'){
        const delim=line[i+1]==='$'?'$$':'$';const start=i;
        if(inMath){mask(start,start+delim.length);inMath=false;i+=delim.length;continue;}
        const end=line.indexOf(delim,i+delim.length);
        if(end>=0){mask(start,end+delim.length);i=end+delim.length;continue;}
        if(delim==='$$'){inMath=true;mask(start,line.length);break;}
      }
      if(line[i]==='<'){
        const end=line.indexOf('>',i+1);if(end>=0){mask(i,end+1);i=end+1;continue;}
      }
      i++;
    }
    const plain=visible.join('');
    // Ignore links, Markdown targets, file paths, and bare protocol/hostname tokens.
    for(const match of plain.matchAll(/(?:https?:\/\/|www\.)\S+|\]\([^\s)]+\)|\b[\w.-]+\.(?:png|jpg|jpeg|svg|pdf|md|json|js|py)\b/gi))
      mask(match.index,match.index+match[0].length);
    const readable=visible.join('');
    for(const m of readable.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)){
      const word=m[0],at=m.index;
      if(word.length<2||/^[A-Z]{2,}$/.test(word))continue;
      // Skip words forming mixed identifiers (e.g. foo_bar, className, version1).
      if(/[\w/\\.-]/.test(line[at-1]||'') || /[\w/\\.-]/.test(line[at+word.length]||''))continue;
      words.push({word,from:offset+at,to:offset+at+word.length});
    }
    offset+=line.length+1;
  }
  return words;
}
export function spellcheckIssues(source,spell,{maxIssues=800}={}){
  const issues=[];let truncated=false;
  const suggestionCache=new Map();
  for(const token of spellcheckTokens(source)){
    if(spell.correct(token.word))continue;
    if(issues.length>=maxIssues){truncated=true;break;}
    const key=token.word.toLowerCase();
    if(!suggestionCache.has(key))suggestionCache.set(key,spell.suggest(token.word).slice(0,3));
    issues.push({...token,suggestions:suggestionCache.get(key)});
  }
  return {issues,truncated};
}
