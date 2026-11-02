/** CMD semantic model for conservatively flagged OCR word-splits. All offsets
 * refer to the one live CM6 Markdown document, never a shadow copy.
 * The annotation sits BEFORE the newline on the preceding text line, so it
 * does not split the paragraph or turn the next line into an HTML block.
 */
import {blockAnchor} from './mineru-anchors.js';
export const LINEBREAK_TAG='ocr2md:illegal-break';
const WORD=/^[A-Za-z]{2,60}$/;
const BAD_STRUCTURE=/^\s*(?:#{1,6}\s|[-*+]\s|\d{1,4}[.)]\s|>|\||!\[|\[\^|`{3,}|~{3,}|<!--|<\/?[a-z]|\$\$)/i;
const INLINE_STRUCTURE=/(?:`|\$|\[|\]|\(|\)|\{|\}|\||<|>|https?:\/\/|www\.|\\|\*\*|__)/i;
function textLines(source){
  let from=0;const rows=[];
  for(const raw of source.split('\n')){rows.push({from,to:from+raw.length,raw});from+=raw.length+1;}
  return rows;
}
// Only grammatical tail fragments with a following same-page, consecutive
// MinerU OCR block qualify: no punctuation alone is not sufficient evidence.
const CONTINUATION_TAILS=new Set([
  'about','of','to','for','with','by','from','than','between','under','over','into',
  'through','toward','towards','upon','because','while','although','including',
  'the','an','a','its','their','our','his','her','whose','and','or','but',
  // An unfinished adjective before an alphanumeric filing/code identifier.
  'latest','previous','following','current','next','last',
]);
const MARKER_SUFFIX=/<!--ocr2md:illegal-break[^\n]*?-->$/;
const BLOCK_RIGHT=/^(?:[a-z]{2,60}|[0-9]{1,5}[A-Za-z]{1,6}|[0-9]{1,5}(?:[.,][0-9]+)?)$/;
const OPENING_TOKEN=/^([a-z]{2,60}|[0-9]{1,5}[A-Za-z]{1,6}|[0-9]{1,5}(?:[.,][0-9]+)?)(?=\b|\s|[,.;:!?])/;
function textWithoutMarker(line){return line.replace(MARKER_SUFFIX,'');}
function blockContinuation(rows,i,previousAnchor,bodyEnd){
  const current=rows[i];
  if(!previousAnchor||current.to>=bodyEnd)return null;
  const before=textWithoutMarker(current.raw);
  // Do not reject the *entire* OCR block because its earlier sentences
  // contain valid inline LaTeX/HTML markup. Only the actual break vicinity
  // and the Markdown block boundary determine whether it is safe to mark.
  if(!before.trim()||BAD_STRUCTURE.test(before)||/^\s{4,}/.test(before)||
     !isSafeLine(before.slice(-100))||
     /[.!?;:。！？；：]\s*$/.test(before)||/\s{2,}$/.test(before))return null;
  const trailing=/([A-Za-z]{2,45})$/.exec(before);
  if(!trailing||!CONTINUATION_TAILS.has(trailing[1].toLowerCase()))return null;
  let n=i+1;
  if(rows[n]?.raw==='')n++;
  const anchor=rows[n]&&blockAnchor(rows[n].raw);
  if(!anchor||anchor.pageIndex!==previousAnchor.pageIndex||
     anchor.blockIndex!==previousAnchor.blockIndex+1)return null;
  n++;
  if(rows[n]?.raw==='')n++;
  const next=rows[n];
  if(!next||next.from>=bodyEnd||!next.raw||!isSafeLine(next.raw.slice(0,95))||
     BAD_STRUCTURE.test(next.raw)||/^\s/.test(next.raw))return null;
  const first=OPENING_TOKEN.exec(next.raw);
  if(!first)return null;
  const left=trailing[1],right=first[1];
  return {from:current.to,to:current.to+1,line:i+1,left,right,joined:left+' '+right,
    reason:'相邻 MinerU 文本块疑似句子断行',
    context:before.slice(-100)+' ↵ [MinerU '+previousAnchor.pageIndex+':'+
      anchor.blockIndex+'] ↵ '+next.raw.slice(0,100)};
}
function readBlockContinuation(source,at,left,right){
  if(source[at]!=='\n')return null;
  const before=textWithoutMarker(source.slice(source.lastIndexOf('\n',at-1)+1,at));
  if(!before.endsWith(left))return null;
  // Both legacy MinerU and canonical CMD PBS anchors are supported.
  // Reject an intervening non-parent line as a source of a forged identity.
  const previous=[...source.slice(0,at).split('\n')].reverse()
    .map(blockAnchor).find(Boolean);
  if(!previous)return null;
  const lines=source.slice(at+1).split('\n',7);
  let n=0;
  if(lines[n]==='')n++;
  const anchor=blockAnchor(lines[n]||'');
  if(!anchor||anchor.pageIndex!==previous.pageIndex||
     anchor.blockIndex!==previous.blockIndex+1)return null;
  n++;
  if(lines[n]==='')n++;
  const next=lines[n]||'';
  const token=OPENING_TOKEN.exec(next);
  if(!token||token[1]!==right||!isSafeLine(next.slice(0,95))||BAD_STRUCTURE.test(next))return null;
  return {context:before.slice(-100)+' ↵ [MinerU '+anchor.pageIndex+':'+
    anchor.blockIndex+'] ↵ '+next.slice(0,100)};
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
  let previousAnchor=null;
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
    const currentAnchor=blockAnchor(text);
    if(currentAnchor){previousAnchor=currentAnchor;continue;}
    // Record explicit OCR block continuation even when the next text starts
    // with a number and blank/provenance lines separate the two fragments.
    const bridge=blockContinuation(rows,i,previousAnchor,bodyEnd);
    if(bridge){
      if(results.length>=maxIssues){truncated=true;break;}
      results.push(bridge);
    }
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
    const isBlock=reason==='block';
    if(!WORD.test(left)||!(isBlock?BLOCK_RIGHT.test(right):WORD.test(right))||
      joined!==(isBlock?left+' '+right:left+right)||
      !(isBlock?readBlockContinuation(source,tag.to,left,right):isValidAt(source,tag.to,left,right))){stale++;continue;}
    const from=tag.to,line=source.slice(0,from).split('\n').length;
    const start=source.lastIndexOf('\n',tag.from-1)+1;
    const end=source.indexOf('\n',from+1);
    rows.push({from,to:from+1,line,left,right,joined,
      reason:isBlock?'相邻 MinerU 文本块疑似句子断行':reason==='hyphen'?'行末连字符疑似断词':'英文单词被换行拆开',
      context:isBlock?readBlockContinuation(source,tag.to,left,right).context:
        source.slice(start,end<0?source.length:end)
          .replace(/<!--ocr2md:illegal-break[^\n]*?-->/g,'').replace('\n',' ↵ ').slice(0,180),marked:true});
  }
  return {rows,stale,recordCount:rows.length+stale};
}
export function planIllegalBreakMarks(source,candidates,annotations){
  const existing=new Set(annotations.filter(x=>x.tag===LINEBREAK_TAG).map(x=>x.to));
  const seen=new Set(),operations=[];
  for(const row of candidates){
    const isBlock=row?.reason==='相邻 MinerU 文本块疑似句子断行';
    if(!row||!WORD.test(row.left)||
       !(isBlock?BLOCK_RIGHT.test(row.right):WORD.test(row.right))||
       row.joined!==(isBlock?row.left+' '+row.right:row.left+row.right)||
       !(isBlock?readBlockContinuation(source,row.from,row.left,row.right):
         isValidAt(source,row.from,row.left,row.right)))
      throw Error('非法断行候选已变化，请重新扫描');
    if(existing.has(row.from)||seen.has(row.from))continue;
    seen.add(row.from);
    operations.push({action:'insert',at:row.from,tag:LINEBREAK_TAG,
      attributes:{v:'1',left:row.left,right:row.right,joined:row.joined,
        reason:isBlock?'block':row.reason==='行末连字符疑似断词'?'hyphen':'split'}});
  }
  return operations;
}
