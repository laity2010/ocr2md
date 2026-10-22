/** Read-only recovery of likely undelimited MinerU inline equations.
 * Only syntax-like fragments are returned; an inferred boundary is not proof
 * of correct TeX or even of an intended complete equation.
 */
const triggers=/\\(?:mathsf|mathrm|mathcal|mathord|pmb|sigma|beta|alpha|gamma|Delta|varepsilon|frac|left|text|dot|tau)\b|[rw]\s*\\_\s*\{/g;
const afterCommand=/\\(?:[a-zA-Z]+|[^\s])/y;
function braced(text,pos){
  if(text[pos]!=='{')return pos;
  let depth=0;
  for(let i=pos;i<text.length;i++){
    if(text[i]==='{')depth++;
    if(text[i]==='}'&&--depth===0)return i+1;
  }
  return pos;
}
function scanEnd(line,at){
  let pos=at,consumed=false,last=at;
  while(pos<line.length){
    const ch=line[pos];
    if(/\s/.test(ch)){
      let end=pos;while(end<line.length&&/\s/.test(line[end]))end++;
      // A math expression may have spaces before commands, operators or
      // decorations, but it never consumes the following prose sentence.
      if(!/^[\\{}_^+*/=()\[\]\d-]/.test(line.slice(end)) &&
         !/^[A-Za-z](?=\s*[\\_^{}])/.test(line.slice(end)))break;
      pos=end;continue;
    }
    if(ch==='\\'){
      afterCommand.lastIndex=pos;
      const match=afterCommand.exec(line);
      if(!match || /^\\(?:<|>|\[|\])/.test(match[0]))break;
      pos=afterCommand.lastIndex;last=pos;consumed=true;continue;
    }
    if(ch==='{'){
      const end=braced(line,pos);
      if(end===pos)break;
      pos=end;last=pos;consumed=true;continue;
    }
    if(ch==='}'||ch===','||ch===';'||ch===':'||ch==='.' )break;
    if(/[\^_+*/=()\[\]-]/.test(ch)){
      pos++;last=pos;consumed=true;continue;
    }
    const atom=/^[A-Za-z0-9]+/.exec(line.slice(pos));
    if(atom){
      // Outside braces a multiletter English word is not part of TeX.
      if(atom[0].length>1)break;
      pos+=atom[0].length;last=pos;consumed=true;continue;
    }
    break;
  }
  return consumed?last:at;
}
export function findUndelimitedInline(source,masked,occupied=[]){
  const result=[];
  let fromLine=0;
  for(const line of source.split('\n')){
    const maskLine=masked.slice(fromLine,fromLine+line.length);
    triggers.lastIndex=0;
    let match;
    let previousEnd=0;
    while((match=triggers.exec(line))!==null){
      const anchor=match.index;
      if(anchor<previousEnd||maskLine.slice(anchor,anchor+match[0].length).trim()==='')continue;
      const initial=match[0].match(/^[rw]\s*\\_/)?anchor:anchor;
      let start=initial;
      // Include braces directly enclosing a mathematical expression.
      while(start>0&&/[ \t]/.test(line[start-1]))start--;
      if(start>0&&line[start-1]==='{')start--;
      else start=initial;
      const end=scanEnd(line,start);
      if(end<=anchor+1)continue;
      if(occupied.some(r=>fromLine+start<r.to&&fromLine+end>r.from))continue;
      const content=line.slice(start,end).trim();
      if(content.length<3)continue;
      result.push({id:`${fromLine+start}:${fromLine+end}`,from:fromLine+start,
        to:fromLine+end,kind:'行内',syntax:'未定界',content,
        issue:'无公式定界符：请与原 PDF 核对范围及 OCR 内容',
        detection:'inferred'});
      previousEnd=end;
    }
    fromLine+=line.length+1;
  }
  return result;
}
