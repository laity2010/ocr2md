/** Pure, read-only LaTeX scan. Offsets refer to original CMD Markdown.
 * Recognizes $$...$$, $...$, \\( ... \\), \\[ ... \\] and math/latex/tex fences.
 * HTML evidence, non-math fences, and inline code are excluded.
 */
const isEscaped=(s,i)=>{let n=0;while(i>0&&s[--i]==='\\')n++;return n%2===1;};
const emptyMask=s=>s.replace(/[^\n]/g,' ');
const LINE_FENCE=/^ {0,3}(`{3,}|~{3,})([^\n]*)$/;
const CLOSE_FENCE=mark=>new RegExp(`^ {0,3}${mark[0]==='`'?'`':'~'}{${mark.length},} *$`);

export function findLatex(source){
  if(typeof source!=='string')throw TypeError('Markdown must be a string');
  let masked=source;
  const found=[];
  const make=(from,to,content,kind,syntax,invalid='')=>{
    const line=source.slice(0,from).split('\n').length;
    found.push({id:String(from)+':'+String(to),from,to,line,kind,syntax,content,
      issue:invalid});
  };
  // Obsidian/MinerU evidence and HTML comments are not editable math.
  masked=masked.replace(/<!--[\s\S]*?(?:-->|$)/g,emptyMask);
  // Fenced math is an explicit display formula. Ordinary code is not math.
  const lines=source.split('\n'),prelines=masked.split('\n');
  let offset=0,opened=null;
  for(let n=0;n<lines.length;n++){
    const raw=lines[n],present=prelines[n];
    const fence=LINE_FENCE.exec(present);
    if(!opened){
      if(fence){
        const language=fence[2].trim().split(/\s+/)[0].toLowerCase();
        opened={mark:fence[1],start:offset,startLine:n,contentFrom:offset+raw.length+1,
          math:['math','latex','tex'].includes(language),syntax:'```'+language};
        prelines[n]=emptyMask(raw);
      }
    }else{
      prelines[n]=emptyMask(raw);
      if(CLOSE_FENCE(opened.mark).test(present)){
        if(opened.math){
          const formula=source.slice(opened.contentFrom,offset).replace(/\n$/,'');
          make(opened.start,offset+raw.length,formula,'独立',opened.syntax);
        }
        opened=null;
      }
    }
    offset+=raw.length+1;
  }
  if(opened?.math){
    make(opened.start,source.length,source.slice(opened.contentFrom).trimEnd(),
      '独立',opened.syntax,'缺少代码围栏结束标记');
  }
  masked=prelines.join('\n');
  // Keep the plain original source for matched LaTeX while masking inline code.
  // Matched backtick lengths must agree, as in CommonMark.
  masked=masked.replace(/(`+)([^`\n]|`(?!`))*?\1/g,emptyMask);
  // Also suppress unmatched inline ticks to end-of-line.
  masked=masked.replace(/`[^\n]*/g,emptyMask);
  const delimiters=[['$$','$$','独立'],['\\[','\\]','独立'],['\\(','\\)','行内'],['$','$','行内']];
  for(let i=0;i<masked.length;){
    let matched=null;
    for(const [open,close,kind] of delimiters){
      if(!masked.startsWith(open,i)||isEscaped(masked,i))continue;
      if(open==='$' && (masked.startsWith('$$',i)||masked[i+1]===' '))continue;
      matched={open,close,kind};break;
    }
    if(!matched){i++;continue;}
    const {open,close,kind}=matched;
    const from=i,body=i+open.length;
    let closing=-1,search=body;
    while(search<masked.length){
      const test=masked.indexOf(close,search);
      if(test<0)break;
      if(open==='$'&&masked.slice(body,test).includes('\n'))break;
      if(!isEscaped(masked,test)&&!(open==='$'&&masked[test+1]==='$')){closing=test;break;}
      search=test+1;
    }
    if(closing<0){
      // MinerU/plain-text escaped square brackets may be written as
      // \[ordinary text]. They are not display math opening delimiters.
      if(open==='\\['){
        const lineEnd=source.indexOf('\n',body);
        const line=source.slice(body,lineEnd<0?source.length:lineEnd);
        const bracket=line.indexOf(']');
        if(bracket>=0 && bracket<=160 &&
           /^[^\\=+_^{}\n]+$/.test(line.slice(0,bracket))){i=body;continue;}
      }
      // Bare $ is usually monetary, not a math delimiter; avoid false errors.
      if(open!=='$'){
        const to=open==='\\('?source.indexOf('\n',body):source.length;
        const stop=to<0?source.length:to;
        make(from,stop,source.slice(body,stop),'',open,'缺少公式结束定界符');
      }
      i=body;continue;
    }
    const value=source.slice(body,closing),to=closing+close.length;
    const noSpace=value.trim()===value && value.length>0;
    // $3,685 and $100 are amounts. Valid inline math must not be pure currency.
    const isMoney=open==='$' && /^\d[\d,.]*(?:\s*(?:USD|元|美元))?$/.test(value);
    if(noSpace&&!isMoney)make(from,to,value,kind,open);
    i=to;
  }
  return found.sort((a,b)=>a.from-b.from);
}
