/** One original PDF text block -> one editable CMD block, without touching
 * its MinerU identity, joins, chapter annotations, or sealed evidence. Pure
 * planner; the CMD transaction port owns the final optimistic write. */
import {blockAnchor} from './mineru-anchors.js';

export function planPDFBlockTextReplacement(source,pageIndex,blockIndex,rawText){
  if(typeof source!=='string'||!Number.isInteger(pageIndex)||pageIndex<0||
     !Number.isInteger(blockIndex)||blockIndex<0||typeof rawText!=='string')
    throw Error('PDF 文本块参数无效');
  const text=rawText.replace(/[\t\r\n ]+/g,' ').trim();
  if(!text||text.length>30000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
    throw Error('PDF 没有可靠的可替换文本');
  const lines=source.split('\n');
  let target=-1;
  for(let i=0;i<lines.length;i++){
    const anchor=blockAnchor(lines[i]);
    if(anchor?.pageIndex===pageIndex&&anchor.blockIndex===blockIndex){
      if(target!==-1)throw Error('CMD 文本块锚点重复');
      target=i;
    }
  }
  if(target<0)throw Error('CMD 找不到对应的原始块锚点');
  let end=target+1;
  // Stop at any OTHER original MinerU annotation, not only the next block:
  // last blocks also border discarded page metadata or sealed evidence.
  while(end<lines.length){
    const line=lines[end];
    if(blockAnchor(line)||/^\s*(?:>\s*)?<!--\s*minerujson:(?!block:v1:)/.test(line)||
       /^\s*<!--\s*minerujson:source:v1:/.test(line))break;
    end++;
  }
  const offset=lines.slice(0,target+1).reduce((n,line)=>n+line.length+1,0);
  const raw=lines.slice(target+1,end).join('\n');
  // Titles may have a CMD chapter marker before their visible Markdown
  // heading. Keep it byte-for-byte; only replace the user-visible title.
  // Inline OCR superscripts/subscripts are ordinary block content: MinerU
  // sometimes incorrectly wraps *words* in <sup>, e.g. page 2 p1b9. The
  // user explicitly asked to replace those bad OCR words with PDF text.
  // Other annotations and nested structural elements remain protected.
  const annotationPrefix=/^([\s\n]*(?:<!-- ocr2md:chapter:v1 [^\n]* -->[\s\n]*)*)/.exec(raw)?.[0]||'';
  const body=raw.slice(annotationPrefix.length);
  const structureProbe=body.replace(/\\?<\/?(?:sup|sub)\b[^>]*>/gi,'');
  if(/<!--|-->|<\/?[a-z][^>]*>|!\[|!\[\[|```|~~~|\$\$|`|\*\*|\[[^\]\n]+\]\(|\^sid-|^\s*\|/im.test(structureProbe))
    throw Error('该 MD 块包含注释、图片或复杂结构，不能直接覆盖');
  const trimmed=body.trim();
  if(!trimmed)throw Error('MD 对应块没有可替换正文');
  const contentLines=trimmed.split('\n');
  const prefixMatch=/^(#{1,6}\s+|(?:>\s*)+)?/.exec(contentLines[0]);
  const prefix=prefixMatch?.[0]||'';
  const content=contentLines.map(line=>line.trim()).join(' ').trim();
  if(!content||/^(?:[-*+]\s|\d+[.)]\s)/.test(content)&&!/^\d+\\[.)]\s/.test(content)){
    // Lists have multiple edit/indent semantics; don't flatten them.
    throw Error('该块属于 Markdown 列表或复杂格式，暂不可直接替换');
  }
  if(contentLines.slice(1).some(line=>/^(?:#{1,6}\s|>\s|[-*+]\s|\d+[.)]\s)/.test(line)))
    throw Error('该块包含多段 Markdown 结构，暂不可直接替换');
  const leading=body.match(/^\s*/)?.[0]||'';
  const trailing=body.match(/\s*$/)?.[0]||'';
  // Preserve structural markdown heading and whitespace boundaries. Escape
  // a leading numbered-list marker in extracted PDF prose (e.g., "7.").
  const md=text.replace(/^(\d{1,3})([.)])(?=\s)/,'$1\\$2');
  return {from:offset,to:offset+raw.length,expected:raw,
    insert:annotationPrefix+leading+prefix+md+trailing,pageIndex,blockIndex};
}
