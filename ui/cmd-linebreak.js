/** CMD semantic model for conservatively flagged OCR word-splits. All offsets
 * refer to the one live CM6 Markdown document, never a shadow copy.
 * The annotation sits BEFORE the newline on the preceding text line, so it
 * does not split the paragraph or turn the next line into an HTML block.
 */
export const LINEBREAK_TAG='ocr2md:illegal-break';
const WORD=/^[A-Za-z]{2,60}$/;
const BAD_STRUCTURE=/^\s*(?:#{1,6}\s|[-*+]\s|\d{1,4}[.)]\s|>|\||!\[|\[\^|`{3,}|~{3,}|<!--|<\/?[a-z]|\$\$)/i;
const INLINE_STRUCTURE=/(?:`|\$|\[|\]|\(|\)|\{|\}|\||<|>|https?:\/\/|www\.|\\|\*\*|__)/i;
function textLines(source){
  let from=0;const rows=[];
  for(const raw of source.split('\n')){rows.push({from,to:from+raw.length,raw});from+=raw.length+1;}
  return rows;
}
function isSafeLine(text){
  if(!text.trim()||BAD_STRUCTURE.test(text)||INLINE_STRUCTURE.test(text))return false;
  if(/^\s{4,}/.test(text))return false;
  return true;
}
/** Only report a boundary when a joined dictionary word explains the error,
 * and at least one fragment isn't independently a valid word. Plain soft
 * wraps (even mid-sentence) MUST NOT be called illegal.
 */
export function detectIllegalBreaks(source,spell,{maxIssues=400,bodyEnd=source.length}={}){
  const rows=textLines(source),results=[];let fenced=null,truncated=false,inComment=false;
  for(let i=0;i<rows.length-1;i++){
    const line=rows[i],next=rows[i+1],text=line.raw,following=next.raw;
    if(line.to>=bodyEnd)break;
    const marker=/^\s{0,3}(`{3,}|~{3,})/.exec(text);
    if(marker){const chars=marker[1];
      if(!fenced)fenced={char:chars[0],length:chars.length};
      else if(fenced.char===chars[0]&&chars.length>=fenced.length)fenced=null;
      continue;
    }
    if(fenced)continue;
    if(text.includes('<!--'))inComment=true;
    if(inComment){if(text.includes('-->'))inComment=false;continue;}
    if(!isSafeLine(text)||!isSafeLine(following)||/[.!?:;。？！：；,，]\s*$/.test(text))continue;
    if(/\s{2,}$/.test(text)||/^\s/.test(following)||/^\s*\d/.test(following))continue;
    const left=/([A-Za-z]{2,60})(-?)$/.exec(text);
    const right=/^([a-z]{2,60})\b/.exec(following);
    if(!left||!right)continue;
    const a=left[1],b=right[1];
    if(!WORD.test(a)||!WORD.test(b))continue;
    const joined=a+b;
    if(!spell.correct(joined)||(!left[2]&&spell.correct(a)&&spell.correct(b)))continue;
    const reason=left[2]?'行末连字符疑似断词':'英文单词被换行拆开';
    if(results.length>=maxIssues){truncated=true;break;}
    results.push({from:line.to,to:line.to+1,line:i+1,left:a,right:b,joined,
      reason,context:`${text.slice(-90)} ↵ ${following.slice(0,90)}`});
  }
  return {issues:results,truncated};
}
function isValidAt(source,at,left,right){
  if(!Number.isInteger(at)||at<0||at>=source.length||source[at]!=='\n')return false;
  const before=source.slice(source.lastIndexOf('\n',at-1)+1,at)
    .replace(/<!--ocr2md:illegal-break[^\n]*?-->$/,'');
  const next=source.slice(at+1,source.indexOf('\n',at+1)<0?source.length:source.indexOf('\n',at+1));
  return (before.endsWith(left)||before.endsWith(left+'-'))&&
    next.startsWith(right)&&isSafeLine(next);
}
export function readIllegalBreaks(source,annotations){
  const rows=[];let stale=0;
  for(const tag of annotations){
    if(tag.tag!==LINEBREAK_TAG)continue;
    const {left='',right='',joined='',reason=''}=tag.attributes||{};
    if(!WORD.test(left)||!WORD.test(right)||joined!==left+right||
       !isValidAt(source,tag.to,left,right)){stale++;continue;}
    const from=tag.to,line=source.slice(0,from).split('\n').length;
    const start=source.lastIndexOf('\n',tag.from-1)+1;
    const end=source.indexOf('\n',from+1);
    rows.push({from,to:from+1,line,left,right,joined,
      reason:reason==='hyphen'?'行末连字符疑似断词':'英文单词被换行拆开',
      context:source.slice(start,end<0?source.length:end)
        .replace(/<!--ocr2md:illegal-break[^\n]*?-->/g,'').replace('\n',' ↵ ').slice(0,180),marked:true});
  }
  return {rows,stale,recordCount:rows.length+stale};
}
export function planIllegalBreakMarks(source,candidates,annotations){
  const existing=new Set(annotations.filter(x=>x.tag===LINEBREAK_TAG).map(x=>x.to));
  const seen=new Set(),operations=[];
  for(const row of candidates){
    if(!row||!WORD.test(row.left)||!WORD.test(row.right)||
       row.joined!==row.left+row.right||!isValidAt(source,row.from,row.left,row.right))
      throw Error('非法断行候选已变化，请重新扫描');
    if(existing.has(row.from)||seen.has(row.from))continue;
    seen.add(row.from);
    operations.push({action:'insert',at:row.from,tag:LINEBREAK_TAG,
      attributes:{v:'1',left:row.left,right:row.right,joined:row.joined,
        reason:row.reason==='行末连字符疑似断词'?'hyphen':'split'}});
  }
  return operations;
}
