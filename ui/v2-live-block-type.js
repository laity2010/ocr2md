/** Shared AG row semantics. Stored OCR type remains immutable provenance.
 * Legacy snapshot callers retain WP23C. Owned-LF callers project all ATX
 * lines from the unique complete CM6 document, not separate title rows.
 */
import {titleSourceParts} from './lab-ocr/title-view.js';
import {markdownLanguage} from '@codemirror/lang-markdown';

export function effectiveBlockType(storedType,markdownText){
  if(titleSourceParts(markdownText).level!==null)return 'title';
  return storedType==='title'?'text':storedType;
}

/** Match the CM6 source ATX rule; the same Markdown parser excludes code
 * fences even when the opening and closing fence are in different blocks.
 * Metadata is transient and contains only line numbers and exact title text.
 */
export function collectOwnedHeadings(source,intervals){
  const result=new Map(intervals.map(row=>[row.logicalId,[]]));
  if(typeof source!=='string'||!intervals.length)return result;
  const fences=[];
  if(/(?:`{3,}|~{3,})/.test(source)){
    markdownLanguage.parser.parse(source).iterate({enter(node){
      if(node.name==='FencedCode'){fences.push({from:node.from,to:node.to});return false;}
    }});
  }
  let offset=0,index=0,fence=0,line=1;
  for(const text of source.split('\n')){
    while(index+1<intervals.length&&offset>=intervals[index].to)index++;
    while(fence<fences.length&&offset>=fences[fence].to)fence++;
    const row=intervals[index],code=fences[fence];
    if(offset>=row.from&&offset<row.to&&
      !(code&&offset>=code.from&&offset<code.to)&&titleSourceParts(text).level!==null)
      result.get(row.logicalId).push({line,text});
    offset+=text.length+1;line++;
  }
  return result;
}
export function ownedBlockType(storedType,headings){
  return headings.length?'title':storedType==='title'?'text':storedType;
}
