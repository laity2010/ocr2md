/** CMD semantic model for conservatively flagged OCR word-splits. All offsets
 * refer to the one live CM6 Markdown document, never a shadow copy.
 * The annotation sits BEFORE the newline on the preceding text line, so it
 * does not split the paragraph or turn the next line into an HTML block.
 */
import {blockAnchor} from './mineru-anchors.js';
import {readCMDBlockChains,parseCMDPBSId} from './cmd-block-chains.js';
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
// Current CMD p/b/s tags, not physical OCR discovery order, define the
// editable review scope. A moved p13b1s3 (origin=p13b0) still belongs to
// logical p13b1, while its original PDF bbox remains untouched.
function currentPBSScope(source,bodyEnd){
  if(!source.includes('<!-- cmd:block:v1 '))return null; // legacy input
  const model=readCMDBlockChains(source);
  if(model.invalid.length)throw Error('CMD 文本块标签无效，停止断行扫描');
  const atoms=model.atoms.filter(a=>a.format==='cmd-v1'&&a.from<bodyEnd);
  return atoms.map((atom,index)=>{
    const identity=parseCMDPBSId(atom.id),scopeStart=atom.from+atom.rawLine.length;
    const next=Math.min(bodyEnd,atoms[index+1]?.from??bodyEnd);
    // The final text block of a PDF page is followed by MANY lines of
    // sealed page/discarded JSON evidence. Those must not inherit the last
    // child ID, or a phantom OCR sentence will appear in AG.
    const meta=/^<!-- (?:minerujson:(?:page|discarded|source)|cmd:(?:pbs-locations|pdf-bbox|absorbed-parent)):v1/gm;
    const match=meta.exec(source.slice(scopeStart,next));
    const scopeEnd=match?scopeStart+match.index:next;
    return {...atom,identity,scopeStart,scopeEnd,
      parentId:`p${identity.p}b${identity.b}`};
  });
}
function withinScopeRows(rows,scopes){
  if(!scopes)return null;
  const result=[];let i=0;
  for(const row of rows){
    while(i+1<scopes.length&&scopes[i+1].from<=row.from)i++;
    const current=scopes[i];
    result.push(current&&row.from>=current.scopeStart&&row.to<=current.scopeEnd?
      current:null);
  }
  return result;
}
function terminalLine(slice,first){
  let pos=0,found=null;
  for(const line of slice.split('\n')){
    if(line.trim()){
      // Metadata and Markdown structures cannot be silently skipped to
      // fabricate a prose connection between semantically unrelated nodes.
      // A long OCR paragraph can contain legitimate inline footnotes or
      // LaTeX far from the seam (p6b6s1 ends with \<sup>7\</sup>).
      // Inspect the prose boundary, not the ENTIRE block line; still reject
      // a structural Markdown/table/HTML line by its actual line prefix.
      const boundary=first?line.slice(0,110):textWithoutMarker(line).slice(-110);
      if(BAD_STRUCTURE.test(line)||!isSafeLine(boundary))return first?null:
        {raw:line,from:pos,to:pos+line.length,unsafe:true};
      found={raw:line,from:pos,to:pos+line.length};
      if(first)return found;
    }
    pos+=line.length+1;
  }
  return found;
}
/** A blank Markdown line INSIDE one current CMD child creates a hard
 * paragraph boundary, unlike an ordinary soft line wrap. Only an unfinished
 * preceding sentence followed by lowercase prose is suspicious; report for
 * human review, not a source edit. */
function childParagraphBreakCandidates(source,scopes,maxIssues){
  const issues=[];
  for(const scope of scopes){
    if(!scope.identity.s.length||scope.scopeEnd<=scope.scopeStart)continue;
    const lines=textLines(source.slice(scope.scopeStart,scope.scopeEnd));
    for(let i=0;i<lines.length-2;i++){
      if(issues.length>=maxIssues)return issues;
      const a=lines[i],blank=lines[i+1];
      if(blank.raw.trim()||!a.raw.trim())continue;
      let n=i+2;
      while(n<lines.length&&!lines[n].raw.trim())n++;
      if(n>=lines.length)continue;
      const b=lines[n],before=textWithoutMarker(a.raw),next=b.raw;
      if(!isSafeLine(before)||!isSafeLine(next)||/^\s/.test(next)||
         /[.!?;:。！？；：,，]\s*$/.test(before)||/\s{2,}$/.test(before))continue;
      const left=/([A-Za-z]{2,45})$/.exec(before);
      const right=/^([a-z]{2,60})\b/.exec(next);
      if(!left||!right)continue;
      const from=scope.scopeStart+a.to;
      if(source[from]!=='\n')continue;
      issues.push({from,to:from+1,line:source.slice(0,from).split('\n').length,
        left:left[1],right:right[1],joined:left[1]+' '+right[1],
        reason:'子块内疑似硬段落断行',blockId:scope.id,parentId:scope.parentId,
        nextBlockId:null,scopeLabel:'子块内',reviewOnly:true,
        context:`${scope.id} ${before.slice(-90)} ↵ [空行] ↵ ${next.slice(0,90)}`});
    }
  }
  return issues;
}
/** OCR often flattens a line-break hyphen into "lever- age" or
 * "insur- ance" inside ONE logical child. This is not a source newline,
 * so it must not use the CMD newline annotation API. Review-only.
 */
function hyphenSpaceCandidates(source,spell,scopes,maxIssues){
  const results=[];
  for(const scope of scopes){
    if(results.length>=maxIssues)break;
    if(!scope.identity.s.length||scope.scopeEnd<=scope.scopeStart)continue;
    const prose=source.slice(scope.scopeStart,scope.scopeEnd);
    for(const line of textLines(prose)){
      if(results.length>=maxIssues)break;
      // A table, URL, fenced code or block HTML cannot be treated as prose;
      // allow an unrelated inline footnote after a valid text match.
      if(!line.raw||BAD_STRUCTURE.test(line.raw)||/^\s{4,}/.test(line.raw)||
         /(?:https?:\/\/|www\.|`|\$\$|\|)/.test(line.raw))continue;
      for(const match of line.raw.matchAll(/\b([A-Za-z]{2,45})-([ \t]+)([A-Za-z]{2,45})\b/g)){
        if(results.length>=maxIssues)break;
        const left=match[1],right=match[3],joined=left+right;
        if(!spell.correct(joined))continue;
        const position=scope.scopeStart+line.from+match.index+left.length;
        if(source.slice(position,position+1+match[2].length)!=='-'+match[2])continue;
        results.push({from:position,to:position+1+match[2].length,
          line:source.slice(0,position).split('\n').length,
          left,right,joined,reason:'子块内 OCR 连字符空格疑似断词',
          blockId:scope.id,parentId:scope.parentId,nextBlockId:null,
          scopeLabel:'子块内',reviewOnly:true,reviewKind:'hyphen-space',
          context:`${scope.id} …${line.raw.slice(Math.max(0,match.index-65),
            match.index+match[0].length+65)}…`});
      }
    }
  }
  return results;
}
// A lower-case, numeric or punctuation-led prose CHILD may be the continuation
// of another PDF column or page, even when no hyphen or same-parent sibling
// explains the break. This is a high-recall REVIEW, never an automatic edit.
const NON_PROSE_OPEN=/^(?:!\[|<\/?(?:table|tr|td|th|div|img|svg|figure|script|style|pre)\b|\|[^|]|\$\$|`{3,}|~{3,}|\{\s*"(?:page_size|page_idx)"|(?:<!--\s*(?:cmd:|minerujson:)))/i;
function firstProseGlyph(source,scope){
  const text=source.slice(scope.scopeStart,scope.scopeEnd);
  for(const line of textLines(text)){
    const raw=line.raw.replace(MARKER_SUFFIX,'');
    if(!raw.trim())continue;
    // Skip CMD comments and their metadata, not the actual child prose.
    if(/^\s*<!--/.test(raw))continue;
    let start=raw.search(/\S/);
    let content=raw.slice(start);
    if(NON_PROSE_OPEN.test(content)||/^\$[^$]*\$\s*$/.test(content))return null;
    // Extract the visible first character rather than mistaking Markdown
    // emphasis, quotation marks or a superscript footnote for prose.
    const front=/^(?:#{1,6}\s+|(?:[-*+]\s+)|(?:\d+[.)]\s+))/.exec(content);
    if(front){start+=front[0].length;content=content.slice(front[0].length);}
    const footnote=/^(?:\\?<sup>[^<]*\\?<\/sup>)+/.exec(content);
    if(footnote){start+=footnote[0].length;content=content.slice(footnote[0].length);}
    const wrappers=/^[\s“”‘’"'([{*_~]+/.exec(content);
    if(wrappers){start+=wrappers[0].length;content=content.slice(wrappers[0].length);}
    if(!content||/^(?:!\[|\$|\\\(|\\\[|<|\|)/.test(content))return null;
    return {from:scope.scopeStart+line.from+start,first:content[0],
      snippet:content.slice(0,100)};
  }
  return null;
}
function physicalPDFPage(scope){
  const physical=parseCMDPBSId(scope.origin||scope.id);
  return physical?.p===undefined?null:physical.p+1;
}
/** Every textual child with a non-ASCII-capital initial is a possible
 * cross-column/page fragment. The previous atom need not share its parent;
 * a manual regrouping cannot erase the suspicion. */
function childOpeningCandidates(source,scopes,excludedNext,maxIssues){
  const result=[];
  for(let i=0;i<scopes.length;i++){
    if(result.length>=maxIssues)break;
    const child=scopes[i];
    if(!child.identity.s.length||excludedNext.has(child.id))continue;
    const opening=firstProseGlyph(source,child);
    if(!opening||/^[A-Z]$/.test(opening.first))continue;
    let previous=null,previousOpening=null;
    for(let j=i-1;j>=0;j--){
      const candidate=firstProseGlyph(source,scopes[j]);
      if(candidate){previous=scopes[j];previousOpening=candidate;break;}
    }
    const prevPage=previous?physicalPDFPage(previous):null;
    const pdfPage=physicalPDFPage(child);
    const changedPage=prevPage!==null&&pdfPage!==null&&prevPage!==pdfPage;
      const first=opening.snippet.replace(/<!--[^>]*-->/g,'')
      .split(/\s+/).slice(0,5).join(' ').slice(0,75);
    const previousText=previous?source.slice(previous.scopeStart,previous.scopeEnd)
      .trim().replace(/\s+/g,' ').slice(-88):'';
    result.push({from:opening.from,to:opening.from+opening.first.length,
      line:source.slice(0,opening.from).split('\n').length,
      left:previousText.slice(-35),right:opening.snippet.slice(0,38),
      joined:first,blockId:child.id,parentId:child.parentId,
      previousBlockId:previous?.id||null,nextBlockId:null,
      pdfPage,previousPdfPage:prevPage,
      scopeLabel:'子块起始',reviewKind:'child-start',reviewOnly:true,
      reason:changedPage?'子块非大写开头：疑似跨页续接':
        '子块非大写开头：疑似跨栏/断行续接',
      context:`${previous?.id||'起始'}（PDF ${prevPage??'?'}页） ${previousText} ↵ `+
        `[${child.id} / PDF ${pdfPage??'?'}页] ${opening.snippet}`});
  }
  return result;
}
/** Read-only review candidates BETWEEN adjacent logical children.
 * A caption/body or cross-page pair may be legitimately separate: never
 * auto-insert an annotation or join these two source scopes. */
function siblingBreakCandidates(source,spell,scopes,maxIssues){
  const rows=[];
  for(let i=0;i<scopes.length-1;i++){
    if(rows.length>=maxIssues)break;
    const a=scopes[i],b=scopes[i+1];
    // `role=body` can be a synthetic prose continuation of a parent, not
    // necessarily a table cell. p6b6s0 (body) -> p6b6s1 (origin=p6b7)
    // is a real "about / 3 percentage points" sentence seam. Validate the
    // actual two prose boundaries instead of excluding all body roles.
    if(a.identity.s.length!==1||b.identity.s.length!==1||
      a.parentId!==b.parentId)continue;
    const previousText=source.slice(a.scopeStart,a.scopeEnd);
    const followingText=source.slice(b.scopeStart,b.scopeEnd);
    // Last visible line matters; do not leap over a closing HTML element,
    // embedded media, table, LaTeX fence or other structural boundary.
    const leftLine=terminalLine(previousText,false),rightLine=terminalLine(followingText,true);
    if(!leftLine||leftLine.unsafe||!rightLine)continue;
    const leftText=textWithoutMarker(leftLine.raw),rightText=rightLine.raw;
    if(/[.!?;:。！？；：,，]\s*$/.test(leftText)||/\s{2,}$/.test(leftText)||
       /^\s/.test(rightText))continue;
    const left=/([A-Za-z]{2,60})(-?)$/.exec(leftText);
    const right=OPENING_TOKEN.exec(rightText);
    if(!left||!right)continue;
    const aWord=left[1],bWord=right[1];
    let reason=null,joined=null;
    if(/^[a-z]{2,60}$/.test(bWord)){
      const combined=aWord+bWord;
      // For a review-only sibling boundary, even two independently valid
      // fragments ("inter" + "national") may be one split dictionary word.
      // This is a CANDIDATE, never an automatic CMD correction.
      if(spell.correct(combined)&&(Boolean(left[2])||
        aWord.length>=3&&bWord.length>=3)){
        reason='同父子块交界疑似断词';joined=combined;
      }
    }
    if(!reason&&!left[2]&&CONTINUATION_TAILS.has(aWord.toLowerCase())){
      reason='同父子块交界疑似句子续接';joined=aWord+' '+bWord;
    }
    if(!reason)continue;
    const from=a.scopeStart+leftLine.to;
    // Underlying source always contains a newline between two CMD children.
    if(source[from]!=='\n')continue;
    rows.push({from,to:from+1,line:source.slice(0,from).split('\n').length,
      left:aWord,right:bWord,joined,reason,
      blockId:a.id,parentId:a.parentId,nextBlockId:b.id,
      pdfPage:physicalPDFPage(a),nextPdfPage:physicalPDFPage(b),
      scopeLabel:'子块交界',reviewOnly:true,
      context:`${a.id} (PDF ${physicalPDFPage(a)??'?'}页) ${leftText.slice(-85)} ↵ `+
        `[${b.id} / PDF ${physicalPDFPage(b)??'?'}页] ${rightText.slice(0,85)}`});
  }
  return rows;
}
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
  const scopes=currentPBSScope(source,bodyEnd),owner=withinScopeRows(rows,scopes);
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
    const bridge=scopes?null:blockContinuation(rows,i,previousAnchor,bodyEnd);
    if(bridge){
      if(results.length>=maxIssues){truncated=true;break;}
      results.push(bridge);
    }
    if(text.includes('<!--'))inComment=true;
    if(inComment){if(text.includes('-->'))inComment=false;continue;}
    if(scopes&&(!owner[i]||owner[i]!==owner[i+1]))continue;
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
    const block=owner?.[i];
    results.push({from:line.to,to:line.to+1,line:i+1,left:a,right:b,joined,
      reason,blockId:block?.id||null,parentId:block?.parentId||null,
      scopeLabel:block?(block.identity.s.length?'子块内':'父块内'):'原文',
      context:`${text.slice(-90)} ↵ ${following.slice(0,90)}`});
  }
  if(scopes){
    const remaining=Math.max(0,maxIssues-results.length);
    const paragraph=childParagraphBreakCandidates(source,scopes,remaining+1);
    const sibling=siblingBreakCandidates(source,spell,scopes,remaining+1);
    const hyphenSpace=hyphenSpaceCandidates(source,spell,scopes,remaining+1);
    // When a precise sibling seam already explains the child opening,
    // retain that stronger evidence rather than a duplicate generic row.
    const childOpening=childOpeningCandidates(source,scopes,
      new Set(sibling.map(row=>row.nextBlockId)),remaining+1);
    const candidates=[...paragraph,...sibling,...hyphenSpace,...childOpening]
      .sort((a,b)=>a.from-b.from);
    if(candidates.length>remaining)truncated=true;
    results.push(...candidates.slice(0,remaining));
    results.sort((a,b)=>a.from-b.from);
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
  const index=source.indexOf('<!-- minerujson:source:v1:');
  const scopes=currentPBSScope(source,index>=0?index:source.length);
  const findScope=from=>scopes?.findLast(scope=>scope.scopeStart<=from&&from<scope.scopeEnd)||null;
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
    const scope=findScope(from);
    rows.push({from,to:from+1,line,left,right,joined,
      blockId:scope?.id||null,parentId:scope?.parentId||null,
      scopeLabel:scope?(scope.identity.s.length?'子块内':'父块内'):'原文',
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
    if(row?.reviewOnly)continue; // sibling boundaries never auto-write CMD
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
