import {blockAnchor,subblockAnchor} from './mineru-anchors.js';

/** A MinerU block or subblock tag owns the interval starting at its own line
 * and ending immediately before the NEXT native block/subblock tag. This is a
 * flat, lexical ownership rule: a parent does not also own its children's
 * content. All ranges are 1-based inclusive and are recomputed from the live
 * CM6 document, including user text inserted between any two tags.
 * Original OCR geometry and sealed JSON remain entirely read-only. */
function sourceBodyRange(lines,start,end){
  let first=null,last=null;
  for(let i=start;i<end;i++){
    const line=lines[i].trim();
    if(!line||/^<!--/.test(line)||
      /^\\?\[MinerU [^\n]*source metadata only\]$/i.test(line))continue;
    if(first===null)first=i+1;
    last=i+1;
  }
  return {contentLine:first,contentEndLine:last};
}

export function sourceBlockScopes(source){
  const lines=source.split('\n');
  const firstEvidence=lines.findIndex(line=>line.includes('<!-- minerujson:source:v1:'));
  const limit=firstEvidence<0?lines.length:firstEvidence;
  const tags=[];
  for(let i=0;i<limit;i++){
    const parent=blockAnchor(lines[i]);
    if(parent){tags.push({...parent,kind:'parent',sourceLine:i+1});continue;}
    const child=subblockAnchor(lines[i]);
    if(child)tags.push({...child,kind:'child',sourceLine:i+1});
  }
  return tags.map((tag,i)=>{
    const end=tags[i+1]?.sourceLine-1??limit;
    // End is inclusive. Source tag owns its own line and its following lines,
    // including blanks, until the next original parent or child tag.
    return {...tag,scopeEndLine:end,
      ...sourceBodyRange(lines,tag.sourceLine,end)};
  });
}
export function sourceBlocks(source){
  return sourceBlockScopes(source).filter(tag=>tag.kind==='parent');
}
export function sourceSubblocks(source){
  return sourceBlockScopes(source).filter(tag=>tag.kind==='child');
}
